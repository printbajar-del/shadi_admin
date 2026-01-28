// src/pages/Orders.jsx
import React, { useEffect, useState } from "react";
import useEmployeePermissions from "../hooks/useEmployeePermissions";
import { useAuth } from "../context/AuthContext.jsx";
import { useEmployeeAuth } from "../context/EmployeeAuthContext.jsx";

/* ================= API base ================= */
const API_BASE =
  (import.meta.env && import.meta.env.VITE_API_BASE_ORDERS) ||
  "http://localhost:5000/api/orders";

/* ================= auth header (admin or employee) ================= */
function getAuthHeader() {
  // Prefer contexts if available; fallback to localStorage
  try {
    const a = JSON.parse(localStorage.getItem("adminAuth") || "null");
    if (a?.token) return { Authorization: "Bearer " + a.token };
  } catch {}
  try {
    const e = JSON.parse(localStorage.getItem("employeeAuth") || "null");
    if (e?.token) return { Authorization: "Bearer " + e.token };
  } catch {}
  return {};
}

async function request(url, opts = {}) {
  const headers = { ...(opts.headers || {}), ...getAuthHeader() };
  const res = await fetch(url, { ...opts, headers });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${text.slice(0, 200)}`);
  if (!ct.includes("application/json"))
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 150)}`);
  return JSON.parse(text);
}

/* ================= API layer ================= */
async function apiList(paramsObj = {}) {
  const {
    q = "",
    status = "all",
    payment = "all",
    from = "",
    to = "",
    page = 1,
    pageSize = 10,
  } = paramsObj;
  const params = new URLSearchParams({
    q,
    status,
    payment,
    from,
    to,
    page: String(page),
    pageSize: String(pageSize),
  });
  return request(`${API_BASE}?${params.toString()}`);
}
async function apiGet(id) { return request(`${API_BASE}/${id}`); }
async function apiUpdateHeader(id, patch) {
  return request(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
async function apiAddHistory(id, payload) {
  return request(`${API_BASE}/${id}/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
async function apiListPayments(orderId) { return request(`${API_BASE}/${orderId}/payments`); }
async function apiAddPayment(orderId, payload) {
  return request(`${API_BASE}/${orderId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* ================= Page ================= */
export default function OrdersPage() {
  const { user: adminUser } = useAuth();
  const { token: empToken } = useEmployeeAuth();
  const { can } = useEmployeePermissions();

  const isAdmin = !!adminUser;

  // granular perms
  const canReadOrders    = isAdmin ? true : (can("orders.read") || can("orders.view") || can("orders.list"));
  const canWriteOrders   = isAdmin ? true : (can("orders.update") || can("orders.write"));
  const canWritePayments = isAdmin ? true : (can("payments.write") || can("orders.write"));

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!canReadOrders) { setItems([]); setTotal(0); return; } // 🚫 no fetch
    try {
      setLoading(true); setError("");
      const data = await apiList({ q, status, payment, from, to, page, pageSize });
      setItems(data.items || []); setTotal(data.total || 0);
    } catch (e) {
      setError(String(e.message || e));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [q, status, payment, from, to, page, pageSize, empToken, canReadOrders]);

  async function openDetail(id) {
    if (!canReadOrders) return;
    try {
      setSaving(true);
      const data = await apiGet(id);
      setDetail(data); setDrawerOpen(true);
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function refreshDetail() { if (!detail?.id) return; try {
    const data = await apiGet(detail.id); setDetail(data);
  } catch (e) { console.error(e); } }

  async function saveHeader(patch) {
    if (!canWriteOrders) return alert("Not allowed");
    try {
      setSaving(true);
      const updated = await apiUpdateHeader(detail.id, patch);
      setDetail((d) => ({ ...d, ...updated })); await load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function addTimeline({ status, note }) {
    if (!canWriteOrders) return alert("Not allowed");
    try {
      setSaving(true);
      const entry = await apiAddHistory(detail.id, { status, note });
      setDetail((d) => ({
        ...d,
        history: Array.isArray(entry) ? entry :
          [...(d.history || []), entry].sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
      }));
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  function exportCSV() {
    if (!canReadOrders) return alert("Not allowed");
    try {
      const params = new URLSearchParams({ q, status, payment, from, to });
      const a = document.createElement("a");
      a.href = `${API_BASE}/export?${params.toString()}`;
      a.download = `orders_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch {}
  }

  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));

  if (!canReadOrders) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="mt-3 p-4 rounded-xl border bg-amber-50 text-amber-900">
          You don’t have permission to view orders.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e)=>{ setPage(1); setQ(e.target.value); }} placeholder="Search order # / email / phone" className="border rounded-xl px-3 py-2 w-64 outline-none focus:ring" />
          <select value={status} onChange={(e)=>{ setPage(1); setStatus(e.target.value); }} className="border rounded-xl px-3 py-2">
            <option value="all">All status</option>
            {["pending","confirmed","processing","shipped","delivered","cancelled","refunded"].map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={payment} onChange={(e)=>{ setPage(1); setPayment(e.target.value); }} className="border rounded-xl px-3 py-2">
            <option value="all">All payments</option>
            {["unpaid","paid","refunded","failed"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={from} onChange={(e)=>{ setPage(1); setFrom(e.target.value); }} className="border rounded-xl px-3 py-2" title="From date" />
          <input type="date" value={to} onChange={(e)=>{ setPage(1); setTo(e.target.value); }} className="border rounded-xl px-3 py-2" title="To date" />
          <button onClick={exportCSV} className="px-3 py-2 rounded-xl border">Export CSV</button>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <OrdersTable items={items} loading={loading} error={error} onOpen={openDetail} />
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-600">Total {total} • Page {page} / {pages}</div>
        <div className="flex items-center gap-2">
          <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-3 py-2 rounded-lg border disabled:opacity-40">Prev</button>
          <button disabled={page===pages} onClick={()=>setPage(p=>Math.min(pages,p+1))} className="px-3 py-2 rounded-lg border disabled:opacity-40">Next</button>
          <select value={pageSize} onChange={(e)=>{ setPage(1); setPageSize(Number(e.target.value)); }} className="border rounded-lg px-2 py-2">
            {[10,20,50].map(n=><option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>

      {drawerOpen && detail && (
        <DetailDrawer onClose={()=>setDrawerOpen(false)}>
          <OrderDetail
            data={detail}
            saving={saving}
            onSaveHeader={saveHeader}
            onAddTimeline={addTimeline}
            onRefresh={refreshDetail}
            canWriteOrders={canWriteOrders}
            canWritePayments={canWritePayments}
          />
        </DetailDrawer>
      )}
    </div>
  );
}

function OrdersTable({ items, loading, error, onOpen }) {
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50 text-left">
          <tr>
            <Th>Order #</Th><Th>Status</Th><Th>Payment</Th><Th>Total</Th><Th>Customer</Th><Th>Placed</Th><Th>Action</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="p-6 text-center text-gray-500">Loading…</td></tr>
          ) : items.length === 0 ? (
            <tr><td colSpan={7} className="p-6 text-center text-gray-500">No orders</td></tr>
          ) : items.map((o)=>(
            <tr key={o.id} className="border-t hover:bg-gray-50">
              <Td><code className="text-xs bg-gray-100 rounded px-2 py-1">{o.order_number ?? o.id}</code></Td>
              <Td><Badge>{o.status}</Badge></Td>
              <Td>{o.payment_status}</Td>
              <Td>{formatMoney(o.grand_total, o.currency)}</Td>
              <Td>{o.customer_name || o.customer_email || "—"}</Td>
              <Td>{formatDate(o.placed_at || o.created_at)}</Td>
              <Td><button className="px-3 py-1 rounded-lg border" onClick={()=>onOpen(o.id)}>View</button></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================ Detail Drawer / Detail ================= */
function DetailDrawer({ children, onClose }) {
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc); return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white shadow-xl p-4 md:p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Order</h2>
          <button onClick={onClose} className="px-3 py-1 rounded-lg border">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OrderDetail({ data, saving, onSaveHeader, onAddTimeline, onRefresh, canWriteOrders, canWritePayments }) {
  const [status, setStatus] = useState(data.status);
  const [paymentStatus, setPaymentStatus] = useState(data.payment_status);
  const [note, setNote] = useState("");

  useEffect(() => { setStatus(data.status); setPaymentStatus(data.payment_status); }, [data.id, data.status, data.payment_status]);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-3">
          <div className="font-semibold mb-1">Summary</div>
          <div className="text-sm text-slate-600">Order: <code className="px-2 py-1 bg-slate-100 rounded text-xs">{data.order_number ?? data.id}</code></div>
          <div className="text-sm text-slate-600">Total: {formatMoney(data.grand_total, data.currency)}</div>
          <div className="text-sm text-slate-600">Placed: {formatDate(data.placed_at || data.created_at)}</div>
          <div className="text-right mt-2"><button onClick={onRefresh} className="px-3 py-1 rounded border">Refresh</button></div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="font-semibold mb-1">Order Status</div>
          <select className="border rounded-xl px-3 py-2 w-full outline-none focus:ring" value={status} onChange={(e)=>setStatus(e.target.value)}>
            {["pending","confirmed","processing","shipped","delivered","cancelled","refunded"].map((s)=><option key={s}>{s}</option>)}
          </select>
          <div className="text-right mt-2">
            {canWriteOrders ? <button disabled={saving} onClick={()=>onSaveHeader({ status })} className="px-3 py-2 rounded-xl border">Save</button> : <span className="text-xs text-slate-400">No permission</span>}
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="font-semibold mb-1">Payment</div>
          <select className="border rounded-xl px-3 py-2 w-full outline-none focus:ring" value={paymentStatus} onChange={(e)=>setPaymentStatus(e.target.value)}>
            {["unpaid","paid","refunded","failed"].map((s)=><option key={s}>{s}</option>)}
          </select>
          <div className="text-right mt-2">
            {canWriteOrders ? <button disabled={saving} onClick={()=>onSaveHeader({ payment_status: paymentStatus })} className="px-3 py-2 rounded-xl border">Save</button> : <span className="text-xs text-slate-400">No permission</span>}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-slate-50 text-left"><tr><Th>Item</Th><Th>Variant</Th><Th>Qty</Th><Th>Price</Th><Th>Subtotal</Th></tr></thead>
        </table>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <tbody>
              {(data.items || []).map((it) => (
                <tr key={it.id} className="border-t">
                  <Td>{it.product_name || it.sku}</Td>
                  <Td>{it.variant_name || "—"}</Td>
                  <Td>{it.quantity}</Td>
                  <Td>{formatMoney(it.unit_price, data.currency)}</Td>
                  <Td>{formatMoney(it.row_total ?? it.subtotal, data.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments */}
      <div className="rounded-xl border p-3">
        <div className="font-semibold mb-2">Payments</div>
        <Payments orderId={data.id} canWritePayments={canWritePayments} />
      </div>

      {/* Timeline */}
      <div className="rounded-xl border p-3">
        <div className="font-semibold mb-2">Timeline</div>
        <div className="space-y-2 mb-3">
          {(data.history || []).map((h, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-36 text-slate-500">{formatDate(h.changed_at)}</span>
              <Badge>{h.status}</Badge>
              <span className="text-slate-700">{h.note || ""}</span>
            </div>
          ))}
        </div>
        <TimelineComposer onAdd={onAddTimeline} currentStatus={status} canWriteOrders={canWriteOrders} />
      </div>
    </div>
  );
}

function Payments({ orderId, canWritePayments }) {
  const [items, setItems] = useState([]);
  const [amt, setAmt] = useState("");
  const [status, setStatus] = useState("captured");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true); setErr("");
      const d = await apiListPayments(orderId); setItems(d.items || []);
    } catch (e) { setErr(String(e.message || e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (orderId) load(); }, [orderId]);

  async function add() {
    if (!canWritePayments) return alert("Not allowed");
    const n = Number(amt || 0); if (!n) return alert("Enter amount");
    try { await apiAddPayment(orderId, { amount: n, status }); setAmt(""); await load(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="text-sm">
      {err && <div className="text-red-600 mb-2">{err}</div>}
      <ul className="space-y-1 mb-3">
        {loading ? <li className="text-gray-500">Loading…</li> :
         items.length === 0 ? <li className="text-gray-500">No payments</li> :
         items.map((p)=>(
          <li key={p.id} className="flex justify-between border rounded px-2 py-1">
            <span>{p.currency} {Number(p.amount).toFixed(2)} • {p.status}</span>
            <span className="text-gray-500">{formatDate(p.created_at)}</span>
          </li>
         ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className="border rounded px-2 py-1 w-28" placeholder="Amount" value={amt} onChange={(e)=>setAmt(e.target.value)} />
        <select className="border rounded px-2 py-1" value={status} onChange={(e)=>setStatus(e.target.value)}>
          {["pending","captured","failed","refunded"].map((s)=><option key={s}>{s}</option>)}
        </select>
        {canWritePayments ? (
          <button onClick={add} className="px-3 py-1 rounded bg-black text-white">Add</button>
        ) : (
          <span className="text-xs text-slate-400 self-center">No permission</span>
        )}
      </div>
    </div>
  );
}

function TimelineComposer({ onAdd, currentStatus, canWriteOrders }) {
  const [status, setStatus] = useState(""); const [note, setNote] = useState("");
  return (
    <div className="grid md:grid-cols-[200px_1fr_auto] gap-2">
      <select className="border rounded-xl px-3 py-2 outline-none focus:ring" value={status} onChange={(e)=>setStatus(e.target.value)}>
        <option value="">(optional) status</option>
        {["pending","confirmed","processing","shipped","delivered","cancelled","refunded"].map((s)=><option key={s}>{s}</option>)}
      </select>
      <input className="border rounded-xl px-3 py-2 outline-none focus:ring" placeholder="Add a note…" value={note} onChange={(e)=>setNote(e.target.value)} />
      {canWriteOrders ? (
        <button onClick={()=>{ if (!note && !status) return alert("Add status or note"); onAdd({ status: status || currentStatus, note }); setNote(""); setStatus(""); }} className="px-3 py-2 rounded-xl border">Add</button>
      ) : (
        <span className="text-xs text-slate-400 self-center">No permission</span>
      )}
    </div>
  );
}

/* ============== UI helpers ============== */
function Th({ children }) { return <th className="px-4 py-3 text-sm font-semibold text-gray-700">{children}</th>; }
function Td({ children }) { return <td className="px-4 py-3 text-sm">{children}</td>; }
function Badge({ children }) { return <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{children}</span>; }
function formatDate(s) { try { return new Date(s).toLocaleString(); } catch { return "—"; } }
function formatMoney(n, cur) { return new Intl.NumberFormat(undefined, { style:"currency", currency: cur || "INR" }).format(Number(n || 0)); }
