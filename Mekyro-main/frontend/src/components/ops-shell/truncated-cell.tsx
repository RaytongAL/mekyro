import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type TruncatedCellProps = {
  children: ReactNode;
  className?: string;
};

/** 表格单元格，使用父列的可用宽度，超出后截断并 hover 显示完整内容 */
export function TruncatedCell({ children, className }: TruncatedCellProps) {
  let text: string | null = null;
  if (typeof children === "string" || typeof children === "number") {
    text = String(children);
  } else if (children && typeof children === "object" && "props" in children) {
    const inner = (children as any).props?.children;
    if (typeof inner === "string" || typeof inner === "number") {
      text = String(inner);
    } else {
      return <>{children}</>;
    }
  } else {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            style={{
              display: "block",
              maxWidth: "100%",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              width: "100%",
            }}
            className={className}
          />
        }
      >
        {text}
      </TooltipTrigger>
      <TooltipContent side="top">
        <p style={{ maxWidth: 400, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
          {text}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
