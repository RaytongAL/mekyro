import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { OfficialViewportMode } from "@/lib/official-site/content";

const STORAGE_KEY = "mekyro-site-view-mode";
const VIEW_MODE_EVENT = "mekyro-site-view-mode-change";
const MOBILE_QUERY = "(max-width: 920px)";

function isViewportMode(value: string | null | undefined): value is Exclude<OfficialViewportMode, "auto"> {
  return value === "desktop" || value === "mobile";
}

function isEmbeddedFrame() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function readStoredViewMode(): OfficialViewportMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  if (isEmbeddedFrame()) {
    return "auto";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isViewportMode(stored) ? stored : "auto";
}

function readIsNarrowViewport() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useSiteViewMode() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMode = searchParams.get("view");
  const [storedMode, setStoredMode] = useState<OfficialViewportMode>(() => readStoredViewMode());
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => readIsNarrowViewport());

  useEffect(() => {
    if (!isViewportMode(urlMode)) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, urlMode);
    setStoredMode(urlMode);
    window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: urlMode }));
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("view");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, urlMode]);

  useEffect(() => {
    const handleViewModeChange = (event: Event) => {
      const nextMode = event instanceof CustomEvent ? event.detail : window.localStorage.getItem(STORAGE_KEY);
      if (isViewportMode(nextMode)) {
        setStoredMode(nextMode);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      setStoredMode(isViewportMode(event.newValue) ? event.newValue : "auto");
    };

    window.addEventListener(VIEW_MODE_EVENT, handleViewModeChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(VIEW_MODE_EVENT, handleViewModeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const handleChange = () => setIsNarrowViewport(media.matches);

    handleChange();
    media.addEventListener("change", handleChange);

    return () => media.removeEventListener("change", handleChange);
  }, []);

  const viewMode: OfficialViewportMode = isViewportMode(urlMode) ? urlMode : storedMode;
  const effectiveViewMode: Exclude<OfficialViewportMode, "auto"> =
    viewMode === "auto" ? (isNarrowViewport ? "mobile" : "desktop") : viewMode;
  const targetViewMode: Exclude<OfficialViewportMode, "auto"> = effectiveViewMode === "mobile" ? "desktop" : "mobile";

  const setViewMode = useCallback(
    (nextMode: OfficialViewportMode) => {
      if (nextMode === "auto") {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, nextMode);
      }
      setStoredMode(nextMode);
      window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: nextMode }));
      window.requestAnimationFrame(() => window.scrollTo({ left: 0, top: 0 }));
    },
    [],
  );

  return useMemo(
    () => ({
      effectiveViewMode,
      isNarrowViewport,
      setViewMode,
      targetViewMode,
      viewMode,
    }),
    [effectiveViewMode, isNarrowViewport, setViewMode, targetViewMode, viewMode],
  );
}
