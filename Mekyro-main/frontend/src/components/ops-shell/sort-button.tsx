import { ArrowUpDown } from "lucide-react";
import styles from "./ops-shell.module.css";

type SortButtonProps = {
  label: string;
  field?: string;        // 默认 "id"
  ordering: string;       // 当前排序值
  onOrderingChange: (v: string) => void;
  showIndicator?: boolean;
};

/** 列头排序按钮 */
export function SortButton({ label, field = "id", ordering, onOrderingChange, showIndicator = true }: SortButtonProps) {
  const asc = ordering === field;
  const desc = ordering === `-${field}`;
  const toggleOrdering = () => onOrderingChange(asc ? `-${field}` : desc ? "" : field);

  if (!showIndicator) {
    return (
      <button
        type="button"
        className={`${styles.sortBtn} ${styles.sortBtnTextOnly}`}
        onClick={toggleOrdering}
        title="点击切换排序"
      >
        {label}
      </button>
    );
  }

  return (
    <span className={styles.sortBtnWrap}>
      {label}
      <button
        type="button"
        className={`${styles.sortBtn} ${asc || desc ? styles.sortBtnActive : ""}`}
        onClick={toggleOrdering}
        title="点击切换排序"
      >
        {/* 当前未排序 */}
        {(!asc && !desc) ? <span className={styles.sortBtnInactive}><ArrowUpDown size={14} /></span> : null}
        {/* 已排序 */}
        {asc ? <ArrowUpDown size={14} className={styles.sortAsc} /> : null}
        {desc ? <ArrowUpDown size={14} className={styles.sortDesc} /> : null}
      </button>
    </span>
  );
}
