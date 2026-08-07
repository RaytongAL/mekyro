import { useEffect, useRef } from "react";
import "./official-noise.css";

type OfficialNoiseProps = {
  patternAlpha?: number;
  patternRefreshInterval?: number;
  patternScaleX?: number;
  patternScaleY?: number;
  patternSize?: number;
};

export function OfficialNoise({
  patternAlpha = 12,
  patternRefreshInterval = 3,
  patternScaleX = 1,
  patternScaleY = 1,
  patternSize = 240,
}: OfficialNoiseProps) {
  const grainRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = grainRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return undefined;

    let frame = 0;
    let animationId = 0;
    const canvasSize = 1024;

    const resize = () => {
      canvas.width = canvasSize;
      canvas.height = canvasSize;
    };

    const drawGrain = () => {
      const imageData = context.createImageData(patternSize, patternSize);
      const data = imageData.data;

      for (let index = 0; index < data.length; index += 4) {
        const value = Math.random() * 255;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = patternAlpha;
      }

      context.clearRect(0, 0, canvasSize, canvasSize);
      context.save();
      context.scale(patternScaleX, patternScaleY);

      for (let y = 0; y < canvasSize / patternScaleY; y += patternSize) {
        for (let x = 0; x < canvasSize / patternScaleX; x += patternSize) {
          context.putImageData(imageData, x, y);
        }
      }

      context.restore();
    };

    const loop = () => {
      if (frame % patternRefreshInterval === 0) {
        drawGrain();
      }

      frame += 1;
      animationId = window.requestAnimationFrame(loop);
    };

    resize();
    loop();

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [patternAlpha, patternRefreshInterval, patternScaleX, patternScaleY, patternSize]);

  return <canvas aria-hidden="true" className="official-noise-overlay" ref={grainRef} />;
}
