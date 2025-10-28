import axios from 'axios';

const resolveApiUrl = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  if (window.API_BASE_URL) {
    return window.API_BASE_URL;
  }

  if (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  if (window.location.hostname === 'localhost') {
    const port =
      (typeof process !== 'undefined' && process.env?.REACT_APP_API_PORT) ||
      '3001';
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }

  return '';
};

const API_URL = resolveApiUrl();

class AuthService {
  async login(username, password) {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username,
        password
      });

      if (response.data.ok && response.data.token) {
        localStorage.setItem('token', response.data.token);
        return { ok: true, user: response.data.user };
      }
      return { ok: false, error: 'Invalid username or password' };
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Unable to reach the server' };
    }
  }

  async changePassword(email, newPassword) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Authentication required' };
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/auth/change-password`,
        { email, newPassword },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Failed to change password' };
    }
  }

  isValidToken(token) {
    // Simple JWT shape validation
    return token && token.split('.').length === 3;
  }

  getToken() {
    return localStorage.getItem('token');
  }

  logout() {
    localStorage.removeItem('token');
  }

  getAuthHeaders() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

export const authService = new AuthService();
export default authService;

