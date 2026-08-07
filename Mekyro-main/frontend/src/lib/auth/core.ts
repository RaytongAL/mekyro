export const TOKEN_COOKIE_NAME = "ai_trade_token";

export type AuthRole = "supplier" | "ops";

export type AuthUser = {
  id: number;
  username: string;
  nickname: string;
  email?: string;
  role: AuthRole;
};

export type JwtPayload = {
  exp: number;
  iat: number;
  sub?: string;
  user_id?: number | string;
  username?: string;
  nickname?: string;
  is_platform_admin?: boolean;
  is_superuser?: boolean;
};

export function roleHome(role: AuthRole) {
  return role === "ops" ? "/ops" : "/supplier";
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  try {
    const json = decodeBase64Url(segments[1]);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function parseAuthFromJwt(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const rawUserId = String(payload.user_id ?? payload.sub ?? "");
  const numericUserId = Number(rawUserId);
  const userId = Number.isInteger(numericUserId) && numericUserId > 0
    ? numericUserId
    : stableIdentityNumber(rawUserId);
  if (
    !Number.isInteger(userId)
    || userId <= 0
    || !rawUserId
    || payload.exp == null
  ) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return {
    id: userId,
    username: payload.username || rawUserId,
    nickname: payload.nickname || payload.username || rawUserId,
    role: payload.is_platform_admin || payload.is_superuser ? "ops" : "supplier",
  };
}

function stableIdentityNumber(value: string): number {
  if (!value) return 0;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

export function getAuthTokenFromCookie() {
  if (typeof document === "undefined") return undefined;
  const tokenMatch = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE_NAME}=([^;]*)`),
  );
  return tokenMatch?.[1];
}

export function getCurrentAuthUser() {
  return parseAuthFromJwt(getAuthTokenFromCookie());
}

export function internalPath(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return "";
  try {
    const url = new URL(input, "https://mekyro.local");
    if (url.origin !== "https://mekyro.local") return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

export function nextPathForRole(input: unknown, role: AuthRole) {
  const path = internalPath(input);
  const home = roleHome(role);
  if (!path) return home;
  if (role === "ops") {
    if (path.startsWith("/ops") || path.startsWith("/supplier")) return path;
  }
  if (role === "supplier" && path.startsWith("/supplier")) return path;
  return home;
}
