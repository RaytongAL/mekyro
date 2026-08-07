import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { type Locale } from "@/i18n";
import { api, type ApiResponse } from "@/lib/api";
import { TOKEN_COOKIE_NAME, nextPathForRole, parseAuthFromJwt, type AuthRole } from "@/lib/auth/core";
import { onboardingSessionStore } from "@/lib/agent/onboarding-session-store";

const COUNTDOWN_SECONDS = 60;
const isSecure = globalThis.location?.protocol === "https:";

export function EmailLoginForm({
  apiPath = "/api/user/email/vendor-login/",
  audience,
  cta,
  hint,
  locale,
  nextPath,
  emailLabel,
  emailPlaceholder,
  tabBar,
}: {
  apiPath?: string;
  audience: AuthRole;
  cta: string;
  hint?: string;
  locale: Locale;
  nextPath: string;
  emailLabel: string;
  emailPlaceholder?: string;
  tabBar?: ReactNode;
}) {
  const goTo = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(undefined, { lng: locale });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  /**点击"发送验证码" */
  async function handleSendCode() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t("auth.emptyEmail"));
      return;
    }

    setError("");
    setSending(true);

    try {
      const data = await api<ApiResponse<null>>("/api/user/email/send-code/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      if (data && data.code === 200) {
        setCountdown(COUNTDOWN_SECONDS);
        setEmail(trimmed);
      } else {
        setError(data?.message || t("auth.sendCodeFailed"));
      }
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setSending(false);
    }
  }

  /**邮箱验证码登录 */
  async function handleLogin() {
    if (!email.trim() || !code.trim()) {
      setError(t("auth.emptyEmailOrCode"));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const data = await api<ApiResponse<{ token: string; user: { is_superuser: boolean; nickname?: string; username?: string; language?: string } }>>(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });

      if (!data || data.code !== 200) {
        setError(data?.message || t("auth.loginFailed"));
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
    <form className="official-login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
      {tabBar}
      {/* 邮箱 */}
      <label className="official-field">
        <span>{emailLabel}</span>
        <input
          autoComplete="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => { if (countdown <= 0) setEmail(e.target.value); }}
          placeholder={emailPlaceholder || emailLabel}
          disabled={countdown > 0}
        />
      </label>

      {/* 验证码 */}
      <label className="official-field official-sms-code-field">
        <span>{t("auth.emailCode")}</span>
        <div className="official-sms-code-row">
          <input
            autoComplete="one-time-code"
            name="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("auth.emailCodePlaceholder")}
          />
          <button
            type="button"
            className="official-button official-button-quiet official-sms-send-btn"
            disabled={sending || countdown > 0}
            onClick={handleSendCode}
          >
            {countdown > 0
              ? `${countdown}s`
              : sending
                ? t("auth.sending")
                : t("auth.getCode")}
          </button>
        </div>
      </label>

      {error ? <p className="official-login-error">{error}</p> : null}

      <button className="official-button official-button-primary official-login-submit" disabled={loading} type="submit">
        <span>{loading ? t("auth.loggingIn") : cta}</span>
        <ArrowRight size={15} />
      </button>

      {hint ? <p className="official-login-hint official-login-hint-sms">{hint}</p> : null}
    </form>
  );
}
