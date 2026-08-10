import { Fragment } from "react";

import styles from "./backend-ui.module.css";

type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

type BackendPaginationNumbersProps = {
  page: number;
  totalPages: number;
  ariaLabel?: string;
  pageLabel?: (page: number) => string;
  onPageChange?: (page: number) => void;
};

export function getVisiblePages(page: number, totalPages: number): PaginationItem[] {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);

  if (safeTotal <= 5) {
    return Array.from({ length: safeTotal }, (_, index) => index + 1);
  }

  if (safePage <= 3) return [1, 2, 3, 4, "ellipsis-end", safeTotal];
  if (safePage >= safeTotal - 2) {
    return [1, "ellipsis-start", safeTotal - 3, safeTotal - 2, safeTotal - 1, safeTotal];
  }

  return [1, "ellipsis-start", safePage - 1, safePage, safePage + 1, "ellipsis-end", safeTotal];
}

export function BackendPaginationNumbers({
  page,
  totalPages,
  ariaLabel = "Pagination",
  pageLabel = (value) => `Page ${value}`,
  onPageChange,
}: BackendPaginationNumbersProps) {
  return (
    <nav className={styles.paginationControls} aria-label={ariaLabel}>
      {getVisiblePages(page, totalPages).map((item, index) => (
        <Fragment key={`${item}-${index}`}>
          {typeof item === "number" ? (
            <button
              type="button"
              className={item === page ? styles.paginationPageActive : styles.paginationPage}
              aria-current={item === page ? "page" : undefined}
              aria-label={pageLabel(item)}
              disabled={item === page}
              onClick={() => onPageChange?.(item)}
            >
              {item}
            </button>
          ) : (
            <span className={styles.paginationEllipsis} aria-hidden="true">…</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
