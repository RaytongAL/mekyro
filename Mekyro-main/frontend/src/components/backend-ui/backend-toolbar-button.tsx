import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import styles from "./backend-ui.module.css";

type BackendToolbarButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size">;

export function BackendToolbarButton({ className, ...props }: BackendToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(styles.toolbarButton, className)}
      {...props}
    />
  );
}
