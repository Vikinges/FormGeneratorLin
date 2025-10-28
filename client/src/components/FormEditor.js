import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { formService } from '../services/formService';
import './FormEditor.css';

// Грид-сетка канваса
const GRID_SIZE = 20;
const ENABLE_FORM_DEBUG = true;

const debugLog = (...args) => {
  if (ENABLE_FORM_DEBUG) {
    console.log('[FormEditor]', ...args);
  }
};

// Компоненты для элементов формы с позиционированием
function FormField({ field, position, onUpdate, onDelete }) {
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'FORM_FIELD',
    item: { id: field.id, type: field.type },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    end: (item, monitor) => {
      // Отладка
      const didDrop = monitor.didDrop();
      if (didDrop) {
        debugLog('✅ Элемент перемещен для поля:', field.id);
      } else {
        debugLog('❌ Элемент НЕ перемещен для поля:', field.id);
      }
    }
  }));

  const fieldContent = () => {
    switch (field.type) {
      case 'text':
        return <input type="text" placeholder={field.placeholder} className="input" disabled />;
      case 'checkbox':
        return (
          <label>
            <input type="checkbox" disabled /> {field.checkboxLabel || 'Да'}
          </label>
        );
      case 'signature':
        return (
          <div className="signature-canvas">
            <canvas width="300" height="80"></canvas>
          </div>
        );
      case 'photo':
        return <input type="file" accept="image/*" multiple className="input" disabled />;
      default:
        return null;
    }
  };

  const getIcon = () => {
    switch (field.type) {
      case 'text': return '📝';
      case 'checkbox': return '☑️';
      case 'signature': return '✍️';
      case 'photo': return '📷';
      default: return '📋';
    }
  };

  return (
    <div
      ref={dragPreview}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 1,
        pointerEvents: isDragging ? 'none' : 'auto'
      }}
      data-field-id={field.id}
    >
      <div className="field-container" style={{ 
        width: field.width || 'auto',
        minWidth: '200px'
      }}>
        <div className="field-header">
          <div ref={drag} className="drag-handle" title="Зажмите чтобы переместить">
            <span className="drag-icon">⋮⋮</span>
            <span>{getIcon()} {field.label}</span>
          </div>
          <button onClick={() => onDelete(field.id)} className="btn-delete">✕</button>
        </div>
        {fieldContent()}
        <div className="field-resize">
          <button onClick={() => onUpdate(field.id, { width: '150px' })} className="btn-resize" title="Маленький">⚬</button>
          <button onClick={() => onUpdate(field.id, { width: '250px' })} className="btn-resize" title="Средний">○</button>
          <button onClick={() => onUpdate(field.id, { width: '350px' })} className="btn-resize" title="Большой">◉</button>
        </div>
        {field.dependsOn && (
          <small className="field-dependency">
            Зависит от: {field.dependsOn}
          </small>
        )}
      </div>
    </div>
  );
}

// Канвас для форм
function FormCanvas({ fields, onMoveField, onDeleteField, onUpdateField }) {
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

      const currentField = fields.find(f => f.id === item.id);
      if (!currentField) {
        return;
      }

      const parseSize = (value, fallback) => {
        if (typeof value === 'number' && !Number.isNaN(value)) {
          return value;
        }
        if (typeof value === 'string') {
          const parsed = parseInt(value, 10);
          return Number.isNaN(parsed) ? fallback : parsed;
        }
        return fallback;
      };

      const fieldNode = canvas.querySelector(`[data-field-id=\"${item.id}\"]`);
      const fieldRect = fieldNode?.getBoundingClientRect();

      const fieldWidth = fieldRect?.width ?? parseSize(currentField?.width, 250);
      const fieldHeightHint = fieldRect?.height ?? (currentField?.type === 'signature'
        ? 180
        : currentField?.type === 'photo'
          ? 200
          : 150);

      const initialPos = currentField.position || { x: 0, y: 0 };
      let x = initialPos.x + delta.x;
      let y = initialPos.y + delta.y;

      x = Math.max(0, x);
      y = Math.max(0, y);

      const maxX = Math.max(0, (canvas.scrollWidth || canvas.clientWidth) - fieldWidth);
      const maxY = Math.max(0, (canvas.scrollHeight || canvas.clientHeight) - fieldHeightHint);

      x = Math.min(x, maxX);
      y = Math.min(y, maxY);

      if (snapToGrid) {
        const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
        debugLog('📍 Сетка: от', { x, y }, 'к', { x: snappedX, y: snappedY });
        x = snappedX;
        y = snappedY;
      }

      debugLog('✅ Новая позиция:', { x, y });
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
    <div ref={scrollContainerRef} style={{ overflow: 'auto', maxHeight: '600px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <div ref={setCanvasNode} className="form-canvas-grid" style={{ 
        position: 'relative', 
        backgroundImage: snapToGrid ? `repeating-linear-gradient(0deg, transparent, transparent ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE}px), repeating-linear-gradient(90deg, transparent, transparent ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE - 1}px, #e2e8f0 ${GRID_SIZE}px)` : undefined, 
        backgroundColor: 'white',
        minWidth: '1000px',
        minHeight: '800px'
      }}>
        {isOver && <div className="drop-indicator" />}
        {fields.map(field => {
          const position = field.position || { x: 50, y: 50 };
          return (
            <FormField
              key={field.id}
              field={field}
              position={position}
              onUpdate={onUpdateField}
              onDelete={onDeleteField}
            />
          );
        })}
      <div className="canvas-controls">
        <label>
          <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
          Привязка к сетке
        </label>
        <button
          className="btn-debug"
          onClick={() => console.log('[FormEditor]', '📋 Элементы на канвасе:', fields)}
        >
          🔍 Debug
        </button>
      </div>
      </div>
    </div>
  );
}

// Панель элементов для добавления
function ElementPalette({ onAddField }) {
  const fieldTypes = [
    { type: 'text', icon: '📝', label: 'Текстовое поле' },
    { type: 'checkbox', icon: '☑️', label: 'Чекбокс' },
    { type: 'signature', icon: '✍️', label: 'Подпись' },
    { type: 'photo', icon: '📷', label: 'Фото' }
  ];

  return (
    <div className="element-palette">
      <h3>Элементы формы</h3>
      <p className="palette-hint">Нажмите чтобы добавить</p>
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
    debugLog('📋 Текущее состояние полей:', fields);
  }, [fields]);

  const loadForm = async () => {
    const result = await formService.getForm(id);
    if (result.ok && result.form) {
      setFormName(result.form.name);
      setFormDescription(result.form.description || '');
      const loadedFields = JSON.parse(result.form.content);
      setFields(loadedFields);
      const maxId = loadedFields.length > 0 ? Math.max(...loadedFields.map(f => f.id)) : 0;
      setNextFieldId(maxId + 1);
    }
  };

  const handleAddField = (type) => {
    const newField = {
      id: nextFieldId,
      type,
      label: `Поле ${nextFieldId}`,
      placeholder: 'Введите текст',
      required: false,
      position: { x: 50, y: fields.length * 80 + 50 },
      width: '250px'
    };
    debugLog('➕ Добавлен элемент:', newField);
    setFields(prev => [...prev, newField]);
    setNextFieldId(prev => prev + 1);
  };

  const handleMoveField = (fieldId, newPosition) => {
    debugLog('🔄 Перемещение поля:', { fieldId, newPosition });
    setFields(prev =>
      prev.map(f =>
        f.id === fieldId ? { ...f, position: newPosition } : f
      )
    );
  };

  const handleUpdateField = (fieldId, updates) => {
    debugLog('📝 Обновление поля:', { fieldId, updates });
    setFields(prev =>
      prev.map(f =>
        f.id === fieldId ? { ...f, ...updates } : f
      )
    );
  };

  const handleDeleteField = (fieldId) => {
    debugLog('🗑️ Удаление поля:', fieldId);
    setFields(prev => prev.filter(f => f.id !== fieldId));
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      alert('Введите название формы');
      return;
    }

    setSaving(true);
    const formData = {
      name: formName,
      description: formDescription,
      content: fields
    };

    debugLog('💾 Сохранение формы:', formData);

    const result = id 
      ? await formService.updateForm(id, formData)
      : await formService.saveForm(formData);

    if (result.ok) {
      alert('Форма успешно сохранена!');
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
            <h1>✏️ Редактор формы</h1>
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={() => navigate('/')}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : '💾 Сохранить'}
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
                placeholder="Название формы"
                className="input input-title"
              />
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Описание формы"
                className="input textarea"
                rows="2"
              />
            </div>

            <FormCanvas
              fields={fields}
              onMoveField={handleMoveField}
              onDeleteField={handleDeleteField}
              onUpdateField={handleUpdateField}
            />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}

export default FormEditor;
