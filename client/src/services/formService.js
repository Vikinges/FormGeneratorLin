import axios from 'axios';
import { authService } from './authService';

const API_URL = '';

class FormService {
  async getForms() {
    try {
      const response = await axios.get(`${API_URL}/api/forms`);
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка получения форм' };
    }
  }

  async getForm(id) {
    try {
      const response = await axios.get(`${API_URL}/api/forms/${id}`);
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка получения формы' };
    }
  }

  async saveForm(formData) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Необходима авторизация' };
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/forms`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка сохранения формы' };
    }
  }

  async updateForm(id, formData) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Необходима авторизация' };
    }

    try {
      const response = await axios.put(
        `${API_URL}/api/forms/${id}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка обновления формы' };
    }
  }

  async deleteForm(id) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Необходима авторизация' };
    }

    try {
      const response = await axios.delete(
        `${API_URL}/api/forms/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка удаления формы' };
    }
  }

  async submitFilledForm(id, data, files) {
    const formData = new FormData();
    formData.append('data', JSON.stringify(data));
    
    if (files && files.length > 0) {
      files.forEach(file => {
        formData.append(file.fieldname || 'files', file);
      });
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/forms/${id}/fill`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка отправки формы' };
    }
  }

  async signForm(id, signatures) {
    try {
      const response = await axios.post(
        `${API_URL}/api/forms/${id}/sign`,
        { signatures }
      );
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Ошибка подписания формы' };
    }
  }
}

export const formService = new FormService();
export default formService;

