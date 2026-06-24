/**
 * Lightweight bottom-to-top confetti burst on a throwaway full-screen canvas.
 * No dependencies; the canvas removes itself once every particle has fallen off
 * screen (or after a hard timeout). Used for the finish-line celebration when
 * the road car reaches the very end of the page.
 */
const COLORS = ["#ff2e88", "#00e5ff", "#aaff00", "#a855f7", "#ffb800", "#ff3b53"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
}

export function fireConfetti(): void {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "1001",
  });
  document.body.appendChild(canvas);

  let W = 0;
  let H = 0;
  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  // Launch ~110 pieces upward from across the bottom edge; gravity reels them
  // back down and they fade over ~2.6s.
  const N = 110;
  const parts: Particle[] = [];
  for (let i = 0; i < N; i++) {
    const spread = Math.random() - 0.5; // -0.5 (left) .. 0.5 (right)
    parts.push({
      x: W * (0.5 + spread * 0.92),
      y: H + Math.random() * 40,
      vx: spread * 6 + (Math.random() - 0.5) * 3,
      vy: -(9 + Math.random() * 8),
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.32,
      w: 6 + Math.random() * 6,
      h: 9 + Math.random() * 8,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    });
  }

  const GRAVITY = 0.22;
  const DRAG = 0.992;
  const start = performance.now();
  let raf = 0;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.remove();
  };

  const tick = (now: number) => {
    const elapsed = now - start;
    const fade = Math.max(0, 1 - elapsed / 2600);
    ctx.clearRect(0, 0, W, H);

    let alive = 0;
    for (const p of parts) {
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y < H + 30 && fade > 0) alive++;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (alive > 0 && elapsed < 3400) {
      raf = requestAnimationFrame(tick);
    } else {
      cleanup();
    }
  };

  raf = requestAnimationFrame(tick);
}
