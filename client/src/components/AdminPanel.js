import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import './AdminPanel.css';

function AdminPanel({ onLogout }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Пароли не совпадают' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Пароль должен содержать минимум 6 символов' });
      return;
    }

    setLoading(true);
    setMessage('');

    const result = await authService.changePassword(email, newPassword);

    if (result.ok) {
      setMessage({ type: 'success', text: 'Пароль успешно изменен!' });
      setEmail('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setMessage({ type: 'error', text: result.error || 'Ошибка изменения пароля' });
    }

    setLoading(false);
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-header-content">
          <h1>⚙️ Административная панель</h1>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              ← Назад к формам
            </button>
            <button className="btn btn-secondary" onClick={onLogout}>
              Выход
            </button>
          </div>
        </div>
      </div>

      <div className="admin-content">
        <div className="admin-card">
          <h2>Смена пароля</h2>
          <p className="admin-description">
            Измените пароль администратора и укажите email для восстановления
          </p>

          {message && (
            <div className={`message ${message.type === 'success' ? 'message-success' : 'message-error'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="admin-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="input"
                required
              />
            </div>

            <div className="form-group">
              <label>Новый пароль</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="input"
                required
              />
            </div>

            <div className="form-group">
              <label>Подтвердите пароль</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                className="input"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Сохранение...' : '💾 Сохранить изменения'}
            </button>
          </form>
        </div>

        <div className="admin-info">
          <h3>📋 Информация о системе</h3>
          <div className="info-grid">
            <div className="info-item">
              <strong>Текущий пользователь:</strong> admin
            </div>
            <div className="info-item">
              <strong>Версия:</strong> 1.0.0
            </div>
            <div className="info-item">
              <strong>Статус:</strong> <span className="status-ok">✓ Активен</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;

