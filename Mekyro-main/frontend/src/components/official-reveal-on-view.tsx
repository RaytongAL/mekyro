import type { ReactNode } from "react";

type OfficialRevealOnViewProps = {
  ariaLabel: string;
  children: ReactNode;
  className: string;
};

export function OfficialRevealOnView({ ariaLabel, children, className }: OfficialRevealOnViewProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={`${className} official-reveal-ready`}
    >
      {children}
    </section>
  );
}
