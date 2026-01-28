// src/apiEmployees.js
import api from "./api";

/* ===================== Employees ===================== */
export const EmployeesAPI = {
  list: (q = "", page = 1, pageSize = 20) =>
    api.get("/api/admin/employees", { params: { q, page, pageSize } }).then(r => r.data),

  get: (id) => api.get(`/api/admin/employees/${id}`).then(r => r.data),
  create: (body) => api.post("/api/admin/employees", body).then(r => r.data),
  update: (id, body) => api.put(`/api/admin/employees/${id}`, body).then(r => r.data),
  remove: (id) => api.delete(`/api/admin/employees/${id}`).then(r => r.data),

  resetPassword: (id, new_password) =>
    api.post(`/api/admin/employees/${id}/reset-password`, { new_password }).then(r => r.data),

  createAdvance: (id, amount, reason, issued_on) =>
    api.post(`/api/admin/employees/${id}/salary-advance`, { amount, reason, issued_on }).then(r => r.data),

  listAdvances: (id) => api.get(`/api/admin/employees/${id}/advances`).then(r => r.data),

  getEffectivePerms: (id) => api.get(`/api/admin/employees/${id}/permissions`).then(r => r.data),
  getOverrides: (id) => api.get(`/api/admin/employees/${id}/overrides`).then(r => r.data),

  setOverrides: (id, body) => api.put(`/api/admin/employees/${id}/overrides`, body).then(r => r.data),
};

/* ===================== Roles & Role Permissions ===================== */
export const RolesAPI = {
  list: () => api.get("/api/admin/roles").then(r => r.data),
  create: (body) => api.post("/api/admin/roles", body).then(r => r.data),
  update: (id, body) => api.put(`/api/admin/roles/${id}`, body).then(r => r.data),
  remove: (id) => api.delete(`/api/admin/roles/${id}`).then(r => r.data),
  listPerms: (id) => api.get(`/api/admin/roles/${id}/permissions`).then(r => r.data),
  setPerms: (id, perm_keys) => api.put(`/api/admin/roles/${id}/permissions`, { perm_keys }).then(r => r.data),
};

/* ===================== Payroll ===================== */
export const PayrollAPI = {
  payruns:      ()              => api.get("/api/admin/payroll/runs").then(r => r.data),
  createRun:    (m,y,pay_date)  => api.post("/api/admin/payroll/runs", { month:m, year:y, pay_date }).then(r => r.data),
  generate:     (runId)         => api.post(`/api/admin/payroll/runs/${runId}/generate`).then(r => r.data),
  markRunProcessed: (runId)     => api.post(`/api/admin/payroll/runs/${runId}/processed`).then(r => r.data),
  markRunPaid:      (runId)     => api.post(`/api/admin/payroll/runs/${runId}/paid`).then(r => r.data),

  payslips:     (runId)         => api.get(`/api/admin/payroll/runs/${runId}/payslips`).then(r => r.data),
  markSlipPaid: (slipId)        => api.post(`/api/admin/payroll/payslips/${slipId}/paid`).then(r => r.data),
};

export default { EmployeesAPI, RolesAPI, PayrollAPI };
