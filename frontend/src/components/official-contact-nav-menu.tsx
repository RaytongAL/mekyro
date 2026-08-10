"use client";

import { Link } from "react-router-dom";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { ChevronDown } from "lucide-react";

type ContactNavMenuProps = {
  active?: boolean;
  items: {
    href: string;
    label: string;
  }[];
  label: string;
};

export function OfficialContactNavMenu({ active = false, items, label }: ContactNavMenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openMenu() {
    clearCloseTimer();
    setOpen(true);
  }

  function closeMenuSoon() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 520);
  }

  useEffect(() => clearCloseTimer, []);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  return (
    <div
      className={`official-nav-menu${open ? " is-open" : ""}${active ? " is-active" : ""}`}
      onBlur={handleBlur}
      onFocus={openMenu}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenuSoon}
    >
      <button
        aria-expanded={open}
        className="official-nav-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>{label}</span>
        <ChevronDown aria-hidden="true" className="official-nav-menu-icon" size={12} strokeWidth={2} />
      </button>
      <div className="official-nav-menu-panel" onMouseEnter={openMenu} role="menu">
        {items.map((item) => (
          <Link to={item.href} key={item.label} onClick={() => setOpen(false)} onMouseEnter={openMenu} role="menuitem">
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
