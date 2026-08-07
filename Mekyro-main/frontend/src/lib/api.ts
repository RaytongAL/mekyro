import { TOKEN_COOKIE_NAME } from "@/lib/auth/core";

const LOCALE_KEY = "mekyro_locale";

function getToken(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE_NAME}=([^;]*)`));
  return match?.[1];
}

function getLocale(): string {
  return localStorage.getItem(LOCALE_KEY) || "zh-CN";
}

export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

export type ApiOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

export async function api<T = unknown>(url: string, options: ApiOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Accept-Language": getLocale(),
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  return res.json() as Promise<T>;
}
