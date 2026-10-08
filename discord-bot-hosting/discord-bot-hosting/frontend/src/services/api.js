import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, name) => api.post('/auth/register', { email, password, name }),
  me: () => api.get('/auth/me')
};

export const botsAPI = {
  list: (params) => api.get('/bots', { params }),
  counts: () => api.get('/bots/counts'),
  get: (id) => api.get(`/bots/${id}`),
  create: (data) => api.post('/bots', data),
  update: (id, data) => api.patch(`/bots/${id}`, data),
  updateToken: (id, token) => api.patch(`/bots/${id}/token`, { token }),
  start: (id) => api.post(`/bots/${id}/start`),
  stop: (id) => api.post(`/bots/${id}/stop`),
  restart: (id) => api.post(`/bots/${id}/restart`),
  remove: (id) => api.delete(`/bots/${id}`),
  logs: (id, limit = 100) => api.get(`/bots/${id}/logs`, { params: { limit } })
};

export const dashboardAPI = {
  get: () => api.get('/dashboard')
};

export const logsAPI = {
  platform: (limit = 50) => api.get('/logs/platform', { params: { limit } })
};

export default api;
