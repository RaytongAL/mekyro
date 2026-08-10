import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, ImagePlus, Loader2, X, ChevronUp, ChevronRight as ChevronRightIcon, Trash2, RotateCcw, Pencil, Plus, SlidersHorizontal, FileDown, Settings2 } from "lucide-react";
import i18n from "@/i18n";
import { BackendDataSurface } from "@/components/backend-ui/backend-data-surface";
import { BackendCombobox } from "@/components/backend-ui/backend-combobox";
import { BackendSearchButton } from "@/components/backend-ui/backend-search-button";
import { BackendPaginationNumbers } from "@/components/backend-ui/backend-pagination";
import { BackendRowActions } from "@/components/backend-ui/backend-row-actions";
import { BackendStatusBadge } from "@/components/backend-ui/backend-status-badge";
import { BackendToolbarButton } from "@/components/backend-ui/backend-toolbar-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { BackendPageSizeSelect } from "../ops-shell/backend-select";
import { TruncatedCell } from "../ops-shell/truncated-cell";
import { SortButton } from "../ops-shell/sort-button";
import { CategoryTree, CategoryCascader, buildCategoryPath, type CategoryOption } from "../ops-shell/category-tree";
// supplier: no logs drawer
import { /* no workspace */ } from "../ops-shell/workspace-context";
import { ImportDialog } from "../ops-shell/import-dialog";

import styles from "../ops-shell/ops-shell.module.css";

/* ---------- 常量 ---------- */
const PAGE_SIZE_OPTIONS = [20, 50, 100];

type PriceTier = { id: number; min_quantity: number; price: string };
type SpecTemplateItem = { name: string; options: string[] };

/** 第一层：商品行（product 列表接口返回） */
type ProductItem = {
  id: number;
  name: string;
  ws_category_id: number | null;
  spec_template: SpecTemplateItem[];
  status: string;
  sku_count: number | null;
  total_stock: number | null;
  created_at: string;
  updated_at: string;
};

/** 第二层：SKU（product 详情接口的 skus 数组） */
type SkuItem = {
  id: number;
  sku_code: string;
  specs: Record<string, string>;
  moq: number;
  currency: string;
  stock_quantity: number;
  status: string;
  price_tiers: PriceTier[];
  created_at: string;
  updated_at: string;
  images?: Array<{id: number; url: string; type: string}>;
};

/** 回收站商品类型 */
type TrashProduct = {
  id: number;
  name: string;
  ws_category_id: number | null;
  deleted_at: string | null;
};

/** 回收站 SKU 类型 */
type TrashSku = {
  id: number;
  sku_code: string;
  specs: Record<string, string>;
  product_name: string;
  deleted_at: string | null;
};

/** 编辑弹窗用的组合行 */
type SkuRow = {
  id: number;
  sku_code: string;
  specs: Record<string, string>;
  moq: number;
  currency: string;
  stock_quantity: number;
  status: string;
  price_tiers: PriceTier[];
  created_at: string;
  product_id: number;
  product_name: string;
  product_status: string;
  category_id: number | null;
  spec_template: SpecTemplateItem[];
};

function getToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ai_trade_token=([^;]*)/);
  return match?.[1] ?? null;
}

/** 生成 SKU 编码：商品名首字母（最多4位） + - + 10位随机码 */
function generateSkuCode(productName: string): string {
  const prefix = productName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4) || "SKU";
  const rand = Array.from({ length: 10 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");
  return `${prefix}-${rand}`;
}

/** 规格 JSON → 可读文本 */
function specsText(specs: Record<string, string> | null): string {
  if (!specs || Object.keys(specs).length === 0) return "—";
  return Object.entries(specs).map(([k, v]) => `${k}:${v}`).join(" / ");
}

export function SupplierProductsPage() {
  const { t } = useTranslation();
  const locale = i18n.language;
  // supplier: auto-scoped workspace

  /* ---- 列表（product 级）---- */
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [ordering, setOrdering] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [manageDrawerOpen, setManageDrawerOpen] = useState(false);
  const [logsSku, setLogsSku] = useState<{ id: number; skuCode: string; productName: string } | null>(null);

  /* ---- 行内展开（SKU 懒加载）---- */
  const [expandedProductIds, setExpandedProductIds] = useState<Set<number>>(new Set());
  const [productSkus, setProductSkus] = useState<Record<number, SkuItem[]>>({});
  const [skuLoading, setSkuLoading] = useState<Set<number>>(new Set());

  /* ---- 编辑（SKU 为主）---- */
  const [editTarget, setEditTarget] = useState<SkuRow | null>(null);
  const [editSpecs, setEditSpecs] = useState<Array<{key: string; value: string}>>([]);
  const [editSkuStatus, setEditSkuStatus] = useState("");
  const [editSkuCode, setEditSkuCode] = useState("");
  const [editMoq, setEditMoq] = useState(1);
  const [editPrice, setEditPrice] = useState(0);
  const [editStock, setEditStock] = useState(0);
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editProductName, setEditProductName] = useState("");
  const [editCategoryId, setEditCategoryId] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSkuImage, setEditSkuImage] = useState<Array<{id: number; url: string; type: string}>>([]);

  /* ---- 删除（product 级）---- */
  const [deleteTarget, setDeleteTarget] = useState<{ product_id: number; product_name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- 编辑商品 ---- */
  const [productEditTarget, setProductEditTarget] = useState<ProductItem | null>(null);
  const [productEditName, setProductEditName] = useState("");
  const [productEditCategoryId, setProductEditCategoryId] = useState<number | null>(null);
  const [productEditing, setProductEditing] = useState(false);
  const [productEditError, setProductEditError] = useState("");
  const [productEditImages, setProductEditImages] = useState<Array<{id?: number; url: string; type: string}>>([]);
  const [productEditSpec, setProductEditSpec] = useState<Array<{name: string; options: string[]}>>([]);
  const [productImageDeleting, setProductImageDeleting] = useState(false);

  /* ---- 创建商品 ---- */
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState<number | null>(null);
  const [createStatus, setCreateStatus] = useState("active");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createImages, setCreateImages] = useState<Array<{file: File; url: string; type: "product" | "product_detail"}>>([]);
  const [createSpecTemplate, setCreateSpecTemplate] = useState<Array<{name: string; options: string[]}>>([]);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  /* ---- 规格模板编辑 ---- */
  const [specTarget, setSpecTarget] = useState<ProductItem | null>(null);
  const [specItems, setSpecItems] = useState<Array<{name: string; options: string[]}>>([]);
  const [specEditing, setSpecEditing] = useState(false);
  const [specError, setSpecError] = useState("");

  /* ---- 出入库操作 ---- */
  const [invTarget, setInvTarget] = useState<{ skuId: number; skuCode: string; productName: string; currentStock: number } | null>(null);
  const [invType, setInvType] = useState<"inbound" | "outbound">("inbound");
  const [invQuantity, setInvQuantity] = useState(1);
  const [invReason, setInvReason] = useState("-");
  const [invRefId, setInvRefId] = useState("");
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState("");

  /* ---- 添加 SKU ---- */
  const [addSkuProduct, setAddSkuProduct] = useState<ProductItem | null>(null);
  const [addSkuCode, setAddSkuCode] = useState("");
  const [addSkuSpecValues, setAddSkuSpecValues] = useState<Record<string, string>>({});
  const [addSkuMoq, setAddSkuMoq] = useState(1);
  const [addSkuPrice, setAddSkuPrice] = useState("");
  const [addSkuCurrency, setAddSkuCurrency] = useState("USD");
  const [addSkuStock, setAddSkuStock] = useState(0);
  const [addSkuStatus, setAddSkuStatus] = useState("active");
  const [addSkuAdding, setAddSkuAdding] = useState(false);
  const [addSkuError, setAddSkuError] = useState("");
  const [addSkuImage, setAddSkuImage] = useState<{file: File; url: string} | null>(null);

  /* ---- SKU 删除 ---- */
  const [skuDeleteTarget, setSkuDeleteTarget] = useState<{ skuId: number; skuCode: string; productId: number } | null>(null);
  const [skuDeleting, setSkuDeleting] = useState(false);

  /* ---- 回收站 ---- */
  const [showTrash, setShowTrash] = useState(false);
  const [trashTab, setTrashTab] = useState<"products" | "skus">("products");
  const [trashProducts, setTrashProducts] = useState<TrashProduct[]>([]);
  const [trashSkus, setTrashSkus] = useState<TrashSku[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashTotal, setTrashTotal] = useState(0);
  const [trashPage, setTrashPage] = useState(1);
  const [trashPageSize, setTrashPageSize] = useState(20);
  const [trashActing, setTrashActing] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState<{ id: number; name: string; action: "restore" | "delete" } | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const categoryIdParam = selectedCategoryId != null ? String(selectedCategoryId) : "";

  /* ==================== 数据获取 ==================== */

  const fetchProducts = useCallback(() => {
    const token = getToken();
    if (!token || false) { setLoading(false); return; }
    setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    params.set("workspace_id", "1");
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (stockFilter) params.set("stock", stockFilter);
    if (categoryIdParam) params.set("category_id", categoryIdParam);
    if (ordering) params.set("ordering", ordering);
    fetch(`/api/supplier/products/?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) { setProducts(data.data.results ?? []); setTotal(data.data.total ?? 0); }
        else { setError(data?.message ?? t("ops.productsFetchFailed")); }
      }).catch(() => setError(t("ops.productsFetchFailed"))).finally(() => setLoading(false));
  }, [page, pageSize, search, statusFilter, stockFilter, "1", categoryIdParam, ordering, t]);

  const fetchCategories = useCallback(() => {
    if (false) return;
    const token = getToken(); if (!token) return;
    const params = new URLSearchParams({ workspace_id: "1" });
    fetch(`/api/supplier/categories/?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && Array.isArray(data.data)) {
          const nextCategories = data.data as CategoryOption[];
          setCategories(nextCategories);
        }
      }).catch(() => {});
  }, ["1"]);

  useEffect(() => { fetchProducts(); fetchCategories(); }, [fetchProducts, fetchCategories]);

  useEffect(() => {
    setExpandedProductIds(new Set());
    setProductSkus({});
  }, ["1", search, statusFilter, stockFilter, categoryIdParam, ordering, page, pageSize]);

  function fetchProductSkus(productId: number) {
    if (productSkus[productId] || skuLoading.has(productId)) return;
    const token = getToken(); if (!token) return;
    setSkuLoading((prev) => { const n = new Set(prev); n.add(productId); return n; });
    fetch(`/api/supplier/products/${productId}/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setProductSkus((prev) => ({ ...prev, [productId]: data.data.skus ?? [] }));
        }
      }).catch(() => {})
      .finally(() => {
        setSkuLoading((prev) => { const n = new Set(prev); n.delete(productId); return n; });
      });
  }

  function toggleExpand(product: ProductItem) {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(product.id)) next.delete(product.id);
      else { next.add(product.id); fetchProductSkus(product.id); }
      return next;
    });
  }

  function handleSearch() { setSearch(searchInput.trim()); setPage(1); }
  function clearSearch() { setSearchInput(""); setSearch(""); setPage(1); }

  /* ==================== 图片上传 ==================== */

  async function uploadImage(file: File): Promise<string> {
    const token = getToken(); if (!token) throw new Error("未登录");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/supplier/upload/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (data?.code !== 200 || !data.data?.url) throw new Error(data?.message || "上传失败");
    return data.data.url;
  }

  /* ==================== 创建商品 ==================== */

  async function handleCreate() {
    const token = getToken(); if (!token) return;
    setCreating(true); setCreateError("");
    try {
      const res = await fetch("/api/supplier/products/create/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          ws_category_id: createCategoryId || null,
          status: createStatus,
          workspace_id: Number("1"),
          spec_template: createSpecTemplate.filter(s => s.name.trim()),
          images: createImages.filter((i) => i.type === "product").map((i) => i.url),
          detail_image: createImages.find((i) => i.type === "product_detail")?.url || "",
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setCreateOpen(false);
        setCreateName("");
        setCreateCategoryId(null);
        setCreateStatus("active");
        fetchProducts();
        fetchCategories();
      } else {
        setCreateError(data?.message ?? t("ops.productsFetchFailed"));
      }
    } catch {
      setCreateError(t("ops.productsFetchFailed"));
    } finally {
      setCreating(false);
    }
  }

  /* ==================== 编辑 ==================== */

  function openProductEdit(product: ProductItem) {
    setProductEditTarget(product);
    setProductEditName(product.name);
    setProductEditCategoryId(product.ws_category_id);
    setProductEditError("");
    setProductEditImages([]);
    setProductEditSpec(
      (product.spec_template || []).map((spec) => ({
        name: spec.name,
        options: [...(spec.options || [])],
      })),
    );

    const token = getToken();
    if (!token) return;
    fetch(`/api/supplier/products/${product.id}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data?.images) {
          setProductEditImages(data.data.images);
        }
      })
      .catch(() => {});
  }

  function openEdit(product: ProductItem, sku: SkuItem) {
    setEditTarget({
      id: sku.id,
      sku_code: sku.sku_code,
      specs: sku.specs,
      moq: sku.moq,
      currency: sku.currency,
      stock_quantity: sku.stock_quantity,
      status: sku.status,
      price_tiers: sku.price_tiers,
      created_at: sku.created_at,
      product_id: product.id,
      product_name: product.name,
      product_status: product.status,
      category_id: product.ws_category_id,
      spec_template: product.spec_template,
    });
    setEditSkuStatus(sku.status);
    setEditSkuCode(sku.sku_code);
    setEditMoq(sku.moq);
    setEditPrice(Number(sku.price_tiers?.[0]?.price) || 0);
    setEditStock(sku.stock_quantity);
    setEditCurrency(sku.currency);
    setEditProductName(product.name);
    setEditCategoryId(product.ws_category_id ?? 0);
    // 根据 spec_template 补全所有规格字段（已有值保留，缺失的填空）
    const templateSpecs = new Map<string, string>();
    for (const tpl of product.spec_template || []) {
      templateSpecs.set(tpl.name, String(sku.specs?.[tpl.name] ?? ""));
    }
    // 也保留 SKU 中不在模板中的额外规格
    for (const [k, v] of Object.entries(sku.specs || {})) {
      if (!templateSpecs.has(k)) templateSpecs.set(k, String(v));
    }
    setEditSpecs(
      Array.from(templateSpecs.entries()).map(([key, value]) => ({ key, value }))
    );
    setEditError("");
    setEditSkuImage((sku as any).images || []);
  }

  async function handleEdit() {
    if (!editTarget) return; const token = getToken(); if (!token) return;
    const specsObj: Record<string, string> = {};
    for (const s of editSpecs) {
      if (s.key.trim()) specsObj[s.key.trim()] = s.value;
    }
    setEditing(true); setEditError("");
    try {
      const res = await fetch(`/api/supplier/skus/${editTarget.id}/update/`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editSkuStatus, sku_code: editSkuCode, moq: editMoq,
          currency: editCurrency, specs: specsObj,
          price: editPrice,
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setEditTarget(null);
        fetchProductSkusRefresh(editTarget.product_id);
        fetchProducts();
      }
      else { setEditError(data?.message ?? t("ops.productsUpdateFailed")); }
    } catch { setEditError(t("ops.productsUpdateFailed")); }
    finally { setEditing(false); }
  }

  function fetchProductSkusRefresh(productId: number) {
    const token = getToken(); if (!token) return;
    fetch(`/api/supplier/products/${productId}/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          setProductSkus((prev) => ({ ...prev, [productId]: data.data.skus ?? [] }));
        }
      }).catch(() => {});
  }

  /* ==================== 删除 ==================== */

  async function confirmDelete() {
    if (!deleteTarget) return; const token = getToken(); if (!token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/supplier/products/${deleteTarget.product_id}/delete/`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data?.code === 200) {
        setProducts((p) => p.filter((x) => x.id !== deleteTarget.product_id));
        setTotal((t) => t - 1);
        setProductSkus((prev) => { const n = { ...prev }; delete n[deleteTarget.product_id]; return n; });
        setExpandedProductIds((prev) => { const n = new Set(prev); n.delete(deleteTarget.product_id); return n; });
      }
    } catch { /* ignore */ }
    finally { setDeleting(false); setDeleteTarget(null); }
  }

  /* ==================== 编辑商品 ==================== */

  async function handleProductEdit() {
    if (!productEditTarget) return; const token = getToken(); if (!token) return;
    setProductEditing(true); setProductEditError("");
    try {
      const body: Record<string, unknown> = {};
      if (productEditName.trim()) body.name = productEditName.trim();
      if (productEditCategoryId !== null && productEditCategoryId !== productEditTarget.ws_category_id) {
        body.ws_category_id = productEditCategoryId || null;
      }
      body.spec_template = productEditSpec.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), options: s.options.filter(o => o.trim()) }));
      const res = await fetch(`/api/supplier/products/${productEditTarget.id}/update/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setProducts((prev) => prev.map((p) => p.id === productEditTarget.id ? { ...p, name: productEditName.trim() || p.name, ws_category_id: productEditCategoryId !== null ? productEditCategoryId : p.ws_category_id, spec_template: productEditSpec.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), options: s.options.filter(o => o.trim()) })) } : p));
        setProductEditTarget(null);
      } else { setProductEditError(data?.message ?? t("ops.productsFetchFailed")); }
    } catch { setProductEditError(t("ops.productsFetchFailed")); }
    finally { setProductEditing(false); }
  }

  /* ==================== 规格模板编辑 ==================== */

  function openSpecEditor(product: ProductItem) {
    setSpecTarget(product);
    setSpecItems((product.spec_template || []).map((s) => ({ name: s.name, options: [...s.options] })));
    setSpecError("");
  }

  async function handleSpecSave() {
    if (!specTarget) return; const token = getToken(); if (!token) return;
    const cleaned = specItems.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), options: s.options.filter((o) => o.trim()) }));
    setSpecEditing(true); setSpecError("");
    try {
      const res = await fetch(`/api/supplier/products/${specTarget.id}/update/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ spec_template: cleaned }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setProducts((prev) => prev.map((p) => p.id === specTarget.id ? { ...p, spec_template: cleaned } : p));
        setSpecTarget(null);
      } else { setSpecError(data?.message ?? t("ops.productsFetchFailed")); }
    } catch { setSpecError(t("ops.productsFetchFailed")); }
    finally { setSpecEditing(false); }
  }

  function addSpecField() {
    setSpecItems((prev) => [...prev, { name: "", options: [] }]);
  }

  function removeSpecField(index: number) {
    setSpecItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSpecName(index: number, name: string) {
    setSpecItems((prev) => prev.map((s, i) => i === index ? { ...s, name } : s));
  }

  function addSpecOption(specIndex: number, option: string) {
    if (!option.trim()) return;
    setSpecItems((prev) => prev.map((s, i) => i === specIndex ? { ...s, options: [...s.options, option.trim()] } : s));
  }

  function removeSpecOption(specIndex: number, optIndex: number) {
    setSpecItems((prev) => prev.map((s, i) => i === specIndex ? { ...s, options: s.options.filter((_, oi) => oi !== optIndex) } : s));
  }

  /* ==================== 添加 SKU ==================== */

  async function handleAddSku() {
    if (!addSkuProduct) return; const token = getToken(); if (!token) return;
    setAddSkuAdding(true); setAddSkuError("");
    try {
      const res = await fetch("/api/supplier/skus/create/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: addSkuProduct.id,
          sku_code: addSkuCode.trim(),
          specs: addSkuSpecValues,
          moq: addSkuMoq,
          currency: addSkuCurrency,
          stock_quantity: addSkuStock,
          status: addSkuStatus,
          price_tiers: addSkuPrice ? [{ min_quantity: 1, price: addSkuPrice }] : [],
          image: addSkuImage?.url || "",
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setAddSkuProduct(null);
        fetchProductSkusRefresh(addSkuProduct.id);
        fetchProducts();
      } else {
        setAddSkuError(data?.message ?? t("ops.productsFetchFailed"));
      }
    } catch {
      setAddSkuError(t("ops.productsFetchFailed"));
    } finally {
      setAddSkuAdding(false);
    }
  }

  /* ==================== 出入库操作 ==================== */

  async function handleInventoryOp() {
    if (!invTarget) return; const token = getToken(); if (!token) return;
    const quantity = invType === "outbound" ? -Math.abs(invQuantity) : Math.abs(invQuantity);
    setInvSubmitting(true); setInvError("");
    try {
      const res = await fetch(`/api/supplier/skus/${invTarget.skuId}/inventory-logs/create/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: invType,
          quantity,
          reason: invReason,
          reference_id: invRefId,
          created_by: "admin",
        }),
      });
      const data = await res.json();
      if (data?.code === 200) {
        setInvTarget(null);
        refreshAllSkus();
      } else {
        setInvError(data?.message ?? t("ops.productsFetchFailed"));
      }
    } catch {
      setInvError(t("ops.productsFetchFailed"));
    } finally {
      setInvSubmitting(false);
    }
  }

  function refreshAllSkus() {
    for (const pid of expandedProductIds) {
      fetchProductSkusRefresh(pid);
    }
    fetchProducts();
  }

  /* ==================== SKU 删除 ==================== */

  async function confirmSkuDelete() {
    if (!skuDeleteTarget) return; const token = getToken(); if (!token) return;
    setSkuDeleting(true);
    try {
      const res = await fetch(`/api/supplier/skus/${skuDeleteTarget.skuId}/delete/`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data?.code === 200) {
        fetchProductSkusRefresh(skuDeleteTarget.productId);
        fetchProducts();
      }
    } catch { /* ignore */ }
    finally { setSkuDeleting(false); setSkuDeleteTarget(null); }
  }

  /* ==================== 回收站 ==================== */

  function fetchTrash() {
    const token = getToken(); if (!token || false) { setTrashLoading(false); return; }
    setTrashLoading(true);
    const params = new URLSearchParams({ page: String(trashPage), page_size: String(trashPageSize) });
    params.set("workspace_id", "1");
    const url = trashTab === "products" ? `/api/supplier/products/trash/?${params.toString()}` : `/api/supplier/skus/trash/?${params.toString()}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.code === 200 && data.data) {
          if (trashTab === "products") { setTrashProducts(data.data.results ?? []); }
          else { setTrashSkus(data.data.results ?? []); }
          setTrashTotal(data.data.total ?? 0);
        }
      })
      .catch(() => {}).finally(() => setTrashLoading(false));
  }

  useEffect(() => { if (showTrash) fetchTrash(); }, [showTrash, trashPage, trashPageSize, "1", trashTab]);

  function doTrashRestore(id: number) {
    const token = getToken(); if (!token) return;
    setTrashActing(true);
    const url = trashTab === "products" ? `/api/supplier/products/${id}/restore/` : `/api/supplier/skus/${id}/restore/`;
    fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.code === 200) { fetchTrash(); fetchProducts(); } })
      .catch(() => {}).finally(() => { setTrashActing(false); setTrashConfirm(null); });
  }

  function doTrashPermanentDelete(id: number) {
    const token = getToken(); if (!token) return;
    setTrashActing(true);
    const url = trashTab === "products" ? `/api/supplier/products/${id}/delete/?permanent=true` : `/api/supplier/skus/${id}/delete/?permanent=true`;
    fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.code === 200) { fetchTrash(); } })
      .catch(() => {}).finally(() => { setTrashActing(false); setTrashConfirm(null); });
  }

  /* ==================== 分类树回调 ==================== */

  async function handleCreateSub(parentId: number, name: string) {
    const token = getToken(); if (!token || false) return;
    const res = await fetch("/api/supplier/categories/create/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: parentId || null, workspace_id: Number("1"), sort_order: 0 }),
    });
    const data = await res.json();
    if (data?.code !== 200) throw new Error(data?.message);
    fetchCategories();
  }

  async function handleDeleteCategory(categoryId: number) {
    const token = getToken(); if (!token) return;
    const res = await fetch(`/api/supplier/categories/${categoryId}/delete/`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data?.code !== 200) throw new Error(data?.message);
    setSelectedCategoryId((prev) => prev === categoryId ? null : prev);
    fetchCategories();
    fetchProducts();
  }

  async function handleMoveCategory(categoryId: number, newParentId: number | null) {
    const token = getToken(); if (!token) return;
    const res = await fetch(`/api/supplier/categories/${categoryId}/update/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: newParentId }),
    });
    const data = await res.json();
    if (data?.code !== 200) throw new Error(data?.message);
    fetchCategories();
  }

  function goPage(p: number) { setPage(Math.max(1, Math.min(p, totalPages))); }
  function formatDatetime(iso: string): string { return iso ? new Date(iso).toLocaleString(locale) : "—"; }

  /* ==================== JSX ==================== */

  const PRODUCT_COL_COUNT = 6;

  return (
    <div className={styles.productsLayout}>
      <div className={`${styles.whiteCard} ${styles.dataPage}`}>
      <div className={`${styles.pageActions} ${styles.productPageActions}`}>
          {!showTrash ? (
          <>
          <BackendToolbarButton
            type="button"
            className={styles.productCategoryManageButton}
            onClick={() => setManageDrawerOpen(true)}
          >
            <Settings2 size={14} aria-hidden="true" data-icon="inline-start" />
            {t("ops.categoryManage")}
          </BackendToolbarButton>
          <BackendToolbarButton
            type="button"
            onClick={() => setImportOpen(true)}
          >
            <FileDown size={14} data-icon="inline-start" />
            {t("ops.productsImportTitle")}
          </BackendToolbarButton>
          <BackendToolbarButton
            type="button"
            onClick={() => { setCreateOpen(true); setCreateName(""); setCreateCategoryId(null); setCreateStatus("active"); setCreateImages([]); setCreateSpecTemplate([]); setCreateError(""); }}
          >
            <Plus size={14} data-icon="inline-start" />
            {t("ops.productsAddProduct")}
          </BackendToolbarButton>
          </>
          ) : null}
          <BackendToolbarButton
            type="button"
            className={showTrash ? styles.productActionButtonActive : undefined}
            onClick={() => { setShowTrash((v) => !v); setTrashPage(1); setTrashTab("products"); }}
          >
            <Trash2 size={14} data-icon="inline-start" />
            {showTrash ? t("ops.productsTitle") : t("ops.trashTitle")}
          </BackendToolbarButton>
      </div>

      {showTrash ? (
        /* ==================== 回收站视图 ==================== */
        <>
          <Tabs value={trashTab} onValueChange={(v) => { setTrashTab(v as "products" | "skus"); setTrashPage(1); }} className={styles.trashTabs}>
            <TabsList>
              <TabsTrigger value="products">{t("ops.trashTabProducts")}</TabsTrigger>
              <TabsTrigger value="skus">{t("ops.trashTabSkus")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className={styles.searchBar} style={{ flexWrap: "wrap" }}>
            <BackendPageSizeSelect
              label={t("ops.apiKeysPerPage")}
              value={trashPageSize}
              options={PAGE_SIZE_OPTIONS}
              onChange={(value) => { setTrashPageSize(value); setTrashPage(1); }}
            />
          </div>
          {trashLoading ? (<p className={styles.loadingText}>{t("common.loading")}</p>)
          : (trashTab === "products" ? trashProducts.length === 0 : trashSkus.length === 0) ? (<p className={styles.emptyText}>{t("ops.trashEmpty")}</p>)
          : (
            <>
              <div className={styles.tableWrapper}>
                <Table className={`${styles.dataTable} ${styles.actionColumnTable} ${styles.wideActionColumn} ${styles.productTrashTable} ${trashTab === "products" ? styles.productTrashProductsTable : styles.productTrashSkusTable}`}>
                  <TableHeader>
                    <TableRow>
                      {trashTab === "products" ? (
                        <>
                          <TableHead>{t("ops.productsSkuColProduct")}</TableHead>
                          <TableHead>{t("ops.productsColCategory")}</TableHead>
                          <TableHead>{t("ops.trashDeletedAt")}</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>{t("ops.productsSkuColCode")}</TableHead>
                          <TableHead>{t("ops.trashSkuColProduct")}</TableHead>
                          <TableHead>{t("ops.trashSkuColSpecs")}</TableHead>
                          <TableHead>{t("ops.trashDeletedAt")}</TableHead>
                        </>
                      )}
                      <TableHead>{t("ops.apiKeysColActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashTab === "products" ? (
                      trashProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell><TruncatedCell>{product.name}</TruncatedCell></TableCell>
                          <TableCell><TruncatedCell><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{buildCategoryPath(categories, product.ws_category_id)}</span></TruncatedCell></TableCell>
                          <TableCell style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{product.deleted_at ? new Date(product.deleted_at).toLocaleString(locale) : "—"}</TableCell>
                          <TableCell>
                            <div className={styles.actionButtons} style={{ gap: 8 }}>
                              <Button type="button" variant="outline" size="sm" className={styles.tableActionButton} onClick={() => setTrashConfirm({ id: product.id, name: product.name, action: "restore" })} disabled={trashActing}>
                                <RotateCcw size={14} /><span style={{ marginLeft: 4 }}>{t("ops.trashRestore")}</span>
                              </Button>
                              <Button type="button" variant="destructive" size="sm" className={styles.tableActionButton} onClick={() => setTrashConfirm({ id: product.id, name: product.name, action: "delete" })} disabled={trashActing}>
                                {t("ops.trashDeletePermanent")}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      trashSkus.map((sku) => (
                        <TableRow key={sku.id}>
                          <TableCell><TruncatedCell><code style={{ fontSize: 11 }}>{sku.sku_code}</code></TruncatedCell></TableCell>
                          <TableCell><TruncatedCell>{sku.product_name}</TruncatedCell></TableCell>
                          <TableCell><TruncatedCell><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{specsText(sku.specs)}</span></TruncatedCell></TableCell>
                          <TableCell style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{sku.deleted_at ? new Date(sku.deleted_at).toLocaleString(locale) : "—"}</TableCell>
                          <TableCell>
                            <div className={styles.actionButtons} style={{ gap: 8 }}>
                              <Button type="button" variant="outline" size="sm" className={styles.tableActionButton} onClick={() => setTrashConfirm({ id: sku.id, name: sku.sku_code, action: "restore" })} disabled={trashActing}>
                                <RotateCcw size={14} /><span style={{ marginLeft: 4 }}>{t("ops.trashRestore")}</span>
                              </Button>
                              <Button type="button" variant="destructive" size="sm" className={styles.tableActionButton} onClick={() => setTrashConfirm({ id: sku.id, name: sku.sku_code, action: "delete" })} disabled={trashActing}>
                                {t("ops.trashDeletePermanent")}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>{t("ops.apiKeysPaginationInfo", { total: trashTotal, page: trashPage, totalPages: Math.max(1, Math.ceil(trashTotal / trashPageSize)) })}</span>
                <div className={styles.paginationControls}>
                  <BackendPageSizeSelect
                    label={t("ops.apiKeysPerPage")}
                    value={trashPageSize}
                    options={PAGE_SIZE_OPTIONS}
                    onChange={(value) => { setTrashPageSize(value); setTrashPage(1); }}
                  />
                  <button className={styles.pageBtn} disabled={trashPage <= 1} onClick={() => setTrashPage((p) => Math.max(1, p - 1))}><ChevronLeft size={14} /></button>
                  <BackendPaginationNumbers
                    page={trashPage}
                    totalPages={Math.max(1, Math.ceil(trashTotal / trashPageSize))}
                    onPageChange={(p) => setTrashPage(p)}
                  />
                  <button className={styles.pageBtn} disabled={trashPage >= Math.max(1, Math.ceil(trashTotal / trashPageSize))} onClick={() => setTrashPage((p) => p + 1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* ==================== 商品列表视图 ==================== */
        <>
        <BackendDataSurface
          toolbar={(
            <div className={`${styles.searchBar} ${styles.productWorkbenchToolbar}`}>
              <div className={styles.productSearchGroup} role="search" aria-label={t("ops.search")}>
                <div className={styles.searchInputWrap}>
                  <Search size={14} className={styles.searchIcon} />
                  <input type="text" className={styles.searchInput} value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                    placeholder={t("ops.productsSearchPlaceholder")} />
                  {searchInput ? <button type="button" className={styles.searchClearBtn} onClick={clearSearch}><X size={14} /></button> : null}
                </div>
                <BackendSearchButton label={t("ops.search")} onClick={handleSearch} />
              </div>
              <div className={styles.productFilterGroup} role="group" aria-label={t("ops.productsFilterLabel")}>
                <span className={styles.productFilterLabel}>
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  {t("ops.productsFilterLabel")}
                </span>
                <div className={styles.productCategoryFilter}>
                  <CategoryCascader
                    categories={categories}
                    value={selectedCategoryId}
                    onChange={(id) => { setSelectedCategoryId(id || null); setPage(1); }}
                    placeholder={t("ops.productsCategoryFilterAll")}
                  />
                </div>
                <BackendCombobox
                  className={styles.productFilterCombobox}
                  aria-label={t("ops.productsAllStatus")}
                  value={statusFilter}
                  onChange={(value) => { setStatusFilter(value); setPage(1); }}
                  options={[
                    { value: "", label: t("ops.productsStatusFilterAll") },
                    { value: "active", label: t("ops.productsStatusActive") },
                    { value: "inactive", label: t("ops.productsStatusInactive") },
                  ]}
                  emptyLabel={t("ops.comboboxNoResults")}
                  placeholder={t("ops.productsStatusFilterAll")}
                  variant="filter"
                />
                <BackendCombobox
                  className={styles.productFilterCombobox}
                  aria-label={t("ops.productsAllStock")}
                  value={stockFilter}
                  onChange={(value) => { setStockFilter(value); setPage(1); }}
                  options={[
                    { value: "", label: t("ops.productsStockFilterAll") },
                    { value: "in_stock", label: t("ops.productsInStock") },
                    { value: "out_of_stock", label: t("ops.productsOutOfStock") },
                  ]}
                  emptyLabel={t("ops.comboboxNoResults")}
                  placeholder={t("ops.productsStockFilterAll")}
                  variant="filter"
                />
              </div>
            </div>
          )}
          footer={(!loading && !error && products.length > 0) ? (
            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>{t("ops.apiKeysPaginationInfo", { total, page, totalPages })}</span>
              <div className={styles.paginationControls}>
                <BackendPageSizeSelect
                  label={t("ops.apiKeysPerPage")}
                  value={pageSize}
                  options={PAGE_SIZE_OPTIONS}
                  onChange={(value) => { setPageSize(value); setPage(1); }}
                />
                <button className={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}><ChevronLeft size={14} /></button>
                <BackendPaginationNumbers page={page} totalPages={totalPages} onPageChange={goPage} />
                <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          ) : undefined}
        >

      {loading ? (<p className={styles.loadingText}>{t("common.loading")}</p>)
      : error ? (<p className={styles.loadingText}>{error}</p>)
      : products.length === 0 ? (<p className={styles.emptyText}>{t("ops.productsEmpty")}</p>)
      : (
          <div className={styles.tableWrapper}>
            <Table className={`${styles.dataTable} ${styles.productDataTable} ${styles.actionColumnTable} ${styles.compactActionColumn}`}>
              <TableHeader>
                <TableRow>
                  <TableHead><SortButton label={t("ops.productsSkuColProduct")} field="name" ordering={ordering} onOrderingChange={(v) => { setOrdering(v); setPage(1); }} /></TableHead>
                  <TableHead>{t("ops.productsColCategory")}</TableHead>
                  <TableHead className={styles.productNumericColumn}>{t("ops.productsSkuCount")}</TableHead>
                  <TableHead className={styles.productNumericColumn}>{t("ops.productsTotalStock")}</TableHead>
                  <TableHead>{t("ops.productsSkuColStatus")}</TableHead>
                  <TableHead>{t("ops.apiKeysColActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.flatMap((product) => {
                  const expanded = expandedProductIds.has(product.id);
                  const skus = productSkus[product.id];
                  const loadingSkus = skuLoading.has(product.id);
                  const specNames = (product.spec_template || []).map((tpl) => tpl.name);
                  const rows = [
                    <TableRow
                      key={`p-${product.id}`}
                      className={styles.productExpandableRow}
                      data-expanded={expanded ? "true" : undefined}
                      onClick={(event) => {
                        const target = event.target as HTMLElement;
                        if (!target.closest("button, a, input, select, textarea")) toggleExpand(product);
                      }}
                    >
                      <TableCell>
                        <div className={styles.productNameCell}>
                          <button type="button" className={styles.productExpandButton} onClick={() => toggleExpand(product)} aria-label={expanded ? t("common.collapse") : t("common.expand")}>
                            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronRightIcon size={14} aria-hidden="true" />}
                          </button>
                          <TruncatedCell>{product.name}</TruncatedCell>
                        </div>
                      </TableCell>
                      <TableCell><TruncatedCell><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{buildCategoryPath(categories, product.ws_category_id)}</span></TruncatedCell></TableCell>
                      <TableCell className={styles.productNumericColumn}>{product.sku_count ?? 0}</TableCell>
                      <TableCell className={`${styles.productNumericColumn} ${styles.productStockValue}`} data-empty={(product.total_stock ?? 0) === 0 ? "true" : undefined}>{product.total_stock ?? 0}</TableCell>
                      <TableCell>
                        <BackendStatusBadge tone={product.status === "active" ? "success" : "neutral"}>
                          {product.status === "active" ? t("ops.productsStatusActive") : t("ops.productsStatusInactive")}
                        </BackendStatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className={`${styles.actionButtons} ${styles.contactLogActionButtons}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={styles.contactLogIconAction}
                            aria-label={t("ops.apiKeysEdit")}
                            title={t("ops.apiKeysEdit")}
                            onClick={() => openProductEdit(product)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={styles.contactLogIconAction}
                            aria-label={t("ops.apiKeysDelete")}
                            title={t("ops.apiKeysDelete")}
                            onClick={() => setDeleteTarget({ product_id: product.id, product_name: product.name })}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>,
                  ];
                  if (expanded) {
                    rows.push(
                      <TableRow key={`p-${product.id}-skus`} className={styles.productSkuExpansionRow}>
                        <TableCell colSpan={PRODUCT_COL_COUNT} className={styles.productSkuExpansionCell}>
                          <div className={styles.productSkuPanelHeader}>
                            <span>{t("ops.productsSkuTitle")}</span>
                            <Button type="button" variant="outline" size="sm"
                              onClick={() => { setAddSkuProduct(product); setAddSkuCode(generateSkuCode(product.name)); setAddSkuMoq(1); setAddSkuPrice(""); setAddSkuCurrency("USD"); setAddSkuStock(0); setAddSkuStatus("active"); setAddSkuSpecValues({}); setAddSkuImage(null); setAddSkuError(""); }}>
                              <Plus size={12} /> {t("ops.productsAddProduct")} SKU
                            </Button>
                          </div>
                          {loadingSkus && (!skus || skus.length === 0) ? (
                            <p className={styles.loadingText}><Loader2 size={14} className={styles.spinIcon} /> {t("common.loading")}</p>
                          ) : !skus || skus.length === 0 ? (
                            <p className={styles.emptyText}>{t("ops.productsNoSkus")}</p>
                          ) : (
                            <Table className={`${styles.dataTable} ${styles.productSkuTable}`}>
                              <TableHeader>
                                <TableRow>
                                  {specNames.map((name) => (
                                    <TableHead key={name} style={{ minWidth: 80 }}>{name}</TableHead>
                                  ))}
                                  <TableHead className={styles.productSkuCodeColumn}>{t("ops.productsSkuColCode")}</TableHead>
                                  <TableHead className={styles.productSkuMoqColumn}>{t("ops.productsSkuColMoq")}</TableHead>
                                  <TableHead className={styles.productSkuStockColumn}>{t("ops.productsSkuColStock")}</TableHead>
                                  <TableHead className={styles.productSkuPriceColumn}>{t("ops.productsSkuColPrice")}</TableHead>
                                  <TableHead className={styles.productSkuCurrencyColumn}>{t("ops.productsSkuColCurrency")}</TableHead>
                                  <TableHead className={styles.productSkuStatusColumn}>{t("ops.productsSkuColStatus")}</TableHead>
                                  <TableHead className={styles.productSkuActionColumn}>{t("ops.apiKeysColActions")}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {skus.map((sku) => (
                                  <TableRow key={sku.id}>
                                    {specNames.map((name) => (
                                      <TableCell key={name}><TruncatedCell><span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{sku.specs?.[name] || "—"}</span></TruncatedCell></TableCell>
                                    ))}
                                    <TableCell className={styles.productSkuCodeColumn}><TruncatedCell><code style={{ fontSize: 11 }}>{sku.sku_code}</code></TruncatedCell></TableCell>
                                    <TableCell className={styles.productSkuMoqColumn}>{sku.moq}</TableCell>
                                    <TableCell className={`${styles.productSkuStockColumn} ${styles.productNumericColumn} ${styles.productStockValue}`} data-empty={sku.stock_quantity === 0 ? "true" : undefined}>{sku.stock_quantity}</TableCell>
                                    <TableCell className={styles.productSkuPriceColumn} style={{ fontSize: 12 }}>
                                      {sku.price_tiers.length > 0
                                        ? sku.price_tiers.map((pt) => `≥${pt.min_quantity}: ${pt.price}`).join(", ")
                                        : "—"}
                                    </TableCell>
                                    <TableCell className={styles.productSkuCurrencyColumn} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{sku.currency}</TableCell>
                                    <TableCell className={styles.productSkuStatusColumn}>
                                      <BackendStatusBadge tone={sku.status === "active" ? "success" : "neutral"}>
                                        {sku.status === "active" ? t("ops.productsStatusActive") : t("ops.productsStatusInactive")}
                                      </BackendStatusBadge>
                                    </TableCell>
                                    <TableCell className={styles.productSkuActionColumn}>
                                      <BackendRowActions
                                        label={t("common.moreActions")}
                                        items={[
                                          { label: t("ops.productsSkuEditBtn"), onSelect: () => openEdit(product, sku) },
                                          { label: t("ops.productsInventoryOp"), onSelect: () => { setInvTarget({ skuId: sku.id, skuCode: sku.sku_code, productName: product.name, currentStock: sku.stock_quantity }); setInvType("inbound"); setInvQuantity(1); setInvReason("-"); setInvRefId("-"); setInvError(""); } },
                                          { label: t("ops.productInventoryLogs"), onSelect: () => setLogsSku({ id: sku.id, skuCode: sku.sku_code, productName: product.name }) },
                                          { label: t("ops.apiKeysDelete"), onSelect: () => setSkuDeleteTarget({ skuId: sku.id, skuCode: sku.sku_code, productId: product.id }), tone: "destructive" },
                                        ]}
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return rows;
                })}
              </TableBody>
            </Table>
          </div>
      )}
        </BackendDataSurface>

      {/* ─── 编辑 SKU 弹窗 ─── */}
      <Sheet open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.productsEditTitle")}</SheetTitle>
            <SheetDescription>{editTarget?.product_name} — {editTarget?.sku_code}</SheetDescription>
          </SheetHeader>
          {editError ? <p className={styles.formError}>{editError}</p> : null}
          <div className={styles.editDialogBody}>
            {/* 商品名称 — 只读 */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsFormProductName")}</label>
              <span className={styles.formValue}>{editProductName}</span>
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{t("ops.productsProductNameReadonly")}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsFormCategory")}</label>
              <span className={styles.formValue}>{buildCategoryPath(categories, editCategoryId || null)}</span>
            </div>
            {/* SKU 编码 — 只读 */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsSkuColCode")}</label>
              <div className={styles.formValue} style={{ background: "var(--bg-canvas)", borderRadius: 6, padding: "8px 10px", border: "1px solid var(--border-subtle)" }}>
                <code style={{ fontSize: 13 }}>{editSkuCode}</code>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{t("ops.productsSkuCodeReadonly")}</span>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.productsSkuColMoq")}</label>
                <Input type="number" className={styles.formInput} value={editMoq} onChange={(e) => setEditMoq(Number(e.target.value))} min={1} />
              </div>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.productsSkuColPrice")}</label>
                <Input type="number" step="0.01" className={styles.formInput} value={editPrice} onChange={(e) => setEditPrice(Math.max(0, Number(e.target.value) || 0))} min={0} />
              </div>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.productsSkuColStock")}</label>
                <div className={styles.formValue} style={{ background: "var(--bg-canvas)", borderRadius: 6, padding: "8px 10px", border: "1px solid var(--border-subtle)", fontWeight: 500, color: editStock > 0 ? "#2e7d32" : "#c62828" }}>
                  {editStock}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{t("ops.productsStockReadonly")}</span>
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.productsSkuColCurrency")}</label>
                <BackendCombobox
                  aria-label={t("ops.productsSkuColCurrency")}
                  value={editCurrency}
                  onChange={setEditCurrency}
                  options={["USD", "CNY", "EUR", "GBP"].map((currency) => ({
                    value: currency,
                    label: currency,
                  }))}
                  emptyLabel={t("ops.comboboxNoResults")}
                  placeholder={editCurrency}
                  variant="form"
                />
              </div>
              <div className={styles.formGroup} style={{ flex: 1 }}>
                <label className={styles.formLabel}>{t("ops.productsSkuColStatus")}</label>
                <BackendCombobox
                  aria-label={t("ops.productsSkuColStatus")}
                  value={editSkuStatus || "active"}
                  onChange={setEditSkuStatus}
                  options={[
                    { value: "active", label: t("ops.productsStatusActive") },
                    { value: "inactive", label: t("ops.productsStatusInactive") },
                  ]}
                  emptyLabel={t("ops.comboboxNoResults")}
                  placeholder={t("ops.productsStatusActive")}
                  variant="form"
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsSkuColSpecs")}</label>
              {editSpecs.length === 0 ? (
                <p style={{ color: "var(--text-faint)", fontSize: 13, margin: 0 }}>—</p>
              ) : (
                <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
                  <Table className={`${styles.dataTable} ${styles.productSpecEditorTable}`} style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TableHeader>
                      <TableRow style={{ background: "var(--bg-canvas)" }}>
                        <TableHead style={{ padding: "6px 10px", textAlign: "left", fontWeight: 500, color: "var(--text-secondary)", width: "35%" }}>{t("ops.productsSpecName")}</TableHead>
                        <TableHead style={{ padding: "6px 10px", textAlign: "left", fontWeight: 500, color: "var(--text-secondary)" }}>{t("ops.productsSpecValue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editSpecs.map((s, i) => {
                        const tpl = editTarget?.spec_template?.find(t => t.name === s.key);
                        const options = tpl?.options || [];
                        return (
                        <TableRow key={i} style={{ borderTop: "1px solid var(--border-default)" }}>
                          <TableCell style={{ padding: "6px 10px", color: "var(--text-secondary)" }}>{s.key}</TableCell>
                          <TableCell style={{ padding: 4 }}>
                            {options.length > 0 ? (
                              <BackendCombobox
                                aria-label={s.key}
                                value={s.value || ""}
                                onChange={v => v != null && setEditSpecs(prev => { const n = [...prev]; n[i] = { ...n[i], value: v }; return n; })}
                                options={options.map((option) => ({ value: option, label: option }))}
                                emptyLabel={t("ops.comboboxNoResults")}
                                placeholder="—"
                                variant="compact"
                              />
                            ) : (
                              <Input className={styles.formInput} style={{ border: "none", background: "transparent", width: "100%", padding: "4px 6px" }} value={s.value} onChange={e => { const n = [...editSpecs]; n[i] = { ...n[i], value: e.target.value }; setEditSpecs(n); }} />
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            {/* SKU 图片 */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>SKU {t("ops.productsImagesTitle")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {editSkuImage.map((img, i) => (
                  <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
                    <span onClick={() => setPreviewImage(img.url)} style={{ display: "block", width: "100%", height: "100%", cursor: "pointer" }}>
                      <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </span>
                    <button type="button" onClick={async () => {
                      if (!editTarget) return;
                      const token = getToken(); if (!token) return;
                      await fetch(`/api/supplier/products/${editTarget.product_id}/images/${img.id}/`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
                      setEditSkuImage([]);
                    }} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: 4, width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
                  </div>
                ))}
                {editSkuImage.length < 1 ? (
                  <ImageFileButton uploading={uploading} label={`SKU ${t("ops.productsImagesTitle")}`} onSelect={async (f) => {
                      if (!editTarget) return;
                      setUploading(true);
                      try {
                        const url = await uploadImage(f);
                        const token = getToken(); if (!token) return;
                        const res = await fetch(`/api/supplier/products/${editTarget.product_id}/images/`, {
                          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "sku", url, sku_id: editTarget.id }),
                        });
                        const d = await res.json();
                        if (d?.code === 200) setEditSkuImage([{ id: d.data.id, url, type: "sku" }]);
                      } catch { alert(t("ops.productsUploadFailed")); }
                      finally { setUploading(false); }
                    }} />
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>{t("common.cancel")}</Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.productsSkuEditBtn")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── 创建商品弹窗 ─── */}
      <Sheet open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.productsCreateTitle")}</SheetTitle>
          </SheetHeader>
          <div className={styles.drawerBody}>
          {createError ? <p className={styles.formError}>{createError}</p> : null}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsFormProductName")}</label>
            <Input className={styles.formInput} value={createName} onChange={(e) => setCreateName(e.target.value)} maxLength={200} autoFocus />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsFormCategory")}</label>
            <CategoryCascader
              categories={categories}
              value={createCategoryId}
              onChange={(v) => setCreateCategoryId(v || null)}
              placeholder={t("ops.productsFormCategoryPlaceholder")}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsFormStatus")}</label>
            <BackendCombobox
              aria-label={t("ops.productsFormStatus")}
              value={createStatus}
              onChange={setCreateStatus}
              options={[
                { value: "active", label: t("ops.productsStatusActive") },
                { value: "inactive", label: t("ops.productsStatusInactive") },
              ]}
              emptyLabel={t("ops.comboboxNoResults")}
              placeholder={t("ops.productsStatusActive")}
              variant="form"
            />
          </div>
          {/* 规格模板 */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsEditSpecTemplate")}</label>
            {createSpecTemplate.map((spec, si) => (
              <div key={si} className={styles.specTemplateRow}>
                <div className={styles.specTemplateHeader}>
                  <Input className={styles.formInput} style={{ flex: 1 }} value={spec.name} onChange={e => { const n = [...createSpecTemplate]; n[si] = { ...n[si], name: e.target.value }; setCreateSpecTemplate(n); }} placeholder={t("ops.productsSpecName") + "（如 颜色）"} />
                  <Button variant="ghost" size="sm" className={styles.tableActionDanger} onClick={() => setCreateSpecTemplate(p => p.filter((_, i) => i !== si))}><Trash2 size={14} /></Button>
                </div>
                <div className={styles.specTemplateOptions}>
                  {spec.options.map((opt, oi) => (
                    <span key={oi} className={styles.specOptionBadge}>
                      {opt}
                      <button type="button" className={styles.specOptionRemove} onClick={() => { const n = [...createSpecTemplate]; n[si] = { ...n[si], options: n[si].options.filter((_, i) => i !== oi) }; setCreateSpecTemplate(n); }} aria-label={t("common.remove")}><X size={10} /></button>
                    </span>
                  ))}
                  <input className={styles.specOptionAddInput} placeholder={t("ops.productsAddSpecOption")} onKeyDown={e => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { const n = [...createSpecTemplate]; n[si] = { ...n[si], options: [...n[si].options, v] }; setCreateSpecTemplate(n); (e.target as HTMLInputElement).value = ""; } } }} />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setCreateSpecTemplate(p => [...p, { name: "", options: [] }])}><Plus size={12} /> {t("ops.productsAddSpecTemplate")}</Button>
          </div>
          {/* 商品头图（最多5张） */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsImagesTitle")} ({createImages.filter((i) => i.type === "product").length}/5)</label>
            <ImageUploader
              images={createImages.filter((i) => i.type === "product")}
              max={5}
              uploading={uploading}
              onUpload={async (file) => {
                setUploading(true);
                try { const url = await uploadImage(file); setCreateImages((p) => [...p, { file, url, type: "product" }]); } catch (e) { alert(t("ops.productsUploadFailed")); }
                finally { setUploading(false); }
              }}
              onRemove={(url) => setCreateImages((p) => p.filter((i) => i.url !== url))}
              onPreview={setPreviewImage}
            />
          </div>
          {/* 商品详情图（1张） */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsDetailImageTitle")}</label>
            <ImageUploader
              images={createImages.filter((i) => i.type === "product_detail")}
              max={1}
              uploading={uploading}
              onUpload={async (file) => {
                setUploading(true);
                try { const url = await uploadImage(file); setCreateImages((p) => [...p.filter((i) => i.type !== "product_detail"), { file, url, type: "product_detail" }]); } catch (e) { alert(t("ops.productsUploadFailed")); }
                finally { setUploading(false); }
              }}
              onRemove={(url) => setCreateImages((p) => p.filter((i) => i.url !== url))}
              onPreview={setPreviewImage}
            />
          </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
              {creating ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.categoriesConfirmCreate")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── 添加 SKU 弹窗 ─── */}
      <Sheet open={!!addSkuProduct} onOpenChange={(open) => { if (!open) setAddSkuProduct(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.productsAddProduct")} SKU</SheetTitle>
            <SheetDescription>{addSkuProduct?.name}</SheetDescription>
          </SheetHeader>
          {addSkuError ? <p className={styles.formError}>{addSkuError}</p> : null}
          {/* 规格字段（根据 spec_template 动态生成） */}
          {(addSkuProduct?.spec_template || []).length > 0 && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsSkuColSpecs")}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(addSkuProduct?.spec_template || []).map((spec) => (
                  <div key={spec.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 50, textAlign: "right" }}>{spec.name}</span>
                    {spec.options && spec.options.length > 0 ? (
                      <BackendCombobox
                        aria-label={spec.name}
                        value={addSkuSpecValues[spec.name] || ""}
                        onChange={(v) => v != null && setAddSkuSpecValues((prev) => ({ ...prev, [spec.name]: v }))}
                        options={spec.options.map((option) => ({ value: option, label: option }))}
                        emptyLabel={t("ops.comboboxNoResults")}
                        placeholder={`— ${t("ops.select")} —`}
                        variant="compact"
                      />
                    ) : (
                      <Input
                        className={styles.formInput}
                        style={{ flex: 1, height: 32, fontSize: 12 }}
                        value={addSkuSpecValues[spec.name] || ""}
                        onChange={(e) => setAddSkuSpecValues((prev) => ({ ...prev, [spec.name]: e.target.value }))}
                        placeholder={spec.name}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsSkuColCode")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <Input className={styles.formInput} style={{ flex: 1 }} value={addSkuCode} onChange={(e) => setAddSkuCode(e.target.value)} maxLength={100} autoFocus />
              <Button type="button" variant="outline" size="sm" onClick={() => setAddSkuCode(generateSkuCode(addSkuProduct?.name ?? "SKU"))}>
                <RotateCcw size={12} />
              </Button>
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>{t("ops.productsSkuColPrice")}</label>
              <Input type="number" className={styles.formInput} value={addSkuPrice} onChange={(e) => setAddSkuPrice(e.target.value)} min="0" step="0.01" placeholder="0.00" />
            </div>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>{t("ops.productsSkuColCurrency")}</label>
              <BackendCombobox
                aria-label={t("ops.productsSkuColCurrency")}
                value={addSkuCurrency}
                onChange={setAddSkuCurrency}
                options={["USD", "CNY", "EUR", "GBP"].map((currency) => ({
                  value: currency,
                  label: currency,
                }))}
                emptyLabel={t("ops.comboboxNoResults")}
                placeholder={addSkuCurrency}
                variant="form"
              />
            </div>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>{t("ops.productsSkuColStatus")}</label>
              <BackendCombobox
                aria-label={t("ops.productsSkuColStatus")}
                value={addSkuStatus}
                onChange={setAddSkuStatus}
                options={[
                  { value: "active", label: t("ops.productsStatusActive") },
                  { value: "inactive", label: t("ops.productsStatusInactive") },
                ]}
                emptyLabel={t("ops.comboboxNoResults")}
                placeholder={t("ops.productsStatusActive")}
                variant="form"
              />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>{t("ops.productsSkuColMoq")}</label>
              <Input type="number" className={styles.formInput} value={addSkuMoq} onChange={(e) => setAddSkuMoq(Number(e.target.value))} min={1} />
            </div>
            <div className={styles.formGroup} style={{ flex: 1 }}>
              <label className={styles.formLabel}>{t("ops.productsSkuColStock")}</label>
              <Input type="number" className={styles.formInput} value={addSkuStock} onChange={(e) => setAddSkuStock(Number(e.target.value))} min={0} />
            </div>
          </div>
          {/* SKU 图片 */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>SKU {t("ops.productsImagesTitle")}</label>
            <ImageUploader
              images={addSkuImage ? [addSkuImage] : []}
              max={1}
              uploading={uploading}
              onUpload={async (file) => {
                setUploading(true);
                try { const url = await uploadImage(file); setAddSkuImage({ file, url }); } catch (e) { alert(t("ops.productsUploadFailed")); }
                finally { setUploading(false); }
              }}
              onRemove={() => setAddSkuImage(null)}
              onPreview={setPreviewImage}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSkuProduct(null)} disabled={addSkuAdding}>{t("common.cancel")}</Button>
            <Button onClick={handleAddSku} disabled={addSkuAdding || !addSkuCode.trim()}>
              {addSkuAdding ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.categoriesConfirmCreate")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── 规格模板编辑弹窗 ─── */}
      <Sheet open={!!specTarget} onOpenChange={(open) => { if (!open) setSpecTarget(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent} style={{ maxWidth: 560 }}>
          <SheetHeader>
            <SheetTitle>{t("ops.productsEditSpecTemplateTitle", { name: specTarget?.name ?? "" })}</SheetTitle>
            <SheetDescription>{t("ops.productsSpecTemplateWarn")}</SheetDescription>
          </SheetHeader>
          {specError ? <p className={styles.formError}>{specError}</p> : null}
          <div className={styles.editDialogBody}>
            {specItems.map((spec, si) => (
              <div key={si} className={styles.specTemplateRow}>
                <div className={styles.specTemplateHeader}>
                  <Input
                    className={styles.formInput}
                    style={{ flex: 1 }}
                    value={spec.name}
                    onChange={(e) => updateSpecName(si, e.target.value)}
                    placeholder={t("ops.productsSpecName") + "（如 颜色）"}
                  />
                  <Button variant="ghost" size="sm" className={styles.tableActionDanger} onClick={() => removeSpecField(si)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
                <div className={styles.specTemplateOptions}>
                  {spec.options.map((opt, oi) => (
                    <span key={oi} className={styles.specOptionBadge}>
                      {opt}
                      <button type="button" className={styles.specOptionRemove} onClick={() => removeSpecOption(si, oi)} aria-label={t("common.remove")}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      className={styles.specOptionAddInput}
                      placeholder={t("ops.productsAddSpecOption")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          addSpecOption(si, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addSpecField} style={{ marginTop: 8 }}>
              <Plus size={14} />{t("ops.productsAddSpecTemplate")}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpecTarget(null)} disabled={specEditing}>{t("common.cancel")}</Button>
            <Button onClick={handleSpecSave} disabled={specEditing}>
              {specEditing ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.apiKeysConfirmEdit")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── 出入库操作弹窗 ─── */}
      <Sheet open={!!invTarget} onOpenChange={(open) => { if (!open) setInvTarget(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.productsInventoryOpTitle")}</SheetTitle>
            <SheetDescription>{invTarget?.productName} — {invTarget?.skuCode}</SheetDescription>
          </SheetHeader>
          {invError ? <p className={styles.formError}>{invError}</p> : null}
          <div className={styles.inventoryStockDisplay}>
            <span className={styles.inventoryStockLabel}>{t("ops.productsInventoryCurrentStock")}</span>
            <span className={styles.inventoryStockValue}>{invTarget?.currentStock ?? 0}</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsInventoryOpType")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="button"
                variant={invType === "inbound" ? "default" : "outline"}
                size="sm"
                onClick={() => setInvType("inbound")}
              >
                {t("ops.productsInventoryInbound")}
              </Button>
              <Button
                type="button"
                variant={invType === "outbound" ? "default" : "outline"}
                size="sm"
                onClick={() => setInvType("outbound")}
              >
                {t("ops.productsInventoryOutbound")}
              </Button>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsInventoryOpQuantity")}</label>
            <Input
              type="number"
              className={styles.formInput}
              value={invQuantity}
              onChange={(e) => setInvQuantity(Math.max(1, Number(e.target.value)))}
              min={1}
            />
            {invType === "outbound" && invQuantity > (invTarget?.currentStock ?? 0) ? (
              <p style={{ color: "#c62828", fontSize: 12, margin: "4px 0 0" }}>{t("ops.productsInventoryExceedStock", { stock: invTarget?.currentStock ?? 0 })}</p>
            ) : null}
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsInventoryOpReason")}</label>
            <Input className={styles.formInput} value={invReason} onChange={(e) => setInvReason(e.target.value)} maxLength={200} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t("ops.productsInventoryOpRef")}</label>
            <Input className={styles.formInput} value={invRefId} onChange={(e) => setInvRefId(e.target.value)} maxLength={100} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvTarget(null)} disabled={invSubmitting}>{t("common.cancel")}</Button>
            <Button
              onClick={handleInventoryOp}
              disabled={invSubmitting || (invType === "outbound" && invQuantity > (invTarget?.currentStock ?? 0))}
            >
              {invSubmitting ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.productsInventoryOpConfirm")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── SKU 删除确认 ─── */}
      <Dialog open={!!skuDeleteTarget} onOpenChange={(open) => { if (!open) setSkuDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.productsSkuDelete")}</DialogTitle>
            <DialogDescription>{t("ops.productsSkuDeleteConfirm", { code: skuDeleteTarget?.skuCode ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkuDeleteTarget(null)} disabled={skuDeleting}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={confirmSkuDelete} disabled={skuDeleting}>
              {skuDeleting ? <Loader2 size={14} className={styles.spinIcon} /> : null}{t("ops.apiKeysConfirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </>
      )}

      {/* ─── 商品编辑弹窗 ─── */}
      <Sheet open={!!productEditTarget} onOpenChange={(open) => { if (!open) setProductEditTarget(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.productsEditProductTitle")}</SheetTitle>
            <SheetDescription>{productEditTarget?.name}</SheetDescription>
          </SheetHeader>
          {productEditError ? <p className={styles.formError}>{productEditError}</p> : null}
          <div className={styles.editDialogBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsFormProductName")}</label>
              <Input className={styles.formInput} value={productEditName} onChange={(e) => setProductEditName(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsFormCategory")}</label>
              <CategoryCascader
                categories={categories}
                value={productEditCategoryId}
                onChange={setProductEditCategoryId}
                placeholder={t("ops.productsFormCategoryPlaceholder")}
              />
            </div>
            {/* 规格模板 */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsEditSpecTemplate")}</label>
              {productEditSpec.map((spec, si) => (
                <div key={si} className={styles.specTemplateRow}>
                  <div className={styles.specTemplateHeader}>
                    <Input className={styles.formInput} style={{ flex: 1 }} value={spec.name} onChange={e => { const n = [...productEditSpec]; n[si] = { ...n[si], name: e.target.value }; setProductEditSpec(n); }} placeholder={t("ops.productsSpecName") + "（如 颜色）"} />
                    <Button variant="ghost" size="sm" className={styles.tableActionDanger} onClick={() => setProductEditSpec(p => p.filter((_, i) => i !== si))}><Trash2 size={14} /></Button>
                  </div>
                  <div className={styles.specTemplateOptions}>
                    {spec.options.map((opt, oi) => (
                      <span key={oi} className={styles.specOptionBadge}>
                        {opt}
                        <button type="button" className={styles.specOptionRemove} onClick={() => { const n = [...productEditSpec]; n[si] = { ...n[si], options: n[si].options.filter((_, i) => i !== oi) }; setProductEditSpec(n); }} aria-label={t("common.remove")}><X size={10} /></button>
                      </span>
                    ))}
                    <input className={styles.specOptionAddInput} placeholder={t("ops.productsAddSpecOption")} onKeyDown={e => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { const n = [...productEditSpec]; n[si] = { ...n[si], options: [...n[si].options, v] }; setProductEditSpec(n); (e.target as HTMLInputElement).value = ""; } } }} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setProductEditSpec(p => [...p, { name: "", options: [] }])}><Plus size={12} /> {t("ops.productsAddSpecTemplate")}</Button>
            </div>
            {/* 商品头图（type=product） */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsImagesTitle")} ({productEditImages.filter((i) => i.type === "product").length}/5)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {productEditImages.filter((i) => i.type === "product").map((img, i) => (
                  <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
                    <span onClick={() => setPreviewImage(img.url)} style={{ display: "block", width: "100%", height: "100%", cursor: "pointer" }}>
                      <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </span>
                    <button type="button" onClick={async () => {
                      if (!productEditTarget || productImageDeleting) return;
                      setProductImageDeleting(true);
                      if (img.id) {
                        const token = getToken(); if (!token) return;
                        await fetch(`/api/supplier/products/${productEditTarget.id}/images/${img.id}/`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
                      }
                      setProductEditImages((p) => p.filter((x) => x.url !== img.url));
                      setProductImageDeleting(false);
                    }} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: 4, width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
                  </div>
                ))}
                {productEditImages.filter((i) => i.type === "product").length < 5 ? (
                  <ImageFileButton uploading={uploading} label={t("ops.productsImagesTitle")} onSelect={async (f) => {
                      if (!productEditTarget) return;
                      setUploading(true);
                      try {
                        const url = await uploadImage(f);
                        const token = getToken(); if (!token) return;
                        const res = await fetch(`/api/supplier/products/${productEditTarget.id}/images/`, {
                          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "product", url }),
                        });
                        const d = await res.json();
                        if (d?.code === 200) setProductEditImages((p) => [...p, { id: d.data.id, url, type: "product" }]);
                      } catch { alert(t("ops.productsUploadFailed")); }
                      finally { setUploading(false); }
                    }} />
                ) : null}
              </div>
            </div>
            {/* 商品详情图（type=product_detail） */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.productsDetailImageTitle")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {productEditImages.filter((i) => i.type === "product_detail").map((img, i) => (
                  <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
                    <span onClick={() => setPreviewImage(img.url)} style={{ display: "block", width: "100%", height: "100%", cursor: "pointer" }}>
                      <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </span>
                    <button type="button" onClick={async () => {
                      if (!productEditTarget || productImageDeleting) return;
                      setProductImageDeleting(true);
                      if (img.id) {
                        const token = getToken(); if (!token) return;
                        await fetch(`/api/supplier/products/${productEditTarget.id}/images/${img.id}/`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
                      }
                      setProductEditImages((p) => p.filter((x) => x.url !== img.url));
                      setProductImageDeleting(false);
                    }} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: 4, width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
                  </div>
                ))}
                {productEditImages.filter((i) => i.type === "product_detail").length < 1 ? (
                  <ImageFileButton uploading={uploading} label={t("ops.productsDetailImageTitle")} onSelect={async (f) => {
                      if (!productEditTarget) return;
                      setUploading(true);
                      try {
                        const url = await uploadImage(f);
                        const token = getToken(); if (!token) return;
                        const res = await fetch(`/api/supplier/products/${productEditTarget.id}/images/`, {
                          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "product_detail", url }),
                        });
                        const d = await res.json();
                        if (d?.code === 200) setProductEditImages((p) => [...p, { id: d.data.id, url, type: "product_detail" }]);
                      } catch { alert(t("ops.productsUploadFailed")); }
                      finally { setUploading(false); }
                    }} />
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductEditTarget(null)} disabled={productEditing}>{t("common.cancel")}</Button>
            <Button onClick={handleProductEdit} disabled={productEditing}>
              {productEditing ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {t("ops.productsSkuEditBtn")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── 删除确认 ─── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.productsDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("ops.productsDeleteConfirm", { name: deleteTarget?.product_name ?? "", id: deleteTarget?.product_id ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className={styles.spinIcon} /> : null}{t("ops.apiKeysConfirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 回收站确认弹窗 ─── */}
      <Dialog open={!!trashConfirm} onOpenChange={(open) => { if (!open) setTrashConfirm(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{trashConfirm?.action === "restore" ? t("ops.trashRestore") : t("ops.trashDeletePermanent")}</DialogTitle>
            <DialogDescription>
              {trashConfirm?.action === "restore"
                ? (trashTab === "products" ? t("ops.trashRestoreConfirm", { name: trashConfirm?.name ?? "" }) : t("ops.trashSkuRestoreConfirm", { code: trashConfirm?.name ?? "" }))
                : (trashTab === "products" ? t("ops.trashDeletePermanentConfirm", { name: trashConfirm?.name ?? "" }) : t("ops.trashSkuDeletePermanentConfirm", { code: trashConfirm?.name ?? "" }))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrashConfirm(null)} disabled={trashActing}>{t("common.cancel")}</Button>
            <Button
              variant={trashConfirm?.action === "delete" ? "destructive" : "default"}
              onClick={() => { if (!trashConfirm) return; trashConfirm.action === "restore" ? doTrashRestore(trashConfirm.id) : doTrashPermanentDelete(trashConfirm.id); }}
              disabled={trashActing}
            >
              {trashActing ? <Loader2 size={14} className={styles.spinIcon} /> : null}
              {trashConfirm?.action === "restore" ? t("ops.trashRestore") : t("ops.trashDeletePermanent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      <Sheet open={manageDrawerOpen} onOpenChange={setManageDrawerOpen}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader className={styles.categoryDrawerHeader}>
            <SheetTitle>{t("ops.categoryManage")}</SheetTitle>
            <SheetDescription>{t("ops.categoriesCreateDesc")}</SheetDescription>
          </SheetHeader>
          <div className={styles.categoryDrawerBody}>
            <CategoryTree
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelect={(id) => { setSelectedCategoryId(id); setPage(1); }}
              enableActions
              onCreateSub={handleCreateSub}
              onDelete={handleDeleteCategory}
              onMove={handleMoveCategory}
              onCreateRoot={async (name) => { await handleCreateSub(0, name); fetchProducts(); }}
            />
          </div>
        </SheetContent>
      </Sheet>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        workspaceId="1"
        apiPrefix="/api/supplier"
        onImported={() => { fetchProducts(); fetchCategories(); }}
      />
      {/* ─── 图片预览弹窗 ─── */}
      {previewImage ? (
        <div
          onClick={() => setPreviewImage(null)}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <img src={previewImage} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }} />
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, width: 40, height: 40, cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---- 图片上传组件 ---- */

type ImageItem = { file?: File; url: string };

function ImageFileButton({
  uploading,
  label,
  onSelect,
}: {
  uploading: boolean;
  label: string;
  onSelect: (file: File) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={uploading}
        aria-label={label}
        title={label}
        onClick={() => inputRef.current?.click()}
        style={{ width: 80, height: 80, borderStyle: "dashed" }}
      >
        {uploading ? <Loader2 className={styles.spinIcon} /> : <ImagePlus />}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onSelect(file);
          event.target.value = "";
        }}
      />
    </>
  );
}

function ImageUploader({
  images,
  max,
  uploading,
  onUpload,
  onRemove,
  onPreview,
}: {
  images: ImageItem[];
  max: number;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: (url: string) => void;
  onPreview: (url: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {images.map((img, i) => (
        <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
          <span onClick={() => onPreview(img.url)} style={{ display: "block", width: "100%", height: "100%", cursor: "pointer" }}>
            <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </span>
          <button
            type="button"
            onClick={() => onRemove(img.url)}
            style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: 4, width: 18, height: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}
          >
            ×
          </button>
        </div>
      ))}
      {images.length < max ? (
        <ImageFileButton uploading={uploading} label="Choose image" onSelect={onUpload} />
      ) : null}
    </div>
  );
}
