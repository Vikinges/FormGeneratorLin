import React, { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import './CanvasPreview.css';

const BASE_CANVAS_WIDTH = 795;
const BASE_CANVAS_HEIGHT = Math.round(BASE_CANVAS_WIDTH * Math.sqrt(2));

const ensureNumeric = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const getPosition = (field) => ({
  x: ensureNumeric(field?.position?.x, 0),
  y: ensureNumeric(field?.position?.y, 0)
});

const getSize = (field) => ({
  width: ensureNumeric(field?.size?.width ?? field?.width, 260),
  height: ensureNumeric(field?.size?.height ?? field?.height, 80)
});

function CanvasPreview({
  fields,
  values,
  suggestions,
  onTextInput,
  onFocusField,
  onSuggestionPick,
  onCheckboxToggle,
  onFileChange,
  registerSignatureCanvas,
  clearSignature,
  signatures
}) {
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    const updateScale = () => {
      const width = node.clientWidth;
      if (!width) {
        return;
      }
      const nextScale = Math.min(width / BASE_CANVAS_WIDTH, 1);
      setScale(nextScale);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const canvasStyle = useMemo(() => ({
    width: BASE_CANVAS_WIDTH,
    height: BASE_CANVAS_HEIGHT,
    transform: `scale(${scale})`,
    transformOrigin: 'top left'
  }), [scale]);

  const renderTextField = useCallback((field, contentRect) => {
    const value = values[field.id] ?? '';
    const suggestionId = `preview-suggestions-${field.id}`;
    return (
      <>
        <input
          type="text"
          className="preview-input"
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onTextInput(field.id, event.target.value)}
          onFocus={() => onFocusField(field.id)}
          list={suggestionId}
        />
        <datalist id={suggestionId}>
          {(suggestions[field.id] || []).map((option) => (
            <option key={`${field.id}-${option}`} value={option} />
          ))}
        </datalist>
      </>
    );
  }, [onFocusField, onTextInput, suggestions, values]);

  const renderTextarea = useCallback((field) => {
    const value = values[field.id] ?? '';
    const pickSuggestion = (option) => {
      onSuggestionPick(field.id, option);
    };
    const options = suggestions[field.id] || [];

    return (
      <div className="preview-textarea-wrapper">
        <TextareaAutosize
          value={value}
          onChange={(event) => onTextInput(field.id, event.target.value)}
          onFocus={() => onFocusField(field.id)}
          placeholder={field.placeholder || 'Add multi-line notes or instructions'}
          className="preview-textarea"
          minRows={3}
        />
        {options.length > 0 && (
          <ul className="preview-suggestion-list" role="listbox">
            {options.map((option) => (
              <li key={`${field.id}-${option}`}>
                <button
                  type="button"
                  className="preview-suggestion-item"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickSuggestion(option)}
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }, [onFocusField, onTextInput, onSuggestionPick, suggestions, values]);

  const renderCheckbox = useCallback((field) => {
    const checked = Boolean(values[field.id]);
    return (
      <label className="preview-checkbox">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckboxToggle(field.id, event.target.checked)}
        />
        <span>{field.checkboxLabel || 'Option'}</span>
      </label>
    );
  }, [onCheckboxToggle, values]);

  const renderPhotoField = useCallback((field) => {
    const files = Array.isArray(values[field.id]) ? values[field.id] : [];
    return (
      <div className="preview-photo">
        <label className="preview-photo-drop">
          <span>{files.length ? `${files.length} file(s) selected` : 'Drop photos here'}</span>
          <small>JPG or PNG up to 5MB</small>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const selected = Array.from(event.target.files || []);
              onFileChange(field.id, selected);
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="preview-photo-list">
            {files.map((file) => (
              <li key={`${field.id}-${file.name}`}>{file.name}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }, [onFileChange, values]);

  const renderSignature = useCallback((field) => {
    const signatureValue = signatures[field.id];
    return (
      <div className="preview-signature">
        <canvas
          className="preview-signature-canvas"
          ref={(canvas) => registerSignatureCanvas(field.id, canvas)}
          width={field.size?.width || 320}
          height={field.size?.height || 160}
        />
        <div className="preview-signature-actions">
          <button
            type="button"
            className="preview-btn-secondary"
            onClick={() => clearSignature(field.id)}
          >
            Clear
          </button>
          {signatureValue && (
            <span className="preview-signature-status">Captured</span>
          )}
        </div>
      </div>
    );
  }, [clearSignature, registerSignatureCanvas, signatures]);

  return (
    <div className="canvas-preview-stage" ref={stageRef}>
      <div
        className="canvas-preview-wrapper"
        style={{ paddingBottom: `${(BASE_CANVAS_HEIGHT / BASE_CANVAS_WIDTH) * 100}%` }}
      >
        <div
          className="canvas-preview-canvas"
          style={canvasStyle}
        >
          {fields.map((field) => {
            const position = getPosition(field);
            const size = getSize(field);
            return (
              <div
                key={field.id}
                className="canvas-preview-card"
                style={{
                  left: position.x,
                  top: position.y,
                  width: size.width,
                  height: size.height
                }}
                data-field-id={field.id}
              >
                <div className="canvas-preview-header">
                  <span className="canvas-preview-title">{field.label || `Field ${field.id}`}</span>
                  {field.required && <span className="canvas-preview-required">Required</span>}
                </div>
                <div className="canvas-preview-body">
                  {(() => {
                    switch (field.type) {
                      case 'text':
                        return renderTextField(field);
                      case 'textarea':
                        return renderTextarea(field);
                      case 'checkbox':
                        return renderCheckbox(field);
                      case 'signature':
                        return renderSignature(field);
                      case 'photo':
                        return renderPhotoField(field);
                      default:
                        return renderTextField(field);
                    }
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CanvasPreview;
