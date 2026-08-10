import { useEffect } from "react";

function getNavHeight() {
  return window.matchMedia("(max-width: 820px)").matches ? 142 : 68;
}

export function OfficialHomeSnapController() {
  useEffect(() => {
    let isSnapping = false;
    let releaseTimer: number | undefined;

    const release = () => {
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        isSnapping = false;
      }, 780);
    };

    const snapTo = (top: number) => {
      isSnapping = true;
      window.scrollTo({ top, behavior: "smooth" });
      release();
    };

    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaY) < 18 || isSnapping) {
        return;
      }

      const hero = document.querySelector<HTMLElement>(".official-hero-minimal");
      const showcase = document.querySelector<HTMLElement>(".supplier-showcase-band");
      const nextPanel = document.querySelector<HTMLElement>(".official-capability-band");
      if (!hero || !showcase) {
        return;
      }

      const navHeight = getNavHeight();
      const showcaseTop = Math.max(0, showcase.offsetTop - navHeight);
      const nextPanelTop = nextPanel ? Math.max(0, nextPanel.offsetTop - navHeight) : null;
      const currentY = window.scrollY;
      const isBetweenHeroAndShowcase = currentY < showcaseTop + 24;

      if (event.deltaY > 0 && currentY < showcaseTop - 24) {
        event.preventDefault();
        snapTo(showcaseTop);
        return;
      }

      if (event.deltaY < 0 && isBetweenHeroAndShowcase) {
        event.preventDefault();
        snapTo(0);
        return;
      }

      if (!nextPanelTop) {
        return;
      }

      const isBetweenShowcaseAndNextPanel = currentY > showcaseTop + 24 && currentY < nextPanelTop + 24;

      if (event.deltaY > 0 && currentY >= showcaseTop - 24 && currentY < nextPanelTop - 24) {
        event.preventDefault();
        snapTo(nextPanelTop);
        return;
      }

      if (event.deltaY < 0 && isBetweenShowcaseAndNextPanel) {
        event.preventDefault();
        snapTo(showcaseTop);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.clearTimeout(releaseTimer);
    };
  }, []);

  return null;
}
