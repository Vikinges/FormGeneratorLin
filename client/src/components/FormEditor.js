import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { formService } from '../services/formService';
import './FormEditor.css';

const GRID_SIZE = 20;
const DEBUG_FLAG_FROM_ENV =
  typeof process !== 'undefined' && process.env.REACT_APP_ENABLE_FORM_DEBUG === 'true';
const BASE_CANVAS_WIDTH = 795; // ~210mm at 96dpi
const BASE_CANVAS_HEIGHT = Math.round(BASE_CANVAS_WIDTH * Math.sqrt(2));

const MIN_FIELD_SIZE = { width: 160, height: 56 };

const FIELD_BASE_DIMENSIONS = {
  text: { width: 280, height: 72 },
  checkbox: { width: 240, height: 56 },
  signature: { width: 320, height: 160 },
  photo: { width: 320, height: 200 },
  default: { width: 260, height: 80 }
};

const FIELD_TEMPLATES = {
  text: {
    label: 'Text field',
    placeholder: 'Type something here'
  },
  checkbox: {
    label: 'Checkbox',
    placeholder: ''
  },
  signature: {
    label: 'Signature',
    placeholder: ''
  },
  photo: {
    label: 'Photo upload',
    placeholder: ''
  }
};

const FIELD_ICONS = {
  text: 'Aa',
  checkbox: '[]',
  signature: 'Sig',
  photo: 'Img',
  default: 'Fld'
};

const getDebugFlag = () => {
  if (DEBUG_FLAG_FROM_ENV) {
    return true;
  }

  if (typeof window !== 'undefined') {
    const runtimeFlag = window.__FORM_EDITOR_DEBUG__;
    if (typeof runtimeFlag === 'boolean') {
      return runtimeFlag;
    }

    try {
      const stored = window.localStorage?.getItem('formEditorDebug');
      if (stored != null) {
        return stored === 'true';
      }
    } catch (error) {
      // Ignore storage access issues (privacy mode, blocked storage, etc.)
    }
  }

  return false;
};

const debugLog = (...args) => {
  if (getDebugFlag()) {
    console.log('[FormEditor]', ...args);
  }
};

const parseDimension = (value, fallback) => {
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

const resolveFieldSize = (field) => {
  const base = FIELD_BASE_DIMENSIONS[field.type] || FIELD_BASE_DIMENSIONS.default;

  const width = Math.max(
    MIN_FIELD_SIZE.width,
    parseDimension(field?.size?.width ?? field?.width, base.width)
  );

  const height = Math.max(
    MIN_FIELD_SIZE.height,
    parseDimension(field?.size?.height ?? field?.height, base.height)
  );

  return { width, height };
};

const normaliseField = (raw) => {
  if (!raw) {
    return null;
  }

  const baseSize = FIELD_BASE_DIMENSIONS[raw.type] || FIELD_BASE_DIMENSIONS.default;

  const position = {
    x: parseDimension(raw?.position?.x, 50),
    y: parseDimension(raw?.position?.y, 50)
  };

  const size = {
    width: Math.max(
      MIN_FIELD_SIZE.width,
      parseDimension(raw?.size?.width ?? raw?.width, baseSize.width)
    ),
    height: Math.max(
      MIN_FIELD_SIZE.height,
      parseDimension(raw?.size?.height ?? raw?.height, baseSize.height)
    )
  };

  return {
    ...raw,
    id: raw.id,
    type: raw.type || 'text',
    label: raw.label || FIELD_TEMPLATES[raw.type]?.label || 'Untitled field',
    placeholder: raw.placeholder ?? FIELD_TEMPLATES[raw.type]?.placeholder ?? '',
    position,
    size
  };
};

function FormField({ field, position, scale, onDelete, onResize, onUpdate }) {
  const size = resolveFieldSize(field);

  const [{ isDragging }, drag, dragPreview] = useDrag(
    () => ({
      type: 'FORM_FIELD',
      item: { id: field.id, type: field.type },
      collect: (monitor) => ({
        isDragging: monitor.isDragging()
      })
    }),
    [field.id, field.type]
  );

  const handleLabelChange = useCallback(
    (event) => {
      if (!onUpdate) {
        return;
      }
      const nextValue = event.target.value;
      onUpdate(field.id, { label: nextValue });
    },
    [field.id, onUpdate]
  );

  const handlePlaceholderChange = useCallback(
    (event) => {
      if (!onUpdate) {
        return;
      }
      const nextValue = event.target.value;
      onUpdate(field.id, { placeholder: nextValue });
    },
    [field.id, onUpdate]
  );

  const handleCheckboxLabelChange = useCallback(
    (event) => {
      if (!onUpdate) {
        return;
      }
      onUpdate(field.id, { checkboxLabel: event.target.value });
    },
    [field.id, onUpdate]
  );

  const handleRequiredToggle = useCallback(
    (event) => {
      if (!onUpdate) {
        return;
      }
      onUpdate(field.id, { required: event.target.checked });
    },
    [field.id, onUpdate]
  );

  const handleResizeStart = useCallback(
    (direction) => (event) => {
      if (!onResize) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = resolveFieldSize(field);

      const handlePointerMove = (moveEvent) => {
        moveEvent.preventDefault();

        const deltaX = (moveEvent.clientX - startX) / scale;
        const deltaY = (moveEvent.clientY - startY) / scale;

        let nextWidth = startSize.width;
        let nextHeight = startSize.height;

        if (direction === 'right' || direction === 'corner') {
          nextWidth = Math.max(MIN_FIELD_SIZE.width, startSize.width + deltaX);
        }

        if (direction === 'bottom' || direction === 'corner') {
          nextHeight = Math.max(MIN_FIELD_SIZE.height, startSize.height + deltaY);
        }

        const roundedWidth = Math.round(nextWidth);
        const roundedHeight = Math.round(nextHeight);

        onResize(field.id, { width: roundedWidth, height: roundedHeight });
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [field, onResize, scale]
  );

  const renderFieldPreview = () => {
    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            className="field-preview-input"
            placeholder={field.placeholder || 'Text field'}
            disabled
          />
        );
      case 'checkbox':
        return (
          <label className="checkbox-field">
            <input type="checkbox" disabled />
            <span>{field.checkboxLabel || 'Option'}</span>
          </label>
        );
      case 'signature':
        return (
          <div className="signature-canvas">
            <canvas width="320" height="120" />
            <span className="signature-hint">Sign inside the box</span>
          </div>
        );
      case 'photo':
        return (
          <div className="photo-upload-placeholder">
            <span>Drop photos here</span>
            <small>JPG or PNG up to 5MB</small>
          </div>
        );
      default:
        return (
          <input
            type="text"
            className="field-preview-input"
            placeholder={field.placeholder || 'Field'}
            disabled
          />
        );
    }
  };

  const icon = FIELD_ICONS[field.type] || FIELD_ICONS.default;

  return (
    <div
      ref={dragPreview}
      className="field-wrapper"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 1
      }}
      data-field-id={field.id}
    >
      <div className="field-container">
        <div className="field-header">
          <div
            ref={drag}
            className="drag-handle"
            title="Drag to move field"
          >
            <span className="drag-icon">::</span>
            <span className="field-name">
              {icon} {field.label}
            </span>
          </div>
          {field.required && <span className="field-required-badge">Required</span>}
          <button
            type="button"
            className="btn-icon"
            onClick={() => onDelete(field.id)}
            aria-label="Remove field"
          >
            ×
          </button>
        </div>

        <div className="field-config">
          <label className="field-config-label" htmlFor={`field-label-${field.id}`}>
            Field title
          </label>
          <input
            id={`field-label-${field.id}`}
            type="text"
            className="field-label-input"
            value={field.label || ''}
            onChange={handleLabelChange}
            placeholder="Enter field title"
          />
          {field.type === 'text' && (
            <>
              <label
                className="field-config-label"
                htmlFor={`field-placeholder-${field.id}`}
              >
                Placeholder
              </label>
              <input
                id={`field-placeholder-${field.id}`}
                type="text"
                className="field-placeholder-input"
                value={field.placeholder || ''}
                onChange={handlePlaceholderChange}
                placeholder="Add helper text for signers"
              />
            </>
          )}
          {field.type === 'checkbox' && (
            <>
              <label
                className="field-config-label"
                htmlFor={`field-checkbox-label-${field.id}`}
              >
                Checkbox label
              </label>
              <input
                id={`field-checkbox-label-${field.id}`}
                type="text"
                className="field-placeholder-input"
                value={field.checkboxLabel || ''}
                onChange={handleCheckboxLabelChange}
                placeholder="Label displayed next to checkbox"
              />
            </>
          )}
          <label className="field-config-toggle">
            <input
              type="checkbox"
              checked={Boolean(field.required)}
              onChange={handleRequiredToggle}
            />
            Required field
          </label>
        </div>

        <div className="field-body">{renderFieldPreview()}</div>

        {field.dependsOn && (
          <small className="field-meta">Depends on field {field.dependsOn}</small>
        )}

        {onResize && (
          <>
            <div
              className="resize-handle resize-handle-right"
              onPointerDown={handleResizeStart('right')}
              role="presentation"
            />
            <div
              className="resize-handle resize-handle-bottom"
              onPointerDown={handleResizeStart('bottom')}
              role="presentation"
            />
            <div
              className="resize-handle resize-handle-corner"
              onPointerDown={handleResizeStart('corner')}
              role="presentation"
            />
          </>
        )}
      </div>
    </div>
  );
}

function FormCanvas({ fields, onMoveField, onDeleteField, onResizeField, onUpdateField }) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasScaleRef = useRef(1);

  const [viewportWidth, setViewportWidth] = useState(BASE_CANVAS_WIDTH);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const spacePressedRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef({ x: 0, y: 0 });

  const canvasHeight = useMemo(() => {
    if (!fields || fields.length === 0) {
      return BASE_CANVAS_HEIGHT;
    }

    const padding = 160;
    const lowestEdge = fields.reduce((bottom, field) => {
      const position = field.position || { x: 50, y: 50 };
      const size = resolveFieldSize(field);
      return Math.max(bottom, position.y + size.height);
    }, 0);

    return Math.max(BASE_CANVAS_HEIGHT, lowestEdge + padding);
  }, [fields]);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return;
    }

    setViewportWidth(node.clientWidth);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setViewportWidth(entries[0].contentRect.width);
      }
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    return Math.min(viewportWidth / BASE_CANVAS_WIDTH, 1);
  }, [viewportWidth]);

  const effectiveScale = useMemo(() => fitScale * zoom, [fitScale, zoom]);

  useEffect(() => {
    canvasScaleRef.current = effectiveScale || 1;
  }, [effectiveScale]);

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: 'FORM_FIELD',
      drop: (item, monitor) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }

        const canvasRect = canvas.getBoundingClientRect();
        const scaleFactor = canvasRect.width / BASE_CANVAS_WIDTH;
        const pointerPosition = monitor.getClientOffset();

        if (!pointerPosition) {
          return;
        }

        const initialClientOffset = monitor.getInitialClientOffset();
        const initialSourceClientOffset = monitor.getInitialSourceClientOffset();

        let offsetX = 0;
        let offsetY = 0;

        if (initialClientOffset && initialSourceClientOffset) {
          offsetX = (initialClientOffset.x - initialSourceClientOffset.x) / scaleFactor;
          offsetY = (initialClientOffset.y - initialSourceClientOffset.y) / scaleFactor;
        }

        const pointerX = (pointerPosition.x - canvasRect.left) / scaleFactor;
        const pointerY = (pointerPosition.y - canvasRect.top) / scaleFactor;

        let x = pointerX - offsetX;
        let y = pointerY - offsetY;

        const currentField = fields.find((field) => field.id === item.id);
        const fieldSize = resolveFieldSize(currentField || { type: 'default' });

        x = Math.max(0, Math.min(x, BASE_CANVAS_WIDTH - fieldSize.width));
        y = Math.max(0, Math.min(y, canvasHeight - fieldSize.height));

        if (snapToGrid) {
          x = Math.round(x / GRID_SIZE) * GRID_SIZE;
          y = Math.round(y / GRID_SIZE) * GRID_SIZE;
        }

        debugLog('Field moved', { fieldId: item.id, x, y });
        onMoveField(item.id, { x, y });
      },
      collect: (monitor) => ({
        isOver: monitor.isOver()
      })
    }),
    [fields, snapToGrid, onMoveField, canvasHeight]
  );

  const setCanvasNode = useCallback(
    (node) => {
      canvasRef.current = node;
      if (node) {
        drop(node);
      }
    },
    [drop]
  );

  const stopPanning = useCallback(() => {
    if (!isPanningRef.current) {
      return;
    }
    isPanningRef.current = false;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space') {
        if (!spacePressedRef.current) {
          event.preventDefault();
        }
        spacePressedRef.current = true;
        setSpacePressed(true);
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false;
        setSpacePressed(false);
        stopPanning();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [stopPanning]);

  const handleWheel = useCallback(
    (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const { clientX, clientY, deltaY } = event;

      const viewportRect = viewportRef.current?.getBoundingClientRect();
      const zoomFactor = deltaY < 0 ? 1.05 : 0.95;

      setZoom((previousZoom) => {
        const nextZoom = Math.min(Math.max(previousZoom * zoomFactor, 0.5), 2.5);

        if (viewportRect) {
          const offsetX = clientX - viewportRect.left;
          const offsetY = clientY - viewportRect.top;
          const currentScale = fitScale * previousZoom;
          const nextScale = fitScale * nextZoom;

          setPan((previousPan) => {
            const contentX = (offsetX - previousPan.x) / currentScale;
            const contentY = (offsetY - previousPan.y) / currentScale;
            return {
              x: offsetX - contentX * nextScale,
              y: offsetY - contentY * nextScale
            };
          });
        }

        debugLog('Zoom changed', { nextZoom });
        return nextZoom;
      });
    },
    [fitScale]
  );

  const handlePointerDown = useCallback((event) => {
    if (!spacePressedRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    isPanningRef.current = true;
    setIsPanning(true);
    lastPanPointRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (!isPanningRef.current) {
      return;
    }

    event.preventDefault();

    const deltaX = event.clientX - lastPanPointRef.current.x;
    const deltaY = event.clientY - lastPanPointRef.current.y;

    lastPanPointRef.current = { x: event.clientX, y: event.clientY };

    setPan((previousPan) => ({
      x: previousPan.x + deltaX,
      y: previousPan.y + deltaY
    }));
  }, []);

  const zoomPercent = Math.round(effectiveScale * 100);

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    debugLog('View reset');
  }, []);

  return (
    <div
      className="canvas-stage"
      ref={viewportRef}
      onWheel={handleWheel}
    >
      <div
        className={[
          'canvas-viewport',
          spacePressed ? 'canvas-viewport--space' : '',
          isPanning ? 'canvas-viewport--panning' : ''
        ].join(' ')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onPointerLeave={stopPanning}
      >
        <div
          className="canvas-translate"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
        >
          <div
            ref={setCanvasNode}
            className="form-canvas-grid"
            style={{
              width: `${BASE_CANVAS_WIDTH}px`,
              minHeight: `${canvasHeight}px`,
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
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
                  scale={canvasScaleRef.current || 1}
                  onDelete={onDeleteField}
                  onResize={onResizeField}
                  onUpdate={onUpdateField}
                />
              );
            })}

            <div className="canvas-controls">
              <label className="controls-checkbox">
                <input
                  type="checkbox"
                  checked={snapToGrid}
                  onChange={(event) => setSnapToGrid(event.target.checked)}
                />
                Snap to grid
              </label>
              <span className="controls-divider">|</span>
              <span className="controls-zoom">{zoomPercent}%</span>
              <button type="button" className="btn-ghost" onClick={resetView}>
                Reset view
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => debugLog('Canvas snapshot', fields)}
              >
                Dump layout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ElementPalette({ onAddField }) {
  const paletteItems = [
    { type: 'text', icon: FIELD_ICONS.text, label: 'Text field' },
    { type: 'checkbox', icon: FIELD_ICONS.checkbox, label: 'Checkbox' },
    { type: 'signature', icon: FIELD_ICONS.signature, label: 'Signature' },
    { type: 'photo', icon: FIELD_ICONS.photo, label: 'Photo upload' }
  ];

  return (
    <aside className="palette-strip">
      <h3>Elements</h3>
      <p className="palette-hint">
        Pick an element and drop it on the canvas. Hold space and drag to pan.
      </p>
      <div className="palette-items">
        {paletteItems.map(({ type, icon, label }) => (
          <button
            key={type}
            type="button"
            className="palette-item-btn"
            onClick={() => onAddField(type)}
          >
            <span className="icon">{icon}</span>
            <span className="label">{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function FormEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [fields, setFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [nextFieldId, setNextFieldId] = useState(1);

  const loadForm = useCallback(async () => {
    if (!id) {
      return;
    }

    const result = await formService.getForm(id);
    if (!result.ok || !result.form) {
      return;
    }

    setFormName(result.form.name);
    setFormDescription(result.form.description || '');

    let loadedFields = [];
    try {
      const parsed = JSON.parse(result.form.content || '[]');
      if (Array.isArray(parsed)) {
        loadedFields = parsed;
      }
    } catch (error) {
      debugLog('Unable to parse stored form content', error);
    }

    const normalised = loadedFields
      .map(normaliseField)
      .filter(Boolean);

    setFields(normalised);

    const maxId = normalised.length
      ? Math.max(...normalised.map((field) => Number(field.id) || 0))
      : 0;

    setNextFieldId(maxId + 1);

    debugLog('Form loaded', { id, fieldCount: normalised.length });
  }, [id]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleAddField = useCallback(
    (type) => {
      setFields((previousFields) => {
        const baseTemplate = FIELD_TEMPLATES[type] || FIELD_TEMPLATES.text;
        const baseSize = FIELD_BASE_DIMENSIONS[type] || FIELD_BASE_DIMENSIONS.default;

        const nextId = nextFieldId;
        const newField = {
          id: nextId,
          type,
          label: `${baseTemplate.label} ${nextId}`,
          placeholder: baseTemplate.placeholder,
          required: false,
          position: {
            x: 64,
            y: previousFields.length * 120 + 64
          },
          size: {
            width: baseSize.width,
            height: baseSize.height
          }
        };

        if (type === 'checkbox' && !newField.checkboxLabel) {
          newField.checkboxLabel = 'Option';
        }

        debugLog('Field added', newField);
        return [...previousFields, newField];
      });

      setNextFieldId((current) => current + 1);
    },
    [nextFieldId]
  );

  const handleMoveField = useCallback((fieldId, newPosition) => {
    setFields((previousFields) =>
      previousFields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              position: {
                x: Math.round(newPosition.x),
                y: Math.round(newPosition.y)
              }
            }
          : field
      )
    );
  }, []);

  const handleUpdateField = useCallback((fieldId, updates) => {
    if (!updates || typeof updates !== 'object') {
      return;
    }

    setFields((previousFields) =>
      previousFields.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }

        const nextField = { ...field, ...updates };

        if (updates.position) {
          nextField.position = {
            ...field.position,
            ...updates.position
          };
        }

        if (updates.size) {
          nextField.size = {
            ...field.size,
            ...updates.size
          };
        }

        return nextField;
      })
    );
  }, []);

  const handleResizeField = useCallback((fieldId, newSize) => {
    setFields((previousFields) =>
      previousFields.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              size: {
                width: Math.max(MIN_FIELD_SIZE.width, Math.round(newSize.width)),
                height: Math.max(MIN_FIELD_SIZE.height, Math.round(newSize.height))
              }
            }
          : field
      )
    );
  }, []);

  const handleDeleteField = useCallback((fieldId) => {
    setFields((previousFields) => previousFields.filter((field) => field.id !== fieldId));
  }, []);

  const handleSave = useCallback(async () => {
    if (!formName.trim()) {
      alert('Please provide a form name before saving.');
      return;
    }

    setSaving(true);

    const payload = {
      name: formName,
      description: formDescription,
      content: fields
    };

    debugLog('Saving form', payload);

    const result = id
      ? await formService.updateForm(id, payload)
      : await formService.saveForm(payload);

    setSaving(false);

    if (!result.ok) {
      alert(result.error || 'Unable to save the form. Please try again.');
      return;
    }

    alert('Form saved successfully.');
    navigate('/');
  }, [formName, formDescription, fields, id, navigate]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="form-editor">
        <header className="editor-header">
          <div className="editor-header-content">
            <h1>Form builder</h1>
            <div className="header-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/')}
              >
                Back to dashboard
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save form'}
              </button>
            </div>
          </div>
        </header>

        <main className="editor-content">
          <section className="editor-hero">
            <div className="hero-copy">
              <h2>Design A4-ready forms in minutes</h2>
              <p>
                Drag elements onto the canvas, snap them to the grid, and fine tune the layout
                with precise resizing. The left panel hosts all available elements, and the
                preview matches the generated PDF size.
              </p>
              <ul className="hero-points">
                <li>
                  Use the scroll wheel with Ctrl or Cmd to zoom in and out of the canvas.
                </li>
                <li>Hold the space bar and drag with the mouse to pan around the page.</li>
                <li>Resize fields from any corner and keep track of every move with debug logs.</li>
              </ul>
            </div>
            <div className="hero-illustration">
              <div className="hero-card">
                <span className="hero-card-title">Canvas tips</span>
                <span className="hero-card-body">Space + drag = pan</span>
                <span className="hero-card-body">Ctrl/Cmd + wheel = zoom</span>
                <span className="hero-card-body">Shift + drag handles = resize</span>
              </div>
            </div>
          </section>

          <section className="form-meta-card">
            <div className="section-header">
              <h2>Form details</h2>
              <p>Give the form a clear name and describe its purpose.</p>
            </div>
            <div className="form-meta">
              <input
                type="text"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Name your form"
                className="input input-title"
              />
              <textarea
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                placeholder="Add a short description for editors and signers"
                className="textarea"
                rows={2}
              />
            </div>
          </section>

          <section className="builder-section">
            <ElementPalette onAddField={handleAddField} />
            <div className="builder-board">
              <FormCanvas
                fields={fields}
                onMoveField={handleMoveField}
                onDeleteField={handleDeleteField}
                onUpdateField={handleUpdateField}
                onResizeField={handleResizeField}
              />
            </div>
          </section>
        </main>
      </div>
    </DndProvider>
  );
}

export default FormEditor;
