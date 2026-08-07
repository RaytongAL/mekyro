import { useMemo, useState, useCallback, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Settings2, Plus, Trash2, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BackendCombobox, type BackendComboboxOption } from "@/components/backend-ui/backend-combobox";

import styles from "./ops-shell.module.css";

export type CategoryOption = { id: number; name: string; parent_id: number | null };

/* ==================== 工具函数 ==================== */

/** 递归向上拼接完整分类路径，如「数码 / 手机 / iPhone」。无则返回「—」。 */
export function buildCategoryPath(categories: CategoryOption[], id: number | null | undefined): string {
  if (id == null) return "—";
  const byId = new Map(categories.map((c) => [c.id, c]));
  const parts: string[] = [];
  let cur = byId.get(id);
  const visited = new Set<number>();
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return parts.length ? parts.join(" / ") : "—";
}

/** 计算某个分类的层级深度（根节点=1）。id 为 null 或不存在时返回 0。 */
export function categoryDepth(categories: CategoryOption[], id: number | null | undefined): number {
  if (id == null) return 0;
  const byId = new Map(categories.map((c) => [c.id, c]));
  let depth = 0;
  let curId: number | null = id;
  const visited = new Set<number>();
  while (curId != null && !visited.has(curId)) {
    visited.add(curId);
    const node = byId.get(curId);
    if (!node) break;
    depth += 1;
    curId = node.parent_id;
  }
  return depth;
}

/** 按先序遍历（父在前、子紧随）展平分类树，用于下拉的有序展示。 */
export function flattenCategoryTree(categories: CategoryOption[]): CategoryOption[] {
  const byParent = new Map<number | null, CategoryOption[]>();
  for (const c of categories) {
    const key = c.parent_id;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  const result: CategoryOption[] = [];
  const walk = (parentId: number | null) => {
    for (const c of byParent.get(parentId) ?? []) {
      result.push(c);
      walk(c.id);
    }
  };
  walk(null);
  return result;
}

/** candidateId 是否是 ancestorId 自身或其后代（用于拖拽时排除成环）。 */
function isSelfOrDescendant(cats: CategoryOption[], candidateId: number, ancestorId: number): boolean {
  let curId: number | null = candidateId;
  const visited = new Set<number>();
  while (curId != null && !visited.has(curId)) {
    if (curId === ancestorId) return true;
    visited.add(curId);
    curId = cats.find((c) => c.id === curId)?.parent_id ?? null;
  }
  return false;
}

/* ==================== 分类树（左侧导航） ==================== */

type CategoryTreeProps = {
  categories: CategoryOption[];
  selectedCategoryId: number | null;
  onSelect: (id: number | null) => void;
  onManageClick?: () => void;
  /** 可选：启用内联操作（创建子分类、删除、拖拽移动） */
  enableActions?: boolean;
  /** 创建子分类回调 */
  onCreateSub?: (parentId: number, name: string) => Promise<void>;
  /** 删除分类回调 */
  onDelete?: (categoryId: number) => Promise<void>;
  /** 移动分类回调 */
  onMove?: (categoryId: number, newParentId: number | null) => Promise<void>;
  /** 创建顶级分类回调 */
  onCreateRoot?: (name: string) => Promise<void>;
};

export function CategoryTree({ categories, selectedCategoryId, onSelect, onManageClick, enableActions, onCreateSub, onDelete, onMove, onCreateRoot }: CategoryTreeProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [subCreateTarget, setSubCreateTarget] = useState<CategoryOption | null>(null);
  const [subCreateName, setSubCreateName] = useState("");
  const [subCreating, setSubCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<CategoryOption | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rootCreateOpen, setRootCreateOpen] = useState(false);
  const [rootCreateName, setRootCreateName] = useState("");
  const [rootCreating, setRootCreating] = useState(false);

  const roots = useMemo(() => categories.filter((c) => c.parent_id == null), [categories]);

  const toggle = (id: number, open: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateSub = useCallback(async () => {
    if (!subCreateTarget || !onCreateSub || !subCreateName.trim()) return;
    setSubCreating(true);
    try {
      await onCreateSub(subCreateTarget.id, subCreateName.trim());
      setSubCreateTarget(null);
      setSubCreateName("");
    } catch { /* ignore */ }
    finally { setSubCreating(false); }
  }, [subCreateTarget, subCreateName, onCreateSub]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }, [deleteConfirm, onDelete]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!onMove) return;
    const { active, over } = event;
    if (!over) return;
    const draggedId = categories.find((item) => String(item.id) === String(active.id))?.id;
    const targetId = over.id === "root"
      ? null
      : categories.find((item) => String(item.id) === String(over.id))?.id;
    if (draggedId === undefined || targetId === undefined) return;

    // 不能拖到自己身上
    if (targetId === draggedId) return;
    // 不能拖到自己的后代上（成环）
    if (targetId !== null && isSelfOrDescendant(categories, targetId, draggedId)) return;
    // 深度检查（最多5级）
    if (targetId !== null && categoryDepth(categories, targetId) >= 4) return;

    const dragged = categories.find((c) => c.id === draggedId);
    if (!dragged || dragged.parent_id === targetId) return;

    onMove(draggedId, targetId);
  }, [categories, onMove]);

  const isAll = selectedCategoryId == null;

  const nodeStyle = (active: boolean, isDropTarget?: boolean): CSSProperties => ({
    width: "100%",
    textAlign: "left",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 13,
    background: isDropTarget ? "var(--bg-accent-mid)" : active ? "var(--bg-accent-soft)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: active ? 500 : 400,
    border: "none",
    cursor: "pointer",
    transition: "background 0.12s ease",
  });

  /* ---- 可拖拽分类节点 ---- */
  const DraggableNode = ({ category, children }: { category: CategoryOption; children: React.ReactNode }) => {
    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: String(category.id) });
    return (
      <div ref={setDragRef} className={styles.categoryTreeDragWrapper} style={{ opacity: isDragging ? 0.4 : 1, position: "relative" }}>
        {children}
        {enableActions ? (
          <span
            className={styles.categoryTreeDragIcon}
            {...listeners}
            {...attributes}
          >
            <GripVertical size={12} aria-hidden="true" />
          </span>
        ) : null}
      </div>
    );
  };

  /* ---- 可放置区域 ---- */
  const DroppableNode = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
    return (
      <div ref={enableActions ? setDropRef : undefined} className={isOver ? styles.categoryTreeDropTarget : undefined}>
        {children}
      </div>
    );
  };

  const renderNode = (category: CategoryOption): React.ReactNode => {
    const children = categories.filter((c) => c.parent_id === category.id);
    const isOpen = !collapsed.has(category.id);
    const active = selectedCategoryId === category.id;
    const depth = categoryDepth(categories, category.id);

    return (
      <Collapsible
        key={category.id}
        open={isOpen}
        onOpenChange={(open) => toggle(category.id, open)}
      >
        <DraggableNode category={category}>
          <DroppableNode id={String(category.id)}>
            <div className={styles.categoryTreeRow}>
              {children.length > 0 ? (
                <CollapsibleTrigger type="button" className={styles.categoryTreeToggle} aria-label={isOpen ? t("common.collapse") : t("common.expand")}>
                  {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                </CollapsibleTrigger>
              ) : (
                <span className={styles.categoryTreeTogglePlaceholder} aria-hidden="true" />
              )}
              <button type="button" style={nodeStyle(active)} onClick={() => onSelect(category.id)}>
                {category.name}
              </button>
              {/* 操作按钮（hover 显示） */}
              {enableActions ? (
                <span className={styles.categoryTreeActions}>
                  <button
                    type="button"
                    className={styles.categoryTreeActionBtn}
                    onClick={(e) => { e.stopPropagation(); setSubCreateTarget(category); setSubCreateName(""); }}
                    title={t("ops.categoryAddSub")}
                    aria-label={t("ops.categoryAddSub")}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    type="button"
                    className={styles.categoryTreeActionBtn}
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(category); }}
                    title={t("ops.apiKeysDelete")}
                    aria-label={t("ops.apiKeysDelete")}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ) : null}
            </div>
          </DroppableNode>
        </DraggableNode>
        {children.length > 0 ? (
          <CollapsibleContent>
            <div className={styles.categoryTreeChildren}>
              {children.map((child) => renderNode(child))}
            </div>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    );
  };

  const treeContent = (
    <>
      <div className={styles.categoryTreeHeader}>
        <span className={styles.categoryTreeTitle}>{t("ops.categoryTreeTitle")}</span>
        {onManageClick ? (
        <Button variant="ghost" size="sm" className={styles.categoryManageBtn} onClick={onManageClick}>
          <Settings2 size={14} aria-hidden="true" />
          {t("ops.categoryManage")}
        </Button>
        ) : null}
      </div>

      <DroppableNode id="root">
        <div style={{ padding: "4px 0", borderRadius: 6, display: "flex", alignItems: "center", gap: 2 }}>
          <button type="button" style={{ ...nodeStyle(isAll), flex: 1 }} onClick={() => onSelect(null)}>
            {t("ops.categoryTreeAll")}
          </button>
          {onCreateRoot ? (
            <button type="button" className={styles.categoryTreeActionBtn} onClick={(e) => { e.stopPropagation(); setRootCreateOpen(true); setRootCreateName(""); }} title={t("ops.categoryCreateChild")} style={{ flexShrink: 0 }}>
              <Plus size={12} />
            </button>
          ) : null}
        </div>
      </DroppableNode>

      {roots.map((root) => renderNode(root))}

      {/* ─── 创建子分类弹窗 ─── */}
      <Sheet open={!!subCreateTarget} onOpenChange={(open) => { if (!open) setSubCreateTarget(null); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader>
            <SheetTitle>{t("ops.categoryCreateChild")}</SheetTitle>
          </SheetHeader>
          <div className={styles.drawerBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColParent")}</label>
              <span className={styles.formValue}>{subCreateTarget?.name ?? ""}</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t("ops.categoriesColName")}</label>
              <Input className={styles.formInput} placeholder={t("ops.categoriesColName")} value={subCreateName} onChange={(e) => setSubCreateName(e.target.value)} maxLength={100} autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleCreateSub(); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubCreateTarget(null)} disabled={subCreating}>{t("common.cancel")}</Button>
            <Button onClick={handleCreateSub} disabled={subCreating || !subCreateName.trim()}>
              {t("ops.categoriesConfirmCreate")}
            </Button>
          </DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── 创建一级分类弹窗 ─── */}
      <Sheet open={rootCreateOpen} onOpenChange={(open) => { if (!open) setRootCreateOpen(false); }}>
        <SheetContent side="right" className={styles.opsDrawerContent}>
          <SheetHeader><SheetTitle>{t("ops.categoryCreateChild")}</SheetTitle></SheetHeader>
          <div className={styles.drawerBody}>
            <div className={styles.formGroup}><label className={styles.formLabel}>{t("ops.categoriesColName")}</label><Input className={styles.formInput} placeholder={t("ops.categoriesColName")} value={rootCreateName} onChange={(e) => setRootCreateName(e.target.value)} maxLength={100} autoFocus onKeyDown={(e) => { if (e.key === "Enter" && rootCreateName.trim() && onCreateRoot) { setRootCreating(true); onCreateRoot(rootCreateName.trim()).finally(() => { setRootCreating(false); setRootCreateOpen(false); setRootCreateName(""); }); } }} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRootCreateOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => { if (!rootCreateName.trim() || !onCreateRoot) return; setRootCreating(true); onCreateRoot(rootCreateName.trim()).finally(() => { setRootCreating(false); setRootCreateOpen(false); setRootCreateName(""); }); }} disabled={!rootCreateName.trim() || rootCreating}>{t("ops.categoriesConfirmCreate")}</Button></DialogFooter>
        </SheetContent>
      </Sheet>

      {/* ─── 删除确认弹窗 ─── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className={styles.createDialog} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("ops.categoriesDeleteTitle")}</DialogTitle>
          </DialogHeader>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            {t("ops.categoryDeleteNodeConfirm", { name: deleteConfirm?.name ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {t("ops.apiKeysConfirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <div className={styles.categoryTree}>
      {enableActions ? (
        <DndContext onDragEnd={handleDragEnd}>
          {treeContent}
        </DndContext>
      ) : (
        treeContent
      )}
    </div>
  );
}

/* ==================== 树形下拉（编辑表单用） ==================== */

type CategoryCascaderProps = {
  categories: CategoryOption[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder?: string;
  /** 候选过滤，返回 true 的节点才可选（用于限制父分类深度等）。 */
  filter?: (c: CategoryOption) => boolean;
};

export function CategoryCascader({ categories, value, onChange, placeholder, filter }: CategoryCascaderProps) {
  const { t } = useTranslation();
  const ordered = useMemo(() => flattenCategoryTree(categories), [categories]);
  const items = useMemo(
    () => (filter ? ordered.filter(filter) : ordered),
    [ordered, filter],
  );
  const noneLabel = placeholder ?? "—";
  const comboboxOptions: BackendComboboxOption[] = [
    { value: "", label: noneLabel },
    ...items.map((category) => ({
      value: String(category.id),
      label: buildCategoryPath(categories, category.id),
      searchText: buildCategoryPath(categories, category.id),
    })),
  ];

  return (
    <BackendCombobox
      aria-label={noneLabel}
      value={value ? String(value) : ""}
      options={comboboxOptions}
      onChange={(nextValue) => {
        const selected = items.find((item) => String(item.id) === nextValue);
        onChange(selected?.id ?? 0);
      }}
      emptyLabel={t("ops.comboboxNoResults")}
      placeholder={noneLabel}
      variant="form"
      renderOption={(option) => {
        const category = items.find((item) => String(item.id) === option.value);
        const depth = category ? categoryDepth(categories, category.id) : 1;
        return (
          <span style={{ paddingLeft: `${Math.max(0, depth - 1) * 16}px` }}>
            {category?.name ?? option.label}
          </span>
        );
      }}
    />
  );
}
