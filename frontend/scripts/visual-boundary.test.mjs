import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findForbiddenVisualFiles } from "./visual-boundary.mjs";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFor(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

function cssRuleBlock(source, selectors) {
  const uncommentedSource = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const escapedSelectors = selectors.map((selector) =>
    selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const rulePattern = new RegExp(
    `(?:^|\\n)\\s*${escapedSelectors.join("\\s*,\\s*")}\\s*\\{([^{}]*)\\}`,
    "m",
  );
  const match = uncommentedSource.match(rulePattern);

  assert.ok(match, `Missing exact CSS rule: ${selectors.join(", ")}`);
  return match[1];
}

function assertIconRule(source, selectors, size) {
  const block = cssRuleBlock(source, selectors);

  assert.match(block, new RegExp(`height:\\s*${size}px\\s*;`));
  assert.match(block, new RegExp(`width:\\s*${size}px\\s*;`));
  assert.match(block, /stroke-width:\s*1\.5\s*;/);
}

test("CSS icon rule assertions ignore commented-out declarations", () => {
  const selectors = [".sidebar nav svg", ".mobileSheetNavigation svg"];
  const liveRule = `
.sidebar nav svg,
.mobileSheetNavigation svg {
  height: 18px;
  stroke-width: 1.5;
  width: 18px;
}
`;

  assert.doesNotThrow(() => assertIconRule(liveRule, selectors, 18));
  assert.throws(
    () => assertIconRule(`/*${liveRule}*/`, selectors, 18),
    /Missing exact CSS rule/,
  );
});

test("allows approved presentation files", () => {
  assert.deepEqual(
    findForbiddenVisualFiles([
      "docs/superpowers/plans/2026-07-11-mekyro-backend-visual-refresh.md",
      "frontend/package.json",
      "frontend/scripts/visual-boundary.mjs",
      "frontend/src/globals.css",
      "frontend/src/components/official-site.tsx",
      "frontend/src/components/ops-shell/ops-shell.tsx",
      "frontend/src/components/sms-login-form.tsx",
      "frontend/src/components/supplier-shell/supplier-leads-page.tsx",
      "frontend/src/i18n/zh-CN.json",
    ]),
    [],
  );
});

test("English supplier SMS login keeps field and captcha UI in English", () => {
  const form = sourceFor("src/components/sms-login-form.tsx");
  const officialSite = sourceFor("src/components/official-site.tsx");
  const en = JSON.parse(sourceFor("src/i18n/en-US.json"));

  assert.equal(en.auth.smsCode, "Code");
  assert.equal(en.auth.smsCodePlaceholder, "Enter SMS code");
  assert.equal(en.auth.getCode, "Get Code");
  assert.match(form, /import i18n, \{ type Locale \} from "@\/i18n"/);
  assert.match(form, /locale: Locale;/);
  assert.match(form, /useTranslation\(undefined, \{ lng: locale \}\)/);
  assert.match(form, /const captchaLanguage = locale === "zh-CN" \? "cn" : "en";/);
  assert.match(form, /language: captchaLanguage/);
  assert.match(
    officialSite,
    /<SmsLoginForm[\s\S]*?key=\{`supplier-sms-\$\{locale\}`\}[\s\S]*?locale=\{locale\}/,
  );
});

test("forced mobile login uses one contained column without clipping", () => {
  const css = sourceFor("src/globals.css");
  const scope = '.site-view-mode-root[data-view-mode="mobile"] .official-site:not(.official-site-mobile)';
  const layout = cssRuleBlock(css, [`${scope} .official-login-layout`]);
  const inner = cssRuleBlock(css, [
    `${scope} .official-login-shell-panel > .official-border-glow-inner`,
  ]);
  const form = cssRuleBlock(css, [`${scope} .official-login-form-panel`]);
  const hero = cssRuleBlock(css, [`${scope} .official-login-hero-panel`]);

  assert.match(layout, /width:\s*min\(calc\(100% - 32px\),\s*640px\)\s*;/);
  assert.match(inner, /grid-template-columns:\s*1fr\s*;/);
  assert.match(inner, /min-height:\s*auto\s*;/);
  assert.match(inner, /padding:\s*22px\s*;/);
  assert.match(form, /min-width:\s*0\s*;/);
  assert.match(form, /order:\s*-1\s*;/);
  assert.match(hero, /height:\s*auto\s*;/);
  assert.match(hero, /min-height:\s*auto\s*;/);
});

test("rejects backend, data, query-state, and API files", () => {
  assert.deepEqual(
    findForbiddenVisualFiles([
      "backend/apps/lead/models.py",
      "backend/apps/product/migrations/0002_auto.py",
      "frontend/src/components/ops-shell/workspace-context.tsx",
      "frontend/src/lib/api.ts",
      "frontend/src/lib/ai-native-command/synthetic-command-data.ts",
    ]),
    [
      "backend/apps/lead/models.py",
      "backend/apps/product/migrations/0002_auto.py",
      "frontend/src/components/ops-shell/workspace-context.tsx",
      "frontend/src/lib/api.ts",
      "frontend/src/lib/ai-native-command/synthetic-command-data.ts",
    ],
  );
});

test("rejects unapproved shell-navigation primitives", () => {
  assert.deepEqual(
    findForbiddenVisualFiles([
      "frontend/src/components/ui/breadcrumb.tsx",
      "frontend/src/components/ui/navigation-menu.tsx",
      "frontend/src/components/ui/sidebar.tsx",
    ]),
    [
      "frontend/src/components/ui/breadcrumb.tsx",
      "frontend/src/components/ui/navigation-menu.tsx",
      "frontend/src/components/ui/sidebar.tsx",
    ],
  );
});

test("Task 6 product pages compose one compact responsive toolbar", () => {
  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.equal((source.match(/productWorkbenchToolbar/g) ?? []).length, 1, relativePath);
    assert.match(source, /toolbar=\{\(\s*<div className=\{`\$\{styles\.searchBar\} \$\{styles\.productWorkbenchToolbar\}`\}>/);
  }
});

test("product workbench separates keyword search from instant filters", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");

  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    const toolbar = source.slice(source.indexOf("toolbar={("), source.indexOf("footer={("));
    const searchGroupStart = toolbar.indexOf("className={styles.productSearchGroup}");
    const filterGroupStart = toolbar.indexOf("className={styles.productFilterGroup}");

    assert.notEqual(searchGroupStart, -1, relativePath);
    assert.notEqual(filterGroupStart, -1, relativePath);
    assert.ok(searchGroupStart < filterGroupStart, relativePath);
    assert.match(
      toolbar.slice(searchGroupStart, filterGroupStart),
      /role="search"[\s\S]*?<BackendSearchButton/,
      relativePath,
    );
    assert.match(
      toolbar.slice(filterGroupStart),
      /role="group"[\s\S]*?productsFilterLabel[\s\S]*?productsCategoryFilterAll[\s\S]*?productsStatusFilterAll[\s\S]*?productsStockFilterAll/,
      relativePath,
    );
  }

  assert.match(styles, /\.productFilterGroup\s*\{[^}]*border-left:\s*1px solid var\(--border-default\);/);
  assert.match(styles, /@media \(max-width: 1180px\)\s*\{[\s\S]*?\.productFilterGroup\s*\{[^}]*border-left:\s*0;/);
});

test("all explicit backend searches use one accessible icon-only submit", () => {
  const searchButton = sourceFor("src/components/backend-ui/backend-search-button.tsx");
  const pages = [
    "src/components/ops-shell/leads-page.tsx",
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
    "src/components/ops-shell/products-page.tsx",
    "src/components/ops-shell/inventory-logs-page.tsx",
    "src/components/supplier-shell/supplier-leads-page.tsx",
    "src/components/supplier-shell/supplier-contact-logs-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
    "src/components/supplier-shell/supplier-inventory-logs-page.tsx",
  ];

  assert.match(searchButton, /function BackendSearchButton\(/);
  assert.match(searchButton, /<Search aria-hidden="true" \/>/);
  assert.match(searchButton, /aria-label=\{label\}/);
  assert.match(searchButton, /title=\{label\}/);
  assert.match(searchButton, /size-10/);
  assert.match(searchButton, /max-\[820px\]:size-11/);

  for (const relativePath of pages) {
    const source = sourceFor(relativePath);
    assert.match(source, /import \{ BackendSearchButton \}/, relativePath);
    assert.match(source, /<BackendSearchButton[\s\S]*?onClick=\{handleSearch\}/, relativePath);
    assert.doesNotMatch(source, /<Button[^>]*onClick=\{handleSearch\}/, relativePath);
  }
});

test("product filters keep independent callbacks without composite reset behavior", () => {
  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.doesNotMatch(source, /hasProductFilters|resetProductFilters|productsResetFilters|productResetFiltersButton/, relativePath);
    assert.match(source, /onChange=\{\(id\) => \{ setSelectedCategoryId\(id \|\| null\); setPage\(1\); \}\}/, relativePath);
    assert.match(source, /onChange=\{\(value\) => \{ setStatusFilter\(value\); setPage\(1\); \}\}/, relativePath);
    assert.match(source, /onChange=\{\(value\) => \{ setStockFilter\(value\); setPage\(1\); \}\}/, relativePath);
  }

  const zh = JSON.parse(sourceFor("src/i18n/zh-CN.json"));
  const en = JSON.parse(sourceFor("src/i18n/en-US.json"));
  assert.equal(zh.ops.productsFilterLabel, "筛选");
  assert.equal(zh.ops.productsCategoryFilterAll, "分类：全部");
  assert.equal(zh.ops.productsStatusFilterAll, "状态：全部");
  assert.equal(zh.ops.productsStockFilterAll, "库存：全部");
  assert.equal("productsResetFilters" in zh.ops, false);
  assert.equal(en.ops.productsFilterLabel, "Filters");
  assert.equal(en.ops.productsCategoryFilterAll, "Category: All");
  assert.equal(en.ops.productsStatusFilterAll, "Status: All");
  assert.equal(en.ops.productsStockFilterAll, "Stock: All");
  assert.equal("productsResetFilters" in en.ops, false);
});

test("product mobile toolbar stays flat inside the data surface", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  assert.match(
    styles,
    /@media \(max-width: 920px\)\s*\{[\s\S]*?\.productWorkbenchToolbar\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*margin:\s*0;[^}]*padding:\s*0;/,
  );
});

test("product management pages use one full-width category-filtered workbench", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const opsSource = sourceFor("src/components/ops-shell/products-page.tsx");
  const supplierSource = sourceFor("src/components/supplier-shell/supplier-products-page.tsx");

  for (const [relativePath, source] of [
    ["src/components/ops-shell/products-page.tsx", opsSource],
    ["src/components/supplier-shell/supplier-products-page.tsx", supplierSource],
  ]) {
    assert.doesNotMatch(source, /<aside className=\{styles\.productsSidebar\}>/, relativePath);
    assert.match(source, /<CategoryCascader[\s\S]*?value=\{selectedCategoryId\}[\s\S]*?setSelectedCategoryId\(id \|\| null\)/, relativePath);
    assert.match(source, /setManageDrawerOpen\(true\)/, relativePath);
  }
  assert.doesNotMatch(opsSource, /<CategoryTree\b/);
  assert.match(supplierSource, /<Sheet open=\{manageDrawerOpen\}[\s\S]*?<CategoryTree\b/);
  assert.doesNotMatch(styles, /\.productsSidebar\s*\{/);
});

test("supplier SKU inventory log action opens the shared supplier drawer", () => {
  const supplierSource = sourceFor("src/components/supplier-shell/supplier-products-page.tsx");
  const drawerSource = sourceFor("src/components/ops-shell/inventory-logs-drawer.tsx");

  assert.match(supplierSource, /setLogsSku\(\{ id: sku\.id, skuCode: sku\.sku_code, productName: product\.name \}\)/);
  assert.match(supplierSource, /<InventoryLogsDrawer[\s\S]*?open=\{!!logsSku\}[\s\S]*?apiPrefix="\/api\/supplier"/);
  assert.match(drawerSource, /fetch\(`\$\{apiPrefix\}\/inventory-logs\/\?\$\{params\.toString\(\)\}`/);
});

test("supplier category management relocates the original action tree without changing handlers", () => {
  const opsSource = sourceFor("src/components/ops-shell/products-page.tsx");
  const supplierSource = sourceFor("src/components/supplier-shell/supplier-products-page.tsx");

  assert.match(opsSource, /fetch\(`\/api\/internal\/categories\/\?\$\{params\.toString\(\)\}`/);
  assert.match(supplierSource, /fetch\(`\/api\/supplier\/categories\/\?\$\{params\.toString\(\)\}`/);

  assert.match(opsSource, /<CategoryManageDrawer[\s\S]*?onChanged=\{fetchCategories\}[\s\S]*?\/>/);
  assert.doesNotMatch(supplierSource, /CategoryManageDrawer/);

  const supplierSheet = supplierSource.match(/<Sheet open=\{manageDrawerOpen\}[\s\S]*?<\/Sheet>/)?.[0] ?? "";
  assert.match(supplierSheet, /<Sheet open=\{manageDrawerOpen\} onOpenChange=\{setManageDrawerOpen\}>/);
  assert.match(supplierSheet, /<SheetContent side="right" className=\{styles\.opsDrawerContent\}>/);
  assert.match(supplierSheet, /<SheetHeader className=\{styles\.categoryDrawerHeader\}>[\s\S]*?<SheetTitle>\{t\("ops\.categoryManage"\)\}<\/SheetTitle>[\s\S]*?<SheetDescription>\{t\("ops\.categoriesCreateDesc"\)\}<\/SheetDescription>/);
  assert.match(supplierSheet, /<div className=\{styles\.categoryDrawerBody\}>/);

  const supplierTree = supplierSheet.match(/<CategoryTree[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(supplierTree, /categories=\{categories\}/);
  assert.match(supplierTree, /selectedCategoryId=\{selectedCategoryId\}/);
  assert.match(supplierTree, /onSelect=\{\(id\) => \{ setSelectedCategoryId\(id\); setPage\(1\); \}\}/);
  assert.match(supplierTree, /enableActions/);
  assert.match(supplierTree, /onCreateSub=\{handleCreateSub\}/);
  assert.match(supplierTree, /onDelete=\{handleDeleteCategory\}/);
  assert.match(supplierTree, /onMove=\{handleMoveCategory\}/);
  assert.match(supplierTree, /onCreateRoot=\{async \(name\) => \{ await handleCreateSub\(0, name\); fetchProducts\(\); \}\}/);
  assert.doesNotMatch(supplierSheet, /setManageDrawerOpen\(false\)/);

  for (const [relativePath, source] of [
    ["src/components/ops-shell/products-page.tsx", opsSource],
    ["src/components/supplier-shell/supplier-products-page.tsx", supplierSource],
  ]) {
    assert.doesNotMatch(
      source,
      /const nextCategories = data\.data as CategoryOption\[\];[\s\S]*?setCategories\(nextCategories\);[\s\S]*?setSelectedCategoryId\(\(current\) =>[\s\S]*?!nextCategories\.some\(\(category\) => category\.id === current\)[\s\S]*?\? null : current/,
      relativePath,
    );
  }
});

test("product toolbars keep search spacious and actions neutral", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");

  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    const actionClassIndex = source.indexOf("styles.pageActions");
    const actions = source.slice(source.lastIndexOf("<div", actionClassIndex), source.indexOf("{showTrash ?", actionClassIndex));
    const toolbar = source.slice(source.indexOf("toolbar={("), source.indexOf("footer={("));
    assert.doesNotMatch(source, /style=\{\{ maxWidth: 280 \}\}/, relativePath);
    assert.doesNotMatch(source, /variant=\{showTrash \? "default" : "outline"\}/, relativePath);
    assert.match(source, /className=\{styles\.productCategoryFilter\}/, relativePath);
    assert.match(actions, /setManageDrawerOpen\(true\)/, relativePath);
    assert.doesNotMatch(toolbar, /productCategoryManageButton/, relativePath);
  }
  assert.match(styles, /@media \(max-width: 920px\)\s*\{[\s\S]*?\.productWorkbenchToolbar \.searchInputWrap,[\s\S]*?\.productCategoryFilter\s*\{\s*flex:\s*0 0 auto;/);
});

test("supplier product actions align left and wrap without mobile overflow", () => {
  const source = sourceFor("src/components/supplier-shell/supplier-products-page.tsx");
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");

  assert.match(
    source,
    /className=\{`\$\{styles\.pageActions\} \$\{styles\.productPageActions\}`\}/,
  );
  assert.match(
    cssRuleBlock(styles, [".productPageActions"]),
    /justify-content:\s*flex-start\s*;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 560px\)\s*\{[\s\S]*?\.productPageActions > button\s*\{[\s\S]*?flex:\s*1 1 160px;[\s\S]*?min-width:\s*0;/,
  );
});

test("backend compact actions use one neutral toolbar button", () => {
  const component = sourceFor("src/components/backend-ui/backend-toolbar-button.tsx");
  assert.match(component, /export function BackendToolbarButton/);
  assert.match(component, /variant="outline"/);
  assert.match(component, /styles\.toolbarButton/);

  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
    "src/components/ops-shell/api-keys-page.tsx",
    "src/components/ops-shell/supplier-accounts-page.tsx",
    "src/components/ops-shell/supplier-management-page.tsx",
  ]) {
    assert.match(sourceFor(relativePath), /BackendToolbarButton/, relativePath);
  }
});

test("backend action columns distinguish compact menus from wide text actions", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const categoryManagement = sourceFor("src/components/ops-shell/category-manage-drawer.tsx");
  assert.match(styles, /\.compactActionColumn/);
  assert.match(styles, /\.wideActionColumn/);
  assert.doesNotMatch(styles, /inset 0 -1px 0 var\(--border-separator\)/);
  assert.match(categoryManagement, /styles\.actionColumnTable\} \$\{styles\.wideActionColumn/);
  assert.doesNotMatch(categoryManagement, /compactActionColumn/);

  for (const relativePath of [
    "src/components/ops-shell/leads-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
    "src/components/ops-shell/api-keys-page.tsx",
    "src/components/ops-shell/supplier-accounts-page.tsx",
    "src/components/ops-shell/shopify-config-page.tsx",
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-leads-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    assert.match(sourceFor(relativePath), /compactActionColumn/, relativePath);
  }
});

test("backend tables keep one row divider and no action-column seam or fade", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const tableFade = cssRuleBlock(styles, [".tableWrapper::after"]);
  const actionColumn = cssRuleBlock(styles, [
    ".actionColumnTable > thead > tr > th:last-child",
    ".actionColumnTable > tbody > tr:not(.productSkuExpansionRow) > td:last-child",
  ]);
  const compactActionColumn = cssRuleBlock(styles, [
    ".compactActionColumn > thead > tr > th:last-child",
    ".compactActionColumn > tbody > tr:not(.productSkuExpansionRow) > td:last-child",
  ]);
  const darkActionColumn = cssRuleBlock(styles, [
    ":global(.dark) .actionColumnTable > thead > tr > th:last-child",
    ":global(.dark) .actionColumnTable > tbody > tr:not(.productSkuExpansionRow) > td:last-child",
  ]);

  assert.match(tableFade, /display:\s*none\s*;/);
  assert.doesNotMatch(styles, /linear-gradient\(90deg[^)]*var\(--bg-card\)/);
  assert.match(actionColumn, /border-left:\s*0\s*;/);
  assert.match(actionColumn, /box-shadow:\s*none\s*;/);
  assert.match(compactActionColumn, /box-shadow:\s*none\s*;/);
  assert.doesNotMatch(compactActionColumn, /inset\b/);
  assert.match(darkActionColumn, /border-left:\s*0\s*;/);
  assert.match(darkActionColumn, /box-shadow:\s*none\s*;/);
  assert.match(
    cssRuleBlock(supplierStyles, [".supplierTableScrollArea::after"]),
    /background:\s*transparent\s*;/,
  );
});

test("all backend tables inherit the operations-leads typography and neutral controls", () => {
  const sharedStyles = sourceFor("src/components/backend-ui/backend-ui.module.css");
  const opsStyles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const statusBadge = cssRuleBlock(sharedStyles, [".statusBadge"]);
  const dataCells = cssRuleBlock(opsStyles, [".dataTable td"]);
  const dataContent = cssRuleBlock(opsStyles, [
    ".dataTable td strong",
    ".dataTable td span",
    ".dataTable td code",
    ".dataTable td a",
    ".dataTable td button",
  ]);
  const dashboardHeaders = cssRuleBlock(opsStyles, [".dashboardTable th"]);
  const dashboardCells = cssRuleBlock(opsStyles, [".dashboardTable td"]);
  const opsShellHeaders = cssRuleBlock(opsStyles, [
    '.opsShell :global([data-slot="table-head"])',
  ]);
  const opsShellCells = cssRuleBlock(opsStyles, [
    '.opsShell :global([data-slot="table-cell"])',
  ]);
  const supplierShellHeaders = cssRuleBlock(supplierStyles, [
    '.supplierShell :global([data-slot="table-head"])',
  ]);
  const supplierShellCells = cssRuleBlock(supplierStyles, [
    '.supplierShell :global([data-slot="table-cell"])',
  ]);
  const overviewCells = cssRuleBlock(supplierStyles, [
    '.overviewLeadTable :global([data-slot="table-cell"])',
  ]);
  const overviewHeaders = cssRuleBlock(supplierStyles, [
    '.overviewLeadTable :global([data-slot="table-head"])',
  ]);
  const tableAction = cssRuleBlock(opsStyles, [".tableActionButton"]);

  for (const block of [dataCells, dashboardCells, opsShellCells, supplierShellCells, overviewCells]) {
    assert.match(block, /color:\s*var\(--text-secondary\)\s*!important|color:\s*var\(--text-secondary\)\s*;/);
    assert.match(block, /font-size:\s*12px\s*!important|font-size:\s*12px\s*;/);
    assert.match(block, /font-weight:\s*400\s*!important|font-weight:\s*400\s*;/);
    assert.match(block, /text-align:\s*left\s*!important/);
  }
  for (const block of [dashboardHeaders, opsShellHeaders, supplierShellHeaders, overviewHeaders]) {
    assert.match(block, /color:\s*var\(--text-tertiary\)\s*!important/);
    assert.match(block, /font-size:\s*12px\s*!important/);
    assert.match(block, /font-weight:\s*600\s*!important/);
    assert.match(block, /text-align:\s*left\s*!important/);
  }
  assert.match(dataContent, /color:\s*var\(--text-secondary\)\s*!important/);
  assert.match(dataContent, /font-size:\s*12px\s*!important/);
  assert.match(dataContent, /font-weight:\s*400\s*!important/);
  assert.match(statusBadge, /--tone:\s*var\(--status-neutral\)\s*;/);
  assert.match(statusBadge, /border-radius:\s*26px\s*;/);
  assert.match(statusBadge, /font-size:\s*12px\s*;/);
  assert.match(statusBadge, /font-weight:\s*400\s*;/);
  assert.match(statusBadge, /min-height:\s*20px\s*;/);
  assert.match(tableAction, /border-radius:\s*8px\s*!important\s*;/);
  assert.match(tableAction, /font-size:\s*12px\s*!important\s*;/);
  assert.match(tableAction, /font-weight:\s*400\s*!important\s*;/);
  assert.match(tableAction, /min-height:\s*28px\s*!important\s*;/);
  assert.doesNotMatch(sharedStyles, /\.statusBadge\[data-tone="(?:info|success|warning|danger)"\]\s*\{\s*--tone:\s*var\(--status-(?:info|success|warning|danger)\)/);
  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.match(
      source,
      /<Table className=\{`\$\{styles\.dataTable\} \$\{styles\.productSpecEditorTable\}`\} style=\{\{ width: "100%", borderCollapse: "collapse" \}\}>/,
      relativePath,
    );
    assert.doesNotMatch(source, /<Table style=\{\{ width: "100%", borderCollapse: "collapse", fontSize: 13 \}\}>/);
  }
});

test("all backend tables share one neutral hover and one column spacing rhythm", () => {
  const opsStyles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const tokenPattern = /--table-row-hover:\s*var\(--bg-hover\)\s*;[\s\S]*--table-cell-inline:\s*12px\s*;[\s\S]*--table-edge-inline:\s*20px\s*;[\s\S]*--table-head-block:\s*10px\s*;[\s\S]*--table-cell-block:\s*11px\s*;/;

  assert.match(cssRuleBlock(opsStyles, [".opsShell"]), tokenPattern);
  assert.match(cssRuleBlock(supplierStyles, [".supplierShell"]), tokenPattern);

  for (const block of [
    cssRuleBlock(opsStyles, [".dataTable th"]),
    cssRuleBlock(opsStyles, ['.opsShell :global([data-slot="table-head"])']),
    cssRuleBlock(supplierStyles, ['.supplierShell :global([data-slot="table-head"])']),
    cssRuleBlock(supplierStyles, ['.overviewLeadTable :global([data-slot="table-head"])']),
  ]) {
    assert.match(block, /padding:\s*var\(--table-head-block\) var\(--table-cell-inline\)/);
  }

  for (const block of [
    cssRuleBlock(opsStyles, [".dataTable td"]),
    cssRuleBlock(opsStyles, [".dashboardTable td"]),
    cssRuleBlock(opsStyles, ['.opsShell :global([data-slot="table-cell"])']),
    cssRuleBlock(supplierStyles, ['.supplierShell :global([data-slot="table-cell"])']),
    cssRuleBlock(supplierStyles, ['.overviewLeadTable :global([data-slot="table-cell"])']),
  ]) {
    assert.match(block, /padding:\s*var\(--table-cell-block\) var\(--table-cell-inline\)/);
  }

  assert.match(cssRuleBlock(opsStyles, [".dashboardTable th"]), /padding:\s*var\(--table-head-block\) var\(--table-cell-inline\)/);
  assert.match(
    cssRuleBlock(opsStyles, [".dataTable th:first-child", ".dataTable td:first-child"]),
    /padding-left:\s*var\(--table-edge-inline\)\s*!important\s*;/,
  );
  assert.match(
    cssRuleBlock(opsStyles, [".dataTable th:last-child", ".dataTable td:last-child"]),
    /padding-right:\s*var\(--table-edge-inline\)\s*;/,
  );

  for (const block of [
    cssRuleBlock(opsStyles, [".dataTable tbody tr:hover td"]),
    cssRuleBlock(opsStyles, [".dataTable tbody tr:hover td:first-child"]),
    cssRuleBlock(opsStyles, [".actionColumnTable > tbody > tr:not(.productSkuExpansionRow):hover > td:last-child"]),
    cssRuleBlock(opsStyles, [".dashboardTable tbody tr:hover td"]),
    cssRuleBlock(opsStyles, [".productSkuTable > tbody > tr:hover"]),
    cssRuleBlock(supplierStyles, [".supplierListCard .supplierLeadTable tbody tr:hover td:last-child"]),
    cssRuleBlock(supplierStyles, ['.overviewLeadTable :global([data-slot="table-body"] [data-slot="table-row"]:hover)']),
  ]) {
    assert.match(block, /background:\s*var\(--table-row-hover\)\s*!important\s*;|background:\s*var\(--table-row-hover\)\s*;/);
  }

  assert.match(
    cssRuleBlock(opsStyles, [":global(.dark) .dataTable tr:hover td"]),
    /background:\s*var\(--table-row-hover\)\s*;/,
  );
  assert.match(
    cssRuleBlock(opsStyles, [":global(.dark) .actionColumnTable > tbody > tr:not(.productSkuExpansionRow):hover > td:last-child"]),
    /background:\s*var\(--table-row-hover\)\s*;/,
  );
  assert.match(
    cssRuleBlock(supplierStyles, [':global(.dark) .overviewLeadTable :global([data-slot="table-body"] [data-slot="table-row"]:hover)']),
    /background:\s*var\(--table-row-hover\)\s*;/,
  );

  assert.doesNotMatch(cssRuleBlock(opsStyles, [".dataTable tbody tr:hover td"]), /bg-accent|189,\s*255,\s*0/);
  assert.doesNotMatch(cssRuleBlock(supplierStyles, ['.overviewLeadTable :global([data-slot="table-body"] [data-slot="table-row"]:hover)']), /244,\s*247,\s*235|bg-accent/);

  const tableComponentDirectories = [
    "src/components/ops-shell",
    "src/components/supplier-shell",
  ];
  const tableDeclarations = [];

  for (const directory of tableComponentDirectories) {
    const absoluteDirectory = path.join(frontendRoot, directory);
    for (const fileName of fs.readdirSync(absoluteDirectory).filter((name) => name.endsWith(".tsx"))) {
      const relativePath = path.join(directory, fileName);
      const source = sourceFor(relativePath);
      for (const [index, line] of source.split("\n").entries()) {
        if (!line.includes("<Table className=")) continue;
        tableDeclarations.push(`${relativePath}:${index + 1}`);
        assert.match(
          line,
          /(?:dataTable|dashboardTable|overviewLeadTable)/,
          `${relativePath}:${index + 1} must use a canonical backend table class`,
        );
      }
    }
  }

  assert.ok(tableDeclarations.length >= 20, "Expected to audit every backend table declaration");
  const inventoryLogsPage = sourceFor("src/components/ops-shell/inventory-logs-page.tsx");
  assert.match(
    inventoryLogsPage,
    /<Table className=\{`\$\{styles\.dataTable\} \$\{styles\.inventoryLogsTable\}`\}>/,
  );
  assert.match(inventoryLogsPage, /<SortButton label="ID" ordering=\{ordering\} showIndicator=\{false\}/);
  const supplierManagementPage = sourceFor("src/components/ops-shell/supplier-management-page.tsx");
  assert.match(supplierManagementPage, /<SortButton label="ID" ordering=\{ordering\} showIndicator=\{false\}/);
  const supplierInventoryLogsPage = sourceFor("src/components/supplier-shell/supplier-inventory-logs-page.tsx");
  assert.match(
    supplierInventoryLogsPage,
    /<Table className=\{`\$\{opsStyles\.dataTable\} \$\{opsStyles\.supplierInventoryLogsTable\}`\}>/,
  );
  assert.doesNotMatch(supplierInventoryLogsPage, /singleActionTable/);
  assert.doesNotMatch(supplierInventoryLogsPage, /<TableHead style=\{\{ (?:minWidth|width):/);
  assert.match(
    sourceFor("src/components/ops-shell/inventory-logs-drawer.tsx"),
    /<Table className=\{`\$\{styles\.dataTable\} \$\{styles\.inventoryLogsDrawerTable\}`\}>/,
  );

  const inventoryTableFoundation = cssRuleBlock(opsStyles, [
    ".inventoryLogsTable",
    ".supplierInventoryLogsTable",
    ".inventoryLogsDrawerTable",
  ]);
  assert.match(inventoryTableFoundation, /table-layout:\s*fixed\s*;/);
  assert.match(inventoryTableFoundation, /width:\s*100%\s*;/);
  assert.match(cssRuleBlock(opsStyles, [".inventoryLogsTable"]), /min-width:\s*1080px\s*;/);
  assert.match(cssRuleBlock(opsStyles, [".supplierInventoryLogsTable"]), /min-width:\s*1000px\s*;/);
  assert.match(opsStyles, /\.inventoryLogsDrawerTable\s*\{\s*min-width:\s*800px\s*;/);

  for (const [selector, width, unit] of [
    [".inventoryLogsTable > thead > tr > th:nth-child(1)", 5, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(2)", 11, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(3)", 17, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(4)", 7, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(5)", 6, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(6)", 21, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(7)", 13, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(8)", 9, "%"],
    [".inventoryLogsTable > thead > tr > th:nth-child(9)", 11, "%"],
    [".supplierInventoryLogsTable > thead > tr > th:nth-child(2)", 136, "px"],
    [".supplierInventoryLogsTable > thead > tr > th:nth-child(3)", 80, "px"],
    [".supplierInventoryLogsTable > thead > tr > th:nth-child(4)", 64, "px"],
  ]) {
    assert.match(cssRuleBlock(opsStyles, [selector]), new RegExp(`width:\\s*${width}${unit}\\s*;`));
  }

  assert.doesNotMatch(opsStyles, /\.supplierInventoryLogsTable\s*>\s*thead\s*>\s*tr\s*>\s*th:nth-child\(5\)\s*\{/);
});

test("backend table content uses the full semantic column width before truncating", () => {
  const truncatedCell = sourceFor("src/components/ops-shell/truncated-cell.tsx");
  const opsStyles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  assert.doesNotMatch(truncatedCell, /maxWidth\?:\s*number/);
  assert.doesNotMatch(truncatedCell, /min\(\$\{maxWidth\}px,\s*100%\)/);
  assert.match(truncatedCell, /maxWidth:\s*"100%"/);
  assert.match(truncatedCell, /minWidth:\s*0/);
  assert.match(truncatedCell, /width:\s*"100%"/);

  for (const directory of ["src/components/ops-shell", "src/components/supplier-shell"]) {
    const absoluteDirectory = path.join(frontendRoot, directory);
    for (const fileName of fs.readdirSync(absoluteDirectory).filter((name) => name.endsWith(".tsx"))) {
      assert.doesNotMatch(
        sourceFor(path.join(directory, fileName)),
        /<TruncatedCell[^>]*maxWidth=/,
        `${directory}/${fileName} must let the semantic table column control truncation`,
      );
    }
  }

  for (const block of [
    cssRuleBlock(opsStyles, [".dataTable td"]),
    cssRuleBlock(opsStyles, [".dashboardTable td"]),
    cssRuleBlock(supplierStyles, ['.overviewLeadTable :global([data-slot="table-cell"])']),
  ]) {
    assert.doesNotMatch(block, /max-width:\s*\d+px\s*;/);
    assert.match(block, /min-width:\s*0\s*;/);
    assert.match(block, /overflow:\s*hidden\s*;/);
    assert.match(block, /text-overflow:\s*ellipsis\s*;/);
  }
});

test("backend action columns stop at top-level table rows", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const uncommentedStyles = styles.replace(/\/\*[\s\S]*?\*\//g, "");
  const mobileStyles = uncommentedStyles.slice(
    uncommentedStyles.indexOf("@media (max-width: 920px)"),
    uncommentedStyles.indexOf("@media (max-width: 560px)"),
  );

  cssRuleBlock(styles, [
    ".actionColumnTable > thead > tr > th:last-child",
    ".actionColumnTable > tbody > tr:not(.productSkuExpansionRow) > td:last-child",
  ]);
  cssRuleBlock(styles, [
    ".actionColumnTable > tbody > tr:not(.productSkuExpansionRow):hover > td:last-child",
  ]);
  cssRuleBlock(styles, [
    ".actionColumnTable > tbody > tr:not(.productSkuExpansionRow) > td:last-child .actionButtons",
  ]);
  cssRuleBlock(styles, [
    ".actionColumnTable > tbody > tr:not(.productSkuExpansionRow) > td:last-child > *",
  ]);

  assert.match(styles, /:global\(\.dark\) \.actionColumnTable > thead > tr > th:last-child/);
  assert.match(styles, /:global\(\.dark\) \.actionColumnTable > tbody > tr:not\(\.productSkuExpansionRow\) > td:last-child/);
  assert.match(styles, /:global\(\.dark\) \.actionColumnTable > tbody > tr:not\(\.productSkuExpansionRow\):hover > td:last-child/);
  assert.match(mobileStyles, /\.actionColumnTable > thead > tr > th:last-child/);
  assert.match(mobileStyles, /\.actionColumnTable > tbody > tr:not\(\.productSkuExpansionRow\) > td:last-child/);

  for (const broadSelector of [
    /\.actionColumnTable\s+th:last-child/,
    /\.actionColumnTable\s+td:last-child/,
    /\.actionColumnTable\s+thead\b/,
    /\.actionColumnTable\s+tbody\b/,
  ]) {
    assert.doesNotMatch(uncommentedStyles, broadSelector, broadSelector.source);
  }
});

test("every backend table declares a semantic column-width contract", () => {
  const opsStyles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const semanticTableClass = /(?:apiKeysTable|categoryTable|contactLogsTable|importPreviewTable|inquiryDataTable|inventoryLogsDrawerTable|inventoryLogsTable|supplierInventoryLogsTable|opsAggregatedLeadsTable|dashboard(?:Leads|Inquiries|Contacts|Products)Table|productTrashTable|productDataTable|productSkuTable|productSpecEditorTable|shopifyConfigTable|supplierAccountsTable|supplierManagementTable|supplierContactLogTable|supplierLeadTable|overviewLeadTable)/;
  const tableDeclarations = [];

  for (const directory of ["src/components/ops-shell", "src/components/supplier-shell"]) {
    const absoluteDirectory = path.join(frontendRoot, directory);
    for (const fileName of fs.readdirSync(absoluteDirectory).filter((name) => name.endsWith(".tsx"))) {
      const relativePath = path.join(directory, fileName);
      const source = sourceFor(relativePath);
      for (const [index, line] of source.split("\n").entries()) {
        if (!line.includes("<Table className=")) continue;
        tableDeclarations.push(`${relativePath}:${index + 1}`);
        assert.match(
          line,
          semanticTableClass,
          `${relativePath}:${index + 1} must declare its semantic width contract`,
        );
      }
    }
  }

  assert.equal(tableDeclarations.length, 27);
  assert.match(
    cssRuleBlock(opsStyles, [".opsShell"]),
    /--table-col-id:\s*72px\s*;[\s\S]*--table-col-number:\s*80px\s*;[\s\S]*--table-col-status:\s*104px\s*;[\s\S]*--table-col-date:\s*132px\s*;[\s\S]*--table-col-action:\s*72px\s*;[\s\S]*--table-col-short:\s*112px\s*;[\s\S]*--table-col-medium:\s*144px\s*;[\s\S]*--table-col-long:\s*192px\s*;[\s\S]*--table-col-content:\s*240px\s*;/,
  );
  assert.match(
    cssRuleBlock(supplierStyles, [".supplierShell"]),
    /--table-col-id:\s*72px\s*;[\s\S]*--table-col-content:\s*240px\s*;/,
  );
  assert.match(
    cssRuleBlock(opsStyles, [
      ".apiKeysTable",
      ".categoryTable",
      ".importPreviewTable",
      ".inquiryDataTable",
      ".shopifyConfigTable",
      ".supplierAccountsTable",
      ".supplierManagementTable",
      ".productTrashTable",
      ".productSpecEditorTable",
    ]),
    /table-layout:\s*fixed\s*;[\s\S]*width:\s*100%\s*;/,
  );
  assert.match(cssRuleBlock(opsStyles, [".apiKeysTable"]), /min-width:\s*1100px\s*;/);
  assert.match(cssRuleBlock(opsStyles, [".supplierAccountsTable"]), /min-width:\s*1180px\s*;/);
  assert.match(cssRuleBlock(opsStyles, [".supplierManagementTable"]), /min-width:\s*1200px\s*;/);
  assert.match(opsStyles, /\.productSpecEditorTable\s*\{\s*min-width:\s*100%\s*!important\s*;/);
  assert.match(
    cssRuleBlock(supplierStyles, [
      '.overviewLeadTable :global([data-slot="table-head"]:nth-child(1))',
      '.overviewLeadTable :global([data-slot="table-cell"]:nth-child(1))',
    ]),
    /width:\s*40%\s*;/,
  );
});

test("product tables expose compact top-level columns without styling nested SKU tables", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");

  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.match(source, /const PRODUCT_COL_COUNT = 6;/, relativePath);
    assert.match(source, /styles\.productDataTable/, relativePath);
    assert.match(source, /className=\{styles\.productNameCell\}/, relativePath);
    assert.match(source, /className=\{styles\.productExpandableRow\}/, relativePath);
    assert.match(source, /data-expanded=\{expanded \? "true" : undefined\}/, relativePath);
    assert.match(source, /if \(!target\.closest\("button, a, input, select, textarea"\)\) toggleExpand\(product\);/, relativePath);
    assert.match(source, /expanded \? <ChevronUp size=\{14\} aria-hidden="true" \/> : <ChevronRightIcon size=\{14\} aria-hidden="true" \/>/, relativePath);
    assert.doesNotMatch(source, /<ChevronDown size=\{14\} aria-hidden="true" \/>/, relativePath);
    assert.doesNotMatch(source, /style=\{\{ opacity: product\.status/, relativePath);
    assert.match(source, /styles\.productDataTable\} \$\{styles\.actionColumnTable\} \$\{styles\.compactActionColumn/, relativePath);
    assert.match(source, /styles\.actionColumnTable\} \$\{styles\.wideActionColumn/, relativePath);
    assert.doesNotMatch(source, /styles\.productSkuTable\} \$\{styles\.(?:actionColumnTable|compactActionColumn)/, relativePath);
    assert.match(source, /<TableHead className=\{styles\.productSkuCodeColumn\}>/, relativePath);
    assert.match(source, /<TableCell className=\{styles\.productSkuCodeColumn\}>/, relativePath);
    assert.match(source, /<TableHead className=\{styles\.productSkuMoqColumn\}>/, relativePath);
    assert.match(source, /<TableCell className=\{styles\.productSkuMoqColumn\}>\{sku\.moq\}<\/TableCell>/, relativePath);
    assert.match(source, /<TableHead className=\{styles\.productSkuActionColumn\}>/, relativePath);
    assert.match(source, /<TableCell className=\{styles\.productSkuActionColumn\}>/, relativePath);

    const productRowsStart = source.indexOf("const rows = [");
    const productRowsEnd = source.indexOf("if (expanded)", productRowsStart);
    const productRow = source.slice(productRowsStart, productRowsEnd);
    assert.ok(productRowsStart > -1 && productRowsEnd > productRowsStart, relativePath);
    assert.doesNotMatch(productRow, /BackendRowActions/, relativePath);
    assert.match(productRow, /onClick=\{\(\) => openProductEdit\(product\)\}/, relativePath);
    assert.match(productRow, /styles\.contactLogIconAction/, relativePath);
    assert.match(productRow, /<Pencil aria-hidden="true" \/>/, relativePath);
    assert.match(productRow, /<Trash2 aria-hidden="true" \/>/, relativePath);
  }
  assert.match(styles, /\.productDataTable\s*\{[\s\S]*?min-width:\s*max\(100%,\s*800px\);/);
  assert.match(cssRuleBlock(styles, [".productExpandableRow"]), /cursor:\s*pointer\s*;/);
  for (const [column, width] of [[1, "26%"], [2, "25%"], [3, "12%"], [4, "14%"], [5, "13%"]]) {
    const columnBlock = cssRuleBlock(styles, [
      `.productDataTable > thead > tr > th:nth-child(${column})`,
      `.productDataTable > tbody > tr:not(.productSkuExpansionRow) > td:nth-child(${column})`,
    ]);
    assert.match(columnBlock, new RegExp(`width:\\s*${width.replace("%", "\\%") }\\s*;`));
  }
  const actionColumn = cssRuleBlock(styles, [
    ".productDataTable > thead > tr > th:nth-child(6)",
    ".productDataTable > tbody > tr:not(.productSkuExpansionRow) > td:nth-child(6)",
  ]);
  assert.match(actionColumn, /min-width:\s*88px\s*!important\s*;/);
  assert.match(actionColumn, /width:\s*88px\s*!important\s*;/);
  assert.match(styles, /\.compactActionColumn > tbody > tr:not\(\.productSkuExpansionRow\) > td:last-child/);
  assert.match(styles, /\.productDataTable > tbody > \.productSkuExpansionRow > \.productSkuExpansionCell\s*\{[^}]*border-left:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;/);
  assert.match(cssRuleBlock(styles, [".productSkuPanelHeader"]), /justify-content:\s*flex-start\s*;/);
  assert.match(cssRuleBlock(styles, [".productSkuPanelHeader"]), /padding:\s*0 12px 0 20px\s*;/);
  const skuContainer = cssRuleBlock(styles, ['.productSkuExpansionCell > :global([data-slot="table-container"])']);
  assert.match(skuContainer, /border-radius:\s*10px\s*;/);
  assert.match(skuContainer, /box-shadow:\s*none\s*!important\s*;/);
  const skuTable = cssRuleBlock(styles, [".productSkuTable"]);
  assert.match(skuTable, /border:\s*0\s*;/);
  assert.match(skuTable, /box-shadow:\s*none\s*!important\s*;/);
  assert.match(skuTable, /min-width:\s*max\(100%,\s*840px\)\s*;/);
  assert.match(styles, /\.productSkuExpansionRow:has\(\[aria-expanded="true"\]\)/);
  assert.match(cssRuleBlock(styles, [".productSkuTable > tbody > tr:hover"]), /background:\s*var\(--table-row-hover\)\s*!important\s*;/);
  assert.match(cssRuleBlock(styles, [".productSkuCodeColumn"]), /width:\s*152px\s*!important\s*;/);
  assert.match(cssRuleBlock(styles, [".productSkuMoqColumn"]), /width:\s*64px\s*!important\s*;/);
  assert.match(cssRuleBlock(styles, [".productSkuActionColumn"]), /width:\s*76px\s*!important\s*;/);
  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 920px)"));
  const mobileSkuTable = cssRuleBlock(mobileStyles, [".productSkuTable"]);
  assert.match(mobileSkuTable, /table-layout:\s*auto\s*;/);
  assert.match(mobileSkuTable, /width:\s*max-content\s*;/);
  assert.doesNotMatch(styles, /\.productDataTable th:nth-child\(/);
});

test("product edit and delete icons preserve the existing data endpoints", () => {
  const cases = [
    ["src/components/ops-shell/products-page.tsx", "/api/internal/products/"],
    ["src/components/supplier-shell/supplier-products-page.tsx", "/api/supplier/products/"],
  ];

  for (const [relativePath, endpoint] of cases) {
    const source = sourceFor(relativePath);
    const helperStart = source.indexOf("function openProductEdit(product: ProductItem)");
    const helperEnd = source.indexOf("function openEdit(product: ProductItem, sku: SkuItem)", helperStart);
    const helper = source.slice(helperStart, helperEnd);
    assert.ok(helperStart > -1 && helperEnd > helperStart, relativePath);
    assert.ok(helper.includes(`fetch(\`${endpoint}\${product.id}/\``), relativePath);
    assert.match(helper, /setProductEditTarget\(product\)/, relativePath);
    assert.match(helper, /setProductEditSpec\(/, relativePath);
  }
});

test("backend edit and delete controls share one restrained hover motion", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const motionClasses = [
    ".actionDeleteBtn",
    ".actionEditBtn",
    ".categoryTreeActionBtn",
    ".contactLogIconAction",
    ".tableActionButton",
    ".tableActionDanger",
  ];

  for (const selector of motionClasses) {
    const block = cssRuleBlock(styles, [selector]);
    assert.match(block, /transform 150ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/, selector);
  }

  for (const [selector, scale] of [
    [".actionDeleteBtn:hover:not(:disabled)", "1.02"],
    [".actionEditBtn:hover:not(:disabled)", "1.02"],
    [".categoryTreeActionBtn:hover:not(:disabled)", "1.04"],
    [".contactLogIconAction:hover:not(:disabled)", "1.04"],
    [".tableActionButton:hover:not(:disabled)", "1.02"],
    [".tableActionDanger:hover:not(:disabled)", "1.04"],
  ]) {
    const block = cssRuleBlock(styles, [selector]);
    assert.match(block, /box-shadow:\s*0 4px 10px rgba\(31, 34, 27, 0\.1\)\s*;/, selector);
    assert.match(block, new RegExp(`transform:\\s*translateY\\(-1px\\) scale\\(${scale.replace(".", "\\.")}\\)\\s*;`), selector);
  }

  const reducedMotion = styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reducedMotion, /\.contactLogIconAction,[\s\S]*?\.tableActionDanger\s*\{[\s\S]*?transition-duration:\s*0\.01ms\s*!important\s*;/);
  assert.match(reducedMotion, /\.contactLogIconAction:hover:not\(:disabled\),[\s\S]*?\.tableActionDanger:hover:not\(:disabled\)\s*\{[\s\S]*?transform:\s*none\s*!important\s*;/);

  for (const relativePath of [
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.match(source, /className=\{styles\.contactLogIconAction\}/, relativePath);
    assert.match(source, /<Pencil\b/, relativePath);
    assert.match(source, /<Trash2\b/, relativePath);
  }
});

test("backend shared data stylesheet omits deleted page-header rules and keeps dark toolbar tokens", () => {
  const sharedStyles = sourceFor("src/components/backend-ui/backend-ui.module.css");
  for (const className of ["pageHeader", "pageHeading", "pageTitleRow", "pageMeta", "pageActions", "scopeBadge"]) {
    assert.doesNotMatch(sharedStyles, new RegExp(`\\.${className}\\b`), className);
  }

  for (const [relativePath, shellClass] of [
    ["src/components/ops-shell/ops-shell.module.css", "opsShell"],
    ["src/components/supplier-shell/supplier-shell.module.css", "supplierShell"],
  ]) {
    const styles = sourceFor(relativePath);
    assert.match(styles, new RegExp(`:global\\(\\.dark\\) \\.${shellClass}\\s*\\{[\\s\\S]*?--bg-toolbar-solid:\\s*#111416;`), relativePath);
  }
});

test("Task 6 pages defer their page heading to the shell", () => {
  for (const relativePath of [
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
    "src/components/ops-shell/products-page.tsx",
    "src/components/ops-shell/inventory-logs-page.tsx",
    "src/components/ops-shell/supplier-accounts-page.tsx",
    "src/components/ops-shell/api-keys-page.tsx",
    "src/components/ops-shell/shopify-config-page.tsx",
    "src/components/supplier-shell/supplier-contact-logs-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
    "src/components/supplier-shell/supplier-inventory-logs-page.tsx",
    "src/components/supplier-shell/supplier-settings-page.tsx",
  ]) {
    assert.doesNotMatch(sourceFor(relativePath), /<h2\b/, relativePath);
  }
});

test("active API key and Shopify delete actions remain visible with disabled reasons", () => {
  const rowActions = sourceFor("src/components/backend-ui/backend-row-actions.tsx");
  assert.match(rowActions, /disabled\?: boolean/);
  assert.match(rowActions, /hint\?: string/);
  assert.match(rowActions, /disabled=\{item\.disabled\}/);
  assert.match(rowActions, /item\.hint/);

  const apiKeys = sourceFor("src/components/ops-shell/api-keys-page.tsx");
  assert.match(apiKeys, /disabled: item\.is_active/);
  assert.match(apiKeys, /hint: item\.is_active \? t\("ops\.apiKeysDeleteDisabledHint"\)/);

  const shopify = sourceFor("src/components/ops-shell/shopify-config-page.tsx");
  assert.match(shopify, /disabled: row\.is_active/);
  assert.match(shopify, /hint: row\.is_active \? t\("ops\.shopifyConfigDeleteDisabledHint"\)/);

  for (const locale of ["zh-CN", "en-US"]) {
    assert.match(sourceFor(`src/i18n/${locale}.json`), /"shopifyConfigDeleteDisabledHint"/);
  }
});

test("operations shell separates global context, workspace entry, and account actions", () => {
  const source = sourceFor("src/components/ops-shell/ops-shell.tsx");

  assert.doesNotMatch(source, /<Breadcrumb>/);
  assert.doesNotMatch(source, /BackendPageHeader/);
  assert.match(source, /function OpsWorkspaceMenu\(/);
  assert.match(source, /function OpsAccountMenu\(/);
  assert.match(source, /navigate\("home"\)/);
  assert.match(source, /setSelectedWorkspaceId\(workspaceId\);\s*navigate\("leads"\);/);
  assert.doesNotMatch(source, /className=\{styles\.workspaceActions\}/);
  assert.doesNotMatch(source, /scope=\{scope\}/);

  for (const locale of ["zh-CN", "en-US"]) {
    const copy = JSON.parse(sourceFor(`src/i18n/${locale}.json`));
    assert.equal(typeof copy.ops.enterSupplierBackend, "string");
    assert.equal(typeof copy.ops.returnToAllSuppliers, "string");
    assert.equal(typeof copy.ops.workspaceEntry, "string");
    assert.equal(typeof copy.ops.accountMenu, "string");
  }
});

test("operations scope truth follows supplier-request page boundaries", () => {
  const source = sourceFor("src/components/ops-shell/ops-shell.tsx");
  const supplierScopedPagesMatch = source.match(
    /const supplierScopedPages: ReadonlySet<OpsPageId> = new Set(?:<OpsPageId>)?\(\[([\s\S]*?)\]\);/,
  );

  assert.ok(supplierScopedPagesMatch, "Missing readonly supplier-scoped page set");
  const supplierScopedPages = [
    ...supplierScopedPagesMatch[1].matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);

  assert.deepEqual(supplierScopedPages, [
    "leads",
    "contact-logs",
    "products",
    "inventory-logs",
  ]);
  for (const globalPage of [
    "supplier-accounts",
    "api-keys",
    "shopify-config",
    "supplier-inquiries",
    "buyer-inquiries",
  ]) {
    assert.equal(supplierScopedPages.includes(globalPage), false, globalPage);
  }

  assert.match(
    source,
    /function isSupplierScopedPage\(page: OpsPageId\) \{\s*return supplierScopedPages\.has\(page\);\s*\}/,
  );

  const workspaceMenuSource = source.slice(
    source.indexOf("function OpsWorkspaceMenu("),
    source.indexOf("type OpsAccountMenuProps"),
  );
  assert.match(
    workspaceMenuSource,
    /const triggerLabel = isSupplierScopedPage\(activePage\)\s*\?/,
  );
  assert.doesNotMatch(workspaceMenuSource, /activePage === "home"/);
  assert.doesNotMatch(source, /const scope = \{/);
  assert.match(source, /placement="topbar"/);
});

test("forced desktop mode restores the global shell bar at narrow widths", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");

  assert.match(
    styles,
    /\.opsShell\[data-view-mode="desktop"\] \.globalShellBar\s*\{\s*display: flex !important;\s*\}/,
  );
});

test("workspace menu leaves the sidebar popover and keeps one controlled topbar portal", () => {
  const source = sourceFor("src/components/ops-shell/ops-shell.tsx");

  assert.match(source, /onOpenChange\?: \(open: boolean\) => void;/);
  assert.match(source, /<DropdownMenu onOpenChange=\{onOpenChange\}>/);
  assert.match(source, /const workspaceMenuOpenRef = useRef\(false\);/);
  assert.match(source, /const sidebarPointerInsideRef = useRef\(false\);/);
  assert.match(
    source,
    /const handleSidebarLeave = useCallback\(\(\) => \{[\s\S]*?hoverCloseTimer\.current = window\.setTimeout\(\(\) => \{[\s\S]*?if \(!workspaceMenuOpenRef\.current && !sidebarPointerInsideRef\.current\)/,
  );
  assert.match(
    source,
    /const handleWorkspaceMenuOpenChange = useCallback\(\(open: boolean\) => \{[\s\S]*?workspaceMenuOpenRef\.current = open;[\s\S]*?if \(!open && !sidebarPointerInsideRef\.current\) \{[\s\S]*?hoverCloseTimer\.current = window\.setTimeout/,
  );
  assert.equal(
    (source.match(/onOpenChange=\{handleWorkspaceMenuOpenChange\}/g) ?? []).length,
    1,
  );
  const expandedStart = source.indexOf("{!sidebarCollapsed ? (");
  const collapsedStart = source.indexOf("{sidebarCollapsed && popoverHovered ? (");
  const mobileStart = source.indexOf('<div className={styles.mobileWorkspaceHeader}>');
  const expandedMenuBlock = source.slice(expandedStart, collapsedStart);
  const collapsedMenuBlock = source.slice(collapsedStart, mobileStart);
  assert.doesNotMatch(expandedMenuBlock, /onOpenChange=\{handleWorkspaceMenuOpenChange\}/);
  assert.doesNotMatch(collapsedMenuBlock, /<OpsWorkspaceMenu/);
  assert.match(source.slice(mobileStart), /onOpenChange=\{handleWorkspaceMenuOpenChange\}[\s\S]*?placement="topbar"/);
  assert.doesNotMatch(source, /<DropdownMenu\s+open=/);
});

test("workspace switch triggers use text and a chevron without a leading pictogram", () => {
  const source = sourceFor("src/components/ops-shell/ops-shell.tsx");
  const workspaceMenuSource = source.slice(
    source.indexOf("function OpsWorkspaceMenu("),
    source.indexOf("type OpsAccountMenuProps"),
  );

  assert.doesNotMatch(workspaceMenuSource, /<Store data-icon="inline-start"/);
  assert.match(workspaceMenuSource, /<span>\{triggerLabel\}<\/span>\s*<ChevronDown/);
});

test("supplier account actions split left and right with neutral controls", () => {
  const source = sourceFor("src/components/ops-shell/supplier-accounts-page.tsx");
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const actionRow = source.slice(
    source.indexOf("<div className={`"),
    source.indexOf("<BackendDataSurface"),
  );

  assert.match(actionRow, /styles\.pageActions[\s\S]*?styles\.supplierAccountActions/);
  assert.match(actionRow, /className=\{styles\.supplierAccountFilter\}/);
  assert.match(actionRow, /<Switch[\s\S]*?checked=\{!includeInactive\}/);
  assert.match(actionRow, /onCheckedChange=\{\(checked\) => \{/);
  assert.match(actionRow, /className=\{styles\.supplierAccountFilterToggle\}/);
  assert.match(actionRow, /<BackendToolbarButton[\s\S]*?onClick=\{openCreate\}[\s\S]*?ops\.supplierAccountsCreate/);
  assert.doesNotMatch(source, /type="checkbox"/);
  assert.doesNotMatch(source, /<BackendDataSurface\s+toolbar=/);

  assert.match(
    cssRuleBlock(styles, [".supplierAccountActions"]),
    /justify-content:\s*space-between\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".supplierAccountFilterToggle[data-checked]"]),
    /background:\s*var\(--text-faint\)\s*!important\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, ['.supplierAccountFilterToggle [data-slot="switch-thumb"]']),
    /background:\s*var\(--primary-foreground\)\s*!important\s*;/,
  );
});

test("API key creation uses the same neutral outline action style", () => {
  const source = sourceFor("src/components/ops-shell/api-keys-page.tsx");
  const actionRow = source.slice(
    source.indexOf('<div className={styles.pageActions}>'),
    source.indexOf("<BackendDataSurface"),
  );

  assert.match(
    actionRow,
    /<BackendToolbarButton\s+onClick=\{openCreate\}>[\s\S]*?ops\.apiKeysCreate/,
  );
});

test("operations home uses passive metrics and one four-item action queue", () => {
  const source = sourceFor("src/components/ops-shell/ops-home-dashboard.tsx");

  assert.doesNotMatch(source, /<BackendPageHeader/);
  assert.match(source, /className=\{styles\.dashboardRefreshMeta\}/);
  assert.doesNotMatch(source, /const attentionMetrics =/);
  assert.doesNotMatch(source, /renderAttentionMetrics/);
  assert.doesNotMatch(source, /dashboardAttentionMetrics/);
  assert.doesNotMatch(source, /dashboardMetricButton/);
  assert.match(source, /label: t\("ops\.dashboardMetricApiKeys"\),\s*value: stats\?\.active_api_key_count/);
  assert.match(source, /<ChevronRight[^>]*aria-hidden="true"/);

  const shell = sourceFor("src/components/ops-shell/ops-shell.tsx");
  assert.doesNotMatch(shell, /BackendPageHeader/);
});

test("backend shell chrome stays quiet and unambiguous", () => {
  const source = sourceFor("src/components/ops-shell/ops-shell.tsx");
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");

  assert.match(source, /className=\{styles\.accountMenuTrigger\}/);
  assert.match(source, /<CircleUserRound aria-hidden="true" \/>/);
  assert.match(source, /<ChevronDown[^>]*aria-hidden="true"/);
  assert.doesNotMatch(source, /Breadcrumb/);

  assert.match(cssRuleBlock(styles, [".collapseToggle"]), /border:\s*0\s*;/);
  assert.match(cssRuleBlock(styles, [".sidebarWorkspaceTrigger"]), /border-color:\s*transparent\s*!important\s*;/);
});

test("desktop backend chrome removes page titles and keeps scope controls in the topbar", () => {
  const ops = sourceFor("src/components/ops-shell/ops-shell.tsx");
  const supplier = sourceFor("src/components/supplier-shell/supplier-shell.tsx");

  assert.doesNotMatch(ops, /BackendPageHeader/);
  assert.doesNotMatch(ops, /Breadcrumb/);
  assert.match(ops, /<OpsWorkspaceMenu[\s\S]*?placement="topbar"/);
  assert.doesNotMatch(
    ops.slice(ops.indexOf("<aside"), ops.indexOf("</aside>")),
    /<OpsWorkspaceMenu/,
  );
  assert.doesNotMatch(supplier, /BackendPageHeader/);
  assert.match(supplier, /<div className=\{styles\.workspaceActions\}/);
});

test("supplier desktop topbar uses one compact account menu", () => {
  const supplier = sourceFor("src/components/supplier-shell/supplier-shell.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const accountBlock = supplier.slice(
    supplier.indexOf("type SupplierAccountMenuProps"),
    supplier.indexOf("type SupplierSidebarBodyProps"),
  );
  const desktopTopbar = supplier.slice(
    supplier.indexOf('<div className={styles.workspaceTopbar}>'),
    supplier.indexOf("<SupplierCommandSurface"),
  );

  assert.match(accountBlock, /function SupplierAccountMenu\(/);
  assert.match(accountBlock, /<CircleUserRound aria-hidden="true" \/>/);
  assert.match(accountBlock, /<ChevronDown[^>]*aria-hidden="true"/);
  assert.match(accountBlock, /isSuperuser \? \([\s\S]*?common\.opsManagement/);
  assert.match(accountBlock, /common\.openOfficialSite/);
  assert.match(accountBlock, /<DropdownMenuSeparator \/>/);
  assert.match(accountBlock, /<DropdownMenuItem variant="destructive" onClick=\{onLogout\}>[\s\S]*?common\.logout/);
  assert.doesNotMatch(accountBlock, /toggleTheme|common\.darkMode|common\.lightMode/);

  assert.match(desktopTopbar, /className=\{styles\.languageAction\}[\s\S]*?<SupplierAccountMenu/);
  assert.doesNotMatch(desktopTopbar, /workspaceActionButton|workspaceActionSeparator|<Separator/);

  assert.match(cssRuleBlock(styles, [".accountMenuTrigger"]), /min-width:\s*42px\s*!important\s*;/);
  assert.match(cssRuleBlock(styles, [".accountMenuContent"]), /min-width:\s*220px\s*;/);
});

test("account menu avoids duplicate theme controls and settings use the gear icon", () => {
  const ops = sourceFor("src/components/ops-shell/ops-shell.tsx");
  const accountBlock = ops.slice(
    ops.indexOf("type OpsAccountMenuProps"),
    ops.indexOf("type SidebarBodyProps"),
  );

  assert.doesNotMatch(accountBlock, /onToggleTheme|isDarkTheme|common\.darkMode|common\.lightMode/);
  assert.match(ops, /<Settings size=\{18\} aria-hidden="true" \/>[\s\S]*?opsNav\.settingsGroup/);
});

test("all backend navigation icons inherit the same color as their labels", () => {
  for (const relativePath of [
    "src/components/ops-shell/ops-shell.module.css",
    "src/components/supplier-shell/supplier-shell.module.css",
  ]) {
    const styles = sourceFor(relativePath);
    const block = cssRuleBlock(styles, [".navParent svg", ".navItem svg", ".navItemActive svg"]);
    assert.match(block, /color:\s*currentColor\s*;/);
  }
});

test("mobile backend headers stay as one compact brand and controls row", () => {
  for (const [shellPath, stylesPath, breakpoint] of [
    [
      "src/components/ops-shell/ops-shell.tsx",
      "src/components/ops-shell/ops-shell.module.css",
      920,
    ],
    [
      "src/components/supplier-shell/supplier-shell.tsx",
      "src/components/supplier-shell/supplier-shell.module.css",
      820,
    ],
  ]) {
    const shell = sourceFor(shellPath);
    const styles = sourceFor(stylesPath);
    const headerStart = shell.indexOf('<div className={styles.mobileWorkspaceHeader}>');
    const headerEnd = shell.indexOf('<div className={styles.workspaceTopbar}>', headerStart);
    const mobileHeader = shell.slice(headerStart, headerEnd);
    const mobileStyles = styles.slice(styles.indexOf(`@media (max-width: ${breakpoint}px)`));

    assert.doesNotMatch(mobileHeader, /mobileWorkspaceCopy|\{pageTitle\}|scope\.label/, shellPath);
    assert.doesNotMatch(styles, /\.mobileWorkspaceCopy\b/, stylesPath);
    assert.match(
      cssRuleBlock(mobileStyles, [".mobileWorkspaceHeader"]),
      /gap:\s*8px\s*;[\s\S]*min-height:\s*56px\s*;[\s\S]*padding:\s*4px 8px 4px 12px\s*;/,
      stylesPath,
    );
    assert.match(
      cssRuleBlock(mobileStyles, [".mobileWorkspaceIdentity"]),
      /display:\s*flex\s*;[\s\S]*min-width:\s*0\s*;/,
      stylesPath,
    );
    assert.doesNotMatch(
      mobileStyles,
      /@media \(max-width: 720px\)[\s\S]*?\.mobileWorkspaceHeader\s*\{[^}]*flex-direction:\s*column/,
      stylesPath,
    );
    const compactStyles = styles.slice(styles.indexOf("@media (max-width: 390px)"));
    assert.match(
      cssRuleBlock(compactStyles, [".mobileBrandLogo"]),
      /width:\s*82px\s*;/,
      stylesPath,
    );
    assert.match(
      cssRuleBlock(compactStyles, [".languageAction svg"]),
      /display:\s*none\s*;/,
      stylesPath,
    );
  }
});

test("supplier mobile assistant exposes the requested AI assistant label", () => {
  const shell = sourceFor("src/components/supplier-shell/supplier-shell.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const zh = JSON.parse(sourceFor("src/i18n/zh-CN.json"));
  const en = JSON.parse(sourceFor("src/i18n/en-US.json"));
  const headerStart = shell.indexOf('<div className={styles.mobileWorkspaceHeader}>');
  const headerEnd = shell.indexOf('<div className={styles.workspaceTopbar}>', headerStart);
  const mobileHeader = shell.slice(headerStart, headerEnd);

  assert.match(
    mobileHeader,
    /size="sm"[\s\S]*?className=\{styles\.mobileAssistantAction\}[\s\S]*?<Sparkles[^>]*data-icon="inline-start"[^>]*\/>\s*\{assistantActionLabel\}/,
  );
  assert.equal(zh.supplier.assistantActionLabel, "AI 助理");
  assert.equal(en.supplier.assistantActionLabel, "AI assistant");
  assert.match(
    cssRuleBlock(styles, [".mobileAssistantAction"]),
    /min-width:\s*0\s*!important\s*;[\s\S]*padding:\s*0 10px\s*!important\s*;/,
  );
  const narrowStyles = styles.slice(styles.indexOf("@media (max-width: 340px)"));
  assert.match(cssRuleBlock(narrowStyles, [".mobileBrandLogo"]), /width:\s*76px\s*;/);
  assert.match(cssRuleBlock(narrowStyles, [".mobileAssistantAction svg"]), /display:\s*none\s*;/);
});

test("supplier mobile navigation includes the existing product pages", () => {
  const source = sourceFor("src/components/supplier-shell/supplier-shell.tsx");
  const mobileNavStart = source.indexOf('<nav className={styles.mobileSheetNavigation}');
  const mobileNavEnd = source.indexOf("</nav>", mobileNavStart);
  const mobileNav = source.slice(mobileNavStart, mobileNavEnd);

  assert.ok(mobileNavStart > -1 && mobileNavEnd > mobileNavStart);
  assert.match(
    mobileNav,
    /\[\.\.\.topNavigation, \.\.\.leadNavigation, \.\.\.orderNavigation, \.\.\.productNavigation\]/,
  );
});

test("supplier mobile order summary tiles preserve their card padding", () => {
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  assert.match(
    cssRuleBlock(styles, [".orderSummaryStats"]),
    /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".orderSummaryStats article"]),
    /padding:\s*14px 16px\s*;/,
  );
  const mobileStyles = styles.slice(
    styles.indexOf("@media (max-width: 820px)"),
    styles.indexOf("@media (max-width: 560px)"),
  );
  const genericTileIndex = mobileStyles.indexOf(".cockpitGrid article");
  const orderTileIndex = mobileStyles.indexOf(".orderSummaryStats article");

  assert.ok(genericTileIndex > -1 && orderTileIndex > genericTileIndex);
  assert.match(
    cssRuleBlock(mobileStyles, [".orderSummaryStats article"]),
    /border-bottom:\s*0\s*;[\s\S]*padding:\s*14px 16px\s*;/,
  );
});

test("backend collapsibles and popovers use buffered open and close motion", () => {
  for (const relativePath of [
    "src/components/ops-shell/ops-shell.module.css",
    "src/components/supplier-shell/supplier-shell.module.css",
  ]) {
    const styles = sourceFor(relativePath);
    const children = cssRuleBlock(styles, [".navChildren"]);
    assert.match(children, /max-height:\s*0\s*;/);
    assert.match(children, /transition:[\s\S]*max-height 220ms cubic-bezier/);
    assert.match(styles, /backendDropdownIn 180ms cubic-bezier/);
    assert.match(styles, /backendDropdownOut 140ms ease-in/);
  }
});

test("list pages flatten nested table cards to the leads-page pattern", () => {
  const opsStyles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const opsBlock = cssRuleBlock(opsStyles, [".dataPage .tableWrapper"]);
  const supplierBlock = cssRuleBlock(supplierStyles, [".supplierListCard .supplierDataTableWrapper"]);

  for (const block of [opsBlock, supplierBlock]) {
    assert.match(block, /border:\s*0\s*;/);
    assert.match(block, /border-radius:\s*0\s*;/);
    assert.match(block, /margin-top:\s*0\s*;/);
  }
});

test("operations summary removes the redundant helper sentence", () => {
  assert.doesNotMatch(
    sourceFor("src/components/ops-shell/ops-home-dashboard.tsx"),
    /dashboardBriefDescription/,
  );
});

test("only the page being shown owns the navigation accent rail", () => {
  for (const relativePath of [
    "src/components/ops-shell/ops-shell.module.css",
    "src/components/supplier-shell/supplier-shell.module.css",
  ]) {
    const styles = sourceFor(relativePath);
    assert.match(styles, /\.navItemActive \.navAccent\s*\{/);
    assert.doesNotMatch(styles, /\.navGroupOpen \.navParent \.navAccent\s*,/);
    assert.doesNotMatch(styles, /\.navParentActive \.navAccent\s*,/);
  }
});

test("shared data surfaces use one pagination and spacing system", () => {
  const pagination = sourceFor("src/components/backend-ui/backend-pagination.tsx");
  const sharedStyles = sourceFor("src/components/backend-ui/backend-ui.module.css");
  const opsStyles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const paginationPagePaths = [
    "src/components/ops-shell/api-keys-page.tsx",
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
    "src/components/ops-shell/inventory-logs-drawer.tsx",
    "src/components/ops-shell/inventory-logs-page.tsx",
    "src/components/ops-shell/leads-page.tsx",
    "src/components/ops-shell/products-page.tsx",
    "src/components/ops-shell/shopify-config-page.tsx",
    "src/components/ops-shell/supplier-accounts-page.tsx",
    "src/components/supplier-shell/supplier-contact-logs-page.tsx",
    "src/components/supplier-shell/supplier-inventory-logs-page.tsx",
    "src/components/supplier-shell/supplier-leads-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ];
  let paginationCallCount = 0;

  assert.match(pagination, /getVisiblePages/);
  assert.match(pagination, /onPageChange\?: \(page: number\) => void/);
  assert.match(pagination, /<button[\s\S]*?onClick=\{\(\) => onPageChange\?\.\(item\)\}/);
  assert.match(pagination, /className=\{item === page \? styles\.paginationPageActive : styles\.paginationPage\}[\s\S]*?aria-current=\{item === page \? "page" : undefined\}[\s\S]*?aria-label=\{pageLabel\(item\)\}/);
  assert.match(pagination, /aria-current=\{item === page \? "page" : undefined\}/);
  assert.match(cssRuleBlock(sharedStyles, [".paginationPage", ".paginationPageActive"]), /cursor:\s*default\s*;/);
  assert.doesNotMatch(sharedStyles, /\.paginationPage:hover\s*\{/);
  assert.match(sharedStyles, /\.paginationControls[\s\S]*margin-left:\s*auto\s*;/);
  for (const relativePath of paginationPagePaths) {
    const source = sourceFor(relativePath);
    const paginationCalls = source.match(/<BackendPaginationNumbers[\s\S]*?\/>/g) ?? [];
    paginationCallCount += paginationCalls.length;
    for (const call of paginationCalls) assert.match(call, /onPageChange=\{/, relativePath);
    assert.match(source, /<BackendPageSizeSelect/, relativePath);
    assert.match(source, /onClick=\{\(\) => goPage\(page - 1\)\}/, relativePath);
    assert.match(source, /onClick=\{\(\) => goPage\(page \+ 1\)\}/, relativePath);
  }
  assert.equal(paginationCallCount, 15);
  assert.match(cssRuleBlock(opsStyles, [".emptyText"]), /padding:\s*32px 24px\s*;/);
  assert.match(cssRuleBlock(supplierStyles, [".supplierListCard"]), /padding:\s*0\s*!important\s*;/);
});

test("contact log toolbar and action column follow the site-wide table pattern", () => {
  const source = sourceFor("src/components/ops-shell/contact-logs-page.tsx");
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const searchIndex = source.indexOf("<InputGroup className={styles.searchInputGroup}>");
  const typeIndex = source.indexOf("aria-label={t(\"ops.contactLogsColType\")}");

  assert.ok(searchIndex > -1 && searchIndex < typeIndex, "search should precede filters");
  const tableStart = source.indexOf("styles.contactLogsTable");
  const tableEnd = source.indexOf("</Table>", tableStart);
  const table = source.slice(tableStart, tableEnd);
  assert.ok(tableStart > -1 && tableEnd > tableStart);
  assert.doesNotMatch(table, /SortButton label="ID"/);
  assert.doesNotMatch(table, /contactLogsColLead/);
  assert.doesNotMatch(table, />\{item\.(?:id|ws_lead_id)\}</);

  const headerOrder = [
    "contactLogsColMerchant",
    "contactLogsColType",
    "contactLogsColChannel",
    "contactLogsColParticipants",
    "contactLogsColContent",
    "contactLogsColCreated",
    "apiKeysColActions",
  ].map((key) => table.indexOf(key));
  assert.ok(headerOrder.every((index, position) => index > -1 && (position === 0 || index > headerOrder[position - 1])));

  const sender = table.indexOf("item.email_sender");
  const recipient = table.indexOf("item.email_recipient");
  assert.ok(sender > -1 && sender < recipient);
  assert.match(table, /<ArrowUpRight aria-hidden="true" \/>/);
  assert.match(table, /<ArrowDownLeft aria-hidden="true" \/>/);

  const subject = table.indexOf("item.email_title");
  const content = table.indexOf("item.content");
  assert.ok(subject > -1 && subject < content);
  assert.match(table, /<Heading aria-hidden="true" \/>/);
  assert.match(table, /<AlignLeft aria-hidden="true" \/>/);
  assert.match(table, /<BackendStatusBadge tone="neutral">/);
  assert.doesNotMatch(table, /BackendRowActions/);
  assert.match(table, /<Pencil aria-hidden="true" \/>/);
  assert.match(table, /<Trash2 aria-hidden="true" \/>/);
  assert.doesNotMatch(table, /styles\.actionColumnTable|styles\.compactActionColumn/);
  assert.match(source, /toLocaleDateString\(locale,/);

  const contactTable = cssRuleBlock(styles, [".dataTable.contactLogsTable"]);
  assert.match(contactTable, /min-width:\s*max\(100%,\s*900px\)\s*;/);
  assert.match(contactTable, /table-layout:\s*fixed\s*;/);
  const contactWrapper = cssRuleBlock(styles, [".contactLogsTableWrapper::after"]);
  assert.match(contactWrapper, /display:\s*none\s*;/);
  const contactCells = cssRuleBlock(styles, [".contactLogsTable td"]);
  assert.match(contactCells, /font-size:\s*12px\s*;/);
  assert.match(contactCells, /font-weight:\s*400\s*;/);
  assert.match(contactCells, /height:\s*86px\s*;/);
  const contactTypeDot = cssRuleBlock(styles, [
    ".contactLogsTable .contactLogTypeCell > span > span:first-child",
  ]);
  assert.match(contactTypeDot, /flex-shrink:\s*0\s*;/);
  const contactBody = cssRuleBlock(styles, [".leadInfoRow.contactLogBodyRow span"]);
  assert.match(contactBody, /-webkit-line-clamp:\s*2\s*;/);
  assert.match(contactBody, /white-space:\s*normal\s*;/);
  const contentColumn = cssRuleBlock(styles, [
    ".contactLogsTable th:nth-child(5)",
    ".contactLogsTable td:nth-child(5)",
  ]);
  assert.match(contentColumn, /width:\s*33%\s*;/);
  const actionColumn = cssRuleBlock(styles, [
    ".contactLogsTable th:nth-child(7)",
    ".contactLogsTable td:nth-child(7)",
  ]);
  assert.match(actionColumn, /border-left:\s*0\s*;/);
  assert.match(actionColumn, /box-shadow:\s*none\s*;/);
  assert.match(actionColumn, /width:\s*7%\s*;/);
  const actionButtons = cssRuleBlock(styles, [".actionButtons.contactLogActionButtons"]);
  assert.match(actionButtons, /gap:\s*8px\s*;/);
  assert.match(actionButtons, /justify-content:\s*flex-start\s*;/);
});

test("supplier lead tables mirror operations aggregation without adding unavailable capabilities", () => {
  const leads = sourceFor("src/components/supplier-shell/supplier-leads-page.tsx");
  const contactLogs = sourceFor("src/components/supplier-shell/supplier-contact-logs-page.tsx");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  const leadsTableStart = leads.indexOf("opsStyles.opsAggregatedLeadsTable");
  const leadsTableEnd = leads.indexOf("</Table>", leadsTableStart);
  const leadsTable = leads.slice(leadsTableStart, leadsTableEnd);
  assert.ok(leadsTableStart > -1 && leadsTableEnd > leadsTableStart);
  const leadHeaders = [
    "leadsColMerchantInfo",
    "leadsColCountry",
    "leadsColContactMethods",
    "leadsColTimeline",
    "leadsColStage",
    "leadsColScore",
    "leadsColDetails",
  ].map((key) => leadsTable.indexOf(key));
  assert.ok(leadHeaders.every((index, position) => index > -1 && (position === 0 || index > leadHeaders[position - 1])));
  for (const icon of ["Store", "Building2", "UserRound", "Mail", "WhatsAppIcon", "Phone", "MessageSquareText", "CalendarPlus"]) {
    assert.match(leadsTable, new RegExp(`<${icon}\\b`), icon);
  }
  assert.doesNotMatch(leadsTable, /item\.city/);
  assert.doesNotMatch(leadsTable, /t\("common\.delete"\)/);
  assert.match(leadsTable, /viewContactLogsBtn/);
  assert.doesNotMatch(leads, /method:\s*"(?:POST|PATCH|DELETE)"/);
  assert.match(leads, /fetch\(`\/api\/supplier\/leads\/\?\$\{params\.toString\(\)\}`/);

  const contactTableStart = contactLogs.indexOf("opsStyles.contactLogsTable");
  const contactTableEnd = contactLogs.indexOf("</Table>", contactTableStart);
  const contactTable = contactLogs.slice(contactTableStart, contactTableEnd);
  assert.ok(contactTableStart > -1 && contactTableEnd > contactTableStart);
  const contactHeaders = [
    "contactLogsColMerchant",
    "contactLogsColType",
    "contactLogsColChannel",
    "contactLogsColParticipants",
    "contactLogsColContent",
    "contactLogsColCreated",
  ].map((key) => contactTable.indexOf(key));
  assert.ok(contactHeaders.every((index, position) => index > -1 && (position === 0 || index > contactHeaders[position - 1])));
  assert.doesNotMatch(contactTable, /SortButton|colLeadId|item\.ws_lead_id|apiKeysColActions/);
  assert.doesNotMatch(contactTable, /BackendRowActions|<Pencil\b|<Trash2\b/);
  assert.match(contactTable, /<ArrowUpRight aria-hidden="true" \/>/);
  assert.match(contactTable, /<ArrowDownLeft aria-hidden="true" \/>/);
  assert.match(contactTable, /<Heading aria-hidden="true" \/>/);
  assert.match(contactTable, /<AlignLeft aria-hidden="true" \/>/);
  assert.match(contactTable, /<BackendStatusBadge tone="neutral">/);
  assert.match(contactLogs, /toLocaleDateString\(locale,/);
  assert.doesNotMatch(contactLogs, /method:\s*"(?:POST|PATCH|DELETE)"/);
  assert.match(contactLogs, /fetch\(`\/api\/supplier\/contact-logs\/\?\$\{params\.toString\(\)\}`/);

  const supplierContactTable = cssRuleBlock(supplierStyles, [
    ".supplierListCard .supplierContactLogTable",
  ]);
  assert.match(supplierContactTable, /min-width:\s*max\(100%,\s*900px\)\s*;/);
  assert.match(supplierContactTable, /table-layout:\s*fixed\s*;/);
  assert.match(supplierContactTable, /width:\s*100%\s*;/);
});

test("backend filters and pagination share one interaction and typography baseline", () => {
  const backendStyles = sourceFor("src/components/backend-ui/backend-ui.module.css");
  const opsStyles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  const filterCursor = cssRuleBlock(backendStyles, [
    ".backendCombobox",
    ".backendCombobox :global([data-slot=\"input-group-control\"]:not(:disabled))",
    ".backendCombobox :global([data-slot=\"combobox-trigger\"]:not(:disabled))",
  ]);
  assert.match(filterCursor, /caret-color:\s*transparent\s*;/);
  assert.match(filterCursor, /cursor:\s*pointer\s*!important\s*;/);
  const backendSelectCursor = cssRuleBlock(opsStyles, [
    ".backendSelectTrigger[data-slot=\"select-trigger\"]",
    ".leadsFilterSelectTrigger[data-slot=\"select-trigger\"]",
  ]);
  assert.match(backendSelectCursor, /cursor:\s*pointer\s*;/);
  assert.match(cssRuleBlock(opsStyles, [".formSelect[data-slot=\"select-trigger\"]"]), /cursor:\s*pointer\s*;/);
  assert.match(cssRuleBlock(opsStyles, ["select.formInput"]), /cursor:\s*pointer\s*;/);

  const paginationInfo = cssRuleBlock(opsStyles, [".paginationInfo"]);
  assert.match(paginationInfo, /color:\s*var\(--text-tertiary\)\s*;/);
  assert.match(paginationInfo, /font-size:\s*12px\s*;/);
  assert.match(paginationInfo, /font-weight:\s*400\s*;/);

  const pageSize = cssRuleBlock(opsStyles, [".pageSizeSelect[data-slot=\"select-trigger\"]"]);
  assert.match(pageSize, /color:\s*var\(--text-tertiary\)\s*;/);
  assert.match(pageSize, /font-size:\s*12px\s*;/);
  assert.match(pageSize, /font-weight:\s*400\s*;/);
  const pageSizeValue = cssRuleBlock(opsStyles, [
    ".pageSizeSelect[data-slot=\"select-trigger\"] .backendSelectValue",
  ]);
  assert.match(pageSizeValue, /color:\s*var\(--text-tertiary\)\s*;/);
  assert.match(pageSizeValue, /font-size:\s*12px\s*;/);
  assert.match(pageSizeValue, /font-weight:\s*400\s*;/);

  const pageNumbers = cssRuleBlock(backendStyles, [
    ".paginationPage",
    ".paginationPageActive",
  ]);
  assert.match(pageNumbers, /font-size:\s*12px\s*;/);
  assert.match(pageNumbers, /font-weight:\s*400\s*;/);
  const activePage = cssRuleBlock(backendStyles, [".paginationPageActive"]);
  assert.match(activePage, /color:\s*var\(--text-tertiary\)\s*;/);
  assert.match(activePage, /font-weight:\s*400\s*;/);

  const supplierPagination = cssRuleBlock(supplierStyles, [".paginationBar"]);
  assert.match(supplierPagination, /font-size:\s*12px\s*;/);
  assert.match(supplierPagination, /font-weight:\s*400\s*;/);
  const supplierPaginationButton = cssRuleBlock(supplierStyles, [".paginationBar button"]);
  assert.match(supplierPaginationButton, /color:\s*var\(--text-tertiary\)\s*;/);
  assert.match(supplierPaginationButton, /font-size:\s*12px\s*;/);
  assert.match(supplierPaginationButton, /font-weight:\s*400\s*;/);
});

test("daily summary action rows expose pressed feedback", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const pressedRule = cssRuleBlock(styles, [".dashboardBriefList button:active"]);

  assert.match(pressedRule, /transform:\s*translateY\(1px\)\s*;/);
});

test("supplier AI entry is neutral and its primary trigger lives in shell chrome", () => {
  const shell = sourceFor("src/components/supplier-shell/supplier-shell.tsx");
  const surface = sourceFor("src/components/supplier-shell/supplier-command-surface.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const assistantPageSet = surface.match(
    /const supplierAssistantPages:[\s\S]*?new Set\(\[([\s\S]*?)\]\);/,
  )?.[1] ?? "";

  assert.deepEqual(
    [...assistantPageSet.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
    [
      "overview",
      "leads",
      "contact-logs",
      "supplier-products",
      "supplier-inventory-logs",
      "supplier-settings",
      "orders-summary",
      "orders-detail",
    ],
  );

  assert.match(shell, /const \[assistantOpen, setAssistantOpen\] = useState\(false\)/);
  assert.match(shell, /supplierPageHasAssistant\(activePage\)/);
  assert.match(shell, /import \{ BorderGlow \} from "@\/components\/border-glow"/);
  assert.equal((shell.match(/<BorderGlow/g) ?? []).length, 2);
  assert.equal((shell.match(/\balwaysOn\b/g) ?? []).length, 2);
  assert.match(shell, /className=\{styles\.assistantTopbarAction\}/);
  assert.match(shell, /className=\{styles\.mobileAssistantAction\}/);
  assert.match(
    shell,
    /className=\{styles\.mobileAssistantAction\}[\s\S]*?aria-label=\{assistantActionLabel\}[\s\S]*?title=\{assistantActionLabel\}[\s\S]*?onClick=\{\(\) => setAssistantOpen\(true\)\}[\s\S]*?aria-expanded=\{assistantOpen\}/,
  );
  assert.match(
    shell,
    /className=\{styles\.assistantTopbarAction\}[\s\S]*?onClick=\{\(\) => setAssistantOpen\(true\)\}[\s\S]*?aria-expanded=\{assistantOpen\}/,
  );
  assert.doesNotMatch(shell, /assistantAccentDot/);
  assert.doesNotMatch(styles, /\.assistantAccentDot\b/);
  assert.match(surface, /assistantOpen: boolean/);
  assert.match(surface, /onAssistantOpenChange: \(open: boolean\) => void/);
  assert.doesNotMatch(surface, /className=\{styles\.assistantSheetTrigger\}/);
  assert.doesNotMatch(styles, /\.assistantSheetTrigger\s*\{[^}]*position:\s*fixed/);
  assert.match(styles, /\.chatEntryPanel\s*\{[^}]*border:\s*1px solid var\(--border-subtle\)/);
  const topbar = cssRuleBlock(styles, [".workspaceTopbar"]);
  assert.match(topbar, /margin-top:\s*-12px\s*;/);
  assert.match(topbar, /padding-top:\s*12px\s*;/);
  assert.match(topbar, /position:\s*sticky\s*;/);
  assert.match(topbar, /top:\s*0\s*;/);
});

test("supplier assistant sheet keeps only an accessible hidden title in its header", () => {
  const surface = sourceFor("src/components/supplier-shell/supplier-command-surface.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const layout = surface.slice(
    surface.indexOf("function AssistantSheetLayout("),
    surface.indexOf("export function SupplierCommandSurface"),
  );

  assert.match(
    layout,
    /<SheetHeader className=\{styles\.assistantSheetHeader\}>\s*<SheetTitle className=\{styles\.srOnly\}>\{title\}<\/SheetTitle>\s*<\/SheetHeader>/,
  );
  assert.doesNotMatch(layout, /<SheetDescription/);
  assert.match(
    cssRuleBlock(styles, [".assistantSheetHeader"]),
    /min-height:\s*44px\s*;/,
  );
});

test("supplier AI border light stays edge-only and moves in a smooth continuous orbit", () => {
  const aliasPath = path.join(frontendRoot, "src/components/border-glow.tsx");
  assert.ok(fs.existsSync(aliasPath), "Missing generic BorderGlow alias");

  const alias = sourceFor("src/components/border-glow.tsx");
  const component = sourceFor("src/components/official-border-glow.tsx");
  const styles = sourceFor("src/components/official-border-glow.css");
  const shell = sourceFor("src/components/supplier-shell/supplier-shell.tsx");
  const shellStyles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  assert.deepEqual(
    findForbiddenVisualFiles([
      "frontend/src/components/border-glow.tsx",
      "frontend/src/components/official-border-glow.tsx",
      "frontend/src/components/official-border-glow.css",
    ]),
    [],
  );
  assert.match(alias, /OfficialBorderGlow as BorderGlow/);
  assert.match(component, /export type OfficialBorderGlowProps/);
  assert.match(component, /alwaysOn\?: boolean/);
  assert.match(component, /alwaysOn = false/);
  assert.match(component, /backgroundColor = "#120F17"/);
  assert.match(component, /borderRadius = 28/);
  assert.match(component, /colors = \["#c084fc", "#f472b6", "#38bdf8"\]/);
  assert.match(component, /coneSpread = 25/);
  assert.match(component, /edgeSensitivity = 30/);
  assert.match(component, /fillOpacity = 0\.5/);
  assert.match(component, /glowColor = "40 80 80"/);
  assert.match(component, /glowIntensity = 1(?:\.0)?/);
  assert.match(component, /glowRadius = 40/);
  assert.match(component, /"--edge-proximity":\s*alwaysOn \? "100" : undefined/);
  assert.match(component, /onPointerMove=\{alwaysOn \? undefined : handlePointerMove\}/);
  assert.match(component, /const sweepAngleStart = 110/);
  assert.match(component, /const sweepAngleEnd = 465/);
  assert.match(component, /const sweepInDuration = 1500/);
  assert.match(component, /const sweepOutDuration = 2250/);
  assert.match(component, /const continuousSweepAngle = 360/);
  assert.match(component, /const orbitProgress = \(elapsed % continuousSweepDuration\) \/ continuousSweepDuration/);
  assert.match(component, /const angle = sweepAngleStart \+ orbitProgress \* continuousSweepAngle/);
  const alwaysOnOrbit = component.slice(
    component.indexOf("if (alwaysOn)"),
    component.indexOf("if (!animated || prefersReducedMotion)"),
  );
  assert.doesNotMatch(alwaysOnOrbit, /easeInCubic|easeOutCubic|sweepValue/);
  assert.match(component, /window\.requestAnimationFrame\(orbitTick\)/);
  assert.match(component, /window\.cancelAnimationFrame\(frameId\)/);
  assert.doesNotMatch(component, /alwaysOn \|\| !animated/);
  assert.match(component, /official-border-glow-always-on/);
  assert.doesNotMatch(shell, /assistantGlowColors/);
  assert.doesNotMatch(shell, /backgroundColor="var\(--bg-card\)"/);
  assert.doesNotMatch(shell, /glowColor=|glowIntensity=|glowRadius=/);
  assert.equal((shell.match(/coneSpread=\{14\}/g) ?? []).length, 2);
  assert.equal((shell.match(/fillOpacity=\{0\}/g) ?? []).length, 2);
  const assistantGlowShell = cssRuleBlock(shellStyles, [".assistantGlow", ".mobileAssistantGlow"]);
  assert.match(assistantGlowShell, /--card-bg:\s*transparent\s*!important\s*;/);
  assert.match(assistantGlowShell, /background:\s*transparent\s*!important\s*;/);
  assert.match(assistantGlowShell, /border:\s*0\s*!important\s*;/);
  assert.match(assistantGlowShell, /box-shadow:\s*none\s*!important\s*;/);
  assert.match(assistantGlowShell, /padding:\s*2px\s*;/);
  assert.match(
    cssRuleBlock(shellStyles, [".assistantGlow::before", ".mobileAssistantGlow::before"]),
    /border-width:\s*2px\s*;[\s\S]*?filter:\s*saturate\(1\.35\) brightness\(1\.12\)\s*;/,
  );
  assert.match(
    cssRuleBlock(shellStyles, [
      ".assistantGlow > :global(.official-border-glow-edge-light)",
      ".mobileAssistantGlow > :global(.official-border-glow-edge-light)",
    ]),
    /display:\s*none\s*;/,
  );
  assert.match(cssRuleBlock(shellStyles, [".assistantTopbarAction"]), /border-color:\s*transparent\s*!important\s*;/);
  assert.match(cssRuleBlock(shellStyles, [".mobileAssistantAction"]), /border-color:\s*transparent\s*!important\s*;/);
  assert.match(
    styles,
    /\.official-border-glow-card:not\(\.official-border-glow-always-on\):not\(:hover\):not\(\.sweep-active\)::before/,
  );
  assert.doesNotMatch(
    styles,
    /\.official-border-glow-card:not\(:hover\):not\(\.sweep-active\)::before/,
  );
  assert.match(
    cssRuleBlock(styles, [
      ".official-border-glow-card::before",
      ".official-border-glow-card::after",
      ".official-border-glow-edge-light",
    ]),
    /pointer-events:\s*none\s*;/,
  );
  assert.match(
    styles.slice(styles.indexOf("@media (prefers-reduced-motion: reduce)")),
    /transition:\s*none\s*;/,
  );
  assert.match(styles, /--edge-sensitivity:\s*30\s*;/);
  assert.match(styles, /--border-radius:\s*28px\s*;/);
  assert.match(styles, /--glow-padding:\s*40px\s*;/);
  assert.match(styles, /--cone-spread:\s*25\s*;/);
  assert.match(styles, /rgba\(0, 0, 0, 0\.1\) 0px 32px 64px/);
  assert.match(
    cssRuleBlock(styles, [".official-border-glow-inner"]),
    /display:\s*flex\s*;[\s\S]*?flex-direction:\s*column\s*;[\s\S]*?overflow:\s*auto\s*;/,
  );
  assert.doesNotMatch(styles, /@keyframes|animation(?:-name)?:/);
});

test("backend shells use one local Lucide outline icon language", () => {
  const opsCss = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const supplierCss = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const packageJson = sourceFor("package.json");

  assertIconRule(opsCss, [".sidebar nav svg", ".mobileSheetNavigation svg"], 18);
  assertIconRule(supplierCss, [".sidebar nav svg", ".mobileSheetNavigation svg"], 18);
  assertIconRule(
    opsCss,
    [
      ".globalShellActions svg",
      ".sidebarWorkspaceTrigger svg",
      ".sidebarWorkspaceMenu svg",
      ".accountMenuContent svg",
      ".dashboardBriefList button svg",
      ".mobileSheetActions svg",
    ],
    16,
  );
  assertIconRule(
    supplierCss,
    [
      ".mobileSheetActions svg",
      ".mobileAssistantAction svg",
      ".workspaceActions svg",
      ".accountMenuContent svg",
    ],
    16,
  );

  const metricContainer = cssRuleBlock(opsCss, [".dashboardMetricIcon"]);
  assert.match(metricContainer, /height:\s*34px\s*;/);
  assert.match(metricContainer, /width:\s*34px\s*;/);
  assert.match(metricContainer, /background:\s*var\(--bg-surface-soft\)\s*;/);
  assert.match(metricContainer, /border:\s*1px solid var\(--border-subtle\)\s*;/);
  assertIconRule(opsCss, [".dashboardMetricIcon svg"], 18);

  assert.doesNotMatch(packageJson, /iconfont/i);

  for (const relativePath of [
    "src/components/ops-shell/ops-shell.tsx",
    "src/components/supplier-shell/supplier-shell.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.match(source, /from "lucide-react"/);
    assert.doesNotMatch(source, /iconfont|at-icon|font-class/i);
  }
});

test("supplier home metrics use one neutral anatomy without colored rails", () => {
  const source = sourceFor("src/components/supplier-shell/supplier-home-cards.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  assert.doesNotMatch(source, /data-emphasis=|data-tone=/);
  assert.match(source, /className=\{styles\.homeOrderMetricGrid\}/);
  assert.match(source, /className=\{`\$\{styles\.homeSalesMetric\} \$\{styles\.homeAmountMetric\}`\}/);
  assert.doesNotMatch(styles, /\.homeSalesMetric\[data-emphasis=/);
  assert.doesNotMatch(styles, /\.homeSalesMetric[^\{]*\{[^}]*border-left:/s);
  assert.match(cssRuleBlock(styles, [".homeAmountMetric"]), /grid-column:\s*1 \/ -1\s*;/);
  assert.match(
    styles,
    /\.supplierShell\[data-view-mode="desktop"\] \.homeSalesGrid,\s*\.supplierShell\[data-view-mode="desktop"\] \.homeOrderMetricGrid/,
  );
});

test("supplier onboarding welcome treatment stays borderless", () => {
  const source = sourceFor("src/components/supplier-shell/command-chat-panel.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const contextCard = cssRuleBlock(styles, [".onboardingContextCard"]);
  const welcomeCard = cssRuleBlock(styles, [".onboardingWelcomeCard"]);
  const welcomeAccent = cssRuleBlock(styles, [".onboardingWelcomeCard::before"]);
  const welcomeAvatar = cssRuleBlock(styles, [".onboardingWelcomeRow .assistantAvatar"]);
  const welcomeSteps = cssRuleBlock(styles, [".onboardingWelcomeCard .markdownBody ol"]);
  const welcomeConnector = cssRuleBlock(styles, [".onboardingWelcomeCard .markdownBody ol li:not(:last-child)::after"]);
  const welcomeActiveStep = cssRuleBlock(styles, [".onboardingWelcomeCard .markdownBody ol li:first-child"]);
  const welcomeThread = cssRuleBlock(styles, [".entryChatThread:has(.onboardingWelcomeRow)"]);
  const darkWelcomeCard = cssRuleBlock(styles, [":global(.dark) .onboardingWelcomeCard"]);

  assert.match(contextCard, /box-shadow:\s*none\s*;/);
  assert.match(welcomeCard, /border:\s*0\s*;/);
  assert.match(welcomeCard, /box-shadow:\s*none\s*;/);
  assert.match(welcomeAccent, /display:\s*none\s*;/);
  assert.match(welcomeAvatar, /border:\s*0\s*;/);
  assert.match(welcomeAvatar, /box-shadow:\s*none\s*;/);
  assert.match(welcomeSteps, /grid-template-columns:\s*minmax\(0, 1fr\)\s*;/);
  assert.match(welcomeConnector, /bottom:\s*-9px\s*;/);
  assert.match(welcomeConnector, /height:\s*8px\s*;/);
  assert.match(welcomeActiveStep, /background:\s*#f0f2ec\s*;/);
  assert.match(welcomeThread, /max-height:\s*min\(540px, 62vh\)\s*;/);
  assert.match(darkWelcomeCard, /box-shadow:\s*none\s*;/);
  assert.match(source, /message\.presentation === "onboarding_welcome"[\s\S]*?<OnboardingWelcomeTaskContent/);
  assert.match(source, /isWelcome && styles\.onboardingWelcomeCard/);
  assert.match(source, /message\.presentation === "onboarding_welcome" && styles\.onboardingWelcomeRow/);
  assert.doesNotMatch(source, /styles\.onboardingContextMeta|styles\.onboardingWorkspaceBadge|styles\.onboardingProgressBadge/);
});

test("supplier overview gives recent leads full width and insights a two-column grid", () => {
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  assert.match(
    cssRuleBlock(styles, [".overviewWorkbenchGrid"]),
    /grid-template-columns:\s*minmax\(0, 1fr\)\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".overviewInsightStack"]),
    /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, ['.overviewLeadsCard > :global([data-slot="card-content"])']),
    /overflow-x:\s*auto\s*;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\)[\s\S]*?\.overviewInsightStack\s*\{[^}]*grid-template-columns:\s*1fr\s*;/,
  );
});

test("supplier settings use one full-width sectioned shadcn form", () => {
  const source = sourceFor("src/components/supplier-shell/supplier-settings-page.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  assert.match(source, /from "@\/components\/ui\/label"/);
  assert.match(source, /from "@\/components\/ui\/textarea"/);
  assert.match(source, /from "@\/components\/backend-ui\/backend-combobox"/);
  assert.match(source, /from "@\/components\/ui\/alert"/);
  assert.match(source, /<form[\s\S]*?className=\{styles\.supplierSettingsPage\}/);
  assert.equal((source.match(/<section className=\{styles\.supplierSettingsSection\}/g) ?? []).length, 3);
  assert.match(source, /htmlFor="supplier-name"[\s\S]*?id="supplier-name"/);
  assert.match(source, /htmlFor="supplier-description"[\s\S]*?id="supplier-description"/);
  assert.match(
    source,
    /<BackendCombobox[\s\S]*?value=\{siteType\}[\s\S]*?onChange=\{setSiteType\}[\s\S]*?value: "", label: t\("ops\.shopifyConfigSiteTypeNone"\)[\s\S]*?value: "shopify", label: t\("ops\.shopifyConfigSiteTypeShopify"\)[\s\S]*?value: "independent", label: t\("ops\.shopifyConfigSiteTypeIndependent"\)[\s\S]*?\/>/,
  );
  assert.doesNotMatch(source, /<span>\s*<h3/);
  assert.equal((source.match(/<div>\s*<h3 id="supplier-(?:company|site|lead)-section"/g) ?? []).length, 3);
  assert.match(source, /htmlFor="supplier-lead-requirement"[\s\S]*?id="supplier-lead-requirement"/);
  assert.doesNotMatch(source, /<textarea\b|<select\b|style=\{\{/);
  assert.match(
    cssRuleBlock(styles, [".supplierSettingsSection"]),
    /grid-template-columns:\s*minmax\(180px, 220px\) minmax\(0, 1fr\)\s*;/,
  );
  assert.match(styles, /\.supplierSettingsSectionIntro > div\s*,/);
  assert.doesNotMatch(styles, /\.supplierSettingsSectionIntro span\s*,/);

  assert.match(source, /fetch\("\/api\/supplier\/profile\/"/);
  assert.match(source, /method:\s*"PATCH"/);
  assert.match(
    source,
    /workspace_name:\s*name,[\s\S]*?description:\s*desc,[\s\S]*?site_type:\s*siteType,[\s\S]*?lead_acquisition_requirement:\s*normalizedLeadRequirement/,
  );
  assert.match(source, /if \(secretKey\) body\.api_secret_key = secretKey;/);
});

test("backend desktop theme switches use fixed labels and high-contrast scoped tracks", () => {
  for (const [shellPath, cssPath, idPrefix] of [
    ["src/components/ops-shell/ops-shell.tsx", "src/components/ops-shell/ops-shell.module.css", "ops"],
    ["src/components/supplier-shell/supplier-shell.tsx", "src/components/supplier-shell/supplier-shell.module.css", "supplier"],
  ]) {
    const shell = sourceFor(shellPath);
    const styles = sourceFor(cssPath);

    assert.match(shell, /const themeControlLabel = t\("common\.darkMode"\);/);
    assert.match(shell, new RegExp(`const themeSwitchId = "${idPrefix}-theme-switch";`));
    assert.match(shell, /<label className=\{styles\.themeToggle\} htmlFor=\{themeSwitchId\}>/);
    assert.match(shell, /<Switch[\s\S]*?id=\{themeSwitchId\}[\s\S]*?aria-label=\{themeControlLabel\}/);
    assert.doesNotMatch(shell, /className=\{styles\.themeSwitch\}[\s\S]{0,120}?size="sm"/);

    assert.match(cssRuleBlock(styles, ['.themeToggle > [data-slot="switch"]']), /height:\s*18px\s*!important\s*;/);
    assert.match(cssRuleBlock(styles, ['.themeToggle > [data-slot="switch"]']), /width:\s*32px\s*!important\s*;/);
    assert.match(styles, /\.themeToggle > \[data-slot="switch"\]\[data-checked\]/);
    assert.match(styles, /:global\(\.dark\) \.themeToggle > \[data-slot="switch"\]\[data-checked\]/);
  }
});

test("backend combobox foundation is installed and visual-only", () => {
  assert.deepEqual(
    findForbiddenVisualFiles([
      "frontend/src/components/ui/combobox.tsx",
      "frontend/src/components/shadcn-studio/combobox/combobox-01.tsx",
    ]),
    [],
  );

  const ui = sourceFor("src/components/ui/combobox.tsx");
  const demo = sourceFor("src/components/shadcn-studio/combobox/combobox-01.tsx");
  const adapter = sourceFor("src/components/backend-ui/backend-combobox.tsx");

  assert.match(ui, /ComboboxPrimitive/);
  assert.match(demo, /const frameworks = \['Next\.js', 'SvelteKit', 'Nuxt\.js', 'Remix', 'Astro'\] as const/);
  assert.match(adapter, /export type BackendComboboxOption/);
  assert.match(adapter, /onValueChange=\{\(nextOption\) =>/);
  assert.match(adapter, /onChange\(nextOption\.value\);/);
  assert.doesNotMatch(adapter, /EMPTY_VALUE|"__all__"/);
  assert.doesNotMatch(adapter, /fetch\(|useEffect\(|URLSearchParams|onInputValueChange=\{onChange\}/);
});

test("backend combobox trigger typography matches shared toolbar buttons", () => {
  const styles = sourceFor("src/components/backend-ui/backend-ui.module.css");
  const toolbarButton = cssRuleBlock(styles, [".toolbarButton"]);
  const comboboxInput = cssRuleBlock(styles, [
    '.backendCombobox :global([data-slot="input-group-control"])',
  ]);

  for (const declaration of [
    /color:\s*var\(--text-primary\)\s*;/,
    /font-size:\s*13px\s*;/,
    /font-weight:\s*500\s*;/,
  ]) {
    assert.match(toolbarButton, declaration);
    assert.match(comboboxInput, declaration);
  }
});

test("backend primary controls expose 44px mobile touch targets", () => {
  const styles = sourceFor("src/components/backend-ui/backend-ui.module.css");
  const toolbarButton = cssRuleBlock(styles, [".toolbarButton"]);
  const combobox = cssRuleBlock(styles, [".backendCombobox"]);
  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 820px)"));
  const mobileToolbarButton = cssRuleBlock(mobileStyles, [
    '.toolbarButton:global([data-slot="button"][type="button"][class*="h-"])',
  ]);
  const mobileCombobox = cssRuleBlock(mobileStyles, [".backendCombobox"]);

  assert.match(toolbarButton, /min-height:\s*34px\s*;/);
  assert.match(combobox, /min-height:\s*40px\s*;/);
  assert.match(mobileToolbarButton, /min-height:\s*44px\s*!important\s*;/);
  assert.match(mobileCombobox, /min-height:\s*44px\s*;/);
});

test("backend combobox keeps search metadata out of the selected label", () => {
  const adapter = sourceFor("src/components/backend-ui/backend-combobox.tsx");
  const distinctOption = {
    label: "Child category",
    searchText: "Parent / Child category",
  };

  assert.notEqual(distinctOption.searchText, distinctOption.label);
  assert.match(adapter, /const \{ contains \} = ComboboxPrimitive\.useFilter\(\);/);
  assert.match(
    adapter,
    /filter=\{\(option, query\) =>\s*contains\(option\.searchText \?\? option\.label, query\)\s*\}/,
  );
  assert.match(adapter, /itemToStringLabel=\{\(option\) => option\.label\}/);
  assert.doesNotMatch(
    adapter,
    /itemToStringLabel=\{\(option\) => option\.searchText/,
  );
});

test("backend combobox isolates empty values from sentinel-like business values", () => {
  const adapter = sourceFor("src/components/backend-ui/backend-combobox.tsx");
  const values = ["", "__all__"].map((externalValue) => ({
    externalValue,
    internalValue:
      externalValue === "" ? "empty:" : `value:${externalValue}`,
  }));

  assert.deepEqual(values, [
    { externalValue: "", internalValue: "empty:" },
    { externalValue: "__all__", internalValue: "value:__all__" },
  ]);
  assert.notEqual(values[0].internalValue, values[1].internalValue);
  assert.match(
    adapter,
    /internalValue: option\.value === "" \? "empty:" : `value:\$\{option\.value\}`/,
  );
  assert.match(
    adapter,
    /normalizedOptions\.find\(\(option\) => option\.value === value\)/,
  );
  assert.match(adapter, /onChange\(nextOption\.value\);/);
  assert.match(
    adapter,
    /itemToStringValue=\{\(option\) => option\.internalValue\}/,
  );
  assert.match(
    adapter,
    /isItemEqualToValue=\{\(option, selected\) =>\s*option\.internalValue === selected\.internalValue\s*\}/,
  );
  assert.match(adapter, /key=\{option\.internalValue\}/);
  assert.doesNotMatch(adapter, /EMPTY_VALUE|"__all__"/);
});

test("backend business filters use Combobox while page size remains Select", () => {
  const backendSelect = sourceFor("src/components/ops-shell/backend-select.tsx");
  const categoryTree = sourceFor("src/components/ops-shell/category-tree.tsx");
  const filterPages = [
    "src/components/ops-shell/leads-page.tsx",
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
    "src/components/ops-shell/inventory-logs-page.tsx",
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-leads-page.tsx",
    "src/components/supplier-shell/supplier-inventory-logs-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ];

  assert.match(categoryTree, /<BackendCombobox/);
  assert.doesNotMatch(categoryTree, /<Select\b/);
  assert.match(backendSelect, /function BackendPageSizeSelect/);
  assert.match(backendSelect, /<Select\b/);

  for (const relativePath of filterPages) {
    const source = sourceFor(relativePath);
    assert.match(source, /<BackendCombobox|<CategoryCascader/, relativePath);
  }

  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.match(source, /setSelectedCategoryId\(id \|\| null\); setPage\(1\);/, relativePath);
    assert.match(source, /setStatusFilter\(value\); setPage\(1\);/, relativePath);
    assert.match(source, /setStockFilter\(value\); setPage\(1\);/, relativePath);
  }
});

test("backend form value selectors use the shared Combobox", () => {
  const formPages = [
    "src/components/ops-shell/api-keys-page.tsx",
    "src/components/ops-shell/category-manage-drawer.tsx",
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
    "src/components/ops-shell/products-page.tsx",
    "src/components/ops-shell/shopify-config-page.tsx",
    "src/components/ops-shell/supplier-accounts-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
    "src/components/supplier-shell/supplier-settings-page.tsx",
  ];

  for (const relativePath of formPages) {
    const source = sourceFor(relativePath);
    assert.doesNotMatch(source, /<select\b/i, relativePath);
    assert.doesNotMatch(source, /from "@\/components\/ui\/select"/, relativePath);
    assert.match(source, /BackendCombobox|CategoryCascader/, relativePath);
  }

  const settings = sourceFor("src/components/supplier-shell/supplier-settings-page.tsx");
  assert.match(settings, /id="supplier-site-type"/);
  assert.match(settings, /onChange=\{setSiteType\}/);
  const siteTypeControl = settings.match(/<BackendCombobox[\s\S]*?onChange=\{setSiteType\}[\s\S]*?\/>/)?.[0] ?? "";
  assert.doesNotMatch(siteTypeControl, /handleSave/);
  assert.match(
    settings,
    /<form[\s\S]*?onSubmit=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?handleSave\(\);[\s\S]*?\}\}/,
  );
  assert.match(settings, /<Button type="submit" disabled=\{saving\}>/);
  assert.doesNotMatch(settings, /onClick=\{handleSave\}/);
});

test("supplier leads keep search and filters on one desktop row while mobile stacks", () => {
  const source = sourceFor("src/components/supplier-shell/supplier-leads-page.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");

  assert.equal(
    (source.match(/className=\{supplierStyles\.supplierLeadCombobox\}/g) ?? []).length,
    2,
  );
  assert.match(
    cssRuleBlock(styles, [".supplierLeadFilterToolbar"]),
    /flex-wrap:\s*nowrap\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".supplierLeadCombobox"]),
    /flex:\s*0 1 176px\s*;/,
  );
  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 820px)"));
  assert.match(
    cssRuleBlock(mobileStyles, [".supplierLeadFilterToolbar", ".supplierInventoryToolbar"]),
    /flex-wrap:\s*wrap\s*;/,
  );
  assert.match(
    cssRuleBlock(mobileStyles, [".supplierLeadCombobox"]),
    /flex:\s*1 1 100%\s*;[\s\S]*max-width:\s*none\s*;/,
  );
});

test("operations leads keep search country and submit control on one desktop row", () => {
  const source = sourceFor("src/components/ops-shell/leads-page.tsx");
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const toolbar = source.slice(source.indexOf("toolbar={("), source.indexOf("footer={("));

  assert.match(
    toolbar,
    /<BackendCombobox[\s\S]*?className=\{styles\.leadsCountryFilter\}[\s\S]*?<BackendSearchButton/,
  );
  assert.match(
    cssRuleBlock(styles, [".leadsSearchBar"]),
    /flex-wrap:\s*nowrap\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".leadsFilterGroup"]),
    /flex-wrap:\s*nowrap\s*;/,
  );

  const countryFilter = cssRuleBlock(styles, [".leadsCountryFilter"]);
  assert.match(countryFilter, /caret-color:\s*transparent\s*;/);
  assert.match(countryFilter, /cursor:\s*pointer\s*!important\s*;/);
  assert.match(countryFilter, /flex:\s*0 1 176px\s*;/);
  assert.match(countryFilter, /max-width:\s*176px\s*;/);
  assert.match(countryFilter, /min-width:\s*132px\s*;/);
  const countryFilterInput = cssRuleBlock(styles, [".leadsCountryFilter input"]);
  assert.match(countryFilterInput, /caret-color:\s*transparent\s*;/);
  assert.match(countryFilterInput, /cursor:\s*pointer\s*!important\s*;/);

  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 920px)"));
  assert.match(
    cssRuleBlock(mobileStyles, [".leadsCountryFilter"]),
    /flex:\s*0 0 auto\s*;[\s\S]*max-width:\s*none\s*!important\s*;[\s\S]*width:\s*100%\s*;/,
  );
  assert.match(
    styles,
    /\.opsShell\[data-view-mode="desktop"\] \.leadsCountryFilter\s*\{[^}]*flex:\s*0 1 176px\s*!important\s*;[^}]*max-width:\s*176px\s*!important\s*;[^}]*min-width:\s*132px\s*!important\s*;/,
  );
});

test("operations leads aggregate business location timing and contact details without changing data flow", () => {
  const source = sourceFor("src/components/ops-shell/leads-page.tsx");
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const tableStart = source.indexOf("styles.opsAggregatedLeadsTable");
  const tableEnd = source.indexOf("</Table>", tableStart);
  const table = source.slice(tableStart, tableEnd);

  assert.ok(tableStart > -1 && tableEnd > tableStart);
  assert.match(table, /leadsColMerchantInfo/);
  assert.match(table, /leadsColTimeline/);
  assert.match(table, /leadsColContactMethods/);
  assert.match(table, /leadsColDetails/);
  assert.doesNotMatch(table, /apiKeysColActions/);

  const headerOrder = [
    "leadsColMerchantInfo",
    "leadsColCountry",
    "leadsColContactMethods",
    "leadsColTimeline",
    "leadsColStage",
    "leadsColScore",
    "leadsColDetails",
  ].map((key) => table.indexOf(key));
  assert.ok(headerOrder.every((index, position) => index > -1 && (position === 0 || index > headerOrder[position - 1])));

  const body = table.slice(table.indexOf("{leads.map"));

  const merchantName = body.indexOf("item.merchant_name");
  const companyName = body.indexOf("item.company_name");
  const contactPerson = body.indexOf("item.contact_person");
  assert.ok(merchantName > -1 && merchantName < companyName && companyName < contactPerson);
  assert.match(table, /<Store aria-hidden="true" \/>/);
  assert.match(table, /<Building2 aria-hidden="true" \/>/);
  assert.match(table, /<UserRound aria-hidden="true" \/>/);

  const country = body.indexOf("countryLabel(item.country)");
  const city = body.indexOf("item.city", country);
  assert.ok(country > -1 && country < city);
  assert.doesNotMatch(body, /<strong>\{countryLabel\(item\.country\)/);

  const latestContact = body.indexOf("formatDate(item.latest_contact_at)");
  const created = body.indexOf("formatDate(item.created_at)");
  assert.ok(latestContact > -1 && latestContact < created);
  assert.match(table, /<MessageSquareText aria-hidden="true" \/>/);
  assert.match(table, /<CalendarPlus aria-hidden="true" \/>/);
  assert.doesNotMatch(table, /formatDatetime\(item\.(?:created_at|latest_contact_at)\)/);

  const email = body.indexOf("item.email");
  const whatsapp = body.indexOf("item.whatsapp");
  const phone = body.indexOf("formatPhone(item.country_code, item.phone)");
  assert.ok(email > -1 && email < whatsapp && whatsapp < phone);
  assert.match(table, /<Mail aria-hidden="true" \/>/);
  assert.match(table, /<WhatsAppIcon className=\{styles\.whatsAppIcon\} \/>/);
  assert.match(table, /<Phone aria-hidden="true" \/>/);
  assert.ok(merchantName < country && country < email && email < latestContact);
  assert.ok(latestContact < body.indexOf("stageLabel(item.stage)") && body.indexOf("stageLabel(item.stage)") < body.indexOf("item.recommendation_score"));
  assert.match(body, /<TableCell className=\{styles\.leadsStageCell\}>\s*<BackendStatusBadge tone="neutral">\s*\{stageLabel\(item\.stage\)\}/);
  assert.doesNotMatch(body, /leadStageTone\(item\.stage\)/);
  assert.doesNotMatch(body, /data-primary="true"/);
  assert.doesNotMatch(body, /leadScoreCell\} data-score-tier/);

  const aggregatedTable = cssRuleBlock(styles, [".opsAggregatedLeadsTable"]);
  assert.match(aggregatedTable, /border-collapse:\s*separate\s*;/);
  assert.match(aggregatedTable, /border-spacing:\s*0\s*;/);
  assert.match(aggregatedTable, /min-width:\s*max\(100%,\s*900px\)\s*;/);
  assert.match(cssRuleBlock(styles, [".leadInfoRow"]), /grid-template-columns:\s*14px minmax\(0,\s*1fr\)\s*;/);
  assert.match(cssRuleBlock(styles, [".opsAggregatedLeadsTable .leadsMerchantColumn"]), /width:\s*175px\s*;/);
  assert.match(cssRuleBlock(styles, [".opsAggregatedLeadsTable .leadsContactColumn"]), /width:\s*223px\s*;/);
  const finalColumnHeader = cssRuleBlock(styles, [".opsAggregatedLeadsTable.compactActionColumn > thead > tr > th:last-child"]);
  assert.match(finalColumnHeader, /border-bottom:\s*1px\s+solid\s+var\(--border-default\)\s*;/);
  assert.match(finalColumnHeader, /border-left:\s*0\s*;/);
  assert.match(finalColumnHeader, /box-shadow:\s*none\s*;/);
  const finalColumnRows = cssRuleBlock(styles, [".opsAggregatedLeadsTable.compactActionColumn > tbody > tr:not(.productSkuExpansionRow) > td:last-child"]);
  assert.match(finalColumnRows, /border-bottom:\s*1px\s+solid\s+var\(--border-separator\)\s*;/);
  assert.match(finalColumnRows, /border-left:\s*0\s*;/);
  assert.match(finalColumnRows, /box-shadow:\s*none\s*;/);
  assert.match(cssRuleBlock(styles, [".leadInfoRow .whatsAppIcon"]), /color:\s*var\(--text-faint\)\s*;/);
  assert.match(cssRuleBlock(styles, [".opsAggregatedLeadsTable > tbody > tr > td:last-child button"]), /color:\s*var\(--text-secondary\)\s*!important\s*;/);
  const scoreTypography = cssRuleBlock(styles, [".opsAggregatedLeadsTable .leadScoreCell"]);
  assert.match(scoreTypography, /background:\s*color-mix\(in srgb,\s*var\(--status-neutral\)\s*10%,\s*transparent\)\s*;/);
  assert.match(scoreTypography, /border-radius:\s*26px\s*;/);
  assert.match(scoreTypography, /border-color:\s*color-mix\(in srgb,\s*var\(--status-neutral\)\s*22%,\s*transparent\)\s*;/);
  assert.match(scoreTypography, /font-size:\s*12px\s*;/);
  assert.match(scoreTypography, /font-weight:\s*400\s*;/);
  assert.match(scoreTypography, /min-height:\s*20px\s*;/);
  assert.match(scoreTypography, /min-width:\s*0\s*;/);
  assert.match(scoreTypography, /padding:\s*2px 8px\s*;/);
  const stageTypography = cssRuleBlock(styles, [".opsAggregatedLeadsTable .leadsStageCell > span"]);
  assert.match(stageTypography, /color:\s*var\(--text-secondary\)\s*!important\s*;/);
  assert.match(stageTypography, /font-weight:\s*400\s*;/);

  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 920px)"));
  assert.match(cssRuleBlock(mobileStyles, [".opsAggregatedLeadsTable"]), /min-width:\s*900px\s*;/);
});

test("product workbench constrains status and stock filters inside the desktop card", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");

  for (const relativePath of [
    "src/components/ops-shell/products-page.tsx",
    "src/components/supplier-shell/supplier-products-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.equal((source.match(/className=\{styles\.productFilterCombobox\}/g) ?? []).length, 2);
  }

  const filterWidths = cssRuleBlock(styles, [".productFilterCombobox"]);
  assert.match(filterWidths, /flex:\s*0 0 132px\s*;/);
  assert.match(filterWidths, /max-width:\s*132px\s*;/);
  assert.match(filterWidths, /width:\s*132px\s*;/);
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*?\.productFilterCombobox\s*\{[^}]*flex:\s*0 0 auto\s*;[^}]*max-width:\s*none\s*!important\s*;[^}]*width:\s*100%\s*;/,
  );
});

test("supplier inventory logs share one toolbar with a separated type filter", () => {
  const source = sourceFor("src/components/supplier-shell/supplier-inventory-logs-page.tsx");
  const styles = sourceFor("src/components/supplier-shell/supplier-shell.module.css");
  const toolbar = source.slice(source.indexOf("toolbar={("), source.indexOf("footer={"));

  assert.match(
    toolbar,
    /<div className=\{`\$\{opsStyles\.searchBar\} \$\{supplierStyles\.supplierInventoryToolbar\}`\}>/,
  );
  assert.match(
    toolbar,
    /className=\{supplierStyles\.supplierInventorySearchGroup\}[\s\S]*?<BackendSearchButton[\s\S]*?className=\{supplierStyles\.supplierInventoryFilterGroup\}[\s\S]*?<BackendCombobox/,
  );
  assert.doesNotMatch(toolbar, /<>|style=\{\{/);
  assert.match(
    cssRuleBlock(styles, [".supplierInventoryFilterGroup"]),
    /border-left:\s*1px solid var\(--border-default\)\s*;/,
  );
  assert.match(source, /function handleSearch\(\) \{ setSearch\(searchInput\.trim\(\)\); setPage\(1\); \}/);
  assert.match(source, /onChange=\{\(value\) => \{ setTypeFilter\(value\); setPage\(1\); \}\}/);
});

test("operations workbenches inherit supplier toolbar layout", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const products = sourceFor("src/components/ops-shell/products-page.tsx");

  assert.match(
    products,
    /className=\{`\$\{styles\.pageActions\} \$\{styles\.productPageActions\}`\}/,
  );

  for (const relativePath of [
    "src/components/ops-shell/inventory-logs-page.tsx",
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    const toolbar = source.slice(source.indexOf("toolbar={("), source.indexOf("footer={("));
    const searchGroupStart = toolbar.indexOf("className={styles.opsSearchGroup}");
    const filterGroupStart = toolbar.indexOf("className={styles.opsFilterGroup}");

    assert.match(
      toolbar,
      /<div className=\{`\$\{styles\.searchBar\} \$\{styles\.opsWorkbenchToolbar\}`\}>/,
      relativePath,
    );
    assert.notEqual(searchGroupStart, -1, relativePath);
    assert.notEqual(filterGroupStart, -1, relativePath);
    assert.ok(searchGroupStart < filterGroupStart, relativePath);
    assert.match(
      toolbar.slice(searchGroupStart, filterGroupStart),
      /role="search"[\s\S]*?<BackendSearchButton/,
      relativePath,
    );
    assert.match(
      toolbar.slice(filterGroupStart),
      /role="group"[\s\S]*?<BackendCombobox/,
      relativePath,
    );
  }

  const inquiries = sourceFor("src/components/ops-shell/inquiries-page.tsx");
  assert.doesNotMatch(inquiries, /style=\{\{ maxWidth: 360 \}\}/);
  assert.match(
    inquiries,
    /<Table className=\{`\$\{styles\.dataTable\}[\s\S]*?\$\{styles\.inquiryDataTable\}`\}>/,
  );

  assert.match(
    cssRuleBlock(styles, [".opsWorkbenchToolbar"]),
    /flex-wrap:\s*nowrap\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".opsSearchGroup"]),
    /flex:\s*1 1 360px\s*;[\s\S]*min-width:\s*0\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".opsFilterGroup"]),
    /border-left:\s*1px solid var\(--border-default\)\s*;[\s\S]*padding-left:\s*12px\s*;/,
  );
  assert.match(
    cssRuleBlock(styles, [".dataTable.inquiryDataTable"]),
    /min-width:\s*max\(100%, 900px\)\s*;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1180px\)\s*\{[\s\S]*?\.opsWorkbenchToolbar\s*\{[^}]*flex-wrap:\s*wrap\s*;[\s\S]*?\.opsFilterGroup\s*\{[^}]*border-left:\s*0\s*;[^}]*padding-left:\s*0\s*;/,
  );
});

test("operations lists use shared backend state panels", () => {
  const statePanelPath = path.join(
    frontendRoot,
    "src/components/backend-ui/backend-state-panel.tsx",
  );
  assert.ok(
    fs.existsSync(statePanelPath),
    "shared backend-state-panel.tsx must exist",
  );

  const statePanel = sourceFor(
    "src/components/backend-ui/backend-state-panel.tsx",
  );
  assert.match(statePanel, /export function BackendEmptyState\(/);
  assert.match(statePanel, /export function BackendErrorState\(/);
  assert.match(statePanel, /export function BackendTableSkeleton\(/);
  assert.match(statePanel, /description\?: string/);
  assert.match(
    statePanel,
    /\{description \? <EmptyDescription>\{description\}<\/EmptyDescription> : null\}/,
  );
  assert.match(
    statePanel,
    /\{description \? <AlertDescription>\{description\}<\/AlertDescription> : null\}/,
  );
  assert.match(statePanel, /Array\.from\(\{ length: 5 \}\)/);

  const stateStyles = sourceFor(
    "src/components/backend-ui/backend-ui.module.css",
  );
  assert.match(
    cssRuleBlock(stateStyles, [
      '.backendEmptyState:global([data-slot="empty"])',
      '.backendAlert:global([data-slot="alert"])',
    ]),
    /width:\s*auto\s*;/,
  );

  for (const relativePath of [
    "src/components/ops-shell/leads-page.tsx",
    "src/components/ops-shell/contact-logs-page.tsx",
    "src/components/ops-shell/inventory-logs-page.tsx",
    "src/components/ops-shell/inquiries-page.tsx",
    "src/components/ops-shell/api-keys-page.tsx",
    "src/components/ops-shell/shopify-config-page.tsx",
  ]) {
    const source = sourceFor(relativePath);
    assert.match(
      source,
      /import \{[\s\S]*?BackendEmptyState[\s\S]*?BackendErrorState[\s\S]*?BackendTableSkeleton[\s\S]*?\} from "@\/components\/backend-ui\/backend-state-panel";/,
      relativePath,
    );
    assert.match(source, /<BackendTableSkeleton\b/, relativePath);
    assert.match(source, /<BackendErrorState\b/, relativePath);
    assert.match(source, /<BackendEmptyState\b/, relativePath);
    assert.doesNotMatch(
      source,
      /loading \? \(\s*<p className=\{styles\.loadingText\}>|error \? \(\s*<p className=\{styles\.loadingText\}>|(?:items|logs|keys|leads|rows)\.length === 0 \? \(\s*<p className=\{styles\.emptyText\}>/,
      relativePath,
    );
  }
});

test("operations chrome and Shopify drawer match supplier visual hierarchy", () => {
  const styles = sourceFor("src/components/ops-shell/ops-shell.module.css");
  const shell = sourceFor("src/components/ops-shell/ops-shell.tsx");
  const shopify = sourceFor("src/components/ops-shell/shopify-config-page.tsx");

  const topbar = cssRuleBlock(styles, [".workspaceTopbar"]);
  assert.match(topbar, /background:\s*var\(--bg-canvas\)\s*;/);
  assert.match(topbar, /position:\s*sticky\s*;/);
  assert.match(topbar, /top:\s*0\s*;/);
  assert.match(topbar, /z-index:\s*20\s*;/);

  assert.match(
    shell,
    /<div className=\{styles\.workspaceTopbar\}>[\s\S]*?<OpsWorkspaceMenu[\s\S]*?placement="topbar"/,
  );
  assert.doesNotMatch(shell, /className=\{styles\.workspaceTopbar\}>[\s\S]*?<h1\b/);

  assert.match(shopify, /import \{[^}]*Building2[^}]*Loader2[^}]*Store[^}]*\} from "lucide-react";/);
  assert.match(shopify, /import \{ Label \} from "@\/components\/ui\/label";/);
  assert.match(shopify, /import \{ Textarea \} from "@\/components\/ui\/textarea";/);
  assert.doesNotMatch(shopify, /<label\b|<textarea\b/);
  assert.match(shopify, /<div className=\{styles\.shopifyDrawerBody\}>/);
  assert.equal((shopify.match(/className=\{styles\.shopifyDrawerSection\}/g) ?? []).length, 2);
  assert.match(
    shopify,
    /<section className=\{styles\.shopifyDrawerSection\} aria-labelledby="ops-shopify-company-section">[\s\S]*?<Building2[\s\S]*?formName[\s\S]*?formDesc[\s\S]*?<\/section>/,
  );
  assert.match(
    shopify,
    /<section className=\{styles\.shopifyDrawerSection\} aria-labelledby="ops-shopify-site-section">[\s\S]*?<Store[\s\S]*?formSiteType[\s\S]*?showShopifyFields[\s\S]*?<\/section>/,
  );
  assert.match(shopify, /<Label htmlFor="ops-shopify-supplier-name">/);
  assert.match(shopify, /<Input id="ops-shopify-supplier-name"[\s\S]*?onChange=\{e => setFormName\(e\.target\.value\)\}/);
  assert.match(shopify, /<Textarea[\s\S]*?id="ops-shopify-description"[\s\S]*?onChange=\{e => setFormDesc\(e\.target\.value\)\}/);
  assert.match(shopify, /id="ops-shopify-site-type"[\s\S]*?onChange=\{setFormSiteType\}/);
  assert.match(shopify, /<Button variant="outline" onClick=\{\(\) => setDrawerOpen\(false\)\} disabled=\{submitting\}>/);
  assert.match(shopify, /<Button onClick=\{handleSubmit\} disabled=\{submitting\}>/);
  assert.doesNotMatch(shopify, /settingsSecretHint|shopifyDrawerHelp/);

  const sheetContent = cssRuleBlock(styles, [
    '.opsDrawerContent:global([data-slot="sheet-content"][data-side="right"])',
  ]);
  assert.match(sheetContent, /background:\s*var\(--bg-card\)\s*;/);
  assert.match(sheetContent, /gap:\s*0\s*;/);
  assert.match(sheetContent, /max-width:\s*640px\s*;/);
  assert.match(sheetContent, /width:\s*640px\s*;/);

  const genericBodyIndex = styles.indexOf(
    ".opsDrawerContent > div:not([data-slot])",
  );
  const shopifyBodyIndex = styles.indexOf(
    ".opsDrawerContent > div.shopifyDrawerBody",
  );
  assert.notEqual(genericBodyIndex, -1);
  assert.ok(shopifyBodyIndex > genericBodyIndex);
  assert.match(
    cssRuleBlock(styles, [
      ".opsDrawerContent > div.shopifyDrawerBody",
    ]),
    /padding:\s*0\s*;/,
  );

  const darkDrawer = cssRuleBlock(styles, [
    ':global(.dark) .opsDrawerContent:global([data-slot="sheet-content"][data-side="right"])',
  ]);
  assert.match(darkDrawer, /--primary:\s*#f4f4f1\s*;/);
  assert.match(darkDrawer, /--primary-foreground:\s*#111111\s*;/);
  assert.match(darkDrawer, /--bg-card:\s*#0d0f10\s*;/);
  assert.match(darkDrawer, /background:\s*var\(--bg-card\)\s*;/);
  assert.doesNotMatch(darkDrawer, /#bdff00|#c5e803|#7a9a00|#688600/);

  const mobileDrawerStyles = styles.slice(
    styles.indexOf("@media (max-width: 700px)"),
  );
  const mobileSheetContent = cssRuleBlock(mobileDrawerStyles, [
    '.opsDrawerContent:global([data-slot="sheet-content"][data-side="right"])',
  ]);
  assert.match(mobileSheetContent, /max-width:\s*100%\s*;/);
  assert.match(mobileSheetContent, /width:\s*100%\s*;/);

  const drawerStyles = styles.slice(
    styles.indexOf(".opsDrawerContent"),
    styles.indexOf("@media (max-width: 700px)", styles.indexOf(".opsDrawerContent")),
  );
  assert.doesNotMatch(drawerStyles, /#7a9a00|#688600/);
});
