import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";

type OfficialTextComponent = ElementType<{
  "aria-label"?: string;
  children?: ReactNode;
  className?: string;
}>;

type OfficialTextTypeProps = {
  as?: OfficialTextComponent;
  className?: string;
  cursorClassName?: string;
  cursorCharacter?: string;
  deleteSpeedMs?: number;
  initialDelayMs?: number;
  lineDelayMs?: number;
  loop?: boolean;
  pauseDurationMs?: number;
  restartDelayMs?: number;
  text: string | string[];
  typingSpeedMs?: number;
};

function getNextTypingIndex(text: string, index: number) {
  let nextIndex = Math.min(index + 1, text.length);

  if (text[nextIndex - 1] === "\n" && nextIndex < text.length) {
    nextIndex += 1;
  }

  return nextIndex;
}

function getNextDeletingIndex(text: string, index: number) {
  let nextIndex = Math.max(index - 1, 0);

  if (text.slice(0, nextIndex).endsWith("\n")) {
    nextIndex = Math.max(nextIndex - 1, 0);
  }

  return nextIndex;
}

export function OfficialTextType({
  as: Component = "span",
  className = "",
  cursorClassName = "",
  cursorCharacter = "|",
  deleteSpeedMs = 42,
  initialDelayMs = 0,
  loop = true,
  pauseDurationMs = 1680,
  restartDelayMs = 420,
  text,
  typingSpeedMs = 62,
}: OfficialTextTypeProps) {
  const fullText = useMemo(() => (Array.isArray(text) ? text.join("\n") : text), [text]);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [started, setStarted] = useState(initialDelayMs === 0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setCharIndex(fullText.length);
      setIsDeleting(false);
      setStarted(true);
      return;
    }

    setCharIndex(0);
    setIsDeleting(false);
    setStarted(initialDelayMs === 0);
  }, [fullText, initialDelayMs, prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion || started) return undefined;
    const timeout = window.setTimeout(() => setStarted(true), initialDelayMs);
    return () => window.clearTimeout(timeout);
  }, [initialDelayMs, prefersReducedMotion, started]);

  useEffect(() => {
    if (prefersReducedMotion || !started) return undefined;

    if (isDeleting) {
      if (charIndex <= 0) {
        if (!loop) return undefined;

        const timeout = window.setTimeout(() => setIsDeleting(false), restartDelayMs);
        return () => window.clearTimeout(timeout);
      }

      const timeout = window.setTimeout(() => {
        setCharIndex((value) => getNextDeletingIndex(fullText, value));
      }, deleteSpeedMs);

      return () => window.clearTimeout(timeout);
    }

    if (charIndex < fullText.length) {
      const timeout = window.setTimeout(() => {
        setCharIndex((value) => getNextTypingIndex(fullText, value));
      }, typingSpeedMs);

      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => setIsDeleting(true), pauseDurationMs);
    return () => window.clearTimeout(timeout);
  }, [charIndex, deleteSpeedMs, fullText, isDeleting, loop, pauseDurationMs, prefersReducedMotion, restartDelayMs, started, typingSpeedMs]);

  const visibleText = prefersReducedMotion ? fullText : fullText.slice(0, charIndex);
  const visibleLines = visibleText.length ? visibleText.split("\n") : [""];
  const activeLineIndex = visibleLines.length - 1;

  return (
    <Component className={`official-text-type${className ? ` ${className}` : ""}`} aria-label={fullText}>
      <span aria-hidden="true" className="official-text-type-content">
        {visibleLines.map((line, index) => (
          <span className="official-text-type-line" key={`official-text-type-line-${index}`}>
            {line}
            {prefersReducedMotion || index !== activeLineIndex ? null : (
              <span className={`official-text-type-cursor${cursorClassName ? ` ${cursorClassName}` : ""}`}>{cursorCharacter}</span>
            )}
          </span>
        ))}
      </span>
    </Component>
  );
}
