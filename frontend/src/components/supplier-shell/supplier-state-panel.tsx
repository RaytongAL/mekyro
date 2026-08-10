import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

import styles from "./supplier-shell.module.css";

type SupplierStatePanelProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  compact?: boolean;
};

export function SupplierEmptyState({
  title,
  description,
  icon,
  compact = false,
}: SupplierStatePanelProps) {
  return (
    <Empty
      className={
        compact
          ? `${styles.supplierEmptyState} ${styles.supplierEmptyStateCompact}`
          : styles.supplierEmptyState
      }
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {icon ?? <Inbox aria-hidden="true" />}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function SupplierErrorState({
  title,
  description,
}: SupplierStatePanelProps) {
  return (
    <Alert className={styles.supplierAlert}>
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

export function SupplierTableSkeleton({ label }: { label: string }) {
  return (
    <div className={styles.supplierTableSkeleton} aria-label={label}>
      <div className={styles.supplierSkeletonHeader}>
        <Loader2 aria-hidden="true" />
        <span>{label}</span>
      </div>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <div key={rowIndex} className={styles.supplierSkeletonRow}>
          <Skeleton className={styles.supplierSkeletonCellWide} />
          <Skeleton className={styles.supplierSkeletonCell} />
          <Skeleton className={styles.supplierSkeletonCell} />
          <Skeleton className={styles.supplierSkeletonCellNarrow} />
        </div>
      ))}
    </div>
  );
}
