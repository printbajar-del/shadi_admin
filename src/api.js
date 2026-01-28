// src/api.js
import axios from "axios";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
const getAdminToken = () => read("adminAuth")?.token || "";
const getEmployeeToken = () => read("employeeAuth")?.token || "";

// Clean baseURL (no trailing slash)
const rawBase = import.meta.env.VITE_API_URL || "http://localhost:5000";
const BASE = rawBase.replace(/\/+$/, "");

const api = axios.create({
  baseURL: BASE,
  withCredentials: false, // contexts set defaults; requests can override
});

// ---------- Request interceptor ----------
api.interceptors.request.use((cfg) => {
  const url = String(cfg.url || "");
  const adminToken = getAdminToken();
  const empToken = getEmployeeToken();

  const isAdminApi = url.includes("/api/admin/");
  const isEmployeeApi = url.includes("/api/employee/");
  const isProtected = isAdminApi || isEmployeeApi;

  let actor = "unknown";
  let token = "";

  if (isAdminApi) {
    token = adminToken;
    actor = "admin";
  } else if (isEmployeeApi) {
    token = empToken;
    actor = "employee";
  } else if (typeof window !== "undefined") {
    const p = (window.location && window.location.pathname) || "";
    if (p.startsWith("/admin")) {
      token = adminToken || empToken;
      actor = adminToken ? "admin" : empToken ? "employee" : "unknown";
    } else if (p.startsWith("/app")) {
      token = empToken || adminToken;
      actor = empToken ? "employee" : adminToken ? "admin" : "unknown";
    } else {
      token = adminToken || empToken;
      actor = adminToken ? "admin" : empToken ? "employee" : "unknown";
    }
  } else {
    token = adminToken || empToken;
    actor = adminToken ? "admin" : empToken ? "employee" : "unknown";
  }

  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  cfg.headers.Accept = cfg.headers.Accept || "application/json";

  // annotate for response handler
  cfg.meta = { ...(cfg.meta || {}), actor, isProtected };
  return cfg;
});

// ---------- Response interceptor ----------
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const url = String(err?.config?.url || "");
    const meta = err?.config?.meta || {};
    const path =
      (typeof window !== "undefined" && window.location && window.location.pathname) || "";

    // Only act on protected (admin/employee) APIs
    if (status === 401 && meta.isProtected) {
      if (meta.actor === "admin") {
        localStorage.removeItem("adminAuth");
        if (path.startsWith("/admin")) {
          if (!url.includes("/api/admin/login")) {
            window.location.replace("/login");
          }
        }
      } else if (meta.actor === "employee") {
        localStorage.removeItem("employeeAuth");
        if (path.startsWith("/app")) {
          window.location.replace("/login");
        }
      }
      return Promise.reject(err);
    }

    // 403 on admin APIs — optionally nudge away from admin area if no admin token
    if (status === 403 && url.includes("/api/admin/") && path.startsWith("/admin")) {
      const hasAdmin = !!getAdminToken();
      const hasEmp = !!getEmployeeToken();
      if (!hasAdmin && hasEmp) {
        window.location.replace("/app");
      }
    }

    return Promise.reject(err);
  }
);

export default api;
