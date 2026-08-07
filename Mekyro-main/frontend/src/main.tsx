import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/i18n";
import { App } from "./App";
import { initTheme } from "./hooks/use-theme";
import { installFastApiLegacyAdapter } from "./lib/fastapi/legacy-adapter";
import "./globals.css";

installFastApiLegacyAdapter();
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
