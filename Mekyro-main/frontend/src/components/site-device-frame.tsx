import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

type SiteDeviceFrameProps = {
  title: string;
};

export function SiteDeviceFrame({ title }: SiteDeviceFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const navigate = useNavigate();
  const src = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, []);

  useEffect(() => {
    const syncFrameLocation = () => {
      const frameLocation = frameRef.current?.contentWindow?.location;
      if (!frameLocation) {
        return;
      }

      const nextPath = `${frameLocation.pathname}${frameLocation.search}${frameLocation.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath !== currentPath) {
        navigate(nextPath, { replace: true });
      }
    };

    const timer = window.setInterval(syncFrameLocation, 400);
    return () => window.clearInterval(timer);
  }, [navigate]);

  return (
    <main className="site-device-frame" aria-label={title}>
      <iframe ref={frameRef} className="site-device-frame-viewport" src={src} title={title} />
    </main>
  );
}
