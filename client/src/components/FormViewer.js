import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formService } from '../services/formService';
import './FormViewer.css';

function FormViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [formData, setFormData] = useState({});
  const [signatures, setSignatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const signatureRefs = useRef({});

  useEffect(() => {
    loadForm();
  }, [id]);

  const loadForm = async () => {
    const result = await formService.getForm(id);
    if (result.ok && result.form) {
      setForm(result.form);
      const fields = JSON.parse(result.form.content);
      const initialData = {};
      fields.forEach(field => {
        if (field.type === 'signature') {
          initialData[field.id] = '';
        }
      });
      setFormData(initialData);
    }
    setLoading(false);
  };

  const handleInputChange = (fieldId, value) => {
    setFormData({ ...formData, [fieldId]: value });
  };

  const startSignature = (fieldId) => {
    const canvas = signatureRefs.current[fieldId];
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    let isDrawing = false;

    const startDraw = (e) => {
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    };

    const draw = (e) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    };

    const stopDraw = () => {
      isDrawing = false;
      const signatureData = canvas.toDataURL();
      setSignatures({ ...signatures, [fieldId]: signatureData });
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    // Touch support for mobile devices
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      startDraw(touch);
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      draw(touch);
    });
    canvas.addEventListener('touchend', stopDraw);
  };

  const clearSignature = (fieldId) => {
    const canvas = signatureRefs.current[fieldId];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatures({ ...signatures, [fieldId]: '' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const result = await formService.submitFilledForm(id, formData, []);
    
    if (result.ok) {
      // Now submit collected signatures
      const signResult = await formService.signForm(result.id, signatures);
      
      if (signResult.ok) {
        alert('Form signed and submitted. PDF document generated.');
        navigate('/');
      } else {
        alert(signResult.error);
      }
    } else {
      alert(result.error);
    }
    
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!form) {
    return <div>Form not found</div>;
  }

  const fields = JSON.parse(form.content);

  return (
    <div className="form-viewer">
      <div className="form-viewer-header">
        <h1>{form.name}</h1>
        {form.description && <p>{form.description}</p>}
      </div>

      <form onSubmit={handleSubmit} className="form-content">
        {fields.map(field => (
          <div key={field.id} className="form-field">
            <label>
              {field.label}
              {field.required && <span className="required"> *</span>}
            </label>

            {field.type === 'text' && (
              <input
                type="text"
                value={formData[field.id] || ''}
                onChange={(e) => handleInputChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="input"
                required={field.required}
              />
            )}

            {field.type === 'checkbox' && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData[field.id] || false}
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
                  const files = Array.from(e.target.files);
                  handleInputChange(field.id, files);
                }}
              />
            )}

            {field.type === 'signature' && (
              <div className="signature-field">
                <canvas
                  ref={el => signatureRefs.current[field.id] = el}
                  width={400}
                  height={150}
                  className="signature-canvas"
                  onClick={() => startSignature(field.id)}
                ></canvas>
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

