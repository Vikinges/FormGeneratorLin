import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

  const handleInputChange = (fieldId, value) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

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

  const handleTextInput = useCallback((fieldId, value) => {
    handleInputChange(fieldId, value);
    const trimmed = (value || '').trim();
    if (trimmed.length >= 2) {
      fetchSuggestions(fieldId, trimmed);
    } else {
      setSuggestions((prev) => ({ ...prev, [fieldId]: [] }));
    }
  }, [fetchSuggestions]);

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

    const baseWidth = Number(canvas.dataset.baseWidth) || Number(canvas.getAttribute('width')) || canvas.width;
    const baseHeight = Number(canvas.dataset.baseHeight) || Number(canvas.getAttribute('height')) || canvas.height;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.round(baseWidth * ratio);
    canvas.height = Math.round(baseHeight * ratio);
    canvas.style.width = `${baseWidth}px`;
    canvas.style.height = `${baseHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    canvas.dataset.dpiRatio = String(ratio);
    canvas.dataset.baseWidth = String(baseWidth);
    canvas.dataset.baseHeight = String(baseHeight);

    let isDrawing = false;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const getCoordinates = (evt) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = baseWidth / rect.width;
      const scaleY = baseHeight / rect.height;
      const x = (evt.clientX - rect.left) * scaleX;
      const y = (evt.clientY - rect.top) * scaleY;
      return {
        x: clamp(x, 0, baseWidth),
        y: clamp(y, 0, baseHeight)
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
        ctx.drawImage(image, 0, 0, baseWidth, baseHeight);
      };
      image.src = cached;
    }

    signatureCleanup.current[fieldId] = () => {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointerleave', end);
      canvas.removeEventListener('pointercancel', end);
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

      const submitResult = await formService.submitFilledForm(id, formData, []);

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

  const fields = JSON.parse(form.content || '[]');

  return (
    <div className="form-viewer">
      <div className="form-viewer-header">
        <h1>{form.name}</h1>
        {form.description && <p>{form.description}</p>}
      </div>

      <form onSubmit={handleSubmit} className="form-content">
        {fields.map((field) => (
          <div key={field.id} className="form-field">
            <label>
              {field.label}
              {field.required && <span className="required"> *</span>}
            </label>

            {field.type === 'text' && (
              <>
                <input
                  type="text"
                  value={formData[field.id] || ''}
                  onChange={(e) => handleTextInput(field.id, e.target.value)}
                  onFocus={() => fetchSuggestions(field.id, formData[field.id] || '')}
                  placeholder={field.placeholder}
                  className="input"
                  required={field.required}
                  list={`suggestions-${field.id}`}
                  autoComplete="off"
                />
                <datalist id={`suggestions-${field.id}`}>
                  {(suggestions[field.id] || []).map((option) => (
                    <option key={`${field.id}-${option}`} value={option} />
                  ))}
                </datalist>
              </>
            )}

            {field.type === 'checkbox' && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!formData[field.id]}
                  onChange={(e) => handleInputChange(field.id, e.target.checked)}
                />
                <span>{field.checkboxLabel || 'Yes'}</span>
              </label>
            )}

            {field.type === 'photo' && (
              <input
                type="file"
                accept="image/*"
                multiple
                className="input"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  handleInputChange(field.id, files);
                }}
              />
            )}

            {field.type === 'signature' && (
              <div className="signature-field">
                <canvas
                  ref={(canvas) => registerSignatureCanvas(field.id, canvas)}
                  width={400}
                  height={150}
                  className="signature-canvas"
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => clearSignature(field.id)}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Sending…' : '✍️ Sign & submit'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FormViewer;
