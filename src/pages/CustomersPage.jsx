// src/pages/CustomersPage.jsx (RBAC-enabled compact)
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Customers Admin (Compact)
 * Tabs → Profile, Orders, Wishlist
 * RBAC:
 * - customers.read    → list/fetch
 * - customers.create  → Add / Create
 * - customers.update  → Edit / Save changes
 * - customers.delete  → Delete
 */

const API_BASE =
  (import.meta.env && import.meta.env.VITE_API_BASE_CUSTOMERS) ||
  "http://localhost:5000/api/admin/customers";

// shared helper
function getAuthHeader() {
  try {
    const rawAdminAuth   = localStorage.getItem("adminAuth");
    const rawAdminToken  = localStorage.getItem("adminToken");
    const rawAuth        = localStorage.getItem("auth");
    const rawToken       = localStorage.getItem("token");
    const adminAuthObj = rawAdminAuth ? JSON.parse(rawAdminAuth) : null;
    const authObj      = rawAuth ? JSON.parse(rawAuth) : null;

    const token =
      (adminAuthObj && (adminAuthObj.token || adminAuthObj.accessToken)) ||
      (authObj && (authObj.adminToken || authObj.token || authObj.accessToken)) ||
      rawAdminToken ||
      rawToken ||
      null;

    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function request(url, opts = {}) {
  const headers = {
    ...(opts.headers || {}),
    ...getAuthHeader(),
  };
  const res = await fetch(url, { ...opts, headers });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${text.slice(0, 200)}`);
  if (!ct.includes("application/json"))
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 150)}`);
  return JSON.parse(text);
}

// ---------- API layer ----------
async function apiList({ q = "", status = "all", page = 1, pageSize = 10 } = {}) {
  const params = new URLSearchParams({ q, status, page: String(page), pageSize: String(pageSize) });
  return request(`${API_BASE}?${params.toString()}`);
}
async function apiGet(id) { return request(`${API_BASE}/${id}`); }
async function apiCreate(payload) {
  return request(`${API_BASE}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}
async function apiUpdate(id, payload) {
  return request(`${API_BASE}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}
async function apiDelete(id) { return request(`${API_BASE}/${id}`, { method: "DELETE" }); }

// addresses
async function apiListAddresses(customerId) { return request(`${API_BASE}/${customerId}/addresses`); }
async function apiAddAddress(customerId, addr) {
  return request(`${API_BASE}/${customerId}/addresses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addr) });
}
async function apiUpdateAddress(customerId, addrId, addr) {
  return request(`${API_BASE}/${customerId}/addresses/${addrId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addr) });
}
async function apiDeleteAddress(customerId, addrId) { return request(`${API_BASE}/${customerId}/addresses/${addrId}`, { method: "DELETE" }); }
async function apiSetDefault(customerId, addrId, flags) {
  return request(`${API_BASE}/${customerId}/addresses/${addrId}/set-default`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(flags) });
}

// orders + wishlist
async function apiOrdersForCustomer(customerId, page = 1, pageSize = 10) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const res = await request(`${API_BASE}/${customerId}/orders?${params}`);

  if (Array.isArray(res)) return { items: res, total: res.length };
  if (Array.isArray(res?.items)) return { items: res.items, total: res.total ?? res.items.length };
  if (Array.isArray(res?.orders)) return { items: res.orders, total: res.total ?? res.orders.length };
  return { items: [], total: 0 };
}
async function apiWishlistForCustomer(customerId) { return request(`${API_BASE}/${customerId}/wishlist`); }

// ---------- page ----------
export default function CustomersPage() {
  const { can } = useAuth();

  // RBAC gates
  const canRead   = !!(can?.("customers.read")   || can?.("customers.view") || can?.("customers.list"));
  const canCreate = !!(can?.("customers.create") || can?.("customers.write"));
  const canUpdate = !!(can?.("customers.update") || can?.("customers.write"));
  const canDelete = !!(can?.("customers.delete") || can?.("customers.write"));

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    if (!canRead) { setItems([]); setTotal(0); return; } // 🚫 no fetch without read
    try {
      setLoading(true); setError("");
      const data = await apiList({ q, status, page, pageSize });
      setItems(data.items || []); setTotal(data.total || 0);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [q, status, page, pageSize, canRead]);

  function onAddNew() {
    if (!canCreate) return alert("Not allowed");
    setEditing(getEmptyCustomer()); setDrawerOpen(true);
  }

  async function onEdit(id) {
    if (!canRead) return;
    try {
      const c = await apiGet(id);
      let addrs = [];
      try {
        const r = await apiListAddresses(id);
        addrs = (r && (r.items || r)) || [];
      } catch {}
      setEditing({
        ...ensureShape(c),
        addresses: addrs,
        _serverAddresses: addrs.map(x => ({ ...x }))
      });
      setDrawerOpen(true);
    } catch (e) { alert(e.message); }
  }

  async function onDelete(id) {
    if (!canDelete) return alert("Not allowed");
    if (!confirm("Delete this customer?")) return;
    try { await apiDelete(id); await load(); } catch (e) { alert(e.message); }
  }

  async function onSave(customer) {
    try {
      const payload = serializeForSave(customer);
      if (customer.id && !String(customer.id).startsWith("new_")) {
        if (!canUpdate) return alert("Not allowed");
        await apiUpdate(customer.id, payload.base);
      } else {
        if (!canCreate) return alert("Not allowed");
        const created = await apiCreate(payload.base); customer.id = created.id;
      }
      if ((customer.addresses || []).length) { await syncAddresses(customer.id, customer.addresses); }
      setDrawerOpen(false); setEditing(null); await load();
    } catch (e) { alert(e.message); }
  }

  async function syncAddresses(customerId, nextAddrs) {
    const server = await apiListAddresses(customerId);
    const serverAddrs = server.items || server || [];

    const isUUID = (s) =>
      typeof s === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

    const nextById = new Map();
    (nextAddrs || []).forEach(a => { if (isUUID(a.id)) nextById.set(a.id, a); });

    // delete removed ones
    for (const old of serverAddrs) {
      if (!nextById.has(old.id)) await apiDeleteAddress(customerId, old.id);
    }

    // create or update
    for (const a of nextAddrs || []) {
      const core = cleanAddress(a);
      if (!isUUID(a.id)) {
        const created = await apiAddAddress(customerId, core);
        if (core.is_default_shipping || core.is_default_billing) {
          await apiSetDefault(customerId, created.id, {
            is_default_shipping: !!core.is_default_shipping,
            is_default_billing:  !!core.is_default_billing
          });
        }
      } else {
        await apiUpdateAddress(customerId, a.id, core);
        if ('is_default_shipping' in core || 'is_default_billing' in core) {
          await apiSetDefault(customerId, a.id, {
            is_default_shipping: !!core.is_default_shipping,
            is_default_billing:  !!core.is_default_billing
          });
        }
      }
    }
  }

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));

  // 🚫 No read permission UI
  if (!canRead) {
    return (
      <div className="p-3 md:p-4">
        <header className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-xl font-semibold">Customers</h1>
          <div />
        </header>
        <div className="p-4 rounded-xl border bg-amber-50 text-amber-900 text-sm">
          You don’t have permission to view customers.
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
        <h1 className="text-xl font-semibold">Customers</h1>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search name / email / phone"
            className="border rounded-lg px-2 py-1.5 w-56 outline-none focus:ring text-sm"
          />
          <select
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            className="border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="active">active</option>
            <option value="blocked">blocked</option>
            <option value="deleted">deleted</option>
          </select>
          {canCreate && (
            <button onClick={onAddNew} className="px-3 py-1.5 rounded-xl bg-black text-white text-sm">
              Add
            </button>
          )}
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <ListTable
          items={items}
          loading={loading}
          error={error}
          onEdit={onEdit}
          onDelete={canDelete ? onDelete : undefined}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-gray-600">Total {total} • Page {page} / {pages}</div>
        <div className="flex items-center gap-2">
          <button disabled={page===1} onClick={() => setPage(p=>Math.max(1,p-1))} className="px-2 py-1 rounded border disabled:opacity-40 text-sm">Prev</button>
          <button disabled={page===pages} onClick={() => setPage(p=>Math.min(pages,p+1))} className="px-2 py-1 rounded border disabled:opacity-40 text-sm">Next</button>
          <select value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(Number(e.target.value)); }} className="border rounded px-2 py-1 text-sm">
            {[10,20,50].map(n=> <option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>

      {drawerOpen && editing && (
        <SideDrawer onClose={() => { setDrawerOpen(false); setEditing(null); }}>
          <CustomerEditor
            value={editing}
            onChange={setEditing}
            onSave={() => onSave(editing)}
            syncAddressesFn={syncAddresses}
            canUpdate={canUpdate}
            canCreate={canCreate}
          />
        </SideDrawer>
      )}
    </div>
  );
}

// ---------- table ----------
function ListTable({ items, loading, error, onEdit, onDelete, canUpdate, canDelete }) {
  if (error) return <div className="p-3 text-red-600 text-sm">{error}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-left">
          <tr>
            <Th>ID</Th>
            <Th>Name</Th>
            <Th>Contact</Th>
            <Th>Status</Th>
            <Th>Mkt</Th>
            <Th>Tags</Th>
            <Th>Created</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="p-5 text-center text-gray-500">Loading…</td></tr>
          ) : items.length === 0 ? (
            <tr><td colSpan={8} className="p-5 text-center text-gray-500">No customers</td></tr>
          ) : (
            items.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50/60">
                <Td>
                  <code className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5">{shortId(c.id)}</code>
                </Td>
                <Td className="truncate max-w-[12rem]">{c.name_full || "—"}</Td>
                <Td>
                  <div className="flex flex-col leading-tight">
                    <span className="truncate max-w-[14rem]">{c.email || "—"}</span>
                    <span className="text-gray-500 text-[11px]">{c.phone_e164 || "—"}</span>
                  </div>
                </Td>
                <Td><StatusBadge status={c.status} /></Td>
                <Td>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.marketing_opt_in?"bg-green-100 text-green-700":"bg-gray-100 text-gray-600"}`}>
                    {c.marketing_opt_in ? "Yes" : "No"}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).map((t) => (
                      <span key={t} className="text-[10px] bg-gray-100 rounded-full px-1.5 py-0.5">{t}</span>
                    ))}
                  </div>
                </Td>
                <Td>{formatDate(c.created_at)}</Td>
                <Td>
                  <div className="flex items-center gap-1 justify-end">
                    <IconButton
                      label="View/Edit"
                      onClick={() => canUpdate ? onEdit(c.id) : onEdit(c.id)}
                      icon={IconEdit}
                    />
                    {canDelete && (
                      <IconButton label="Delete" onClick={() => onDelete?.(c.id)} icon={IconTrash} danger />
                    )}
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className="" }) { return <th className={`px-3 py-2 text-[11px] font-semibold text-gray-700 ${className}`}>{children}</th>; }
function Td({ children, className="" }) { return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>; }
function StatusBadge({ status }) {
  const map = { active: "bg-emerald-100 text-emerald-700", blocked: "bg-yellow-100 text-yellow-700", deleted: "bg-red-100 text-red-700" };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${map[status] || "bg-gray-100 text-gray-600"}`}>{status}</span>;
}

function IconButton({ icon:Icon, onClick, label, danger }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={`p-1.5 rounded-lg border hover:bg-gray-50 ${danger?"text-red-600 border-red-200":""}`}>
      <Icon className="w-4 h-4" />
    </button>
  );
}
function IconEdit({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
    </svg>
  );
}
function IconTrash({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
    </svg>
  );
}

// ---------- drawer + editor ----------
function SideDrawer({ children, onClose }) {
  useEffect(() => { const onEsc = (e) => e.key === "Escape" && onClose(); document.addEventListener("keydown", onEsc); return () => document.removeEventListener("keydown", onEsc); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl p-3 md:p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Customer</h2>
          <button onClick={onClose} className="px-2.5 py-1 rounded-lg border text-sm">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerEditor({ value, onChange, onSave, syncAddressesFn, canUpdate, canCreate }) {
  const c = value || getEmptyCustomer();
  const [tab, setTab] = useState("profile");
  function set(part) { onChange({ ...c, ...part }); }
  function save() {
    const issues = validateCustomer(c);
    if (issues.length) { alert("Please fix these:\n\n" + issues.join("\n")); return; }
    if (validId(c.id)) {
      if (!canUpdate) return alert("Not allowed");
    } else {
      if (!canCreate) return alert("Not allowed");
    }
    onSave();
  }

  const [showAddrUI, setShowAddrUI] = useState(Boolean((c.addresses||[]).length));
  useEffect(()=>{ setShowAddrUI(Boolean((c.addresses||[]).length)); }, [c.id]);

  return (
    <div className="space-y-3">
      <TabBar tabs={[{key:"profile",label:"Profile"},{key:"orders",label:"Orders"},{key:"wishlist",label:"Wishlist"}]} value={tab} onChange={setTab} />

      {tab === "profile" && (
        <>
          {/* BASIC */}
          <section className="space-y-2">
            <Field label="Email"><input type="email" value={c.email || ""} onChange={(e)=>set({ email:e.target.value })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" placeholder="user@example.com"/></Field>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Field label="Phone (E.164)"><input value={c.phone_e164 || ""} onChange={(e)=>set({ phone_e164:e.target.value })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" placeholder="+91…"/></Field>
              <Field label="Name"><input value={c.name_full || ""} onChange={(e)=>set({ name_full:e.target.value })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" placeholder="Full name"/></Field>
              <Field label="Status">
                <select value={c.status} onChange={(e)=>set({ status:e.target.value })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm">
                  <option value="active">active</option>
                  <option value="blocked">blocked</option>
                  <option value="deleted">deleted</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Field label="Marketing">
                <select value={String(c.marketing_opt_in)} onChange={(e)=>set({ marketing_opt_in: e.target.value === "true" })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"><option value="true">true</option><option value="false">false</option></select>
              </Field>
              <Field label="Tags (comma)"><input value={(c.tags||[]).join(", ")} onChange={(e)=>set({ tags: splitTags(e.target.value) })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" placeholder="VIP, wedding"/></Field>
            </div>
          </section>

          {/* PROFILE */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="First Name"><input value={c.profile?.first_name || ""} onChange={(e)=>set({ profile:{ ...c.profile, first_name:e.target.value } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"/></Field>
            <Field label="Last Name"><input value={c.profile?.last_name || ""} onChange={(e)=>set({ profile:{ ...c.profile, last_name:e.target.value } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"/></Field>
            <Field label="Company"><input value={c.profile?.company_name || ""} onChange={(e)=>set({ profile:{ ...c.profile, company_name:e.target.value } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"/></Field>
            <Field label="GSTIN"><input value={c.profile?.gstin || ""} onChange={(e)=>set({ profile:{ ...c.profile, gstin:e.target.value } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"/></Field>
          </section>

          {/* PREFS */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Field label="Locale"><input value={c.preferences?.locale || ""} onChange={(e)=>set({ preferences:{ ...c.preferences, locale:e.target.value } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" placeholder="en-IN, hi-IN"/></Field>
            <Field label="Currency"><input value={c.preferences?.currency || ""} onChange={(e)=>set({ preferences:{ ...c.preferences, currency:e.target.value } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" placeholder="INR"/></Field>
            <Field label="Marketing Emails">
              <select value={String(c.preferences?.marketing_emails || false)} onChange={(e)=>set({ preferences:{ ...c.preferences, marketing_emails: e.target.value === "true" } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"><option value="true">true</option><option value="false">false</option></select>
            </Field>
            <Field label="Marketing SMS">
              <select value={String(c.preferences?.marketing_sms || false)} onChange={(e)=>set({ preferences:{ ...c.preferences, marketing_sms: e.target.value === "true" } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"><option value="true">true</option><option value="false">false</option></select>
            </Field>
            <Field label="WhatsApp Updates">
              <select value={String(c.preferences?.whatsapp_updates || false)} onChange={(e)=>set({ preferences:{ ...c.preferences, whatsapp_updates: e.target.value === "true" } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm"><option value="true">true</option><option value="false">false</option></select>
            </Field>
          </section>

          {/* Addresses inside Profile */}
          <AddressEditor
            toolbar={true}
            customerId={c.id}
            addresses={c.addresses || []}
            onChange={(next) => set({ addresses: next })}
            onSync={async (list) => {
              const id = validId(c.id);
              if (!id){ alert("Save customer first, then sync addresses."); return; }
              try { await syncAddressesFn(id, list); alert("Addresses synced ✅"); }
              catch (e) { alert(String(e.message || e)); }
            }}
          />

          <div className="pt-2 flex items-center justify-end gap-2">
            <button onClick={save} className="px-3 py-1.5 rounded-lg bg-black text-white text-sm">
              {validId(c.id)? 'Save' : 'Create'}
            </button>
          </div>
        </>
      )}

      {tab === "orders" && (<CustomerOrders customerId={validId(c.id)} />)}
      {tab === "wishlist" && (<CustomerWishlist customerId={validId(c.id)} />)}
    </div>
  );
}

function AddressEditor({ customerId, addresses, onChange, onSync, toolbar = true }) {
  const list = addresses || [];

  const isUUID = (s) =>
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  const idOf = (a) => a?.id || a?._id || a?.uuid || null;

  function upsertLocal(next) { onChange([...next]); }

  function addEmptyLocal() {
    const cid = "tmp_" + Math.random().toString(36).slice(2, 8);
    upsertLocal([
      ...(list || []),
      {
        id: cid,
        label: "Home",
        line1: "",
        line2: "",
        city: "",
        state: "",
        postal_code: "",
        country_iso2: "IN",
        phone: "",
        is_default_shipping: list.every((a) => !a.is_default_shipping),
        is_default_billing: list.every((a) => !a.is_default_billing),
      },
    ]);
  }

  function enforceDefaults(next, kind, idx) {
    if (idx < 0) return next;
    if (kind === "ship") {
      const on = !!next[idx].is_default_shipping;
      if (on) next.forEach((a, i) => { if (i !== idx) a.is_default_shipping = false; });
    } else if (kind === "bill") {
      const on = !!next[idx].is_default_billing;
      if (on) next.forEach((a, i) => { if (i !== idx) a.is_default_billing = false; });
    }
    return next;
  }

  async function hardReloadFromServer() {
    if (!customerId) return alert("Save customer first, then sync addresses.");
    try {
      const r = await apiListAddresses(customerId);
      const serverList = (r && (r.items || r)) || [];
      upsertLocal(serverList);
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  async function makeDefault(addr) {
    const realId = idOf(addr);
    const idx = list.findIndex((x) => idOf(x) === realId);
    const next = list.map((a) => ({ ...a }));
    if (idx !== -1) {
      next[idx].is_default_shipping = true;
      next[idx].is_default_billing = true;
      enforceDefaults(next, "ship", idx);
      enforceDefaults(next, "bill", idx);
      upsertLocal(next);
    }
    if (customerId && isUUID(realId)) {
      try {
        await apiSetDefault(customerId, realId, {
          is_default_shipping: true,
          is_default_billing: true,
        });
      } catch (e) {
        alert("Set default failed: " + (e.message || e));
        hardReloadFromServer();
      }
    }
  }

  function removeLocal(addr) {
    const aid = idOf(addr);
    upsertLocal(list.filter((x) => idOf(x) !== aid));
  }

  async function removeRemote(addr) {
    const aid = idOf(addr);
    if (!confirm("Delete this address?")) return;
    const prev = list;
    removeLocal(addr);
    if (customerId && isUUID(aid)) {
      try {
        await apiDeleteAddress(customerId, aid);
      } catch (e) {
        alert("Delete failed: " + (e.message || e));
        upsertLocal(prev);
      }
    }
  }

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  function onAddClick() { setEditing(null); setFormOpen(true); }
  function onEditClick(addr) { setEditing(addr); setFormOpen(true); }

  async function onFormSave(payload) {
    const prev = list.map((x) => ({ ...x }));
    if (editing) {
      const aid = idOf(editing);
      const next = list.map((a) => (idOf(a) === aid ? { ...a, ...payload } : a));
      enforceDefaults(next, "ship", next.findIndex((a) => idOf(a) === aid));
      enforceDefaults(next, "bill", next.findIndex((a) => idOf(a) === aid));
      upsertLocal(next);

      if (customerId && /^[0-9a-f-]{36}$/i.test(aid)) {
        try {
          const clean = { ...payload };
          await apiUpdateAddress(customerId, aid, clean);
          if (payload.is_default_shipping || payload.is_default_billing) {
            await apiSetDefault(customerId, aid, {
              is_default_shipping: !!payload.is_default_shipping,
              is_default_billing: !!payload.is_default_billing,
            });
          }
        } catch (e) {
          alert("Update failed: " + (e.message || e));
          upsertLocal(prev);
        }
      }
    } else {
      if (customerId) {
        try {
          const created = await apiAddAddress(customerId, payload);
          upsertLocal([created, ...list]);
          if (payload.is_default_shipping || payload.is_default_billing) {
            await apiSetDefault(customerId, created.id, {
              is_default_shipping: !!payload.is_default_shipping,
              is_default_billing: !!payload.is_default_billing,
            });
            await hardReloadFromServer();
          }
        } catch (e) {
          alert("Create failed: " + (e.message || e));
        }
      } else {
        upsertLocal([{ id: "tmp_" + Math.random().toString(36).slice(2, 8), ...payload }, ...list]);
      }
    }

    setFormOpen(false);
    setEditing(null);
  }

  return (
    <section className="space-y-2">
      {toolbar && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Addresses</h3>
          <div className="flex items-center gap-2">
            <button onClick={onAddClick} className="px-2.5 py-1 rounded-lg border text-sm">
              Add
            </button>
            <button
              onClick={() => (onSync ? onSync(list) : hardReloadFromServer())}
              className="px-2.5 py-1 rounded-lg border text-sm"
            >
              Sync
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="text-xs text-gray-500">No addresses</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <AddressCard
              key={(a.id) || a.postal_code || a.line1}
              addr={a}
              onDefault={() => makeDefault(a)}
              onEdit={() => onEditClick(a)}
              onDelete={() => removeRemote(a)}
            />
          ))}
        </div>
      )}

      {!customerId && list.length === 0 && (
        <div className="text-[11px] text-gray-500">
          Tip: Save/Create the customer to persist addresses on the server.
        </div>
      )}

      {formOpen && (
        <div className="border rounded-xl p-3 bg-gray-50">
          <AddressForm
            initial={editing}
            onCancel={() => { setFormOpen(false); setEditing(null); }}
            onSave={onFormSave}
          />
        </div>
      )}
    </section>
  );
}

function AddressCard({ addr, onDefault, onEdit, onDelete }) {
  const {
    label = "Home",
    line1, line2, city, state, postal_code, country_iso2 = "IN", phone,
    is_default_shipping, is_default_billing,
  } = addr || {};
  const isDefault = !!(is_default_shipping || is_default_billing);

  return (
    <div className="relative rounded-2xl border p-4 shadow-sm bg-white">
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <button className="p-1 rounded hover:bg-gray-100" title="Make default" onClick={onDefault}>
          <StarIcon active={isDefault} />
        </button>
        <button className="p-1 rounded hover:bg-gray-100" title="Edit" onClick={onEdit}>
          <EditIcon className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-gray-100" title="Delete" onClick={onDelete}>
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="pr-16">
        <div className="font-semibold">
          {label}
          {is_default_shipping && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border bg-emerald-50">Default Ship</span>}
          {is_default_billing && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border bg-indigo-50">Default Bill</span>}
        </div>
        <div className="mt-1 text-sm text-gray-700 leading-6">
          {[line1, line2].filter(Boolean).join(", ")}<br/>
          {[city, state, postal_code].filter(Boolean).join(", ")}<br/>
          {country_iso2 || "IN"}
        </div>
        <div className="mt-1 text-xs text-gray-500">{phone || ""}</div>
      </div>
    </div>
  );
}

function EditIcon({ className }) {
  return (
    <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function TrashIcon({ className }) {
  return (
    <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function StarIcon({ active }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke={active ? "none" : "currentColor"}>
      <path d="M12 17.3l-5.4 3 1-6.1-4.4-4.3 6.1-.9L12 3l2.7 5.9 6.1.9-4.4 4.3 1 6.1z" />
    </svg>
  );
}

// ---- Small Form ----
function AddressForm({ initial, onCancel, onSave }) {
  const [f, setF] = React.useState({
    label: initial?.label || "Home",
    phone: initial?.phone || "",
    country_iso2: initial?.country_iso2 || "IN",
    line1: initial?.line1 || "",
    line2: initial?.line2 || "",
    city: initial?.city || "",
    state: initial?.state || "",
    postal_code: initial?.postal_code || "",
    is_default_shipping: !!initial?.is_default_shipping,
    is_default_billing: !!initial?.is_default_billing,
  });
  const [saving, setSaving] = React.useState(false);

  function bind(k) { return (e) => setF((x) => ({ ...x, [k]: e.target.value })); }
  function bindCheck(k) { return (e) => setF((x) => ({ ...x, [k]: e.target.checked })); }

  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try { await onSave(f); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
      <Field label="Label">
        <select value={f.label} onChange={bind("label")} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm">
          <option>Home</option><option>Office</option><option>Other</option>
        </select>
      </Field>
      <Field label="Phone">
        <input value={f.phone} onChange={bind("phone")} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" placeholder="+91…" />
      </Field>
      <Field label="Country (ISO2)">
        <input value={f.country_iso2} onChange={(e)=>bind("country_iso2")({ target: { value: e.target.value.toUpperCase().slice(0,2) } })} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" />
      </Field>
      <Field label="Line 1">
        <input value={f.line1} onChange={bind("line1")} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" required />
      </Field>
      <Field label="Line 2">
        <input value={f.line2} onChange={bind("line2")} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" />
      </Field>
      <Field label="City">
        <input value={f.city} onChange={bind("city")} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" required />
      </Field>
      <Field label="State">
        <input value={f.state} onChange={bind("state")} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" required />
      </Field>
      <Field label="Postal Code">
        <input value={f.postal_code} onChange={bind("postal_code")} className="border rounded-lg px-2 py-1.5 w-full outline-none focus:ring text-sm" required />
      </Field>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={!!f.is_default_shipping} onChange={bindCheck("is_default_shipping")} />
          Default shipping
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={!!f.is_default_billing} onChange={bindCheck("is_default_billing")} />
          Default billing
        </label>

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm rounded-lg border">Cancel</button>
          <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded-lg border bg-black text-white disabled:opacity-50">
            {initial ? "Save changes" : "Add address"}
          </button>
        </div>
      </div>
    </form>
  );
}

function CustomerOrders({ customerId }) {
  const [items, setItems] = useState([]); const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); useEffect(() => { setPage(1); }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true); setError("");
    apiOrdersForCustomer(customerId, page, 10)
      .then(d => { setItems(d.items); setTotal(d.total); })
      .catch(e => { setError(String(e.message || e)); setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [customerId, page]);

  if (!customerId) return <div className="text-xs text-gray-500">Save customer first.</div>;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr><Th>#</Th><Th>Status</Th><Th>Payment</Th><Th>Total</Th><Th>When</Th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-3 text-center text-gray-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="p-3 text-center text-red-600">{error}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="p-3 text-center text-gray-500">No orders</td></tr>
            ) : items.map(o => (
              <tr key={o.id || o.order_number} className="border-t">
                <Td><code className="bg-gray-100 rounded px-1.5 py-0.5">{o.order_number || o.id}</code></Td>
                <Td>{o.status || "—"}</Td>
                <Td>{o.payment_status || o.payment?.status || "—"}</Td>
                <Td>{(o.currency || "INR")} {Number(o.grand_total ?? o.total ?? 0).toFixed(2)}</Td>
                <Td>{formatDate(o.ordered_at || o.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-xs text-gray-600">Total {total}</div>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-2 py-1 rounded border text-xs" disabled={page === 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
          <button className="px-2 py-1 rounded border text-xs" disabled={loading || items.length === 0} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

function CustomerWishlist({ customerId }) {
  const [items, setItems] = useState([]);
  useEffect(()=>{ if (!customerId) return; apiWishlistForCustomer(customerId).then(d=> setItems(d.items || [])); }, [customerId]);
  if (!customerId) return <div className="text-xs text-gray-500">Save customer first.</div>;
  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50"><tr><Th>SKU</Th><Th>Name</Th><Th>Added</Th></tr></thead>
        <tbody>
          {items.length===0 ? (
            <tr><td colSpan={3} className="p-3 text-center text-gray-500">Empty wishlist</td></tr>
          ) : items.map(w => (
            <tr key={w.id} className="border-t">
              <Td>{w.sku || "—"}</Td>
              <Td>{w.product_name || `#${w.product_id}`}</Td>
              <Td>{formatDate(w.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- small ui ----------
function TabBar({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((t) => (
        <button key={t.key} className={`px-2.5 py-2 -mb-px border-b-2 text-sm ${value===t.key?"border-black font-semibold":"border-transparent text-gray-500"}`} onClick={()=>onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}

// ---------- utils ----------
function ensureShape(c) {
  return {
    id: c.id,
    email: c.email || "",
    phone_e164: c.phone_e164 || "",
    name_full: c.name_full || "",
    status: c.status || "active",
    marketing_opt_in: !!c.marketing_opt_in,
    tags: c.tags || [],
    created_at: c.created_at,
    updated_at: c.updated_at,
    profile: { first_name: c.profile?.first_name || "", last_name: c.profile?.last_name || "", company_name: c.profile?.company_name || "", gstin: c.profile?.gstin || "" },
    preferences: { locale: c.preferences?.locale || "", currency: c.preferences?.currency || "INR", marketing_emails: !!c.preferences?.marketing_emails, marketing_sms: !!c.preferences?.marketing_sms, whatsapp_updates: !!c.preferences?.whatsapp_updates },
    addresses: (c.addresses || []).map(a=> ({...a})),
  };
}
function getEmptyCustomer() {
  return { id: `new_${Math.random().toString(36).slice(2,6)}`, email: "", phone_e164: "", name_full: "", status: "active", marketing_opt_in: false, tags: [], profile: { first_name: "", last_name: "", company_name: "", gstin: "" }, preferences: { locale: "en-IN", currency: "INR", marketing_emails: false, marketing_sms: false, whatsapp_updates: false }, addresses: [] };
}
function validateCustomer(c) {
  const issues = [];
  if (!c.email && !c.phone_e164) issues.push("Either email or phone is required");
  if (c.phone_e164 && !/^\+[1-9]\d{6,14}$/.test(c.phone_e164)) issues.push("Phone must be E.164 (+country…)");
  (c.addresses || []).forEach((a,i)=>{ if (!a.country_iso2) issues.push(`Address #${i+1}: country required`); if (!a.line1) issues.push(`Address #${i+1}: line1 required`); if (!a.city) issues.push(`Address #${i+1}: city required`); if (!a.postal_code) issues.push(`Address #${i+1}: postal code required`); });
  return issues;
}
function serializeForSave(c) {
  const base = {
    email: c.email || null,
    phone_e164: c.phone_e164 || null,
    name_full: c.name_full || null,
    status: c.status || "active",
    marketing_opt_in: !!c.marketing_opt_in,
    tags: c.tags || [],
    profile: { first_name: c.profile?.first_name || null, last_name: c.profile?.last_name || null, company_name: c.profile?.company_name || null, gstin: c.profile?.gstin || null },
    preferences: { locale: c.preferences?.locale || null, currency: c.preferences?.currency || "INR", marketing_emails: !!c.preferences?.marketing_emails, marketing_sms: !!c.preferences?.marketing_sms, whatsapp_updates: !!c.preferences?.whatsapp_updates },
  };
  return { base };
}
function cleanAddress(a) { const x = { ...a }; delete x.id; return x; }
function shortId(id) { return (id || "").toString().slice(0, 8) || "—"; }
function formatDate(s) { try { return new Date(s).toLocaleString(); } catch { return "—"; } }
function splitTags(s) { return s.split(",").map(x=>x.trim()).filter(Boolean); }
function validId(id) { if (!id) return null; const s = String(id); if (s.startsWith("new_")) return null; return id; }
