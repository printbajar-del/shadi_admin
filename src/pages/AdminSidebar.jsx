// src/pages/AdminSidebar.jsx
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * NOTE:
 * - Dashboard sabko dikhai de (no perm).
 * - Baaki items permission ke hisaab se filter.
 * - Super Admin sab dekh sakta hai, bina filter.
 */

const MENU = [
  { label: "Dashboard", icon: "🏠", to: "/admin",              perm: null },
  { label: "Customers", icon: "👤", to: "/admin/customers",     perm: "customers.read" },
  { label: "Employees", icon: "👥", to: "/admin/employees",     perm: "employees.read" },
  { label: "Products",  icon: "📚", to: "/admin/products",      perm: "products.read" },
  { label: "Orders",    icon: "📦", to: "/admin/orders",        perm: "orders.read" },
  { label: "Coupons",   icon: "🏷️", to: "/admin/coupons",       perm: "coupons.read" },
  // (optional) Roles manager route:
  { label: "Roles",     icon: "🛡️", to: "/admin/roles",         perm: "roles.read" },
];

const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, "_");
const isSuper = (u) => {
  if (!u) return false;
  const role = norm(u.role || u.type || "");
  if (role === "super_admin") return true;
  const roles = Array.isArray(u.roles) ? u.roles.map(norm) : [];
  return roles.includes("super_admin");
};

export default function AdminSidebar() {
  const { user, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const items = useMemo(() => {
    if (isSuper(user)) return MENU;
    const safeCan = typeof can === "function" ? can : () => false;
    return MENU.filter((it) => !it.perm || safeCan(it.perm));
  }, [user, can]);

  useEffect(() => {
    // If current route not allowed → redirect to first allowed item
    const allowed = items.some((i) => location.pathname.startsWith(i.to));
    if (!allowed && items.length) navigate(items[0].to, { replace: true });
  }, [location.pathname, items, navigate]);

  return (
    <aside className="w-full md:w-64 shrink-0">
      <nav className="grid gap-2 p-3">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm " +
              (isActive ? "bg-indigo-600 text-white" : "hover:bg-slate-100 text-slate-800")
            }
          >
            <span className="w-5 text-center">{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
