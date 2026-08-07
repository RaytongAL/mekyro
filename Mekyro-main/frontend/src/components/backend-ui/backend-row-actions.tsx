import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type BackendRowAction = {
  label: string;
  onSelect: () => void;
  tone?: "default" | "destructive";
  disabled?: boolean;
  hint?: string;
};

export function BackendRowActions({
  label,
  items,
}: {
  label: string;
  items: BackendRowAction[];
}) {
  const hasHints = items.some((item) => item.hint);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={hasHints ? "w-56" : undefined}>
        <DropdownMenuGroup>
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              variant={item.tone ?? "default"}
              disabled={item.disabled}
              title={item.hint}
              className={item.hint ? "flex-col items-start gap-0.5" : undefined}
              onClick={item.disabled ? undefined : item.onSelect}
            >
              <span>{item.label}</span>
              {item.hint ? (
                <span className="text-xs text-muted-foreground">{item.hint}</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
