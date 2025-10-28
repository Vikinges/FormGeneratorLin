import axios from 'axios';

const API_URL = '';

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
      return { ok: false, error: 'Ошибка авторизации' };
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка соединения' };
    }
  }

  async changePassword(email, newPassword) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Необходима авторизация' };
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
      return { ok: false, error: error.response?.data?.error || 'Ошибка изменения пароля' };
    }
  }

  isValidToken(token) {
    // Простая проверка формата JWT
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

