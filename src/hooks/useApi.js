// src/hooks/useApi.js
import { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useEmployeeAuth } from "../context/EmployeeAuthContext.jsx";

/**
 * useApi()
 * - Auto-picks admin token, else employee token
 * - JSON helpers: get/post/put/patch/del
 * - apiJson(path, opts) stays backward-compatible
 * - Nice Error objects: err.status, err.data, err.text
 * - Credentials included by default
 */
export function useApi(baseOverride) {
  const { token: adminToken } = useAuth() || {};
  const { token: empToken } = useEmployeeAuth() || {};

  const base = useMemo(
    () => baseOverride || import.meta.env.VITE_API_URL || "http://localhost:5000",
    [baseOverride]
  );

  const getToken = () => adminToken || empToken || null;

  async function apiJson(path, opts = {}) {
    const token = getToken();
    const headers = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // allow absolute URLs too; else join with base
    const url = /^https?:\/\//i.test(path) ? path : base + path;

    const res = await fetch(url, { ...opts, headers, credentials: "include" });

    const ct = res.headers.get("content-type") || "";
    const text = await res.text().catch(() => "");

    if (!res.ok) {
      const err = new Error(text || res.statusText || "Request failed");
      err.status = res.status;
      try { err.data = JSON.parse(text); } catch { err.text = text; }
      throw err;
    }

    if (!ct.includes("application/json")) {
      // non-JSON response, return raw text
      try { return JSON.parse(text); } catch { return text; }
    }
    return JSON.parse(text);
  }

  // convenience methods
  const get   = (p, params) => apiJson(withParams(p, params));
  const post  = (p, body)   => apiJson(p, { method: "POST", body: JSON.stringify(body || {}) });
  const put   = (p, body)   => apiJson(p, { method: "PUT",  body: JSON.stringify(body || {}) });
  const patch = (p, body)   => apiJson(p, { method: "PATCH",body: JSON.stringify(body || {}) });
  const del   = (p)         => apiJson(p, { method: "DELETE" });

  // create a bound instance with different base
  const withBase = (nextBase) => useApi(nextBase);

  return { apiJson, get, post, put, patch, del, withBase, base };
}

/* small util for query params */
function withParams(path, params) {
  if (!params || typeof params !== "object") return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.append(k, String(v));
  }
  const hasQ = String(path).includes("?");
  return path + (hasQ ? "&" : "?") + qs.toString();
}
