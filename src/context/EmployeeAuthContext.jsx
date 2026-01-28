// src/context/EmployeeAuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api";

const EmployeeAuthCtx = createContext(null);

/* ------------ helpers ------------ */
function isExpired(jwt) {
  try {
    const { exp } = JSON.parse(atob(jwt.split(".")[1]));
    return exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, "_");

function decodeFromJWT(t) {
  try {
    const p = JSON.parse(atob(t.split(".")[1]));
    return {
      id: p.sub ?? p.id ?? null,
      email: p.email ?? null,
      name: p.name ?? null,
      role: p.role ?? p.type ?? "employee",
      type: p.type ?? p.role ?? "employee",
      roles: Array.isArray(p.roles) ? p.roles : [],
      perms: Array.isArray(p.perms)
        ? p.perms
        : Array.isArray(p.permissions)
        ? p.permissions
        : [],
    };
  } catch {
    return null;
  }
}

const isSuper = (u) => {
  if (!u) return false;
  const role = norm(u.role || u.type || "");
  if (role === "super_admin") return true;
  const roles = Array.isArray(u.roles) ? u.roles.map(norm) : [];
  return roles.includes("super_admin");
};

function hasPerm(u, perm) {
  if (!u) return false;
  if (isSuper(u)) return true;
  const list = Array.isArray(u.perms) ? u.perms : [];
  if (list.includes("*")) return true;
  if (list.includes(perm)) return true;
  const [mod] = String(perm).split(".");
  return list.includes(`${mod}.*`);
}
const hasAny = (u, arr = []) => (Array.isArray(arr) ? arr : [arr]).some((p) => hasPerm(u, p));

function extractToken(data = {}) {
  return data.token || data.accessToken || data.jwt || data.access_token || null;
}

/* ------------ provider ------------ */
export function EmployeeAuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [ready, setReady] = useState(false);

  // Bootstrap
  useEffect(() => {
    try {
      const raw = localStorage.getItem("employeeAuth");
      if (raw) {
        const saved = JSON.parse(raw);
        const t = saved?.token || null;
        const u = saved?.employee || saved?.user || (t ? decodeFromJWT(t) : null);
        if (t && !isExpired(t)) {
          setToken(t);
          setEmployee(u);
        } else {
          localStorage.removeItem("employeeAuth");
        }
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete api.defaults.headers.common.Authorization;
    api.defaults.withCredentials = true;
  }, [token]);

  // ✅ No auto-logout effect here

  async function login(email, password) {
    try {
      // NOTE: If your employee login endpoint differs, change this path
      const { data } = await api.post(
        "/api/admin/login",
        { email, password },
        { withCredentials: true }
      );

      const tok = extractToken(data);
      const u =
        data.employee ||
        data.user ||
        data.admin ||
        (tok ? decodeFromJWT(tok) : null) ||
        null;

      if (!tok || !u) throw new Error("Invalid server response");

      const payload = { token: tok, employee: u };
      localStorage.setItem("employeeAuth", JSON.stringify(payload));
      localStorage.removeItem("adminAuth");

      setToken(payload.token);
      setEmployee(payload.employee);

      setTimeout(() => window.location.replace("/app"), 50);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err?.response?.data?.error || "Login failed",
      };
    }
  }

  function logout() {
    localStorage.removeItem("employeeAuth");
    setToken(null);
    setEmployee(null);
    window.location.replace("/login");
  }

  const value = useMemo(
    () => ({
      token,
      user: employee, // alias for UI
      employee,
      ready,
      login,
      logout,
      actor: "employee",
      can: (perm) => hasPerm(employee, perm),
      canAny: (perms) => hasAny(employee, perms),
      isSuperAdmin: isSuper(employee),
      permissions: Array.isArray(employee?.perms) ? employee.perms : [],
      roles: Array.isArray(employee?.roles) ? employee.roles : [],
    }),
    [token, employee, ready]
  );

  return (
    <EmployeeAuthCtx.Provider value={value}>
      {children}
    </EmployeeAuthCtx.Provider>
  );
}

export const useEmployeeAuth = () => useContext(EmployeeAuthCtx);
