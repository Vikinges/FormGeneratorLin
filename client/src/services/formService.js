import axios from 'axios';
import { authService } from './authService';

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

class FormService {
  async getForms() {
    try {
      const response = await axios.get(`${API_URL}/api/forms`);
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Failed to load forms' };
    }
  }

  async getForm(id) {
    try {
      const response = await axios.get(`${API_URL}/api/forms/${id}`);
      return response.data;
    } catch (error) {
      return { ok: false, error: error.response?.data?.error || 'Failed to load form' };
    }
  }

  async saveForm(formData) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Authentication required' };
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
      return { ok: false, error: error.response?.data?.error || 'Failed to save form' };
    }
  }

  async updateForm(id, formData) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Authentication required' };
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
      return { ok: false, error: error.response?.data?.error || 'Failed to update form' };
    }
  }

  async deleteForm(id) {
    const token = localStorage.getItem('token');
    if (!token) {
      return { ok: false, error: 'Authentication required' };
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
      return { ok: false, error: error.response?.data?.error || 'Failed to delete form' };
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
      return { ok: false, error: error.response?.data?.error || 'Failed to submit form' };
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
      return { ok: false, error: error.response?.data?.error || 'Failed to sign form' };
    }
  }
}

export const formService = new FormService();
export default formService;

