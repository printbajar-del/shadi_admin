// src/hooks/useEmployeePermissions.js
import { useEffect, useMemo, useState } from "react";
import { useEmployeeAuth } from "../context/EmployeeAuthContext.jsx";

/**
 * Employee permissions hook
 * - Reads perms from EmployeeAuthContext (instant)
 * - Also refreshes from server when token changes (stays in sync)
 * - Helpers: can, canAny, canAll (support "*", "module.*" wildcards)
 *
 * Server contracts (any one is fine):
 *  1) GET /api/employee/me          -> { perms: [...]} or { permissions: [...] }
 *  2) GET /api/me/permissions       -> { permissions: [...] }
 */
export default function useEmployeePermissions() {
  const { token, permissions: ctxPerms = [], user } = useEmployeeAuth();

  const [loading, setLoading] = useState(false);
  const [perms, setPerms] = useState(() => (Array.isArray(ctxPerms) ? ctxPerms : []));

  // keep local state in sync with context first
  useEffect(() => {
    setPerms(Array.isArray(ctxPerms) ? ctxPerms : []);
  }, [ctxPerms]);

  // refresh from server on token change
  useEffect(() => {
    let alive = true;
    async function run() {
      if (!token) {
        if (alive) setPerms([]);
        return;
      }
      setLoading(true);
      try {
        const base = import.meta.env.VITE_API_URL || "http://localhost:5000";
        const headers = { Authorization: "Bearer " + token };
        let res = await fetch(base + "/api/employee/me", { headers, credentials: "include" });
        let data, p = [];
        if (res.ok) {
          data = await res.json();
          p = data?.perms || data?.permissions || [];
        }
        // fallback endpoint
        if (!Array.isArray(p) || p.length === 0) {
          res = await fetch(base + "/api/me/permissions", { headers, credentials: "include" });
          if (res.ok) {
            const d2 = await res.json();
            p = d2?.permissions || d2?.perms || [];
          }
        }
        if (alive) setPerms(Array.isArray(p) ? p : []);
      } catch {
        if (alive) setPerms([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [token]);

  // ---------- permission matching with wildcards ----------
  const setObj = useMemo(() => new Set(perms), [perms]);

  const has = (perm) => {
    if (!perm) return true;
    // super-admin shortcut (context might already enforce this, but harmless)
    if (user?.role === "super_admin" || (Array.isArray(user?.roles) && user.roles.map(String).map(s => s.toLowerCase().replace(/\s+/g, "_")).includes("super_admin"))) {
      return true;
    }
    if (setObj.has("*") || setObj.has(perm)) return true;
    const [mod] = String(perm).split(".");
    return setObj.has(`${mod}.*`);
  };

  const can = (perm) => has(perm);
  const canAny = (arr = []) => (Array.isArray(arr) ? arr : [arr]).some(has);
  const canAll = (arr = []) => (Array.isArray(arr) ? arr : [arr]).every(has);

  return {
    loading,
    set: setObj,
    permissions: perms,
    can,
    canAny,
    canAll,
  };
}
