// src/pages/Login.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useEmployeeAuth } from '../context/EmployeeAuthContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('admin@shaadicards.local');
  const [password, setPassword] = useState('Admin@123'); // seed creds (update if needed)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');



  // Admin auth (this page is for Admin)
  const { login, token: adminToken, ready: adminReady } = useAuth();
  // Employee auth (in case already signed in as employee)
  const { token: empToken, ready: empReady } = useEmployeeAuth();

  const navigate = useNavigate();

  // If already logged-in → redirect appropriately
  useEffect(() => {
    if (!adminReady || !empReady) return;

    if (adminToken) {
      navigate('/admin', { replace: true });
      return;
    }
    if (empToken) {
      navigate('/app', { replace: true });
      return;
    }
  }, [adminToken, empToken, adminReady, empReady, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    const res = await login(email, password); // AuthContext handles storage + redirect
    if (!res?.success) {
      setErr(res?.error || 'Login failed');
      setLoading(false);
    } else {
      // fallback: in case window.location.replace is blocked
      navigate('/admin', { replace: true });
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500" />
          <h2 className="text-lg font-semibold">Admin Login</h2>
        </div>

        <form onSubmit={onSubmit} className="grid gap-3">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="username"
            disabled={loading}
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            disabled={loading}
          />

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button
            type="submit"
            className={'btn btn-primary justify-center ' + (loading ? 'opacity-70 pointer-events-none' : '')}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
