import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download, Upload, Loader2, AlertCircle, CheckCircle2, X, FileSpreadsheet } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import styles from "./ops-shell.module.css";

/* ---------- 类型 ---------- */

type ImportRow = {
  row: number;
  product_name: string;
  category_path: string;
  description: string;
  sku_code: string;
  specs: Record<string, string>;
  moq: number;
  currency: string;
  stock_quantity: number;
  status: string;
  unit_price: number;
};

type ImportError = {
  row: number;
  sku_code: string;
  errors: string[];
};

type PreviewData = {
  rows: ImportRow[];
  errors: ImportError[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    products: number;
    skus: number;
  };
};

type ImportResult = {
  created_products: number;
  created_skus: number;
  batches: number;
  errors: string[];
};

type Step = "upload" | "preview" | "result";

/* ---------- Props ---------- */

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  apiPrefix: string;
  onImported: () => void;
}

/* ---------- 辅助 ---------- */

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

function specsText(specs: Record<string, string>): string {
  if (!specs || Object.keys(specs).length === 0) return "—";
  return Object.entries(specs).map(([k, v]) => `${k}:${v}`).join(" / ");
}

function unitPriceText(price: number): string {
  if (!price || price <= 0) return "—";
  return price.toFixed(2);
}

/* ---------- 组件 ---------- */

export function ImportDialog({ open, onOpenChange, workspaceId, apiPrefix, onImported }: ImportDialogProps) {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- 重置 ---- */

  const reset = useCallback(() => {
    setStep("upload");
    setLoading(false);
    setError("");
    setFile(null);
    setPreview(null);
    setResult(null);
  }, []);

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) reset();
      onOpenChange(open);
    },
    [onOpenChange, reset],
  );

  /* ---- 下载模板 ---- */

  const handleDownloadTemplate = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${apiPrefix}/products/import/?action=template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "product_import_template.xlsx";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(t("ops.productsImportDownloadFailed"));
    }
  }, [apiPrefix, t]);

  /* ---- 上传预览 ---- */

  const handleUpload = useCallback(async () => {
    if (!file) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("action", "preview");
      form.append("workspace_id", workspaceId);

      const res = await fetch(`${apiPrefix}/products/import/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (data?.code === 200 && data.data) {
        setPreview(data.data);
        setStep("preview");
      } else {
        setError(data?.message ?? t("ops.productsImportParseFailed"));
      }
    } catch {
      setError(t("ops.productsImportParseFailed"));
    } finally {
      setLoading(false);
    }
  }, [file, workspaceId, apiPrefix, t]);

  /* ---- 确认导入 ---- */

  const handleConfirm = useCallback(async () => {
    if (!preview || preview.rows.length === 0) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiPrefix}/products/import/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "confirm",
          workspace_id: workspaceId,
          rows: preview.rows,
        }),
      });
      const data = await res.json();
      if (data?.code === 200 && data.data) {
        setResult(data.data);
        setStep("result");
      } else {
        setError(data?.message ?? t("ops.productsImportFailed"));
      }
    } catch {
      setError(t("ops.productsImportFailed"));
    } finally {
      setLoading(false);
    }
  }, [preview, workspaceId, apiPrefix, t]);

  /* ---- 关闭并刷新 ---- */

  const handleDone = useCallback(() => {
    handleClose(false);
    onImported();
  }, [handleClose, onImported]);

  /* ---- 文件选择 ---- */

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.endsWith(".xlsx")) {
        setError(t("ops.productsImportInvalidFormat"));
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        setError(t("ops.productsImportFileTooLarge"));
        return;
      }
      setFile(f);
      setError("");
    }
  };

  /* ==================== JSX ==================== */

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className={styles.opsDrawerContent} style={{ maxWidth: 640 }}>
        {/* ─── Step 1: 上传 ─── */}
        {step === "upload" && (
          <>
            <SheetHeader>
              <SheetTitle>{t("ops.productsImportTitle")}</SheetTitle>
              <SheetDescription>{t("ops.productsImportDesc")}</SheetDescription>
            </SheetHeader>

            <div style={{ flex: 1, padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 下载模板 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--bg-canvas)", borderRadius: 8 }}>
                <FileSpreadsheet size={20} style={{ color: "var(--text-secondary)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t("ops.productsImportStep1Download")}</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{t("ops.productsImportStep1DownloadHint")}</div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download size={14} />
                  <span style={{ marginLeft: 6 }}>{t("ops.productsImportDownloadTemplate")}</span>
                </Button>
              </div>

              {/* 上传文件 */}
              <div
                style={{
                  border: dragOver ? "2px dashed #5B9BD5" : "2px dashed var(--border-default)",
                  borderRadius: 12,
                  padding: 32,
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "var(--bg-accent-mid)" : file ? "var(--bg-accent-soft)" : "transparent",
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation(); setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) {
                    if (!f.name.endsWith(".xlsx")) { setError(t("ops.productsImportInvalidFormat")); return; }
                    if (f.size > 10 * 1024 * 1024) { setError(t("ops.productsImportFileTooLarge")); return; }
                    setFile(f); setError("");
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                {file ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <FileSpreadsheet size={32} style={{ color: "#2e7d32" }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{file.name}</span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      <X size={12} /> {t("common.remove")}
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <Upload size={32} style={{ color: "var(--text-faint)" }} />
                    <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                      {t("ops.productsImportClickToUpload")}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      {t("ops.productsImportUploadHint")}
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </div>

            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border-default)" }}>
              <Button onClick={handleUpload} disabled={!file || loading} style={{ width: "100%" }}>
                {loading ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                {loading ? t("ops.productsImportParsing") : t("ops.productsImportUploadAndPreview")}
              </Button>
            </div>
          </>
        )}

        {/* ─── Step 2: 预览 ─── */}
        {step === "preview" && preview && (
          <>
            <SheetHeader>
              <SheetTitle>{t("ops.productsImportPreviewTitle")}</SheetTitle>
              <SheetDescription>
                {t("ops.productsImportPreviewSummary", {
                  total: preview.summary.total,
                  valid: preview.summary.valid,
                  invalid: preview.summary.invalid,
                  products: preview.summary.products,
                  skus: preview.summary.skus,
                })}
              </SheetDescription>
            </SheetHeader>

            <div style={{ flex: 1, overflow: "auto", padding: "8px 24px" }}>
              {/* 摘要卡片 */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <SummaryBadge label={t("ops.productsImportTotal")} value={preview.summary.total} color="default" />
                <SummaryBadge label={t("ops.productsImportValid")} value={preview.summary.valid} color="success" />
                {preview.summary.invalid > 0 && (
                  <SummaryBadge label={t("ops.productsImportInvalid")} value={preview.summary.invalid} color="destructive" />
                )}
              </div>

              {/* 有效数据表格 */}
              {preview.rows.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: "#2e7d32" }}>
                    <CheckCircle2 size={14} style={{ display: "inline", marginRight: 4 }} />
                    {t("ops.productsImportValidRows")} ({preview.rows.length})
                  </div>
                  <div className={styles.tableWrapper} style={{ maxHeight: 260, overflow: "auto" }}>
                    <Table className={`${styles.dataTable} ${styles.importPreviewTable}`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead style={{ width: 30 }}>#</TableHead>
                          <TableHead>{t("ops.productsSkuColProduct")}</TableHead>
                          <TableHead>{t("ops.productsSkuColCode")}</TableHead>
                          <TableHead>{t("ops.productsSkuColSpecs")}</TableHead>
                          <TableHead>{t("ops.productsSkuColPrice")}</TableHead>
                          <TableHead>{t("ops.productsSkuColStock")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell style={{ color: "var(--text-faint)" }}>{row.row}</TableCell>
                            <TableCell>{row.product_name}</TableCell>
                            <TableCell><code style={{ fontSize: 11 }}>{row.sku_code}</code></TableCell>
                            <TableCell style={{ fontSize: 11, color: "var(--text-secondary)" }}>{specsText(row.specs)}</TableCell>
                            <TableCell style={{ fontSize: 11 }}>{unitPriceText(row.unit_price)}</TableCell>
                            <TableCell>{row.stock_quantity}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* 错误列表 */}
              {preview.errors.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: "#dc2626" }}>
                    <AlertCircle size={14} style={{ display: "inline", marginRight: 4 }} />
                    {t("ops.productsImportErrorRows")} ({preview.errors.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflow: "auto" }}>
                    {preview.errors.map((err, i) => (
                      <div key={i} style={{ padding: "6px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12 }}>
                        <span style={{ fontWeight: 500 }}>第 {err.row} 行</span>
                        {err.sku_code ? <span style={{ color: "var(--text-secondary)" }}> ({err.sku_code})</span> : null}
                        {": "}
                        {err.errors.join("；")}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 13, marginTop: 12 }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </div>

            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border-default)", display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={() => setStep("upload")} disabled={loading}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading || preview.rows.length === 0}
                style={{ flex: 1 }}
              >
                {loading ? <Loader2 size={14} className={styles.spinIcon} /> : null}
                {t("ops.productsImportConfirm", { count: preview.rows.length })}
              </Button>
            </div>
          </>
        )}

        {/* ─── Step 3: 结果 ─── */}
        {step === "result" && result && (
          <>
            <SheetHeader>
              <SheetTitle>{t("ops.productsImportResultTitle")}</SheetTitle>
              <SheetDescription>{t("ops.productsImportResultDesc")}</SheetDescription>
            </SheetHeader>

            <div style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={36} style={{ color: "#16a34a" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  {t("ops.productsImportSuccess")}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {t("ops.productsImportSuccessDetail", {
                    products: result.created_products,
                    skus: result.created_skus,
                    batches: result.batches,
                  })}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ padding: "6px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
                      <AlertCircle size={12} style={{ display: "inline", marginRight: 4 }} />{e}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border-default)" }}>
              <Button onClick={handleDone} style={{ width: "100%" }}>
                {t("ops.productsImportDone")}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---- 摘要小卡片 ---- */

function SummaryBadge({ label, value, color }: { label: string; value: number; color: "default" | "success" | "destructive" }) {
  const colors = {
    default: { bg: "var(--bg-canvas)", text: "var(--text-primary)" },
    success: { bg: "#dcfce7", text: "#16a34a" },
    destructive: { bg: "#fef2f2", text: "#dc2626" },
  };
  const c = colors[color];
  return (
    <div style={{ flex: 1, padding: "10px 12px", background: c.bg, borderRadius: 8, textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: c.text }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</div>
    </div>
  );
}
