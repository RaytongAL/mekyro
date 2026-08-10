import { useEffect, useRef, useState } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import "./official-soft-aurora.css";

type SoftAuroraProps = {
  bandHeight?: number;
  bandSpread?: number;
  brightness?: number;
  className?: string;
  color1?: string;
  color2?: string;
  colorSpeed?: number;
  enableMouseInteraction?: boolean;
  layerOffset?: number;
  mouseInfluence?: number;
  noiseAmplitude?: number;
  noiseFrequency?: number;
  octaveDecay?: number;
  scale?: number;
  speed?: number;
};

const hexToVec3 = (hex: string): [number, number, number] => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255]
    : [1, 1, 1];
};

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uScale;
uniform float uBrightness;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uNoiseFreq;
uniform float uNoiseAmp;
uniform float uBandHeight;
uniform float uBandSpread;
uniform float uOctaveDecay;
uniform float uLayerOffset;
uniform float uColorSpeed;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;

#define TAU 6.28318

vec3 gradientHash(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 234.6)),
    dot(p, vec3(269.5, 183.3, 198.3)),
    dot(p, vec3(169.5, 283.3, 156.9))
  );
  vec3 h = fract(sin(p) * 43758.5453123);
  float phi = acos(2.0 * h.x - 1.0);
  float theta = TAU * h.y;
  return vec3(cos(theta) * sin(phi), sin(theta) * cos(phi), cos(phi));
}

float quinticSmooth(float t) {
  float t2 = t * t;
  float t3 = t * t2;
  return 6.0 * t3 * t2 - 15.0 * t2 * t2 + 10.0 * t3;
}

vec3 cosineGradient(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

float perlin3D(float amplitude, float frequency, float px, float py, float pz) {
  float x = px * frequency;
  float y = py * frequency;

  float fx = floor(x); float fy = floor(y); float fz = floor(pz);
  float cx = ceil(x);  float cy = ceil(y);  float cz = ceil(pz);

  vec3 g000 = gradientHash(vec3(fx, fy, fz));
  vec3 g100 = gradientHash(vec3(cx, fy, fz));
  vec3 g010 = gradientHash(vec3(fx, cy, fz));
  vec3 g110 = gradientHash(vec3(cx, cy, fz));
  vec3 g001 = gradientHash(vec3(fx, fy, cz));
  vec3 g101 = gradientHash(vec3(cx, fy, cz));
  vec3 g011 = gradientHash(vec3(fx, cy, cz));
  vec3 g111 = gradientHash(vec3(cx, cy, cz));

  float d000 = dot(g000, vec3(x - fx, y - fy, pz - fz));
  float d100 = dot(g100, vec3(x - cx, y - fy, pz - fz));
  float d010 = dot(g010, vec3(x - fx, y - cy, pz - fz));
  float d110 = dot(g110, vec3(x - cx, y - cy, pz - fz));
  float d001 = dot(g001, vec3(x - fx, y - fy, pz - cz));
  float d101 = dot(g101, vec3(x - cx, y - fy, pz - cz));
  float d011 = dot(g011, vec3(x - fx, y - cy, pz - cz));
  float d111 = dot(g111, vec3(x - cx, y - cy, pz - cz));

  float sx = quinticSmooth(x - fx);
  float sy = quinticSmooth(y - fy);
  float sz = quinticSmooth(pz - fz);

  float lx00 = mix(d000, d100, sx);
  float lx10 = mix(d010, d110, sx);
  float lx01 = mix(d001, d101, sx);
  float lx11 = mix(d011, d111, sx);

  float ly0 = mix(lx00, lx10, sy);
  float ly1 = mix(lx01, lx11, sy);

  return amplitude * mix(ly0, ly1, sz);
}

float auroraGlow(float t, vec2 shift) {
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  uv += shift;

  float noiseVal = 0.0;
  float freq = uNoiseFreq;
  float amp = uNoiseAmp;
  vec2 samplePos = uv * uScale;

  for (float i = 0.0; i < 3.0; i += 1.0) {
    noiseVal += perlin3D(amp, freq, samplePos.x, samplePos.y, t);
    amp *= uOctaveDecay;
    freq *= 2.0;
  }

  float yBand = uv.y * 10.0 - uBandHeight * 10.0;
  return 0.3 * max(exp(uBandSpread * (1.0 - 1.1 * abs(noiseVal + yBand))), 0.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float t = uSpeed * 0.4 * uTime;

  vec2 shift = vec2(0.0);
  if (uEnableMouse) {
    shift = (uMouse - 0.5) * uMouseInfluence;
  }

  vec3 col = vec3(0.0);
  col += 0.99 * auroraGlow(t, shift) * cosineGradient(uv.x + uTime * uSpeed * 0.2 * uColorSpeed, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.3, 0.20, 0.20)) * uColor1;
  col += 0.99 * auroraGlow(t + uLayerOffset, shift) * cosineGradient(uv.x + uTime * uSpeed * 0.1 * uColorSpeed, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.5, 0.20, 0.25)) * uColor2;

  col *= uBrightness;
  float alpha = clamp(length(col), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

type AuroraUniforms = {
  uBandHeight: { value: number };
  uBandSpread: { value: number };
  uBrightness: { value: number };
  uColor1: { value: [number, number, number] };
  uColor2: { value: [number, number, number] };
  uColorSpeed: { value: number };
  uEnableMouse: { value: boolean };
  uLayerOffset: { value: number };
  uMouse: { value: Float32Array };
  uMouseInfluence: { value: number };
  uNoiseAmp: { value: number };
  uNoiseFreq: { value: number };
  uOctaveDecay: { value: number };
  uResolution: { value: [number, number, number] };
  uScale: { value: number };
  uSpeed: { value: number };
  uTime: { value: number };
};

export function SoftAurora({
  bandHeight = 0.5,
  bandSpread = 1,
  brightness = 1,
  className = "",
  color1 = "#f7f7f7",
  color2 = "#e100ff",
  colorSpeed = 1,
  enableMouseInteraction = true,
  layerOffset = 0,
  mouseInfluence = 0.25,
  noiseAmplitude = 1,
  noiseFrequency = 2.5,
  octaveDecay = 0.1,
  scale = 1.5,
  speed = 0.6,
}: SoftAuroraProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef<AuroraUniforms | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const cleanupFunctionRef = useRef<(() => void) | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);

    return () => query.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "280px", threshold: 0.01 },
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || prefersReducedMotion || !containerRef.current) {
      if (cleanupFunctionRef.current) {
        cleanupFunctionRef.current();
        cleanupFunctionRef.current = null;
      }
      return undefined;
    }

    if (cleanupFunctionRef.current) {
      cleanupFunctionRef.current();
      cleanupFunctionRef.current = null;
    }

    const container = containerRef.current;
    const renderer = new Renderer({
      alpha: true,
      dpr: Math.min(window.devicePixelRatio, 2),
      premultipliedAlpha: false,
    });
    rendererRef.current = renderer;

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";

    let currentMouse: [number, number] = [0.5, 0.5];
    let targetMouse: [number, number] = [0.5, 0.5];

    const updateMouseTarget = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      targetMouse = [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height];
    };

    const resetMouseTarget = () => {
      targetMouse = [0.5, 0.5];
    };

    const uniforms: AuroraUniforms = {
      uBandHeight: { value: bandHeight },
      uBandSpread: { value: bandSpread },
      uBrightness: { value: brightness },
      uColor1: { value: hexToVec3(color1) },
      uColor2: { value: hexToVec3(color2) },
      uColorSpeed: { value: colorSpeed },
      uEnableMouse: { value: enableMouseInteraction },
      uLayerOffset: { value: layerOffset },
      uMouse: { value: new Float32Array([0.5, 0.5]) },
      uMouseInfluence: { value: mouseInfluence },
      uNoiseAmp: { value: noiseAmplitude },
      uNoiseFreq: { value: noiseFrequency },
      uOctaveDecay: { value: octaveDecay },
      uResolution: { value: [1, 1, 1] },
      uScale: { value: scale },
      uSpeed: { value: speed },
      uTime: { value: 0 },
    };
    uniformsRef.current = uniforms;

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      fragment: fragmentShader,
      uniforms,
      vertex: vertexShader,
    });
    const mesh = new Mesh(gl, { geometry, program });

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(gl.canvas);

    const updateSize = () => {
      renderer.dpr = Math.min(window.devicePixelRatio, 2);
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height);
      uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
    };

    const render = (time: number) => {
      if (!rendererRef.current || !uniformsRef.current) return;
      uniforms.uTime.value = time * 0.001;

      if (enableMouseInteraction) {
        currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
        uniforms.uMouse.value[0] = currentMouse[0];
        uniforms.uMouse.value[1] = currentMouse[1];
      } else {
        uniforms.uMouse.value[0] = 0.5;
        uniforms.uMouse.value[1] = 0.5;
      }

      try {
        renderer.render({ scene: mesh });
        animationIdRef.current = requestAnimationFrame(render);
      } catch {
        return;
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    if (enableMouseInteraction) {
      container.addEventListener("pointermove", updateMouseTarget);
      container.addEventListener("pointerleave", resetMouseTarget);
    }

    animationIdRef.current = requestAnimationFrame(render);

    cleanupFunctionRef.current = () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }

      window.removeEventListener("resize", updateSize);
      container.removeEventListener("pointermove", updateMouseTarget);
      container.removeEventListener("pointerleave", resetMouseTarget);

      try {
        const loseContext = gl.getExtension("WEBGL_lose_context");
        if (loseContext) loseContext.loseContext();
        if (gl.canvas.parentNode === container) {
          container.removeChild(gl.canvas);
        }
      } catch {
        return;
      }

      rendererRef.current = null;
      uniformsRef.current = null;
    };

    return () => {
      if (cleanupFunctionRef.current) {
        cleanupFunctionRef.current();
        cleanupFunctionRef.current = null;
      }
    };
  }, [
    bandHeight,
    bandSpread,
    brightness,
    color1,
    color2,
    colorSpeed,
    enableMouseInteraction,
    isVisible,
    layerOffset,
    mouseInfluence,
    noiseAmplitude,
    noiseFrequency,
    octaveDecay,
    prefersReducedMotion,
    scale,
    speed,
  ]);

  return <div ref={containerRef} className={`soft-aurora-container ${className}`.trim()} />;
}
