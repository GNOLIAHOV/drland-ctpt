import { Navigate, Outlet } from 'react-router-dom';
import { ADMIN_USER_KEY, TOKEN_STORAGE_KEY } from '../api/axiosClient';

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function ProtectedRoute() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);

  if (!isTokenValid(token)) {
    if (token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(ADMIN_USER_KEY);
    }
    return <Navigate replace to="/login" />;
  }

  return <Outlet />;
}
