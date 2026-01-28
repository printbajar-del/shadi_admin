import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Orders from "./pages/Orders.jsx";
import Coupons from "./pages/Coupons.jsx";
import CustomersPage from "./pages/CustomersPage.jsx";
import Employees from "./pages/Employees.jsx";
import Roles from "./pages/Roles.jsx";
import Payroll from "./pages/Payroll.jsx";

import { useAuth } from "./context/AuthContext.jsx";
import { useEmployeeAuth } from "./context/EmployeeAuthContext.jsx";

import EmployeeLayout from "./pages/EmployeeSidebar.jsx";
import Guard from "./pages/Guard.jsx";
import AdminSidebar from "./pages/AdminSidebar.jsx";

/* ---------------- Active auth (pick by area) ---------------- */
function useActiveAuth() {
  const loc = useLocation();
  const admin = useAuth();
  const emp = useEmployeeAuth();

  if (loc.pathname.startsWith("/app") && emp?.token) return { ...emp, actor: "employee" };
  if (loc.pathname.startsWith("/admin") && admin?.token) return { ...admin, actor: "admin" };
  if (admin?.token) return { ...admin, actor: "admin" };
  if (emp?.token) return { ...emp, actor: "employee" };
  return { user: null, token: null, actor: "none", ready: true };
}

function initialsOf(str = "U") {
  const base = String(str || "U").replace(/@.+$/, "").trim();
  const [a = "U", b = ""] = base.split(/\s+/);
  return (a[0] || "U").toUpperCase() + (b[0] || "").toUpperCase();
}

/* ---------------- Header user dropdown ---------------- */
function UserMenu() {
  const { user, logout, actor } = useActiveAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const displayName = useMemo(() => user?.name || user?.full_name || user?.email || "User", [user]);
  const designation = useMemo(
    () => user?.designation || user?.title || user?.role || (actor === "admin" ? "Admin" : "Employee"),
    [user, actor]
  );
  const profileHref = actor === "employee" ? "/app/profile" : "/admin/profile";

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-100"
      >
        <div className="h-7 w-7 rounded-full grid place-items-center bg-indigo-600 text-white text-xs font-semibold">
          {initialsOf(displayName)}
        </div>
        <span className="hidden sm:block text-sm font-medium">{displayName}</span>
        <span className="hidden md:inline text-xs text-slate-500">· {designation}</span>
        <span className="hidden sm:block text-slate-500">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1 z-50">
          <div className="px-3 pt-2 text-xs text-slate-500">Signed in as</div>
          <div className="px-3 text-sm font-medium truncate">{displayName}</div>
          <div className="px-3 pb-2 text-xs text-slate-500">{designation}</div>
          <hr className="my-1 border-slate-100" />
          <Link to={profileHref} className="block px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setOpen(false)}>
            Profile ({designation})
          </Link>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={logout}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Admin Shell layout ---------------- */
function Layout({ children }) {
  const { token } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500" />
            <h1 className="font-semibold tracking-tight">ShaadiCards Admin</h1>
          </div>
          <div className="flex items-center gap-3">{token ? <UserMenu /> : null}</div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <AdminSidebar />
        <main className="grid gap-4">{children}</main>
      </div>
    </div>
  );
}

/* ---------------- Route guards / redirects ---------------- */
function RedirectByActor() {
  const { token: adminToken } = useAuth();
  const { token: empToken } = useEmployeeAuth();
  if (adminToken) return <Navigate to="/admin" replace />;
  if (empToken) return <Navigate to="/app" replace />;
  return <Navigate to="/login" replace />;
}

function AdminOnly({ children }) {
  const { token: adminToken, ready: aReady } = useAuth();
  const { token: empToken, ready: eReady } = useEmployeeAuth();
  if (!aReady || !eReady) return null;
  if (adminToken) return children;
  if (empToken) return <Navigate to="/app" replace />;
  return <Navigate to="/login" replace />;
}

function EmployeeOnly({ children }) {
  const { token: empToken, ready } = useEmployeeAuth();
  if (!ready) return null;
  return empToken ? children : <Navigate to="/login" replace />;
}

/* ---------------- Routes ---------------- */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RedirectByActor />} />
      <Route path="/login" element={<Login />} />

      {/* ADMIN */}
      <Route
        path="/admin"
        element={
          <AdminOnly>
            <Layout>
              <Dashboard />
            </Layout>
          </AdminOnly>
        }
      />
      <Route
        path="/admin/products"
        element={
          <AdminOnly>
            <Layout>
              <Guard need={["products.read"]}>
                <Products />
              </Guard>
            </Layout>
          </AdminOnly>
        }
      />
      <Route
        path="/admin/orders"
        element={
          <AdminOnly>
            <Layout>
              <Guard need={["orders.read"]}>
                <Orders />
              </Guard>
            </Layout>
          </AdminOnly>
        }
      />
      <Route
        path="/admin/coupons"
        element={
          <AdminOnly>
            <Layout>
              <Guard need={["coupons.read"]}>
                <Coupons />
              </Guard>
            </Layout>
          </AdminOnly>
        }
      />
      <Route
        path="/admin/customers"
        element={
          <AdminOnly>
            <Layout>
              <Guard need={["customers.read"]}>
                <CustomersPage />
              </Guard>
            </Layout>
          </AdminOnly>
        }
      />
      <Route
        path="/admin/employees"
        element={
          <AdminOnly>
            <Layout>
              <Guard need={["employees.read"]}>
                <Employees />
              </Guard>
            </Layout>
          </AdminOnly>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <AdminOnly>
            <Layout>
              <Guard need={["roles.read"]}>
                <Roles />
              </Guard>
            </Layout>
          </AdminOnly>
        }
      />

      {/* EMPLOYEE PORTAL */}
      <Route
        path="/app"
        element={
          <EmployeeOnly>
            <EmployeeLayout />
          </EmployeeOnly>
        }
      >
        <Route path="orders"   element={<Guard need={["orders.read"]}><Orders /></Guard>} />
        <Route path="coupons"  element={<Guard need={["coupons.read"]}><Coupons /></Guard>} />
        <Route path="products" element={<Guard need={["products.read"]}><Products /></Guard>} />
        <Route path="payroll"  element={<Guard need={["payroll.read"]}><Payroll /></Guard>} />
      </Route>

      <Route path="*" element={<RedirectByActor />} />
    </Routes>
  );
}
