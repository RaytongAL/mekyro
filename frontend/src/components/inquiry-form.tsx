import { useState, useCallback, useMemo } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api, type ApiResponse } from "@/lib/api";
import type { OfficialLocale } from "@/lib/official-site/content";

type InquiryType = "supplier" | "buyer";

interface InquiryFormProps {
  /** 表单类型 */
  type: InquiryType;
  /** 字段标签列表 */
  fields: readonly string[];
  /** 提交按钮文案 */
  ctaLabel: string;
  /** 当前语言 */
  locale: OfficialLocale;
  /** 提交成功回调 */
  onSuccess?: () => void;
}

/** 国家列表（与后端 apps.core.constants.Country 保持一致，中英文双语） */
const COUNTRIES: Record<OfficialLocale, [string, string][]> = {
  "zh-CN": [
    ["CN", "中国"],
    ["US", "美国"],
    ["UK", "英国"],
    ["FR", "法国"],
    ["DE", "德国"],
    ["ES", "西班牙"],
    ["JP", "日本"],
    ["KR", "韩国"],
    ["CA", "加拿大"],
    ["AU", "澳大利亚"],
    ["IT", "意大利"],
    ["BR", "巴西"],
    ["IN", "印度"],
    ["MX", "墨西哥"],
    ["NL", "荷兰"],
    ["SE", "瑞典"],
    ["SG", "新加坡"],
    ["AE", "阿联酋"],
    ["SA", "沙特阿拉伯"],
  ],
  "en-US": [
    ["CN", "China"],
    ["US", "United States"],
    ["UK", "United Kingdom"],
    ["FR", "France"],
    ["DE", "Germany"],
    ["ES", "Spain"],
    ["JP", "Japan"],
    ["KR", "South Korea"],
    ["CA", "Canada"],
    ["AU", "Australia"],
    ["IT", "Italy"],
    ["BR", "Brazil"],
    ["IN", "India"],
    ["MX", "Mexico"],
    ["NL", "Netherlands"],
    ["SE", "Sweden"],
    ["SG", "Singapore"],
    ["AE", "United Arab Emirates"],
    ["SA", "Saudi Arabia"],
  ],
};

const SUPPLIER_FIELD_KEYS = [
  "company_name",
  "main_business",
  "country",
  "contact_name",
  "phone",
  "email",
  "remark",
] as const;

const BUYER_FIELD_KEYS = [
  "company_name",
  "required_product",
  "country",
  "contact_name",
  "phone",
  "email",
  "remark",
] as const;

function getFieldKeys(type: InquiryType): readonly string[] {
  return type === "supplier" ? SUPPLIER_FIELD_KEYS : BUYER_FIELD_KEYS;
}

function getApiUrl(type: InquiryType): string {
  return type === "supplier"
    ? "/api/external/inquiries/suppliers/create/"
    : "/api/external/inquiries/buyers/create/";
}

function isCountryField(index: number): boolean {
  return index === 2;
}

function isEmailField(index: number): boolean {
  return index === 5;
}

function isRemarkField(index: number, total: number): boolean {
  return index === total - 1;
}

/** 组件内中英文文案 */
const t = {
  selectCountry: { "zh-CN": "请选择国家", "en-US": "Select country" },
  submitting: { "zh-CN": "提交中...", "en-US": "Submitting..." },
  validationPrefix: { "zh-CN": "请填写", "en-US": "Please fill in" },
  success: {
    supplier: {
      "zh-CN": "提交成功。我们会审核您的供应商资料，并通过您填写的联系方式与您联系。",
      "en-US": "Submitted successfully. We will review your supplier profile and contact you using the details provided.",
    },
    buyer: {
      "zh-CN": "提交成功。我们会根据您的采购需求进行匹配，并通过您填写的联系方式与您联系。",
      "en-US": "Submitted successfully. We will match your buying requirements and contact you using the details provided.",
    },
  },
  failureFallback: { "zh-CN": "提交失败，请稍后重试", "en-US": "Submission failed, please try again later" },
  networkError: { "zh-CN": "网络错误，请检查网络后重试", "en-US": "Network error, please check your connection and try again" },
} as const;

export function InquiryForm({ type, fields, ctaLabel, locale, onSuccess }: InquiryFormProps) {
  const fieldKeys = getFieldKeys(type);
  const initialValues: Record<string, string> = {};
  fieldKeys.forEach((key) => {
    initialValues[key] = "";
  });

  const initialValuesKey = useMemo(() => JSON.stringify(initialValues), [type]);

  const [values, setValues] = useState<Record<string, string>>(() => JSON.parse(initialValuesKey));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // 简单校验：检查必填字段是否有值（最后一个备注字段选填）
    for (let i = 0; i < fieldKeys.length; i++) {
      const key = fieldKeys[i];
      if (i !== fieldKeys.length - 1 && !values[key]?.trim()) {
        setResult({ ok: false, message: `${t.validationPrefix[locale]}"${fields[i]}"` });
        return;
      }
    }

    setSubmitting(true);
    setResult(null);

    try {
      const res = await api<ApiResponse>(getApiUrl(type), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (res.code === 200) {
        setResult({ ok: true, message: t.success[type][locale] });
        setValues(JSON.parse(initialValuesKey));
        onSuccess?.();
      } else {
        setResult({ ok: false, message: res.message ?? t.failureFallback[locale] });
      }
    } catch {
      setResult({ ok: false, message: t.networkError[locale] });
    } finally {
      setSubmitting(false);
    }
  }, [values, fieldKeys, fields, type, locale, initialValuesKey, onSuccess]);

  return (
    <>
      {fields.map((field, index) => {
        const key = fieldKeys[index];
        const value = values[key] ?? "";

        return (
          <label
            className={
              isRemarkField(index, fields.length)
                ? "official-field official-field-wide"
                : "official-field"
            }
            key={key}
          >
            <span>{field}</span>
            {isCountryField(index) ? (
              <select
                aria-label={field}
                onChange={(e) => handleChange(key, e.target.value)}
                required
                value={value}
              >
                <option value="" disabled>
                  {t.selectCountry[locale]}
                </option>
                {COUNTRIES[locale].map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            ) : isRemarkField(index, fields.length) ? (
              <textarea
                aria-label={field}
                onChange={(e) => handleChange(key, e.target.value)}
                rows={4}
                value={value}
              />
            ) : (
              <input
                aria-label={field}
                onChange={(e) => handleChange(key, e.target.value)}
                required
                type={isEmailField(index) ? "email" : "text"}
                value={value}
              />
            )}
          </label>
        );
      })}
      <div className="official-form-footer">
        {result ? (
          <p className={result.ok ? "official-form-success" : "official-form-error"}>
            {result.message}
          </p>
        ) : (
          <p />
        )}
        <button
          className="official-button official-button-primary"
          disabled={submitting}
          onClick={handleSubmit}
          type="button"
        >
          {submitting ? (
            <>
              <Loader2 size={15} className="official-spin-icon" />
              <span>{t.submitting[locale]}</span>
            </>
          ) : (
            <>
              <span>{ctaLabel}</span>
              <CheckCircle2 size={15} />
            </>
          )}
        </button>
      </div>
    </>
  );
}
