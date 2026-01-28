
// ===============================
// File: src/pages/customers/OrdersWishlistTabs.jsx
// ===============================
import React from "react";

export function OrdersTab({ items }) {
  if (!items || items.length === 0) return <Empty text="No orders." />;
  return (
    <div className="overflow-x-auto border rounded">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <Th>Order ID</Th>
            <Th>Total</Th>
            <Th>Status</Th>
            <Th>Created</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id} className="border-t">
              <Td className="font-medium">{o.id}</Td>
              <Td>₹{o.total}</Td>
              <Td>{o.status}</Td>
              <Td>{fmtDate(o.created_at || o.createdAt)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WishlistTab({ items }) {
  if (!items || items.length === 0) return <Empty text="No wishlist items." />;
  return (
    <div className="space-y-2">
      {items.map((w) => (
        <div key={w.id} className="border rounded p-2 flex items-center justify-between">
          <div>
            <div className="font-medium">{w.title ?? w.product_title ?? ("#" + w.product_id)}</div>
            <div className="text-xs text-gray-500">Product ID: {w.product_id}</div>
          </div>
          {w.price != null && <div className="text-sm">₹{w.price}</div>}
        </div>
      ))}
    </div>
  );
}

function Th({ children }) { return <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{children}</th>; }
function Td({ children, className = "" }) { return <td className={`px-3 py-2 ${className}`}>{children}</td>; }
function Empty({ text }) { return <div className="text-sm text-gray-500">{text}</div>; }
function fmtDate(x) { if (!x) return "—"; try { const d = new Date(x); if (isNaN(d.getTime())) return String(x); return d.toLocaleDateString(); } catch { return String(x); } }