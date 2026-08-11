import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Loader2, Sparkles, Store } from "lucide-react";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyOnboardingRequirementUpdated } from "./onboarding-session-events";
import styles from "./supplier-shell.module.css";

function getToken() { const m = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/); return m?.[1] ?? null; }

export function SupplierSettingsPage() {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [siteType, setSiteType] = useState("");
  const [loadedSiteType, setLoadedSiteType] = useState("");
  const [leadRequirement, setLeadRequirement] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [loadedStoreUrl, setLoadedStoreUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [vendureUrl, setVendureUrl] = useState("");
  const [vendureChannelsToken, setVendureChannelsToken] = useState("");
  const [dailyLeadLimit, setDailyLeadLimit] = useState(0);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const fetchProfile = useCallback(() => {
    const token = getToken(); if (!token) return;
    setLoading(true);
    fetch("/api/supplier/profile/", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(async d => {
        if (d?.code === 200 && d.data) {
          const nextWorkspaceId = String(d.data.workspace_id || "") || null;
          setWorkspaceId(nextWorkspaceId);
          setName(d.data.workspace_name || "");
          setDesc(d.data.description || "");
          setSiteType(d.data.site_type || "");
          setLoadedSiteType(d.data.site_type || "");
          setLeadRequirement(d.data.prompt || d.data.lead_acquisition_requirement || "");
          setStoreUrl(d.data.store_url || "");
          setApiKey(d.data.api_key || "");
          setSecretKey("");
          setVendureUrl(d.data.vendure_url || "");
          setVendureChannelsToken(d.data.vendure_channels_token || "");
          setDailyLeadLimit(d.data.daily_lead_limit || 0);
          if (d.data.site_type === "shopify" && nextWorkspaceId) {
            const configResponse = await fetch(
              `/api/v1/workspaces/${encodeURIComponent(nextWorkspaceId)}/shopify/config`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            const config = await configResponse.json();
            if (!configResponse.ok) {
              throw new Error(config?.detail || t("supplier.settingsSaveFailed"));
            }
            setStoreUrl(config.store_url || "");
            setLoadedStoreUrl(config.store_url || "");
            setApiKey(config.api_key_masked || "");
          }
        }
      }).catch(() => setError(t("supplier.settingsNetworkError"))).finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function handleSave() {
    const normalizedLeadRequirement = leadRequirement.trim();
    setError(""); setOkMsg("");
    if (!normalizedLeadRequirement) {
      setError(t("supplier.settingsLeadRequirementRequired"));
      return;
    }
    if (normalizedLeadRequirement.length > 2000) {
      setError(t("supplier.settingsLeadRequirementTooLong"));
      return;
    }
    setSaving(true);
    const token = getToken();
    const body: Record<string, string | number> = {
      workspace_name: name,
      description: desc,
      site_type: siteType,
      prompt: normalizedLeadRequirement,
      daily_lead_limit: dailyLeadLimit,
    };
    if (siteType === "shopify") {
      body.store_url = storeUrl; body.api_key = apiKey;
      if (secretKey) body.api_secret_key = secretKey;
    }
    if (siteType === "independent") {
      body.vendure_url = vendureUrl;
      body.vendure_channels_token = vendureChannelsToken;
    }
    try {
      const response = await fetch("/api/supplier/profile/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await response.json();
      if (d?.code === 200) {
        const savedRequirement = d.data?.lead_acquisition_requirement || normalizedLeadRequirement;
        const savedWorkspaceId = String(d.data?.workspace_id || workspaceId || "") || null;
        const shopifyConfigChanged = siteType === "shopify" && (
          loadedSiteType !== "shopify"
          || storeUrl.trim() !== loadedStoreUrl
          || Boolean(apiKey && !apiKey.includes("*"))
          || Boolean(secretKey)
        );
        if (shopifyConfigChanged) {
          if (!savedWorkspaceId) throw new Error(t("supplier.settingsSaveFailed"));
          const shopifyBody: Record<string, string> = { store_url: storeUrl.trim() };
          if (apiKey && !apiKey.includes("*")) shopifyBody.api_key = apiKey.trim();
          if (secretKey) shopifyBody.api_secret_key = secretKey;
          const configResponse = await fetch(
            `/api/v1/workspaces/${encodeURIComponent(savedWorkspaceId)}/shopify/config`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(shopifyBody),
            },
          );
          const config = await configResponse.json();
          if (!configResponse.ok) {
            throw new Error(config?.detail || t("supplier.settingsSaveFailed"));
          }
          setStoreUrl(config.store_url || "");
          setLoadedStoreUrl(config.store_url || "");
          setApiKey(config.api_key_masked || apiKey);
          setSecretKey("");
        }
        setLoadedSiteType(siteType);
        setLeadRequirement(savedRequirement);
        setOkMsg(t("supplier.settingsSaveSuccess"));
        if (savedWorkspaceId && d.data?.requirement_updated) {
          const onboardingWorkspaceId = Number(savedWorkspaceId);
          if (Number.isInteger(onboardingWorkspaceId) && onboardingWorkspaceId > 0) {
            notifyOnboardingRequirementUpdated(
              onboardingWorkspaceId,
              d.data?.invalidated_card_id,
            );
          }
        }
      } else {
        setError(d?.message ?? t("supplier.settingsSaveFailed"));
      }
    } catch (saveError) {
      setError(saveError instanceof Error && saveError.message
        ? saveError.message
        : t("supplier.settingsNetworkError"));
    } finally {
      setSaving(false);
    }
  }

  const showShopify = siteType === "shopify";
  const showVendure = siteType === "independent";

  if (loading) return <div className={styles.whiteCard}><p className={styles.loadingText}>{t("common.loading")}</p></div>;

  return (
    <form
      className={styles.supplierSettingsPage}
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <section className={styles.supplierSettingsSection} aria-labelledby="supplier-company-section">
        <div className={styles.supplierSettingsSectionIntro}>
          <Building2 aria-hidden="true" />
          <div>
            <h3 id="supplier-company-section">{t("supplier.settingsCompanySection")}</h3>
            <p>{t("supplier.settingsCompanyHint")}</p>
          </div>
        </div>
        <div className={styles.supplierSettingsFields}>
          <div className={styles.supplierSettingsFieldWide}>
            <Label htmlFor="supplier-name">{t("ops.shopifyConfigSupplierName")}</Label>
            <Input id="supplier-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className={styles.supplierSettingsFieldWide}>
            <Label htmlFor="supplier-description">{t("ops.shopifyConfigDescription")}</Label>
            <Textarea
              id="supplier-description"
              value={desc}
              onChange={(event) => setDesc(event.target.value)}
              rows={5}
            />
          </div>
        </div>
      </section>

      <section className={styles.supplierSettingsSection} aria-labelledby="supplier-site-section">
        <div className={styles.supplierSettingsSectionIntro}>
          <Store aria-hidden="true" />
          <div>
            <h3 id="supplier-site-section">{t("supplier.settingsSiteSection")}</h3>
            <p>{t("supplier.settingsSiteHint")}</p>
          </div>
        </div>
        <div className={styles.supplierSettingsFields}>
          <div className={styles.supplierSettingsFieldWide}>
            <Label htmlFor="supplier-site-type">{t("ops.shopifyConfigSiteType")}</Label>
            <BackendCombobox
              id="supplier-site-type"
              aria-label={t("ops.shopifyConfigSiteType")}
              value={siteType}
              onChange={setSiteType}
              options={[
                { value: "", label: t("ops.shopifyConfigSiteTypeNone") },
                { value: "shopify", label: t("ops.shopifyConfigSiteTypeShopify") },
                { value: "independent", label: t("ops.shopifyConfigSiteTypeIndependent") },
              ]}
              emptyLabel={t("ops.comboboxNoResults")}
              placeholder={t("ops.shopifyConfigSiteTypeNone")}
              variant="form"
              className={styles.supplierSettingsSelect}
            />
          </div>

          {showShopify ? (
            <>
              <div className={styles.supplierSettingsFieldWide}>
                <Label htmlFor="supplier-store-url">{t("ops.shopifyConfigStoreUrl")}</Label>
                <Input
                  id="supplier-store-url"
                  value={storeUrl}
                  onChange={(event) => setStoreUrl(event.target.value)}
                  placeholder="https://xxx.myshopify.com"
                />
              </div>
              <div className={styles.supplierSettingsField}>
                <Label htmlFor="supplier-api-key">{t("ops.shopifyConfigApiKey")}</Label>
                <Input
                  id="supplier-api-key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Shopify App client_id"
                />
              </div>
              <div className={styles.supplierSettingsField}>
                <Label htmlFor="supplier-secret-key">{t("ops.shopifyConfigSecretKey")}</Label>
                <Input
                  id="supplier-secret-key"
                  type="password"
                  value={secretKey}
                  onChange={(event) => setSecretKey(event.target.value)}
                />
                <small className={styles.supplierSettingsHelp}>{t("supplier.settingsSecretHint")}</small>
              </div>
            </>
          ) : null}

          {showVendure ? (
            <>
              <div className={styles.supplierSettingsFieldWide}>
                <Label htmlFor="supplier-vendure-url">{t("ops.vendureUrl")}</Label>
                <Input
                  id="supplier-vendure-url"
                  value={vendureUrl}
                  onChange={(event) => setVendureUrl(event.target.value)}
                  placeholder={t("ops.vendureUrlPlaceholder")}
                />
              </div>
              <div className={styles.supplierSettingsFieldWide}>
                <Label htmlFor="supplier-vendure-token">{t("ops.vendureChannelsToken")}</Label>
                <Input
                  id="supplier-vendure-token"
                  value={vendureChannelsToken}
                  onChange={(event) => setVendureChannelsToken(event.target.value)}
                  placeholder={t("ops.vendureChannelsTokenPlaceholder")}
                />
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className={styles.supplierSettingsSection} aria-labelledby="supplier-lead-section">
        <div className={styles.supplierSettingsSectionIntro}>
          <Sparkles aria-hidden="true" />
          <div>
            <h3 id="supplier-lead-section">{t("supplier.settingsLeadSection")}</h3>
            <p>{t("supplier.settingsLeadHint")}</p>
          </div>
        </div>
        <div className={styles.supplierSettingsFields}>
          <div className={styles.supplierSettingsFieldWide}>
            <Label htmlFor="supplier-lead-requirement">{t("supplier.settingsLeadRequirement")}</Label>
            <Textarea
              id="supplier-lead-requirement"
              value={leadRequirement}
              onChange={(event) => setLeadRequirement(event.target.value)}
              rows={5}
              maxLength={2000}
              placeholder={t("supplier.settingsLeadRequirementPlaceholder")}
            />
            <small className={styles.supplierSettingsHelp}>
              {t("supplier.settingsLeadRequirementHelp", { count: leadRequirement.length })}
            </small>
          </div>
          <div className={styles.supplierSettingsFieldWide}>
            <Label htmlFor="supplier-lead-limit">{t("supplier.configLeadLimit")}</Label>
            <Input
              id="supplier-lead-limit"
              type="number"
              value={String(dailyLeadLimit)}
              onChange={(event) => setDailyLeadLimit(Math.max(0, parseInt(event.target.value) || 0))}
              placeholder={t("supplier.configLeadLimitPlaceholder")}
              min={0}
            />
          </div>
        </div>
      </section>

      <div className={styles.supplierSettingsActions}>
        <div className={styles.supplierSettingsFeedback} aria-live="polite">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {okMsg ? (
            <Alert className={styles.supplierSettingsSuccess} role="status">
              <AlertDescription>{okMsg}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 aria-hidden="true" className={styles.settingsSpin} /> : null}
          {t("supplier.configSave")}
        </Button>
      </div>
    </form>
  );
}
