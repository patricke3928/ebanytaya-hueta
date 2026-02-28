"use client";

import { useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
  ox: number;
  oy: number;
};

const BG_COLOR = "#050505";
const DOT_COLOR = "255, 255, 255";
const SPACING = 44;
const RADIUS = 180;

function createPoints(width: number, height: number): Point[] {
  const points: Point[] = [];
  const cols = Math.ceil(width / SPACING) + 1;
  const rows = Math.ceil(height / SPACING) + 1;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const jitterX = (Math.random() - 0.5) * 6;
      const jitterY = (Math.random() - 0.5) * 6;
      const x = col * SPACING + jitterX;
      const y = row * SPACING + jitterY;
      points.push({ x, y, ox: x, oy: y });
    }
  }

  return points;
}

export function InteractiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let points: Point[] = [];
    const mouse = { x: -10_000, y: -10_000, active: false };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = createPoints(width, height);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      if (mouse.active) {
        const glow = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, RADIUS * 1.05);
        glow.addColorStop(0, "rgba(80, 150, 255, 0.18)");
        glow.addColorStop(0.4, "rgba(80, 150, 255, 0.06)");
        glow.addColorStop(1, "rgba(80, 150, 255, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }

      for (const point of points) {
        const dx = mouse.x - point.ox;
        const dy = mouse.y - point.oy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const influence = mouse.active ? Math.max(0, 1 - distance / RADIUS) : 0;
        const targetX = point.ox + dx * influence * 0.06;
        const targetY = point.oy + dy * influence * 0.06;

        point.x += (targetX - point.x) * 0.12;
        point.y += (targetY - point.y) * 0.12;

        const alpha = 0.08 + influence * 0.35;
        const size = 0.85 + influence * 1.2;
        ctx.fillStyle = `rgba(${DOT_COLOR}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fill();

        if (influence > 0.2) {
          ctx.strokeStyle = `rgba(120, 182, 255, ${(influence - 0.2) * 0.18})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(point.ox, point.oy);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
      }

      rafId = window.requestAnimationFrame(draw);
    };

    const onMove = (event: PointerEvent) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      mouse.active = true;
    };

    const onLeave = () => {
      mouse.active = false;
    };

    resize();
    draw();

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="interactive-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="interactive-bg-canvas" />
    </div>
  );
}
