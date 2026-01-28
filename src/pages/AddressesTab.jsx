


// ===============================
// File: src/pages/customers/AddressesTab.jsx
// ===============================
import React from "react";

export default function AddressesTab({ items }) {
  if (!items || items.length === 0) return <Empty text="No addresses." />;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className="border rounded p-3">
          <div className="font-medium mb-1">{(a.type || "Address").toUpperCase()}</div>
          <div className="text-sm text-gray-700">{a.line1}{a.line2 ? ", " + a.line2 : ""}</div>
          <div className="text-sm text-gray-700">{[a.city, a.state, a.pin].filter(Boolean).join(", ")}</div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) { return <div className="text-sm text-gray-500">{text}</div>; }


