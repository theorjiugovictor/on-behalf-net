"use client";

import { useEffect, useRef } from "react";

/**
 * GameBackground3D
 * A faint, game-style 3D wireframe perspective grid and spatial constellation.
 * Rendered on an HTML5 canvas in subtle monochromatic grays for an expansive,
 * tactical "trading floor arena" feel on a clean white background.
 */
export function GameBackground3D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = width / 2;
    let targetMouseY = height / 2;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);

    // 3D Grid Parameters
    const horizon = height * 0.48; // horizon line
    const fov = 340;
    let gridOffset = 0;

    // Tactical floating 3D markers (game style waypoints / agent nodes)
    const nodeCount = 28;
    const nodes: Array<{ x: number; y: number; z: number; size: number; pulse: number }> = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: (Math.random() - 0.5) * 1600,
        y: Math.random() * 220 - 40,
        z: Math.random() * 1400 + 80,
        size: Math.random() * 2.5 + 1.5,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse tracking for subtle parallax
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;
      const tiltX = (mouseX - width / 2) * 0.08;
      const tiltY = (mouseY - height / 2) * 0.05;

      gridOffset = (gridOffset + 0.55) % 40;

      // 1. Draw 3D Perspective Grid Floor (Game tactical grid receding into horizon)
      const gridZMin = 40;
      const gridZMax = 1200;
      const gridStepZ = 40;
      const gridXRange = 1200;
      const gridStepX = 70;

      ctx.save();

      // Fade mask toward horizon
      const horizonY = horizon + tiltY;

      // Draw Z lines (perspective rays converging to center vanishing point)
      ctx.lineWidth = 1;
      const vanishingX = width / 2 + tiltX * 0.5;

      for (let x = -gridXRange; x <= gridXRange; x += gridStepX) {
        const xStart = x - tiltX;
        const pNear = project(xStart, 160, gridZMin, vanishingX, horizonY, fov);
        const pFar = project(xStart, 160, gridZMax, vanishingX, horizonY, fov);

        if (pNear && pFar) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(0, 0, 0, 0.032)";
          ctx.moveTo(pNear.x, pNear.y);
          ctx.lineTo(pFar.x, pFar.y);
          ctx.stroke();
        }
      }

      // Draw X lines (horizontal lines moving forward on the ground plane)
      for (let z = gridZMin + gridOffset; z <= gridZMax; z += gridStepZ) {
        const depthAlpha = Math.max(0, 1 - (z - gridZMin) / (gridZMax - gridZMin));
        const pLeft = project(-gridXRange - tiltX, 160, z, vanishingX, horizonY, fov);
        const pRight = project(gridXRange - tiltX, 160, z, vanishingX, horizonY, fov);

        if (pLeft && pRight) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 0, 0, ${depthAlpha * 0.045})`;
          ctx.moveTo(pLeft.x, pLeft.y);
          ctx.lineTo(pRight.x, pRight.y);
          ctx.stroke();
        }
      }

      // 2. Draw Tactical 3D Agent Floating Nodes & Connectors
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.pulse += 0.025;
        n.z -= 0.65;
        if (n.z < 60) {
          n.z = 1400;
          n.x = (Math.random() - 0.5) * 1600;
        }

        const proj = project(n.x - tiltX, n.y - tiltY * 0.4, n.z, vanishingX, horizonY, fov);
        if (proj) {
          const alpha = Math.max(0, 1 - n.z / 1400) * 0.12;
          const radius = (n.size * fov) / n.z;

          // Node circle
          ctx.beginPath();
          ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 1.5})`;
          ctx.arc(proj.x, proj.y, Math.max(1, radius), 0, Math.PI * 2);
          ctx.fill();

          // Tactical altitude drop line down to the 3D grid floor
          const groundProj = project(n.x - tiltX, 160, n.z, vanishingX, horizonY, fov);
          if (groundProj) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.45})`;
            ctx.setLineDash([2, 4]);
            ctx.moveTo(proj.x, proj.y);
            ctx.lineTo(groundProj.x, groundProj.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="game-bg-canvas"
      aria-hidden="true"
    />
  );
}

function project(
  x: number,
  y: number,
  z: number,
  vanishX: number,
  vanishY: number,
  fov: number
): { x: number; y: number } | null {
  if (z <= 1) return null;
  const scale = fov / z;
  return {
    x: vanishX + x * scale,
    y: vanishY + y * scale,
  };
}
