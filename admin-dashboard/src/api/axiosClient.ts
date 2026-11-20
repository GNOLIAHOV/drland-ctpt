import axios from 'axios';

export const TOKEN_STORAGE_KEY = 'accessToken';
export const ADMIN_USER_KEY = 'adminUser';

function resolveCoreApiUrl(): string {
  const envUrl = import.meta.env.VITE_CORE_API_URL as string | undefined;
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      return '/core-api';
    }
  }
  return envUrl || 'http://localhost:3001';
}

const axiosClient = axios.create({
  baseURL: resolveCoreApiUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Tự động đính kèm JWT token vào mọi request (trừ /auth/login)
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const isLoginRequest = config.url?.includes('/auth/login');
    if (token && !isLoginRequest) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response Interceptor: Tự động xóa token & chuyển về /login nếu lỗi 401
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isLoginRequest = error.config?.url?.includes('/auth/login');

    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(ADMIN_USER_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default axiosClient;
