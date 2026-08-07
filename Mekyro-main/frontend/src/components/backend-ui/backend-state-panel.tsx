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

import styles from "./backend-ui.module.css";

type BackendStatePanelProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  compact?: boolean;
};

export function BackendEmptyState({
  title,
  description,
  icon,
  compact = false,
}: BackendStatePanelProps) {
  return (
    <Empty
      className={
        compact
          ? `${styles.backendEmptyState} ${styles.backendEmptyStateCompact}`
          : styles.backendEmptyState
      }
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {icon ?? <Inbox aria-hidden="true" />}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}

export function BackendErrorState({
  title,
  description,
}: Pick<BackendStatePanelProps, "title" | "description">) {
  return (
    <Alert className={styles.backendAlert}>
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  );
}

export function BackendTableSkeleton({ label }: { label: string }) {
  return (
    <div className={styles.backendTableSkeleton} aria-label={label}>
      <div className={styles.backendSkeletonHeader}>
        <Loader2 aria-hidden="true" />
        <span>{label}</span>
      </div>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <div key={rowIndex} className={styles.backendSkeletonRow}>
          <Skeleton className={styles.backendSkeletonCellWide} />
          <Skeleton className={styles.backendSkeletonCell} />
          <Skeleton className={styles.backendSkeletonCell} />
          <Skeleton className={styles.backendSkeletonCellNarrow} />
        </div>
      ))}
    </div>
  );
}
