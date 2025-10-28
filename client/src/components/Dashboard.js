import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formService } from '../services/formService';
import './Dashboard.css';

function Dashboard({ onLogout }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadForms();
  }, []);

  const loadForms = async () => {
    setLoading(true);
    const result = await formService.getForms();
    if (result.ok) {
      setForms(result.forms || []);
    } else {
      setError(result.error || 'Ошибка загрузки форм');
    }
    setLoading(false);
  };

  const handleNewForm = () => {
    navigate('/editor');
  };

  const handleEditForm = (id) => {
    navigate(`/editor/${id}`);
  };

  const handleDeleteForm = async (id, e) => {
    e.stopPropagation();
    if (window.confirm('Удалить эту форму?')) {
      const result = await formService.deleteForm(id);
      if (result.ok) {
        loadForms();
      } else {
        alert(result.error);
      }
    }
  };

  const handleViewForm = (id) => {
    navigate(`/form/${id}`);
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-content">
          <div>
            <h1>📋 Мои формы</h1>
            <p>Управление шаблонами форм</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => navigate('/admin')}>
              ⚙️ Админ-панель
            </button>
            <button className="btn btn-primary" onClick={handleNewForm}>
              ➕ Новая форма
            </button>
            <button className="btn btn-secondary" onClick={onLogout}>
              Выход
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        {error && <div className="error-message">{error}</div>}

        {forms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <h2>Нет созданных форм</h2>
            <p>Создайте свою первую форму для начала работы</p>
            <button className="btn btn-primary" onClick={handleNewForm}>
              Создать форму
            </button>
          </div>
        ) : (
          <div className="forms-grid">
            {forms.map(form => (
              <div key={form.id} className="form-card">
                <div className="form-card-header">
                  <h3>{form.name}</h3>
                  <div className="form-card-actions">
                    <button 
                      className="btn-icon" 
                      onClick={() => handleViewForm(form.id)}
                      title="Посмотреть"
                    >
                      👁️
                    </button>
                    <button 
                      className="btn-icon" 
                      onClick={() => handleEditForm(form.id)}
                      title="Редактировать"
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn-icon btn-icon-danger" 
                      onClick={(e) => handleDeleteForm(form.id, e)}
                      title="Удалить"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <p className="form-description">{form.description || 'Нет описания'}</p>
                <div className="form-card-footer">
                  <span className="form-date">
                    📅 {new Date(form.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;

