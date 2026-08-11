export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  const copyWithExecCommand = () => {
    if (typeof document === "undefined" || typeof document.execCommand !== "function") {
      return false;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
      activeElement?.focus();
    }
  };

  // Clipboard API requires a secure context. On LAN HTTP, use the synchronous
  // fallback while the original click activation is still available.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return copyWithExecCommand();
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back for HTTP deployments, embedded browsers, or denied permissions.
  }

  return copyWithExecCommand();
}
