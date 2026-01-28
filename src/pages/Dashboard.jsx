// src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext.jsx";

export default function Dashboard() {
  const { token: adminToken, canAccess, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [metrics, setMetrics] = useState({
    revenue30d: 0,
    orders30d: 0,
    customers: 0,
    products: 0,
    trend: [],
    daily: [],
  });

  // ✅ unified access check (Super Admin bypass)
  const hasMetricsAccess =
    isSuperAdmin || canAccess("metrics.read") || canAccess("dashboard.read");

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!adminToken) {
        navigate("/app", { replace: true });
        return;
      }

      setLoading(true);
      setErr("");

      try {
        if (!hasMetricsAccess) {
          setMetrics({
            revenue30d: 0,
            orders30d: 0,
            customers: 0,
            products: 0,
            trend: [],
            daily: [],
          });
          setLoading(false);
          return;
        }

        const { data } = await api.get("/api/admin/metrics");

        const revenue30d =
          data?.revenue30d != null
            ? Number(data.revenue30d)
            : data?.summary?.revenue != null
            ? Number(data.summary.revenue) / 100
            : 0;

        const orders30d =
          data?.orders30d != null
            ? Number(data.orders30d)
            : Number(data?.summary?.orders || 0);

        const customers = Number(data?.customers || 0);
        const products = Number(data?.products || 0);

        const trend = Array.isArray(data?.trend)
          ? data.trend
          : Array.isArray(data?.series)
          ? data.series.map((r) => ({
              date: r.date,
              revenue: Number(r.revenue_cents || 0) / 100,
            }))
          : [];

        const daily = Array.isArray(data?.daily)
          ? data.daily
          : Array.isArray(data?.series)
          ? data.series.map((r) => ({ date: r.date, orders: r.orders || 0 }))
          : [];

        if (!alive) return;
        setMetrics({ revenue30d, orders30d, customers, products, trend, daily });
      } catch (e) {
        if (!alive) return;
        const msg =
          e?.response?.status === 403
            ? "Forbidden (403): Admin metrics ke liye access chahiye."
            : e?.response?.status === 401
            ? "Unauthorized (401): Token missing/expired."
            : e?.response?.data?.error || e.message || "Failed to load metrics";
        setErr(msg);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [adminToken, hasMetricsAccess, navigate]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat
          title="Revenue (30d)"
          value={
            hasMetricsAccess
              ? `₹ ${metrics.revenue30d.toFixed(2)}`
              : "— (No access)"
          }
        />
        <Stat
          title="Orders (30d)"
          value={hasMetricsAccess ? String(metrics.orders30d) : "—"}
        />
        <Stat
          title="Customers"
          value={hasMetricsAccess ? String(metrics.customers) : "—"}
        />
        <Stat
          title="Products"
          value={hasMetricsAccess ? String(metrics.products) : "—"}
        />
      </div>

      {err && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Charts */}
      <Card title="Revenue Trend">
        {loading ? (
          <Skeleton />
        ) : hasMetricsAccess ? (
          <Placeholder />
        ) : (
          <NoAccess />
        )}
      </Card>

      <Card title="Orders / day">
        {loading ? (
          <Skeleton />
        ) : hasMetricsAccess ? (
          <Placeholder />
        ) : (
          <NoAccess />
        )}
      </Card>
    </div>
  );
}

/* ---------------- UI bits ---------------- */
function Stat({ title, value }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}

function Skeleton() {
  return <div className="h-48 rounded-xl border border-dashed animate-pulse" />;
}

function Placeholder() {
  return <div className="h-48 rounded-xl border border-dashed" />;
}

function NoAccess() {
  return (
    <div className="h-48 rounded-xl border border-dashed flex items-center justify-center text-slate-500">
      No access to view metrics
    </div>
  );
}
