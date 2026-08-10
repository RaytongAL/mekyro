import type { OnboardingCardData, OnboardingSiteVariant } from "./chat";

export type OnboardingSiteDraftField = "url" | "details" | "apiKey" | "apiSecret";

export type OnboardingSiteDraftErrors = Partial<Record<OnboardingSiteDraftField, string>>;

export type OnboardingSiteDraft = {
  workspaceId: number | null;
  variant: OnboardingSiteVariant | null;
  url: string;
  details: string;
  apiKey: string;
  apiSecret: string;
  errors: OnboardingSiteDraftErrors;
};

export function createEmptyOnboardingSiteDraft(
  workspaceId: number | null = null,
): OnboardingSiteDraft {
  return {
    workspaceId,
    variant: null,
    url: "",
    details: "",
    apiKey: "",
    apiSecret: "",
    errors: {},
  };
}

export function validateOnboardingSiteDraft(
  draft: OnboardingSiteDraft,
  isZh: boolean,
): OnboardingSiteDraftErrors {
  const errors: OnboardingSiteDraftErrors = {};
  const url = draft.url.trim();
  if (!url) {
    errors.url = isZh ? "请填写网站地址" : "Website URL is required";
  } else if (url.length > 500) {
    errors.url = isZh ? "网站地址不能超过 500 个字符" : "URL must be 500 characters or fewer";
  } else {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error();
    } catch {
      errors.url = isZh
        ? "请输入以 http:// 或 https:// 开头的有效地址"
        : "Enter a valid http(s) URL";
    }
  }

  if (draft.variant === "shopify") {
    const apiKey = draft.apiKey.trim();
    const apiSecret = draft.apiSecret.trim();
    if (!apiKey) {
      errors.apiKey = isZh ? "请填写 API Key" : "API Key is required";
    } else if (apiKey.length > 200) {
      errors.apiKey = isZh ? "API Key 不能超过 200 个字符" : "API Key must be 200 characters or fewer";
    }
    if (!apiSecret) {
      errors.apiSecret = isZh ? "请填写 Secret Key" : "Secret Key is required";
    } else if (apiSecret.length > 200) {
      errors.apiSecret = isZh ? "Secret Key 不能超过 200 个字符" : "Secret Key must be 200 characters or fewer";
    }
  } else if (draft.variant === "self_hosted" || draft.variant === "other") {
    const details = draft.details.trim();
    if (!details) {
      errors.details = isZh ? "请填写类型说明" : "Details are required";
    } else if (details.length > 500) {
      errors.details = isZh
        ? "类型说明不能超过 500 个字符"
        : "Details must be 500 characters or fewer";
    }
  }
  return errors;
}

export function isShopifyOnboardingCard(card: OnboardingCardData) {
  return card.step === "site"
    && card.fields.some((field) => field.key === "shopify_store_url");
}
