import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import styles from "./backend-ui.module.css";

export type BackendStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export function BackendStatusBadge({
  tone,
  children,
}: {
  tone: BackendStatusTone;
  children: ReactNode;
}) {
  return (
    <Badge variant="secondary" className={styles.statusBadge} data-tone={tone}>
      <span className={styles.statusDot} aria-hidden="true" />
      {children}
    </Badge>
  );
}
