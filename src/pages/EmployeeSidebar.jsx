// src/components/EmployeeSidebar.jsx
import { NavLink } from "react-router-dom";
import useEmployeePermissions from "../hooks/useEmployeePermissions";

const MENU = [
  { label: "Orders",   to: "/app/orders",   perm: "orders.read",   icon: "📦" },
  { label: "Coupons",  to: "/app/coupons",  perm: "coupons.read",  icon: "🏷️" },
  { label: "Products", to: "/app/products", perm: "products.read", icon: "📚" },
  { label: "Payroll",  to: "/app/payroll",  perm: "payroll.read",  icon: "💳" },
];

export default function EmployeeSidebar() {
  const { can } = useEmployeePermissions();
  const items = MENU.filter(i => !i.perm || can(i.perm));
  return (
    <aside className="w-full md:w-64 shrink-0">
      <nav className="grid gap-2 p-3">
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({isActive}) =>
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm " +
              (isActive ? "bg-indigo-600 text-white" : "hover:bg-slate-100 text-slate-800")
            }>
            <span className="w-5 text-center">{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
