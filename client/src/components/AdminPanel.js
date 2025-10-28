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
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must contain at least 6 characters' });
      return;
    }

    setLoading(true);
    setMessage('');

    const result = await authService.changePassword(email, newPassword);

    if (result.ok) {
      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setEmail('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to change password' });
    }

    setLoading(false);
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-header-content">
          <h1>⚙️ Admin Console</h1>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              ← Back to forms
            </button>
            <button className="btn btn-secondary" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="admin-content">
        <div className="admin-card">
          <h2>Password reset</h2>
          <p className="admin-description">
            Update the administrator password and provide a recovery email
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
              <label>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="input"
                required
              />
            </div>

            <div className="form-group">
              <label>Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="input"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : '💾 Save changes'}
            </button>
          </form>
        </div>

        <div className="admin-info">
          <h3>📋 System info</h3>
          <div className="info-grid">
            <div className="info-item">
              <strong>Current user:</strong> admin
            </div>
            <div className="info-item">
              <strong>Version:</strong> 1.0.0
            </div>
            <div className="info-item">
              <strong>Status:</strong> <span className="status-ok">✓ Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;

