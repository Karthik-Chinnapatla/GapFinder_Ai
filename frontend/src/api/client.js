import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  withCredentials: true,
});

export async function fetchCsrfToken() {
  const { data } = await api.get('/auth/csrf-token');
  if (!data?.csrfToken) {
    throw new Error('Could not initialize CSRF verification token. Please restart the backend server.');
  }
  return data.csrfToken;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gapfinder_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/')) {
      localStorage.removeItem('gapfinder_token');
      window.dispatchEvent(new Event('gapfinder:unauthorized'));
    }
    return Promise.reject(err);
  }
);

export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  return err?.response?.data?.message || err?.response?.data?.detail || err?.message || fallback;
}

export default api;
