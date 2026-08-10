import { TOKEN_COOKIE_NAME } from "@/lib/auth/core";

const API_PREFIX = "/api/v1";
const nativeFetch = globalThis.fetch.bind(globalThis);

type LegacyKind =
  | "default"
  | "dashboard"
  | "activities"
  | "inventory"
  | "lead"
  | "leads"
  | "login"
  | "paginated"
  | "api-keys"
  | "shopify"
  | "stream"
  | "user-info"
  | "workspace-list"
  | "workspace-created"
  | "workspace-profile"
  | "product"
  | "products"
  | "variants";

type MappedRequest = {
  init: RequestInit;
  kind: LegacyKind;
  metadata?: Record<string, unknown>;
  url: string;
};

let installed = false;
let workspaceCache: { token: string; promise: Promise<string> } | null = null;

function tokenFromCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE_NAME}=([^;]*)`),
  );
  return match?.[1] ?? "";
}

function requestHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  const token = tokenFromCookie();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

function withPagination(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  const page = Math.max(1, Number(next.get("page") || "1"));
  const limit = Math.max(1, Number(next.get("page_size") || next.get("limit") || "20"));
  if (next.has("page") || next.has("page_size")) {
    next.set("limit", String(limit));
    next.set("offset", String((page - 1) * limit));
  }
  next.delete("page");
  next.delete("page_size");
  next.delete("flat");
  return next;
}

function jsonBody(init: RequestInit): Record<string, unknown> | null {
  if (typeof init.body !== "string") return null;
  try {
    const value = JSON.parse(init.body) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function replaceJsonBody(
  init: RequestInit,
  transform: (body: Record<string, unknown>) => Record<string, unknown>,
): RequestInit {
  const body = jsonBody(init);
  if (!body) return init;
  return { ...init, body: JSON.stringify(transform(body)) };
}

function normalizeProductBody(body: Record<string, unknown>) {
  const next = { ...body };
  if ("ws_category_id" in next) next.category_id = next.ws_category_id;
  if ("spec_template" in next) next.specification_template = next.spec_template;
  delete next.ws_category_id;
  delete next.spec_template;
  delete next.workspace_id;
  return next;
}

function normalizeVariantBody(
  body: Record<string, unknown>,
  omitStockQuantity = false,
) {
  const next = { ...body };
  if ("specs" in next) next.specifications = next.specs;
  if ("moq" in next) next.minimum_order_quantity = next.moq;
  if (Array.isArray(next.price_tiers)) {
    next.price_tiers = next.price_tiers.map((tier) => {
      const item = tier as Record<string, unknown>;
      return {
        minimum_quantity: item.minimum_quantity ?? item.min_quantity,
        unit_price: item.unit_price ?? item.price,
      };
    });
  }
  delete next.specs;
  delete next.moq;
  delete next.product_id;
  delete next.workspace_id;
  if (omitStockQuantity) delete next.stock_quantity;
  return next;
}

function normalizeShopifyUpdateBody(body: Record<string, unknown>) {
  const next = { ...body };
  for (const field of ["api_key", "api_secret_key"] as const) {
    const value = next[field];
    if (typeof value === "string" && value.includes("*")) delete next[field];
  }
  return next;
}

async function firstWorkspaceId(headers: Headers): Promise<string> {
  const token = headers.get("Authorization") ?? tokenFromCookie();
  if (workspaceCache?.token === token) return workspaceCache.promise;

  const promise = nativeFetch(`${API_PREFIX}/workspaces?limit=1&offset=0`, { headers })
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to resolve Workspace");
      const payload = await response.json() as { items?: Array<{ id?: string }> };
      const workspaceId = payload.items?.[0]?.id;
      if (!workspaceId) throw new Error("No accessible Workspace");
      return workspaceId;
    });
  workspaceCache = { token, promise };
  return promise;
}

async function workspaceIdFor(
  source: URL,
  init: RequestInit,
  preferMembership = false,
): Promise<string> {
  const body = jsonBody(init);
  const selected = source.searchParams.get("workspace_id")
    || (typeof body?.workspace_id === "string" ? body.workspace_id : "")
    || (typeof localStorage !== "undefined" ? localStorage.getItem("ops-selected-workspace") ?? "" : "");
  if (!preferMembership && selected && selected !== "1") return selected;
  return firstWorkspaceId(requestHeaders(init));
}

function apiUrl(path: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return `${API_PREFIX}${path}${query ? `?${query}` : ""}`;
}

async function mapLegacyRequest(source: URL, inputInit: RequestInit): Promise<MappedRequest | null> {
  const path = source.pathname.replace(/\/+$/, "");
  if (!path.startsWith("/api/") || path.startsWith(`${API_PREFIX}/`)) return null;

  let init: RequestInit = { ...inputInit, headers: requestHeaders(inputInit) };
  const method = String(init.method || "GET").toUpperCase();
  const params = withPagination(source.searchParams);
  let kind: LegacyKind = "default";

  if (path === "/api/user/login") {
    return { init, kind: "login", url: apiUrl("/auth/login") };
  }
  if (path === "/api/user/info") {
    return { init, kind: "user-info", url: apiUrl("/auth/me") };
  }
  if (path === "/api/user/language") {
    return { init, kind, url: apiUrl("/auth/me/language") };
  }
  if (path === "/api/user/email/send-code" || path === "/api/user/sms/send-code") {
    const channel = path.includes("email") ? "email" : "sms";
    init = replaceJsonBody(init, (body) => ({
      channel,
      target: body.email ?? body.phone,
      ...(channel === "sms" ? { captcha_token: body.captcha_verify_param } : {}),
    }));
    return { init, kind, url: apiUrl("/auth/challenges") };
  }
  if (path === "/api/user/email/vendor-login" || path === "/api/user/sms/vendor-login") {
    const channel = path.includes("email") ? "email" : "sms";
    init = replaceJsonBody(init, (body) => ({
      channel,
      target: body.email ?? body.phone,
      code: body.code,
      vendor_only: true,
    }));
    return { init, kind: "login", url: apiUrl("/auth/challenges/login") };
  }

  if (path === "/api/workspace/list") {
    return { init, kind: "workspace-list", url: apiUrl("/workspaces", params) };
  }
  if (path === "/api/workspace/create") {
    let generatedPassword = "";
    let workspaceName = "";
    let contactName: unknown = "";
    init = replaceJsonBody(init, (body) => {
      const password = String(body.password || `Mekyro-${crypto.randomUUID()}!`);
      const name = String(body.workspace_name || "workspace");
      generatedPassword = password;
      workspaceName = name;
      contactName = body.contact_name || body.username;
      return {
        username: body.username,
        email: body.email,
        display_name: body.contact_name || body.username,
        country_code: body.country_code || "+86",
        phone: body.phone || "",
        password,
        workspace_name: name,
        workspace_slug: String(body.workspace_slug || name)
          .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
          .slice(0, 90) || `workspace-${Date.now()}`,
        description: body.description || "",
        site_type: body.site_type || "none",
        prompt: body.prompt || "",
        daily_lead_limit: body.daily_lead_limit || 0,
      };
    });
    return {
      init,
      kind: "workspace-created",
      metadata: { generatedPassword, workspaceName, contactName },
      url: apiUrl("/workspaces"),
    };
  }
  const workspaceMatch = path.match(/^\/api\/workspace\/([^/]+)\/(detail|update|delete)$/);
  if (workspaceMatch) {
    const [, workspaceId, action] = workspaceMatch;
    if (action === "detail") {
      return { init, kind: "workspace-profile", url: apiUrl(`/workspaces/${workspaceId}/supplier-account`) };
    }
    if (action === "update") {
      init = replaceJsonBody(init, (body) => ({
        workspace_name: body.workspace_name,
        description: body.description,
        site_type: body.site_type,
        workspace_is_active: body.workspace_is_active,
        owner_display_name: body.contact_name,
        owner_country_code: body.country_code,
        owner_phone: body.phone,
        owner_email: body.email,
        owner_is_active: body.user_is_active,
        owner_role: body.role,
        prompt: body.prompt,
        daily_lead_limit: body.daily_lead_limit,
        email_outreach_enabled: body.email_outreach_enabled,
        vendure_channels_token: body.vendure_channels_token,
        vendure_url: body.vendure_url,
      }));
      return { init, kind: "workspace-profile", url: apiUrl(`/workspaces/${workspaceId}/supplier-account`) };
    }
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/supplier-account`, params) };
  }

  if (path === "/api/supplier/profile") {
    const workspaceId = await workspaceIdFor(source, init, true);
    if (method === "PATCH") {
      init = replaceJsonBody(init, (body) => {
        const token = body.vendure_channels_token;
        return {
          name: body.workspace_name,
          description: body.description,
          site_type: body.site_type || "none",
          lead_acquisition_requirement: body.lead_acquisition_requirement,
          prompt: body.prompt,
          daily_lead_limit: body.daily_lead_limit,
          email_outreach_enabled: body.email_outreach_enabled,
          vendure_url: body.vendure_url,
          vendure_channels_token:
            typeof token === "string" && !token.includes("*") ? token : undefined,
        };
      });
    }
    return { init, kind: "workspace-profile", url: apiUrl(`/workspaces/${workspaceId}`) };
  }
  if (path === "/api/supplier/home-stats") {
    const workspaceId = await workspaceIdFor(source, init, true);
    return { init, kind: "dashboard", url: apiUrl(`/workspaces/${workspaceId}/dashboard`) };
  }
  if (path === "/api/supplier/agent/chat") {
    const workspaceId = await workspaceIdFor(source, init, true);
    init = replaceJsonBody(init, (body) => {
      const next = { ...body };
      delete next.workspace_id;
      return next;
    });
    return { init, kind: "stream", url: apiUrl(`/workspaces/${workspaceId}/agent/chat`) };
  }
  if (path === "/api/internal/dashboard/stats") {
    return { init, kind: "dashboard", url: apiUrl("/internal/dashboard/stats") };
  }

  const isSupplier = path.startsWith("/api/supplier/");
  const isInternal = path.startsWith("/api/internal/");
  const workspaceId = isSupplier || isInternal
    ? await workspaceIdFor(source, init, isSupplier)
    : "";
  if (isInternal && workspaceId) params.set("workspace_id", workspaceId);
  else params.delete("workspace_id");

  const leadList = path.match(/^\/api\/(supplier|internal)\/leads$/);
  if (leadList) {
    const target = leadList[1] === "internal"
      ? "/internal/leads"
      : `/workspaces/${workspaceId}/leads`;
    if (method === "POST") {
      init = replaceJsonBody(init, (body) => {
        const next = { ...body };
        if ("platform" in next) next.source = next.platform;
        if ("merchant_id" in next) next.external_ref = next.merchant_id;
        delete next.platform;
        delete next.merchant_id;
        delete next.workspace_id;
        return next;
      });
      return { init, kind: "lead", url: apiUrl(target) };
    }
    return { init, kind: "leads", url: apiUrl(target, params) };
  }
  const leadAction = path.match(/^\/api\/(supplier|internal)\/leads\/([^/]+)\/(update|delete)$/);
  if (leadAction) {
    init = replaceJsonBody(init, (body) => {
      const next = { ...body };
      if ("platform" in next) next.source = next.platform;
      if ("merchant_id" in next) next.external_ref = next.merchant_id;
      delete next.platform;
      delete next.merchant_id;
      return next;
    });
    return { init, kind: "lead", url: apiUrl(`/workspaces/${workspaceId}/leads/${leadAction[2]}`) };
  }
  const leadActivities = path.match(/^\/api\/supplier\/leads\/([^/]+)\/contact-logs$/);
  if (leadActivities) {
    return { init, kind: "activities", url: apiUrl(`/workspaces/${workspaceId}/leads/${leadActivities[1]}/activities`, params) };
  }

  const orderList = path.match(/^\/api\/supplier\/orders$/);
  if (orderList) {
    return { init, kind: "paginated", url: apiUrl(`/workspaces/${workspaceId}/orders`, params) };
  }
  const orderDetail = path.match(/^\/api\/supplier\/orders\/([^/]+)$/);
  if (orderDetail) {
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/orders/${orderDetail[1]}`) };
  }

  const activityList = path.match(/^\/api\/(supplier|internal)\/contact-logs$/);
  if (activityList) {
    const target = activityList[1] === "internal"
      ? "/internal/contact-logs"
      : `/workspaces/${workspaceId}/activities`;
    return { init, kind: "activities", url: apiUrl(target, params) };
  }
  const activityAction = path.match(/^\/api\/internal\/contact-logs\/([^/]+)\/(update|delete)$/);
  if (activityAction) {
    init = replaceJsonBody(init, (body) => ({
      activity_type: body.type,
      channel: body.channel,
      subject: body.subject ?? body.email_title,
      content: body.content,
      sender: body.sender ?? body.email_sender,
      recipient: body.recipient ?? body.email_recipient,
      occurred_at: body.occurred_at,
    }));
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/activities/${activityAction[1]}`) };
  }

  const productList = path.match(/^\/api\/(supplier|internal)\/products(?:\/(trash))?$/);
  if (productList) {
    const base = productList[1] === "internal"
      ? "/internal/products"
      : `/workspaces/${workspaceId}/products`;
    return { init, kind: "products", url: apiUrl(`${base}${productList[2] ? "/trash" : ""}`, params) };
  }
  if (path === "/api/internal/products/create" || path === "/api/supplier/products/create") {
    init = replaceJsonBody(init, normalizeProductBody);
    return { init, kind: "product", url: apiUrl(`/workspaces/${workspaceId}/products`) };
  }
  const productImport = path.match(/^\/api\/(supplier|internal)\/products\/import$/);
  if (productImport) {
    const importWorkspaceId = await workspaceIdFor(source, init, productImport[1] === "supplier");
    if (method === "GET" && source.searchParams.get("action") === "template") {
      return { init, kind: "stream", url: apiUrl(`/workspaces/${importWorkspaceId}/product-import/template`) };
    }
    const body = jsonBody(init);
    if (body?.action === "confirm") {
      init = replaceJsonBody(init, (value) => ({ rows: value.rows }));
      return { init, kind, url: apiUrl(`/workspaces/${importWorkspaceId}/product-import/confirm`) };
    }
    if (init.body instanceof FormData) {
      const form = new FormData();
      const file = init.body.get("file");
      if (file) form.append("file", file);
      init = { ...init, body: form };
      return { init, kind, url: apiUrl(`/workspaces/${importWorkspaceId}/product-import/preview`) };
    }
  }
  const productDetail = path.match(/^\/api\/(supplier|internal)\/products\/([^/]+)$/);
  if (productDetail) {
    const target = productDetail[1] === "internal" && method === "GET"
      ? `/internal/products/${productDetail[2]}`
      : `/workspaces/${workspaceId}/products/${productDetail[2]}`;
    return { init, kind: "product", url: apiUrl(target) };
  }
  const productAction = path.match(/^\/api\/(supplier|internal)\/products\/([^/]+)\/(update|restore|delete)$/);
  if (productAction) {
    const [, , productId, action] = productAction;
    if (action === "update") init = replaceJsonBody(init, normalizeProductBody);
    const suffix = action === "restore"
      ? "/restore"
      : action === "delete" && params.get("permanent") === "true"
        ? "/permanent"
        : "";
    params.delete("permanent");
    return { init, kind: "product", url: apiUrl(`/workspaces/${workspaceId}/products/${productId}${suffix}`) };
  }
  const productImages = path.match(/^\/api\/(supplier|internal)\/products\/([^/]+)\/images(?:\/([^/]+))?$/);
  if (productImages) {
    init = replaceJsonBody(init, (body) => ({
      image_type: body.type ?? body.image_type,
      url: body.url,
      variant_id: body.sku_id ?? body.variant_id,
    }));
    const suffix = productImages[3] ? `/${productImages[3]}` : "";
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/products/${productImages[2]}/images${suffix}`) };
  }

  const variantList = path.match(/^\/api\/(supplier|internal)\/skus\/(trash)$/);
  if (variantList) {
    const target = variantList[1] === "internal"
      ? "/internal/variants/trash"
      : `/workspaces/${workspaceId}/variants/trash`;
    return { init, kind: "variants", url: apiUrl(target, params) };
  }
  if (path === "/api/internal/skus/create" || path === "/api/supplier/skus/create") {
    const body = jsonBody(init);
    const productId = String(body?.product_id || "");
    init = replaceJsonBody(init, normalizeVariantBody);
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/products/${productId}/variants`) };
  }
  const variantAction = path.match(/^\/api\/(supplier|internal)\/skus\/([^/]+)\/(update|restore|delete)$/);
  if (variantAction) {
    const [, , variantId, action] = variantAction;
    if (action === "update") {
      init = replaceJsonBody(init, (body) => normalizeVariantBody(body, true));
    }
    const suffix = action === "restore"
      ? "/restore"
      : action === "delete" && params.get("permanent") === "true"
        ? "/permanent"
        : "";
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/variants/${variantId}${suffix}`) };
  }
  const inventoryCreate = path.match(/^\/api\/(supplier|internal)\/skus\/([^/]+)\/inventory-logs\/create$/);
  if (inventoryCreate) {
    init = replaceJsonBody(init, (body) => ({
      variant_id: inventoryCreate[2],
      movement_type: body.type,
      quantity_delta: body.quantity,
      reason: body.reason || "Manual adjustment",
      reference: body.reference_id || "",
    }));
    const headers = new Headers(init.headers);
    headers.set("Idempotency-Key", crypto.randomUUID());
    init = { ...init, headers };
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/inventory-adjustments`) };
  }

  const categoryList = path.match(/^\/api\/(supplier|internal)\/categories$/);
  if (categoryList) {
    const target = categoryList[1] === "internal"
      ? "/internal/categories"
      : `/workspaces/${workspaceId}/categories`;
    return { init, kind: categoryList[1] === "internal" ? "paginated" : "default", url: apiUrl(target, params) };
  }
  if (path === "/api/internal/categories/create" || path === "/api/supplier/categories/create") {
    init = replaceJsonBody(init, (body) => {
      const next = { ...body };
      delete next.workspace_id;
      return next;
    });
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/categories`) };
  }
  const categoryAction = path.match(/^\/api\/(supplier|internal)\/categories\/([^/]+)\/(update|delete)$/);
  if (categoryAction) {
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/categories/${categoryAction[2]}`) };
  }

  const inventoryList = path.match(/^\/api\/(supplier|internal)\/inventory-logs$/);
  if (inventoryList) {
    if (params.has("sku_id")) {
      params.set("variant_id", params.get("sku_id") || "");
      params.delete("sku_id");
    }
    const target = inventoryList[1] === "internal"
      ? "/internal/inventory-movements"
      : `/workspaces/${workspaceId}/inventory-movements`;
    return { init, kind: "inventory", url: apiUrl(target, params) };
  }

  const inquiryCreate = path.match(/^\/api\/external\/inquiries\/(buyers|suppliers)\/create$/);
  if (inquiryCreate) {
    return { init, kind, url: apiUrl(`/inquiries/${inquiryCreate[1]}`) };
  }
  const inquiryList = path.match(/^\/api\/internal\/inquiries\/(buyers|suppliers)$/);
  if (inquiryList) {
    return { init, kind: "paginated", url: apiUrl(`/inquiries/${inquiryList[1]}`, params) };
  }
  const inquiryAction = path.match(/^\/api\/internal\/inquiries\/(buyers|suppliers)\/([^/]+)\/(update|delete)$/);
  if (inquiryAction) {
    return { init, kind, url: apiUrl(`/inquiries/${inquiryAction[1]}/${inquiryAction[2]}`) };
  }

  if (path === "/api/internal/api-keys") {
    const legacyParams = new URLSearchParams(source.searchParams);
    if (Number(legacyParams.get("page_size") || "20") > 100) legacyParams.set("page_size", "100");
    return { init, kind: "api-keys", url: apiUrl("/internal/api-keys", legacyParams) };
  }
  if (path === "/api/internal/api-keys/create") {
    return { init, kind, url: apiUrl("/internal/api-keys") };
  }
  const apiKeyAction = path.match(/^\/api\/internal\/api-keys\/([^/]+)\/(update|status|delete)$/);
  if (apiKeyAction) {
    return { init, kind, url: apiUrl(`/internal/api-keys/${apiKeyAction[1]}${apiKeyAction[2] === "status" ? "/status" : ""}`) };
  }

  if (path === "/api/internal/shopify-configs") {
    const legacyParams = new URLSearchParams(source.searchParams);
    if (Number(legacyParams.get("page_size") || "20") > 100) legacyParams.set("page_size", "100");
    return { init, kind: "shopify", url: apiUrl("/internal/shopify-configs", legacyParams) };
  }
  if (path === "/api/internal/shopify-configs/create") {
    return { init, kind, url: apiUrl("/internal/shopify-configs") };
  }
  const shopifyAction = path.match(/^\/api\/internal\/shopify-configs\/([^/]+)\/(update|status|delete)$/);
  if (shopifyAction) {
    if (shopifyAction[2] === "update") {
      init = replaceJsonBody(init, normalizeShopifyUpdateBody);
    }
    return { init, kind, url: apiUrl(`/internal/shopify-configs/${shopifyAction[1]}${shopifyAction[2] === "status" ? "/status" : ""}`) };
  }

  if (path === "/api/internal/upload" || path === "/api/supplier/upload") {
    return { init, kind, url: apiUrl(`/workspaces/${workspaceId}/uploads`) };
  }

  return null;
}

function image(item: Record<string, unknown>): Record<string, unknown> {
  return { ...item, type: item.image_type ?? item.type };
}

function variant(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    specs: item.specifications ?? item.specs ?? {},
    moq: item.minimum_order_quantity ?? item.moq ?? 1,
    images: Array.isArray(item.images) ? item.images.map((value) => image(value as Record<string, unknown>)) : [],
    price_tiers: Array.isArray(item.price_tiers)
      ? item.price_tiers.map((value) => {
        const tier = value as Record<string, unknown>;
        return {
          ...tier,
          min_quantity: tier.minimum_quantity ?? tier.min_quantity,
          price: tier.unit_price ?? tier.price,
        };
      })
      : [],
  };
}

function product(item: Record<string, unknown>): Record<string, unknown> {
  const variants = Array.isArray(item.variants)
    ? item.variants.map((value) => variant(value as Record<string, unknown>))
    : [];
  return {
    ...item,
    ws_category_id: item.category_id ?? item.ws_category_id,
    spec_template: item.specification_template ?? item.spec_template ?? [],
    skus: variants,
    variants,
    images: Array.isArray(item.images) ? item.images.map((value) => image(value as Record<string, unknown>)) : [],
  };
}

function lead(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    platform: item.source ?? item.platform,
    merchant_id: item.external_ref ?? item.merchant_id,
  };
}

function activity(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    ws_lead_id: item.lead_id ?? item.ws_lead_id,
    type: item.activity_type ?? item.type,
    email_title: item.subject ?? item.email_title,
    email_sender: item.sender ?? item.email_sender,
    email_recipient: item.recipient ?? item.email_recipient,
  };
}

function inventoryMovement(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    ws_sku_id: item.variant_id ?? item.ws_sku_id,
    type: item.movement_type ?? item.type,
    quantity: item.quantity_delta ?? item.quantity,
    reference_id: item.reference ?? item.reference_id,
  };
}

async function transformedData(
  kind: LegacyKind,
  payload: unknown,
  init: RequestInit,
  metadata: Record<string, unknown> = {},
): Promise<unknown> {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;

  if (kind === "login" && record) {
    const user = record.user as Record<string, unknown>;
    return {
      token: record.access_token,
      user: { ...user, is_superuser: Boolean(user?.is_platform_admin) },
    };
  }
  if (kind === "workspace-list" && record) {
    const items = Array.isArray(record.items) ? record.items as Array<Record<string, unknown>> : [];
    return {
      total: record.total ?? items.length,
      results: items.map((item) => ({
        ...item,
        workspace_id: item.id,
        workspace_name: item.name,
        members: Array.isArray(item.members)
          ? item.members.map((value) => {
            const member = value as Record<string, unknown>;
            return {
              ...member,
              user_is_active: member.user_is_active,
              is_superuser: member.is_platform_admin,
              ws_user_name: member.name,
            };
          })
          : [],
      })),
    };
  }
  if (kind === "workspace-created" && record) {
    return {
      ...record,
      workspace_id: record.workspace_id,
      workspace_name: metadata.workspaceName,
      user_id: record.user_id,
      username: record.username,
      ws_user_name: metadata.contactName,
      password: metadata.generatedPassword,
    };
  }
  if (kind === "user-info" && record) {
    const headers = requestHeaders(init);
    let workspaces: unknown[] = [];
    try {
      const response = await nativeFetch(`${API_PREFIX}/workspaces?limit=100&offset=0`, { headers });
      const list = await response.json() as { items?: Array<Record<string, unknown>> };
      workspaces = (list.items ?? []).map((item) => ({
        workspace_id: item.id,
        workspace_name: item.name,
        ws_user_name: record.display_name ?? record.nickname ?? record.username,
      }));
    } catch {
      workspaces = [];
    }
    return { ...record, is_superuser: Boolean(record.is_platform_admin), workspaces };
  }
  if (kind === "workspace-profile" && record) {
    const workspace = (record.workspace as Record<string, unknown> | undefined) ?? record;
    const owner = (record.owner as Record<string, unknown> | undefined) ?? {};
    return {
      ...workspace,
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      phone: owner.phone ?? "",
      email: owner.email ?? "",
      user_is_active: owner.is_active ?? true,
      ws_user_name: owner.display_name ?? owner.nickname ?? owner.username ?? "",
      ws_user_role: owner.role ?? workspace.role ?? "owner",
      vendure_channels_token: workspace.vendure_channels_token_masked ?? "",
    };
  }
  if (kind === "dashboard" && record) {
    return {
      ...record,
      log_types: record.contact_log_types ?? record.log_types ?? {},
      inventory_log_count: record.inventory_movement_count ?? record.inventory_log_count ?? 0,
      out_of_stock_count: record.out_of_stock_count ?? 0,
    };
  }
  if (kind === "lead" && record) return lead(record);
  if (kind === "leads" && record) {
    const items = Array.isArray(record.items)
      ? (record.items as Array<Record<string, unknown>>).map(lead)
      : [];
    return { ...record, results: items };
  }
  if (kind === "activities" && record) {
    const items = Array.isArray(record.items)
      ? (record.items as Array<Record<string, unknown>>).map(activity)
      : [];
    return { ...record, results: items };
  }
  if (kind === "inventory" && record) {
    const items = Array.isArray(record.items)
      ? (record.items as Array<Record<string, unknown>>).map(inventoryMovement)
      : [];
    return { ...record, results: items };
  }
  if (kind === "product" && record) return product(record);
  if (kind === "products") {
    const items = Array.isArray(payload)
      ? payload.map((value) => product(value as Record<string, unknown>))
      : Array.isArray(record?.items)
        ? (record.items as Array<Record<string, unknown>>).map(product)
        : [];
    return { total: record?.total ?? items.length, results: items };
  }
  if (kind === "variants") {
    const items = Array.isArray(payload)
      ? payload.map((item) => variant(item as Record<string, unknown>))
      : Array.isArray(record?.items)
        ? (record.items as Array<Record<string, unknown>>).map(variant)
        : [];
    return { total: record?.total ?? items.length, results: items };
  }
  if ((kind === "paginated" || kind === "api-keys" || kind === "shopify") && record) {
    const items = Array.isArray(record.items) ? record.items : [];
    if (kind === "api-keys") {
      return { ...record, keys: Array.isArray(record.keys) ? record.keys : items };
    }
    if (kind === "shopify") {
      const configs = (Array.isArray(record.configs) ? record.configs : items)
        .map((value) => {
          const item = value as Record<string, unknown>;
          return {
            ...item,
            api_key: item.api_key_masked ?? "",
            api_secret_key: item.api_secret_key_masked ?? "",
          };
        });
      return { ...record, configs };
    }
    return { ...record, results: items };
  }
  return payload;
}

function legacyResponse(body: unknown, response: Response): Response {
  return new Response(JSON.stringify(body), {
    status: response.ok ? 200 : response.status,
    statusText: response.ok ? "OK" : response.statusText,
    headers: { "Content-Type": "application/json" },
  });
}

async function compatibilityFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (input instanceof Request) return nativeFetch(input, init);
  const raw = typeof input === "string" ? input : input.toString();
  const base = typeof location === "undefined" ? "http://localhost" : location.origin;
  const source = new URL(raw, base);
  const mapped = await mapLegacyRequest(source, init);
  if (!mapped) return nativeFetch(input, init);

  const response = await nativeFetch(mapped.url, mapped.init);
  if (mapped.kind === "stream") return response;
  let payload: unknown = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const error = payload as { detail?: unknown } | null;
    const detail = Array.isArray(error?.detail)
      ? error?.detail.map((item) => (item as { msg?: string }).msg).filter(Boolean).join("; ")
      : error?.detail;
    return legacyResponse({ code: response.status, message: String(detail || response.statusText), data: null }, response);
  }
  const data = await transformedData(mapped.kind, payload, mapped.init, mapped.metadata);
  return legacyResponse({ code: 200, message: "ok", data }, response);
}

export function installFastApiLegacyAdapter() {
  if (installed) return;
  installed = true;
  globalThis.fetch = compatibilityFetch;
}
