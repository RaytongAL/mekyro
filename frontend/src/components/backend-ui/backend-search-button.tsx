import type { ComponentProps } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BackendSearchButtonProps = Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "children" | "size" | "title" | "variant"
> & {
  label: string;
};

export function BackendSearchButton({
  className,
  label,
  type = "button",
  ...props
}: BackendSearchButtonProps) {
  return (
    <Button
      {...props}
      type={type}
      variant="outline"
      size="icon"
      className={cn(
        "size-10 rounded-[10px] bg-background text-foreground max-[820px]:size-11",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Search aria-hidden="true" />
    </Button>
  );
}
