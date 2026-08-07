import { Navigate, useLocation } from "react-router-dom";
import { parseAuthFromJwt, type AuthRole } from "@/lib/auth/core";

type AuthGuardProps = {
  role: AuthRole;
  children: React.ReactNode;
};

export function AuthGuard({ role, children }: AuthGuardProps) {
  const location = useLocation();
  const tokenMatch = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  const token = tokenMatch?.[1];
  const user = parseAuthFromJwt(token);

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // ops 用户可以访问所有页面，supplier 用户只能访问 supplier 页面
  if (role === "ops" && user.role !== "ops") {
    return <Navigate to="/supplier" replace />;
  }

  return <>{children}</>;
}
