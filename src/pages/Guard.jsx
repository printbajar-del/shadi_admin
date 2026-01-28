// src/pages/Guard.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useEmployeeAuth } from "../context/EmployeeAuthContext.jsx";
import useEmployeePermissions from "../hooks/useEmployeePermissions";

/**
 * Guard
 * - Admin area: if admin token exists (or authenticated admin user), bypass ALL checks.
 * - Employee area: checks employee token + permissions via useEmployeePermissions().
 */
export default function Guard({ need = [], children }) {
  const loc = useLocation();

  // ✅ ADMIN BYPASS
  // Some setups set token but not isAuthenticated; so we allow token as well.
  const { user: adminUser, token: adminToken, isAuthenticated } = useAuth();
  if (adminToken || (isAuthenticated && adminUser)) return children;

  // EMPLOYEE check
  const { token: empToken } = useEmployeeAuth();
  const { loading, canAny } = useEmployeePermissions();

  if (!empToken) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (loading) return null;

  if (!Array.isArray(need) || need.length === 0) return children;
  return canAny(need) ? children : <Navigate to="/app" replace />;
}
