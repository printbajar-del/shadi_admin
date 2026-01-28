// src/pages/Roles.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Employees & Roles Manager
 *
 * Permissions used:
 * - employees.read       → list/fetch employees
 * - employees.create     → create employee
 * - employees.update     → edit employee
 * - employees.delete     → delete employee
 * - roles.read           → load role list to assign
 * - roles.assign         → assign roles to employee
 * - roles.update         → (optional) if you allow editing role meta elsewhere
 *
 * Endpoints (expected):
 * GET    /api/admin/employees                -> { items, total }
 * GET    /api/admin/employees/:id            -> employee
 * POST   /api/admin/employees                -> create
 * PUT    /api/admin/employees/:id            -> update
 * DELETE /api/admin/employees/:id            -> delete
 *
 * GET    /api/admin/roles                    -> [ {id, name, key, ...}, ... ]
 * POST   /api/admin/employees/:id/roles      -> { roleIds: [] }
 */

const BLANK = {
  name: "",
  email: "",
  phone: "",
  status: "active",
  join_date: "",
  salary_base: 0,
};

export default function RolesPage() {
  const { can, user } = useAuth();

  // RBAC gates
  const canReadEmp   = isSuper(user) || !!(can?.("employees.read"));
  const canCreateEmp = isSuper(user) || !!(can?.("employees.create"));
  const canUpdateEmp = isSuper(user) || !!(can?.("employees.update"));
  const canDeleteEmp = isSuper(user) || !!(can?.("employees.delete"));
  const canReadRoles = isSuper(user) || !!(can?.("roles.read"));
  const canAssign    = isSuper(user) || !!(can?.("roles.assign") || can?.("employees.update"));

  // filters/paging
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // data
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // create/edit employee
  const [openForm, setOpenForm] = useState(false);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState(BLANK);

  // assign roles modal
  const [openRoles, setOpenRoles] = useState(false);
  const [roles, setRoles] = useState([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));

  // ======== Load employees =========
  async function load() {
    if (!canReadEmp) { setRows([]); setTotal(0); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/employees", {
        params: { q, status, page, pageSize },
      });
      setRows(data?.items || []);
      setTotal(data?.total || (data?.items?.length || 0));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [q, status, page, pageSize, canReadEmp]);

  // ======== Load roles =========
  async function loadRoles() {
    if (!canReadRoles) { setRoles([]); return; }
    const { data } = await api.get("/api/admin/roles");
    setRoles(Array.isArray(data) ? data : (data?.items || []));
  }

  // ======== CRUD: employees =========
  function openCreate() {
    if (!canCreateEmp) return alert("Not allowed");
    setForm(BLANK);
    setCurrent(null);
    setOpenForm(true);
  }

  async function openEdit(id) {
    if (!canReadEmp) return;
    const { data } = await api.get(`/api/admin/employees/${id}`);
    setCurrent(data);
    setForm({
      ...BLANK,
      ...data,
      join_date: data.join_date || "",
      salary_base: Number(data.salary_base || 0),
    });
    setOpenForm(true);
  }

  async function save() {
    const payload = { ...form, salary_base: Number(form.salary_base || 0) };
    if (current) {
      if (!canUpdateEmp) return alert("Not allowed");
      await api.put(`/api/admin/employees/${current.id}`, payload);
    } else {
      if (!canCreateEmp) return alert("Not allowed");
      await api.post("/api/admin/employees", payload);
    }
    setOpenForm(false);
    setForm(BLANK);
    await load();
  }

  async function remove(id) {
    if (!canDeleteEmp) return alert("Not allowed");
    if (!confirm("Delete this employee?")) return;
    await api.delete(`/api/admin/employees/${id}`);
    await load();
  }

  // ======== Assign Roles =========
  async function openAssignRoles(id) {
    if (!canAssign) return alert("Not allowed");
    await loadRoles();
    const { data } = await api.get(`/api/admin/employees/${id}`);
    setCurrent(data);
    setSelectedRoleIds((data.roles || []).map((r) => r.id));
    setOpenRoles(true);
  }

  function toggleRole(id) {
    setSelectedRoleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function saveRoles() {
    if (!canAssign) return alert("Not allowed");
    await api.post(`/api/admin/employees/${current.id}/roles`, {
      roleIds: selectedRoleIds,
    });
    setOpenRoles(false);
    await load();
  }

  if (!canReadEmp) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">Employees & Roles</h1>
        <div className="p-3 rounded-xl border bg-amber-50 text-amber-900">
          You don’t have permission to view employees.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Employees & Roles</h1>
          <p className="text-sm text-slate-500">
            Manage employees, and assign roles/permissions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search name / email / phone"
            className="border rounded-xl px-3 py-2 w-64 outline-none focus:ring"
          />
          <select
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            className="border rounded-xl px-3 py-2"
          >
            <option value="all">All</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="blocked">blocked</option>
          </select>
          {canCreateEmp && (
            <button
              className="px-3 py-2 rounded-xl bg-black text-white"
              onClick={openCreate}
            >
              + Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <Th>ID</Th>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500">
                    No employees
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-gray-50">
                    <Td>
                      <code className="text-xs bg-gray-100 rounded px-2 py-1">
                        {String(e.id).slice(0, 8)}
                      </code>
                    </Td>
                    <Td className="font-medium">{e.name || "—"}</Td>
                    <Td>
                      <div className="flex flex-col">
                        <span>{e.email || "—"}</span>
                        <span className="text-xs text-gray-500">
                          {e.phone || "—"}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <Badge>{e.status || "active"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {(e.roles || []).map((r) => (
                          <span
                            key={r.id || r.key}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100"
                          >
                            {r.name || r.key}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          className="px-2 py-1 rounded border"
                          onClick={() => openAssignRoles(e.id)}
                          disabled={!canAssign}
                          title={canAssign ? "Assign roles" : "No permission"}
                        >
                          Assign Roles
                        </button>
                        {canUpdateEmp && (
                          <button
                            className="px-2 py-1 rounded border"
                            onClick={() => openEdit(e.id)}
                          >
                            Edit
                          </button>
                        )}
                        {canDeleteEmp && (
                          <button
                            className="px-2 py-1 rounded border text-red-600"
                            onClick={() => remove(e.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Total {total} • Page {page} / {pages}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-2 rounded-lg border disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="px-3 py-2 rounded-lg border disabled:opacity-40"
          >
            Next
          </button>
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
            className="border rounded-lg px-2 py-2"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Create/Edit Employee Modal */}
      {openForm && (
        <Modal onClose={() => setOpenForm(false)} title={current ? "Edit Employee" : "Add Employee"}>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="blocked">blocked</option>
              </select>
            </Field>
            <Field label="Join Date">
              <input
                className="input"
                type="date"
                value={form.join_date}
                onChange={(e) => setForm((f) => ({ ...f, join_date: e.target.value }))}
              />
            </Field>
            <Field label="Base Salary (₹)">
              <input
                className="input"
                type="number"
                value={form.salary_base}
                onChange={(e) =>
                  setForm((f) => ({ ...f, salary_base: Number(e.target.value || 0) }))
                }
              />
            </Field>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button className="px-3 py-2 rounded border" onClick={() => setOpenForm(false)}>
              Cancel
            </button>
            <button className="px-3 py-2 rounded bg-black text-white" onClick={save}>
              {current ? "Save" : "Create"}
            </button>
          </div>
        </Modal>
      )}

      {/* Assign Roles Modal */}
      {openRoles && (
        <Modal onClose={() => setOpenRoles(false)} title={`Assign Roles • ${current?.name || current?.email || ""}`}>
          {!canReadRoles ? (
            <div className="p-3 rounded-xl border bg-amber-50 text-amber-900 text-sm">
              You don’t have permission to load roles list.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-2">
                {roles.map((r) => {
                  const checked = selectedRoleIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className={
                        "flex items-center gap-2 p-2 rounded-xl border cursor-pointer " +
                        (checked ? "bg-indigo-50 border-indigo-200" : "hover:bg-slate-50")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(r.id)}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{r.name || r.key}</div>
                        {r.key && <div className="text-xs text-slate-500">{r.key}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button className="px-3 py-2 rounded border" onClick={() => setOpenRoles(false)}>
                  Cancel
                </button>
                <button
                  className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
                  onClick={saveRoles}
                  disabled={!canAssign}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ------------- small ui helpers ------------- */
function Th({ children, className = "" }) {
  return <th className={`px-3 py-2 text-sm font-semibold text-gray-700 ${className}`}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
function Badge({ children }) {
  return (
    <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
      {children}
    </span>
  );
}
function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
function Modal({ onClose, title, children }) {
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-start md:items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold">{title}</h3>
            <button className="p-2 rounded hover:bg-slate-100" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="p-4 max-h-[80vh] overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
function norm(s = "") { return String(s).toLowerCase().replace(/\s+/g, "_"); }
function isSuper(u) {
  if (!u) return false;
  const role = norm(u.role || u.type || "");
  if (role === "super_admin") return true;
  const roles = Array.isArray(u.roles) ? u.roles.map(norm) : [];
  return roles.includes("super_admin");
}
