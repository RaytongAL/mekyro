import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import "./official-border-glow.css";

export type OfficialBorderGlowProps = {
  alwaysOn?: boolean;
  animated?: boolean;
  backgroundColor?: string;
  borderRadius?: number;
  children: ReactNode;
  className?: string;
  colors?: string[];
  coneSpread?: number;
  edgeSensitivity?: number;
  fillOpacity?: number;
  glowColor?: string;
  glowIntensity?: number;
  glowRadius?: number;
};

type Hsl = {
  h: number;
  l: number;
  s: number;
};

const gradientPositions = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const gradientKeys = [
  "--gradient-one",
  "--gradient-two",
  "--gradient-three",
  "--gradient-four",
  "--gradient-five",
  "--gradient-six",
  "--gradient-seven",
];
const colorMap = [0, 1, 2, 0, 1, 2, 1];
const sweepAngleStart = 110;
const sweepAngleEnd = 465;
const sweepInDuration = 1500;
const sweepOutDuration = 2250;
const continuousSweepDuration = sweepInDuration + sweepOutDuration;
const continuousSweepAngle = 360;

function parseHsl(hsl: string): Hsl {
  const match = hsl.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };

  return {
    h: Number.parseFloat(match[1]),
    s: Number.parseFloat(match[2]),
    l: Number.parseFloat(match[3]),
  };
}

function buildGlowVars(glowColor: string, intensity: number) {
  const { h, s, l } = parseHsl(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];

  return opacities.reduce<Record<string, string>>((vars, opacity, index) => {
    vars[`--glow-color${keys[index]}`] = `hsl(${base} / ${Math.min(opacity * intensity, 100)}%)`;
    return vars;
  }, {});
}

function buildGradientVars(colors: string[]) {
  const usableColors = colors.length > 0 ? colors : ["#c084fc", "#f472b6", "#38bdf8"];

  return gradientKeys.reduce<Record<string, string>>((vars, key, index) => {
    const color = usableColors[Math.min(colorMap[index], usableColors.length - 1)];
    vars[key] = `radial-gradient(at ${gradientPositions[index]}, ${color} 0px, transparent 50%)`;
    if (index === gradientKeys.length - 1) {
      vars["--gradient-base"] = `linear-gradient(${usableColors[0]} 0 100%)`;
    }
    return vars;
  }, {});
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

function easeInCubic(x: number) {
  return x * x * x;
}

function animateValue({
  delay = 0,
  duration = 1000,
  ease = easeOutCubic,
  end = 100,
  onEnd,
  onUpdate,
  start = 0,
}: {
  delay?: number;
  duration?: number;
  ease?: (value: number) => number;
  end?: number;
  onEnd?: () => void;
  onUpdate: (value: number) => void;
  start?: number;
}) {
  const t0 = performance.now() + delay;

  const tick = () => {
    const elapsed = performance.now() - t0;
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));

    if (t < 1) {
      window.requestAnimationFrame(tick);
      return;
    }

    onEnd?.();
  };

  window.setTimeout(() => window.requestAnimationFrame(tick), delay);
}

export function OfficialBorderGlow({
  alwaysOn = false,
  animated = false,
  backgroundColor = "#120F17",
  borderRadius = 28,
  children,
  className = "",
  colors = ["#c084fc", "#f472b6", "#38bdf8"],
  coneSpread = 25,
  edgeSensitivity = 30,
  fillOpacity = 0.5,
  glowColor = "40 80 80",
  glowIntensity = 1.0,
  glowRadius = 40,
}: OfficialBorderGlowProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const getCenterOfElement = useCallback((element: HTMLElement) => {
    const { width, height } = element.getBoundingClientRect();
    return [width / 2, height / 2] as const;
  }, []);

  const getEdgeProximity = useCallback(
    (element: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(element);
      const dx = x - cx;
      const dy = y - cy;
      const kx = dx !== 0 ? cx / Math.abs(dx) : Infinity;
      const ky = dy !== 0 ? cy / Math.abs(dy) : Infinity;

      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    },
    [getCenterOfElement],
  );

  const getCursorAngle = useCallback(
    (element: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(element);
      const dx = x - cx;
      const dy = y - cy;
      if (dx === 0 && dy === 0) return 0;

      const radians = Math.atan2(dy, dx);
      const degrees = radians * (180 / Math.PI) + 90;

      return degrees < 0 ? degrees + 360 : degrees;
    },
    [getCenterOfElement],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const edge = getEdgeProximity(card, x, y);
      const angle = getCursorAngle(card, x, y);

      card.style.setProperty("--edge-proximity", `${(edge * 100).toFixed(3)}`);
      card.style.setProperty("--cursor-angle", `${angle.toFixed(3)}deg`);
    },
    [getCursorAngle, getEdgeProximity],
  );

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (alwaysOn) {
      card.style.setProperty("--edge-proximity", "100");
      card.style.setProperty("--cursor-angle", `${sweepAngleStart}deg`);

      if (prefersReducedMotion) return;

      const orbitStartedAt = performance.now();
      let frameId = 0;

      const orbitTick = (timestamp: number) => {
        const elapsed = Math.max(0, timestamp - orbitStartedAt);
        const orbitProgress = (elapsed % continuousSweepDuration) / continuousSweepDuration;
        const angle = sweepAngleStart + orbitProgress * continuousSweepAngle;

        card.style.setProperty("--cursor-angle", `${angle}deg`);
        frameId = window.requestAnimationFrame(orbitTick);
      };

      frameId = window.requestAnimationFrame(orbitTick);

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    if (!animated || prefersReducedMotion) return;

    card.classList.add("sweep-active");
    card.style.setProperty("--cursor-angle", `${sweepAngleStart}deg`);

    animateValue({ duration: 500, onUpdate: (value) => card.style.setProperty("--edge-proximity", `${value}`) });
    animateValue({
      duration: 1500,
      ease: easeInCubic,
      end: 50,
      onUpdate: (value) => card.style.setProperty("--cursor-angle", `${(sweepAngleEnd - sweepAngleStart) * (value / 100) + sweepAngleStart}deg`),
    });
    animateValue({
      delay: 1500,
      duration: 2250,
      ease: easeOutCubic,
      end: 100,
      onUpdate: (value) => card.style.setProperty("--cursor-angle", `${(sweepAngleEnd - sweepAngleStart) * (value / 100) + sweepAngleStart}deg`),
      start: 50,
    });
    animateValue({
      delay: 2500,
      duration: 1500,
      ease: easeInCubic,
      end: 0,
      onEnd: () => card.classList.remove("sweep-active"),
      onUpdate: (value) => card.style.setProperty("--edge-proximity", `${value}`),
      start: 100,
    });
  }, [alwaysOn, animated]);

  const style = {
    "--edge-proximity": alwaysOn ? "100" : undefined,
    "--border-radius": `${borderRadius}px`,
    "--card-bg": backgroundColor,
    "--cone-spread": coneSpread,
    "--edge-sensitivity": edgeSensitivity,
    "--fill-opacity": fillOpacity,
    "--glow-padding": `${glowRadius}px`,
    ...buildGlowVars(glowColor, glowIntensity),
    ...buildGradientVars(colors),
  } as CSSProperties;

  return (
    <div
      ref={cardRef}
      className={`official-border-glow-card ${alwaysOn ? "official-border-glow-always-on" : ""} ${className}`.trim()}
      onPointerMove={alwaysOn ? undefined : handlePointerMove}
      style={style}
    >
      <span className="official-border-glow-edge-light" />
      <div className="official-border-glow-inner">{children}</div>
    </div>
  );
}
