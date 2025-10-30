import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CanvasPreview from './CanvasPreview';
import { formService } from '../services/formService';
import './FormViewer.css';

function FormViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [formData, setFormData] = useState({});
  const [signatures, setSignatures] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const signatureRefs = useRef({});
  const signatureCleanup = useRef({});
  const signatureImageCache = useRef({});

  useEffect(() => {
    const loadForm = async () => {
      setLoading(true);
      const result = await formService.getForm(id);
      if (result.ok && result.form) {
        setForm(result.form);
        const fields = JSON.parse(result.form.content || '[]');
        const initialData = {};
        fields.forEach((field) => {
          if (field.type === 'signature') {
            initialData[field.id] = '';
          }
        });
        setFormData(initialData);
      }
      setLoading(false);
    };

    loadForm();
  }, [id]);

  const handleInputChange = useCallback((fieldId, value) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const fetchSuggestions = useCallback(async (fieldId, query = '') => {
    if (!form?.id) {
      return;
    }
    try {
      const response = await formService.getSuggestions(form.id, fieldId, query);
      if (response.ok) {
        setSuggestions((prev) => ({ ...prev, [fieldId]: response.suggestions || [] }));
      }
    } catch (error) {
      // ignore fetch errors
    }
  }, [form]);

  const handleTextInput = useCallback(
    (fieldId, value) => {
      handleInputChange(fieldId, value);
      const trimmed = (value || '').trim();
      if (trimmed.length >= 2) {
        fetchSuggestions(fieldId, trimmed);
      } else {
        setSuggestions((prev) => ({ ...prev, [fieldId]: [] }));
      }
    },
    [fetchSuggestions, handleInputChange]
  );

  const handleSuggestionPick = useCallback(
    (fieldId, value) => {
      handleInputChange(fieldId, value);
      setSuggestions((prev) => ({ ...prev, [fieldId]: [] }));
    },
    [handleInputChange]
  );

  const registerSignatureCanvas = useCallback((fieldId, canvas) => {
    if (signatureCleanup.current[fieldId]) {
      signatureCleanup.current[fieldId]();
      delete signatureCleanup.current[fieldId];
    }

    if (!canvas) {
      delete signatureRefs.current[fieldId];
      return;
    }

    signatureRefs.current[fieldId] = canvas;
    canvas.style.touchAction = 'none';

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';

    const configureCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const displayWidth = rect.width || Number(canvas.getAttribute('width')) || 400;
      const displayHeight = rect.height || Number(canvas.getAttribute('height')) || 150;
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.round(displayWidth * ratio);
      canvas.height = Math.round(displayHeight * ratio);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);

      ctx.lineWidth = 2;

      canvas.dataset.dpiRatio = String(ratio);
      canvas.dataset.baseWidth = String(displayWidth);
      canvas.dataset.baseHeight = String(displayHeight);
    };

    configureCanvasSize();

    let isDrawing = false;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const getCoordinates = (evt) => {
      const rect = canvas.getBoundingClientRect();
      const baseWidth = Number(canvas.dataset.baseWidth) || rect.width;
      const baseHeight = Number(canvas.dataset.baseHeight) || rect.height;
      const pointerX = evt.clientX - rect.left;
      const pointerY = evt.clientY - rect.top;
      const normalizedX = (pointerX / rect.width) * baseWidth;
      const normalizedY = (pointerY / rect.height) * baseHeight;
      const x = clamp(normalizedX, 0, baseWidth);
      const y = clamp(normalizedY, 0, baseHeight);
      return {
        x,
        y
      };
    };

    const start = (evt) => {
      evt.preventDefault();
      try {
        if (typeof evt.pointerId === 'number' && canvas.setPointerCapture) {
          canvas.setPointerCapture(evt.pointerId);
        }
      } catch (captureErr) {
        /* ignore pointer capture errors */
      }
      const { x, y } = getCoordinates(evt);
      ctx.beginPath();
      ctx.moveTo(x, y);
      isDrawing = true;
    };

    const move = (evt) => {
      if (!isDrawing) return;
      evt.preventDefault();
      const { x, y } = getCoordinates(evt);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const end = (evt) => {
      if (!isDrawing) return;
      if (evt) {
        evt.preventDefault();
        try {
          if (typeof evt.pointerId === 'number' && canvas.releasePointerCapture) {
            canvas.releasePointerCapture(evt.pointerId);
          }
        } catch (releaseErr) {
          /* ignore pointer capture errors */
        }
      }
      isDrawing = false;
      const dataUrl = canvas.toDataURL('image/png');
      signatureImageCache.current[fieldId] = dataUrl;
      setSignatures((prev) => ({
        ...prev,
        [fieldId]: dataUrl
      }));
    };

    canvas.addEventListener('pointerdown', start, { passive: false });
    canvas.addEventListener('pointermove', move, { passive: false });
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);
    canvas.addEventListener('pointercancel', end);

    const cached = signatureImageCache.current[fieldId];
    if (cached) {
      const image = new Image();
      image.onload = () => {
        const baseWidth = Number(canvas.dataset.baseWidth) || canvas.width;
        const baseHeight = Number(canvas.dataset.baseHeight) || canvas.height;
        ctx.drawImage(image, 0, 0, baseWidth, baseHeight);
      };
      image.src = cached;
    }

    const handleResize = () => {
      configureCanvasSize();
      const cachedImage = signatureImageCache.current[fieldId];
      if (cachedImage) {
        const image = new Image();
        image.onload = () => {
          const baseWidth = Number(canvas.dataset.baseWidth) || canvas.width;
          const baseHeight = Number(canvas.dataset.baseHeight) || canvas.height;
          ctx.drawImage(image, 0, 0, baseWidth, baseHeight);
        };
        image.src = cachedImage;
      }
    };

    window.addEventListener('resize', handleResize);

    signatureCleanup.current[fieldId] = () => {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointerleave', end);
      canvas.removeEventListener('pointercancel', end);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const clearSignature = useCallback((fieldId) => {
    const canvas = signatureRefs.current[fieldId];
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    const ratio = Number(canvas.dataset.dpiRatio || 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    signatureImageCache.current[fieldId] = '';
    setSignatures((prev) => ({ ...prev, [fieldId]: '' }));
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setSubmitting(true);

      const serialisedData = {};
      const filesPayload = [];

      Object.entries(formData || {}).forEach(([fieldId, value]) => {
        if (Array.isArray(value) && value.length && value[0] instanceof File) {
          serialisedData[fieldId] = value.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
          }));
          value.forEach((file) => {
            filesPayload.push({ fieldId, file });
          });
        } else {
          serialisedData[fieldId] = value;
        }
      });

      const submitResult = await formService.submitFilledForm(id, serialisedData, filesPayload);

      if (submitResult.ok) {
        const signResult = await formService.signForm(
          submitResult.id,
          signatures
        );

        if (signResult.ok) {
          alert('Form signed and submitted. PDF document generated.');
          navigate('/');
        } else {
          alert(signResult.error);
        }
      } else {
        alert(submitResult.error);
      }

      setSubmitting(false);
    },
    [formData, id, navigate, signatures]
  );

  const fields = useMemo(() => {
    if (!form?.content) {
      return [];
    }
    try {
      const parsed = JSON.parse(form.content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }, [form]);

  const handleFocusField = useCallback((fieldId) => {
    fetchSuggestions(fieldId, formData[fieldId] || '');
  }, [fetchSuggestions, formData]);

  const handleCheckboxToggle = useCallback((fieldId, checked) => {
    handleInputChange(fieldId, checked);
  }, [handleInputChange]);

  const handleFilesChange = useCallback((fieldId, files) => {
    handleInputChange(fieldId, files);
  }, [handleInputChange]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh'
        }}
      >
        <div className="spinner"></div>
      </div>
    );
  }

  if (!form) {
    return <div>Form not found</div>;
  }

  return (
    <div className="form-viewer">
      <div className="form-viewer-header">
        <h1>{form.name}</h1>
        {form.description && <p>{form.description}</p>}
      </div>

      <form onSubmit={handleSubmit} className="form-preview-form">
        <CanvasPreview
          fields={fields}
          values={formData}
          suggestions={suggestions}
          signatures={signatures}
          onTextInput={handleTextInput}
          onFocusField={handleFocusField}
          onSuggestionPick={handleSuggestionPick}
          onCheckboxToggle={handleCheckboxToggle}
          onFileChange={handleFilesChange}
          registerSignatureCanvas={registerSignatureCanvas}
          clearSignature={clearSignature}
        />

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Sending...' : 'Sign & submit'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FormViewer;
