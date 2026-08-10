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
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [siteType, setSiteType] = useState("");
  const [leadRequirement, setLeadRequirement] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [vendureUrl, setVendureUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dailyLeadLimit, setDailyLeadLimit] = useState(0);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const fetchProfile = useCallback(() => {
    const token = getToken(); if (!token) return;
    setLoading(true);
    fetch("/api/supplier/profile/", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        if (d?.code === 200 && d.data) {
          setWorkspaceId(d.data.workspace_id ?? null);
          setName(d.data.workspace_name || "");
          setDesc(d.data.description || "");
          setSiteType(d.data.site_type || "");
          setLeadRequirement(d.data.lead_acquisition_requirement || "");
          setStoreUrl(d.data.store_url || "");
          setApiKey(d.data.api_key || "");
          setSecretKey("");
          setVendureUrl(d.data.vendure_url || "");
          setPrompt(d.data.prompt || "");
          setDailyLeadLimit(d.data.daily_lead_limit || 0);
        }
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  function handleSave() {
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
      lead_acquisition_requirement: normalizedLeadRequirement,
      prompt,
      daily_lead_limit: dailyLeadLimit,
    };
    if (siteType === "shopify") {
      body.store_url = storeUrl; body.api_key = apiKey;
      if (secretKey) body.api_secret_key = secretKey;
    }
    if (siteType === "independent") {
      body.vendure_url = vendureUrl;
    }
    fetch("/api/supplier/profile/", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }).then(r => r.json()).then(d => {
      if (d?.code === 200) {
        const savedRequirement = d.data?.lead_acquisition_requirement || normalizedLeadRequirement;
        const savedWorkspaceId = d.data?.workspace_id ?? workspaceId;
        setLeadRequirement(savedRequirement);
        setOkMsg(t("supplier.settingsSaveSuccess"));
        if (savedWorkspaceId && d.data?.requirement_updated) {
          notifyOnboardingRequirementUpdated(
            savedWorkspaceId,
            d.data?.invalidated_card_id,
          );
        }
      } else {
        setError(d?.message ?? t("supplier.settingsSaveFailed"));
      }
    }).catch(() => setError(t("supplier.settingsNetworkError"))).finally(() => setSaving(false));
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
      <div className={styles.supplierSettingsFeedback}>
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
            <div className={styles.supplierSettingsFieldWide}>
              <Label htmlFor="supplier-vendure-url">{t("ops.vendureUrl")}</Label>
              <Input
                id="supplier-vendure-url"
                value={vendureUrl}
                onChange={(event) => setVendureUrl(event.target.value)}
                placeholder={t("ops.vendureUrlPlaceholder")}
              />
            </div>
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
          <div className={styles.supplierSettingsFieldWide}>
            <Label htmlFor="supplier-prompt">{t("supplier.configPrompt")}</Label>
            <Textarea
              id="supplier-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t("supplier.configPromptPlaceholder")}
              rows={5}
            />
          </div>
        </div>
      </section>

      <div className={styles.supplierSettingsActions}>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 aria-hidden="true" className={styles.settingsSpin} /> : null}
          {t("supplier.configSave")}
        </Button>
      </div>
    </form>
  );
}
