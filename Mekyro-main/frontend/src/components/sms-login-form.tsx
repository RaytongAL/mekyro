import { useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { type Locale } from "@/i18n";
import { api, type ApiResponse } from "@/lib/api";
import { CAPTCHA_CONFIG } from "@/lib/captcha";
import { TOKEN_COOKIE_NAME, nextPathForRole, parseAuthFromJwt, type AuthRole } from "@/lib/auth/core";
import { onboardingSessionStore } from "@/lib/agent/onboarding-session-store";

const CAPTCHA_SDK_URL = "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";
const COUNTDOWN_SECONDS = 60;
const isSecure = globalThis.location?.protocol === "https:";

export function SmsLoginForm({
  apiPath = "/api/user/sms/vendor-login/",
  audience,
  cta,
  hint,
  locale,
  nextPath,
  phoneLabel,
  phonePlaceholder,
  tabBar,
}: {
  apiPath?: string;
  audience: AuthRole;
  cta: string;
  hint?: string;
  locale: Locale;
  nextPath: string;
  phoneLabel: string;
  phonePlaceholder?: string;
  tabBar?: ReactNode;
}) {
  const goTo = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(undefined, { lng: locale });
  const captchaLanguage = locale === "zh-CN" ? "cn" : "en";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [captchaReady, setCaptchaReady] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const captchaInstanceRef = useRef<unknown>(null);
  const pendingPhoneRef = useRef<string>("");

  // 初始化阿里云验证码（仅一次）
  useEffect(() => {
    // 1. 设置全局配置（必须在 SDK 加载前）
    window.AliyunCaptchaConfig = {
      region: "cn",
      prefix: CAPTCHA_CONFIG.prefix,
    };

    // 2. 动态加载 SDK
    if (window.initAliyunCaptcha) {
      initCaptcha();
      return;
    }

    const existing = document.querySelector(`script[src="${CAPTCHA_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", initCaptcha);
      return;
    }

    const script = document.createElement("script");
    script.src = CAPTCHA_SDK_URL;
    script.async = true;
    script.onload = initCaptcha;
    script.onerror = () => console.warn("[Captcha] SDK 加载失败");
    document.head.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initCaptcha() {
    if (!window.initAliyunCaptcha) {
      console.warn("[Captcha] initAliyunCaptcha 不存在");
      return;
    }

    window.initAliyunCaptcha({
      SceneId: CAPTCHA_CONFIG.sceneId,
      mode: "popup",
      element: "#aliyun-captcha-container",
      button: "#aliyun-captcha-trigger",
      captchaVerifyCallback: captchaVerifyCallback,
      onBizResultCallback: onBizResultCallback,
      getInstance: (instance: unknown) => {
        captchaInstanceRef.current = instance;
      },
      slideStyle: { width: 360, height: 40 },
      language: captchaLanguage,
    });

    setCaptchaReady(true);
    console.log("[Captcha] 初始化完成");
  }

  /**验证码通过后调用：发送短信 */
  async function captchaVerifyCallback(captchaVerifyParam: string) {
    const phoneNumber = pendingPhoneRef.current;
    try {
      const data = await api<ApiResponse<null>>("/api/user/sms/send-code/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, captcha_verify_param: captchaVerifyParam }),
      });

      const success = !!(data && data.code === 200);
      if (!success) {
        setError(data?.message || t("auth.sendCodeFailed"));
      }
      // captchaResult 永远为 true：只要能拿到后端响应就说明 captcha 已校验通过
      // bizResult 反映短信是否发送成功
      return { captchaResult: true, bizResult: success };
    } catch {
      setError(t("auth.networkError"));
      return { captchaResult: true, bizResult: false };
    }
  }

  /**业务结果回调：验证码关闭后触发 */
  function onBizResultCallback(bizResult: boolean) {
    setSending(false);
    if (bizResult) {
      // 短信发送成功，开始倒计时
      setCountdown(COUNTDOWN_SECONDS);
      setPhone(pendingPhoneRef.current);
      setError("");
    }
  }

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 清理 captcha 实例
  const destroyCaptcha = useCallback(() => {
    const inst = captchaInstanceRef.current as { destroy?: () => void } | null;
    inst?.destroy?.();
    captchaInstanceRef.current = null;
  }, []);

  useEffect(() => {
    return () => destroyCaptcha();
  }, [destroyCaptcha]);

  /**点击"获取验证码" */
  function handleSendCode() {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError(t("auth.emptyPhone"));
      return;
    }
    pendingPhoneRef.current = trimmed;
    setError("");
    setSending(true);

    // 触发隐藏按钮，启动验证码
    triggerRef.current?.click();
  }

  /**短信验证码登录 */
  async function handleLogin() {
    if (!phone.trim() || !code.trim()) {
      setError(t("auth.emptyPhoneOrCode"));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const data = await api<ApiResponse<{ token: string; user: { is_superuser: boolean; nickname?: string; username?: string; language?: string } }>>(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
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
    <>
    <form className="official-login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
      {tabBar}
      {/* 手机号 */}
      <label className="official-field">
        <span>{phoneLabel}</span>
        <input
          autoComplete="tel"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => { if (countdown <= 0) setPhone(e.target.value); }}
          placeholder={phonePlaceholder || phoneLabel}
          disabled={countdown > 0}
        />
      </label>

      {/* 验证码 */}
      <label className="official-field official-sms-code-field">
        <span>{t("auth.smsCode")}</span>
        <div className="official-sms-code-row">
          <input
            autoComplete="one-time-code"
            name="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("auth.smsCodePlaceholder")}
          />
          <button
            type="button"
            className="official-button official-button-quiet official-sms-send-btn"
            disabled={!captchaReady || sending || countdown > 0}
            onClick={handleSendCode}
          >
            {!captchaReady
              ? "..."
              : countdown > 0
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
    <div id="aliyun-captcha-container" />
    <button
      id="aliyun-captcha-trigger"
      ref={triggerRef}
      type="button"
      style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      aria-hidden="true"
      tabIndex={-1}
    />
    </>  );
}
