import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { api, type ApiResponse } from "@/lib/api";
import { TOKEN_COOKIE_NAME, nextPathForRole, parseAuthFromJwt, type AuthRole } from "@/lib/auth/core";
import { onboardingSessionStore } from "@/lib/agent/onboarding-session-store";

const isSecure = globalThis.location?.protocol === "https:";

export function LoginForm({
  accountLabel,
  apiPath = "/api/user/login/",
  audience,
  cta,
  hint,
  nextPath,
  passwordLabel,
  tabBar,
  accountPlaceholder,
  passwordPlaceholder,
}: {
  accountLabel: string;
  apiPath?: string;
  audience: AuthRole;
  cta: string;
  hint?: string;
  nextPath: string;
  passwordLabel: string;
  tabBar?: ReactNode;
  accountPlaceholder?: string;
  passwordPlaceholder?: string;
}) {
  const goTo = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const account = String(form.get("account") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!account || !password) {
      setError(t("auth.emptyFields"));
      setLoading(false);
      return;
    }

    try {
      const data = await api<ApiResponse<{ token: string; user: { is_superuser: boolean; nickname?: string; username?: string; language?: string } }>>(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account, password }),
      });

      if (!data || data.code !== 200) {
        setError(data?.code === 401 ? t("auth.invalidCredentials") : t("auth.loginFailed"));
        setLoading(false);
        return;
      }

      if (!data.data) {
        setError(t("auth.badResponse"));
        setLoading(false);
        return;
      }

      const { token, user } = data.data;
      const role: AuthRole = user.is_superuser ? "ops" : "supplier";

      if (audience === "ops" && role !== audience) {
        setError(t("auth.wrongEntrance"));
        setLoading(false);
        return;
      }

      sessionStorage.setItem("user", JSON.stringify(user));
      document.cookie = `${TOKEN_COOKIE_NAME}=${token}; path=/; max-age=${15 * 24 * 60 * 60}; samesite=lax${isSecure ? "; secure" : ""}`;
      onboardingSessionStore.synchronizeUser(parseAuthFromJwt(token)?.id ?? null);

      if (user.language) {
        localStorage.setItem("mekyro_locale", user.language);
        i18n.changeLanguage(user.language);
      }

      const fallback = searchParams.get("next") ?? nextPath;
      setLoading(false);
      goTo(nextPathForRole(fallback, role));
    } catch {
      setError(t("auth.networkError"));
      setLoading(false);
    }
  }

  return (
    <form className="official-login-form" onSubmit={handleSubmit}>
      {tabBar}
      <label className="official-field">
        <span>{accountLabel}</span>
        <input autoComplete="username" name="account" type="text" placeholder={accountPlaceholder} />
      </label>
      <label className="official-field">
        <span>{passwordLabel}</span>
        <input autoComplete="current-password" name="password" type="password" placeholder={passwordPlaceholder} />
      </label>
      {error ? <p className="official-login-error">{error}</p> : null}
      <button className="official-button official-button-primary official-login-submit" disabled={loading} type="submit">
        <span>{loading ? t("auth.loggingIn") : cta}</span>
        <ArrowRight size={15} />
      </button>
      {hint ? <p className="official-login-hint">{hint}</p> : null}
    </form>
  );
}
