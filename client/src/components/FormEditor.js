import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { formService } from '../services/formService';
import './FormEditor.css';

const GRID_SIZE = 20;
const ENABLE_FORM_DEBUG = true;

const FIELD_BASE_DIMENSIONS = {
  text: { width: 280, height: 72 },
  checkbox: { width: 240, height: 56 },
  signature: { width: 320, height: 160 },
  photo: { width: 320, height: 200 },
  default: { width: 260, height: 80 }
};

const MIN_FIELD_SIZE = { width: 160, height: 48 };

const debugLog = (...args) => {
  if (ENABLE_FORM_DEBUG) {
    console.log('[FormEditor]', ...args);
  }
};

const getBaseDimensions = (type) =>
  FIELD_BASE_DIMENSIONS[type] || FIELD_BASE_DIMENSIONS.default;

const parseDimension = (value, fallback) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const numeric =
    typeof value === 'string' ? parseFloat(value) : Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
};

const resolveFieldSize = (field) => {
  const base = getBaseDimensions(field.type);
  const width = parseDimension(
    field?.size?.width ?? field?.width,
    base.width
  );
  const height = parseDimension(
    field?.size?.height ?? field?.height,
    base.height
  );

  return {
    width: Math.max(MIN_FIELD_SIZE.width, width),
    height: Math.max(MIN_FIELD_SIZE.height, height)
  };
};

function FormField({ field, position, onUpdate, onDelete, onResize }) {
  const baseSize = getBaseDimensions(field.type);
  const size = resolveFieldSize(field);
  const scaleX = size.width / baseSize.width;
  const scaleY = size.height / baseSize.height;

  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'FORM_FIELD',
    item: { id: field.id, type: field.type },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    end: (item, monitor) => {
      if (monitor.didDrop()) {
        debugLog('✅ Field moved', field.id);
      } else {
        debugLog('❌ Field move cancelled', field.id);
      }
    }
  }));

  const handleTextChange = (event) => {
    onUpdate(field.id, { value: event.target.value });
  };

  const handleCheckboxChange = (event) => {
    onUpdate(field.id, { checked: event.target.checked });
  };

  const beginResize = (directions) => (event) => {
    if (!onResize) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const getPoint = (ev) => {
      if (ev.touches && ev.touches.length > 0) {
        return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      }
      return { x: ev.clientX, y: ev.clientY };
    };

    const startPoint = getPoint(event);
    const startSize = { ...size };

    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const point = getPoint(moveEvent);
      let nextWidth = startSize.width;
      let nextHeight = startSize.height;

      if (directions.includes('right')) {
        nextWidth = startSize.width + (point.x - startPoint.x);
      }
      if (directions.includes('bottom')) {
        nextHeight = startSize.height + (point.y - startPoint.y);
      }

      if (moveEvent.shiftKey) {
        if (directions.includes('right')) {
          nextWidth = Math.round(nextWidth / GRID_SIZE) * GRID_SIZE;
        }
        if (directions.includes('bottom')) {
          nextHeight = Math.round(nextHeight / GRID_SIZE) * GRID_SIZE;
        }
      }

      onResize(field.id, {
        width: Math.max(MIN_FIELD_SIZE.width, nextWidth),
        height: Math.max(MIN_FIELD_SIZE.height, nextHeight)
      });
    };

    const handleUp = () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
      window.removeEventListener('touchcancel', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    window.addEventListener('touchcancel', handleUp);
  };

  const fieldContent = () => {
    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            placeholder={field.placeholder || 'Enter text'}
            className="input"
            value={field.value ?? ''}
            onChange={handleTextChange}
            style={{ width: '100%' }}
          />
        );
      case 'checkbox':
        return (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={!!field.checked}
              onChange={handleCheckboxChange}
            />
            <span>{field.checkboxLabel || 'Option'}</span>
          </label>
        );
      case 'signature':
        return (
          <div className="signature-canvas">
            <canvas width={baseSize.width - 20} height={baseSize.height - 40}></canvas>
            <span className="signature-hint">Signature area</span>
          </div>
        );
      case 'photo':
        return (
          <div className="photo-upload-placeholder">
            <span role="img" aria-hidden="true">📷</span>
            <span>Photo upload</span>
          </div>
        );
      default:
        return <div className="generic-field-placeholder">Field content</div>;
    }
  };

  const outerStyle = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: `${size.width}px`,
    height: `${size.height}px`,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
    pointerEvents: isDragging ? 'none' : 'auto'
  };

  const getIcon = () => {
    switch (field.type) {
      case 'text':
        return '📝';
      case 'checkbox':
        return '☑️';
      case 'signature':
        return '✍️';
      case 'photo':
        return '📷';
      default:
        return '📋';
    }
  };

  return (
    <div ref={dragPreview} style={outerStyle} data-field-id={field.id}>
      <div className="field-container">
        <div className="field-header">
          <div ref={drag} className="drag-handle" title="Drag to reposition">
            <span className="drag-icon">⋮⋮</span>
            <span>{getIcon()} {field.label}</span>
          </div>
          <button onClick={() => onDelete(field.id)} className="btn-delete" title="Delete field">
            ✕
          </button>
        </div>
        <div className="field-body">
          <div
            className="field-content-wrapper"
            style={{
              width: baseSize.width,
              height: baseSize.height,
              transform: `scale(${scaleX}, ${scaleY})`,
              transformOrigin: 'top left'
            }}
          >
            {fieldContent()}
          </div>
        </div>
        {field.dependsOn && (
          <small className="field-dependency">Depends on: {field.dependsOn}</small>
        )}
        <div
          className="resize-handle resize-handle-right"
          onMouseDown={beginResize(['right'])}
          onTouchStart={beginResize(['right'])}
        />
        <div
          className="resize-handle resize-handle-bottom"
          onMouseDown={beginResize(['bottom'])}
          onTouchStart={beginResize(['bottom'])}
        />
        <div
          className="resize-handle resize-handle-corner"
          onMouseDown={beginResize(['right', 'bottom'])}
          onTouchStart={beginResize(['right', 'bottom'])}
        />
      </div>
    </div>
  );
}

function FormCanvas({ fields, onMoveField, onDeleteField, onUpdateField, onResizeField }) {
  const canvasRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'FORM_FIELD',
    drop: (item, monitor) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const delta = monitor.getDifferenceFromInitialOffset();
      if (!delta) {
        return;
      }

      const currentField = fields.find((f) => f.id === item.id);
      if (!currentField) {
        return;
      }

      const size = resolveFieldSize(currentField);
      const initialPos = currentField.position || { x: 0, y: 0 };

      let x = initialPos.x + delta.x;
      let y = initialPos.y + delta.y;

      x = Math.max(0, x);
      y = Math.max(0, y);

      const boundsWidth = canvas.scrollWidth || canvas.clientWidth;
      const boundsHeight = canvas.scrollHeight || canvas.clientHeight;

      const maxX = Math.max(0, boundsWidth - size.width);
      const maxY = Math.max(0, boundsHeight - size.height);

      x = Math.min(x, maxX);
      y = Math.min(y, maxY);

      if (snapToGrid) {
        const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
        debugLog('📍 Snap to grid', { from: { x, y }, to: { x: snappedX, y: snappedY } });
        x = snappedX;
        y = snappedY;
      }

      debugLog('✅ New position', { fieldId: item.id, x, y });
      onMoveField(item.id, { x, y });
    },
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  }), [fields, snapToGrid, onMoveField]);

  const setCanvasNode = useCallback((node) => {
    canvasRef.current = node;
    drop(node);
  }, [drop]);

  return (
    <div
      ref={scrollContainerRef}
      className="form-canvas-scroll"
    >
      <div
        ref={setCanvasNode}
        className="form-canvas-grid"
        style={{
          backgroundImage: snapToGrid
            ? `repeating-linear-gradient(0deg, transparent, transparent ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE}px), repeating-linear-gradient(90deg, transparent, transparent ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE}px)`
            : undefined
        }}
      >
        {isOver && <div className="drop-indicator" />}
        {fields.map((field) => {
          const position = field.position || { x: 50, y: 50 };
          return (
            <FormField
              key={field.id}
              field={field}
              position={position}
              onUpdate={onUpdateField}
              onDelete={onDeleteField}
              onResize={onResizeField}
            />
          );
        })}
        <div className="canvas-controls">
          <label>
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
            />{' '}
            Snap to grid
          </label>
          <button
            className="btn-debug"
            onClick={() => debugLog('Canvas snapshot', fields)}
          >
            🔍 Dump layout
          </button>
        </div>
      </div>
    </div>
  );
}

function ElementPalette({ onAddField }) {
  const fieldTypes = [
    { type: 'text', icon: '📝', label: 'Short text' },
    { type: 'checkbox', icon: '☑️', label: 'Checkbox' },
    { type: 'signature', icon: '✍️', label: 'Signature' },
    { type: 'photo', icon: '📷', label: 'Photo upload' }
  ];

  return (
    <div className="element-palette">
      <h3>Form elements</h3>
      <p className="palette-hint">Click to add</p>
      <div className="palette-items">
        {fieldTypes.map(({ type, icon, label }) => (
          <button
            key={type}
            className="palette-item-btn"
            onClick={() => onAddField(type)}
          >
            <span className="icon">{icon}</span>
            <span className="label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function normaliseField(field) {
  const size = resolveFieldSize(field);
  return {
    ...field,
    label: field.label || 'Field',
    placeholder:
      field.placeholder ?? (field.type === 'text' ? 'Enter text' : ''),
    position: field.position || { x: 50, y: 50 },
    size,
    width: size.width,
    height: size.height
  };
}

function FormEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [nextFieldId, setNextFieldId] = useState(1);

  useEffect(() => {
    if (id) {
      loadForm();
    }
  }, [id]);

  useEffect(() => {
    debugLog('📋 Current fields snapshot:', fields);
  }, [fields]);

  const loadForm = async () => {
    const result = await formService.getForm(id);
    if (result.ok && result.form) {
      setFormName(result.form.name);
      setFormDescription(result.form.description || '');
      const loadedFields = JSON.parse(result.form.content);
      const normalised = Array.isArray(loadedFields)
        ? loadedFields.map(normaliseField)
        : [];
      setFields(normalised);
      const maxId = normalised.length > 0 ? Math.max(...normalised.map((f) => f.id)) : 0;
      setNextFieldId(maxId + 1);
    }
  };

  const handleAddField = (type) => {
    const base = getBaseDimensions(type);
    const newField = normaliseField({
      id: nextFieldId,
      type,
      label: `Field ${nextFieldId}`,
      placeholder: type === 'text' ? 'Enter text' : '',
      required: false,
      position: { x: 50, y: fields.length * 80 + 50 },
      size: { width: base.width, height: base.height },
      width: base.width,
      height: base.height,
      value: '',
      checked: false
    });

    debugLog('➕ Field added:', newField);
    setFields((prev) => [...prev, newField]);
    setNextFieldId((prev) => prev + 1);
  };

  const handleMoveField = (fieldId, newPosition) => {
    debugLog('🔄 Field moved:', { fieldId, newPosition });
    setFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, position: newPosition } : field
      )
    );
  };

  const handleUpdateField = (fieldId, updates) => {
    debugLog('📝 Field updated:', { fieldId, updates });
    setFields((prev) =>
      prev.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }
        const next = { ...field, ...updates };
        if (updates.size || updates.width || updates.height) {
          const size = resolveFieldSize(next);
          next.size = size;
          next.width = size.width;
          next.height = size.height;
        }
        return next;
      })
    );
  };

  const handleResizeField = (fieldId, nextSize) => {
    debugLog('📐 Resizing field:', { fieldId, nextSize });
    setFields((prev) =>
      prev.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }
        const size = {
          width: Math.round(nextSize.width),
          height: Math.round(nextSize.height)
        };
        return {
          ...field,
          size,
          width: size.width,
          height: size.height
        };
      })
    );
  };

  const handleDeleteField = (fieldId) => {
    debugLog('🗑️ Field removed:', fieldId);
    setFields((prev) => prev.filter((field) => field.id !== fieldId));
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      alert('Please enter a form name');
      return;
    }

    setSaving(true);
    const formData = {
      name: formName,
      description: formDescription,
      content: fields
    };

    debugLog('💾 Saving form:', formData);

    const result = id
      ? await formService.updateForm(id, formData)
      : await formService.saveForm(formData);

    if (result.ok) {
      alert('Form saved successfully!');
      navigate('/');
    } else {
      alert(result.error);
    }
    setSaving(false);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="form-editor">
        <div className="editor-header">
          <div className="editor-header-content">
            <h1>✏️ Form builder</h1>
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={() => navigate('/')}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : '💾 Save form'}
              </button>
            </div>
          </div>
        </div>

        <div className="editor-content">
          <div className="editor-sidebar">
            <ElementPalette onAddField={handleAddField} />
          </div>

          <div className="editor-main">
            <div className="form-meta">
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Form name"
                className="input input-title"
              />
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Form description"
                className="input textarea"
                rows={2}
              />
            </div>

            <FormCanvas
              fields={fields}
              onMoveField={handleMoveField}
              onDeleteField={handleDeleteField}
              onUpdateField={handleUpdateField}
              onResizeField={handleResizeField}
            />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}

export default FormEditor;
