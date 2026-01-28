import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api";

const AuthCtx = createContext(null);

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

function decodeUserFromJWT(t) {
  try {
    const p = JSON.parse(atob(t.split(".")[1]));
    return {
      id: p.sub ?? p.id ?? null,
      email: p.email ?? null,
      name: p.name ?? null,
      role: p.role ?? p.type ?? "admin",
      type: p.type ?? p.role ?? "admin",
      roles: Array.isArray(p.roles) ? p.roles : [],
      perms: Array.isArray(p.perms)
        ? p.perms
        : Array.isArray(p.permissions)
        ? p.permissions
        : [],
      is_super: p.is_super ?? p.is_super_admin ?? false,
    };
  } catch {
    return null;
  }
}

function rolesContainSuper(u) {
  const roles = Array.isArray(u?.roles) ? u.roles : [];
  for (const r of roles) {
    const v =
      typeof r === "string"
        ? r
        : r?.key || r?.slug || r?.name || r?.title || r?.role;
    if (!v) continue;
    const k = norm(v);
    if (
      k === "super_admin" ||
      k === "superadmin" ||
      k === "root" ||
      k === "owner"
    )
      return true;
    if (r?.is_super || r?.is_super_admin) return true;
  }
  return false;
}

const isSuper = (u) => {
  if (!u) return false;
  if (u.is_super || u.is_super_admin) return true;
  const keyish = norm(u.role_key || u.roleKey || u.role || u.type || "");
  if (["super_admin", "superadmin", "root", "owner"].includes(keyish))
    return true;
  if (rolesContainSuper(u)) return true;
  // wildcard on perms also implies super
  const perms = Array.isArray(u.perms)
    ? u.perms
    : Array.isArray(u.permissions)
    ? u.permissions
    : [];
  if (perms.includes("*") || perms.includes("super:*")) return true;
  return false;
};

function hasPerm(u, perm) {
  if (!u) return false;
  if (isSuper(u)) return true; // SA bypass
  const list = Array.isArray(u.perms)
    ? u.perms
    : Array.isArray(u.permissions)
    ? u.permissions
    : [];
  if (list.includes("*")) return true;
  if (list.includes(perm)) return true;
  const [mod] = String(perm).split(".");
  if (list.includes(`${mod}.*`)) return true;
  return false;
}

const hasAny = (u, arr = []) =>
  (Array.isArray(arr) ? arr : [arr]).some((p) => hasPerm(u, p));

function extractToken(data = {}) {
  return data.token || data.accessToken || data.jwt || data.access_token || null;
}

/* ------------ provider ------------ */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Bootstrap from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("adminAuth");
      if (raw) {
        const saved = JSON.parse(raw);
        const t = saved?.token || null;
        const u = saved?.user || (t ? decodeUserFromJWT(t) : null);
        if (t && !isExpired(t)) {
          setToken(t);
          setUser(u);
        } else {
          localStorage.removeItem("adminAuth");
        }
      }
    } finally {
      setReady(true);
    }
  }, []);

  // Set default header
  useEffect(() => {
    if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete api.defaults.headers.common.Authorization;
    api.defaults.withCredentials = true;
  }, [token]);

  // Login handler
  async function login(email, password) {
    try {
      const { data } = await api.post(
        "/api/admin/login",
        { email, password },
        { withCredentials: true }
      );

      const tok = extractToken(data);
      const u =
        data.user ||
        data.admin ||
        data.employee ||
        (tok ? decodeUserFromJWT(tok) : null) ||
        null;

      if (!tok || !u) throw new Error("Invalid server response");

      const payload = { token: tok, user: u };
      localStorage.setItem("adminAuth", JSON.stringify(payload));
      localStorage.removeItem("employeeAuth");

      setToken(payload.token);
      setUser(payload.user);
      setReady(true);

      setTimeout(() => window.location.replace("/admin"), 40);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err?.response?.data?.error || "Login failed",
      };
    }
  }

  // Logout handler
  function logout() {
    localStorage.removeItem("adminAuth");
    localStorage.removeItem("employeeAuth");
    setToken(null);
    setUser(null);
    window.location.replace("/login");
  }

  /* ------------ permissions ------------ */
  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      login,
      logout,

      // 🔐 Permission helpers
      can: (perm) => hasPerm(user, perm),
      canAny: (perms) => hasAny(user, perms),

      // 🟣 Full Super Admin access
      isSuperAdmin: isSuper(user),

      // 🧩 Combined helper for frontend checks and API conditions
      canAccess: (perm) => isSuper(user) || hasPerm(user, perm),

      actor: "admin",
      permissions: Array.isArray(user?.perms) ? user.perms : [],
      roles: Array.isArray(user?.roles) ? user.roles : [],
    }),
    [token, user, ready]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ------------ hook ------------ */
export const useAuth = () => useContext(AuthCtx);
