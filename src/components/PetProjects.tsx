import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import { arcade } from "../lib/arcadeStore";
import { platformer } from "../lib/platformerStore";
import { Gamepad } from "./Icons";
import styles from "./PetProjects.module.css";

/**
 * "Pet projects" — the two playable games that live inside this site.
 *
 * Each card paints its own poster on a small canvas instead of shipping a
 * screenshot: the art is a few dozen lines, it stays sharp on any display,
 * and it can move a little without a video file. The platformer poster is the
 * only one that loads a real asset, and only once the card is on screen.
 */

const NEON_STACK = ["TypeScript", "Canvas 2D", "three.js", "Web Audio"];
const PLAT_STACK = ["TypeScript", "Canvas 2D", "Fixed-step", "Web Audio"];

/** Neon horizon: sun, grid, taillights — NEON RUN in one frame. */
function drawNeon(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1a0533");
  sky.addColorStop(0.55, "#3d1050");
  sky.addColorStop(1, "#0d0221");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const hy = h * 0.56;
  // sun
  const sunR = h * 0.24;
  const sg = ctx.createLinearGradient(0, hy - sunR, 0, hy + sunR * 0.2);
  sg.addColorStop(0, "#ffd45e");
  sg.addColorStop(1, "#ff2e88");
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, hy);
  ctx.clip();
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(w / 2, hy, sunR, 0, Math.PI * 2);
  ctx.fill();
  // scanlines across the sun
  ctx.fillStyle = "rgba(26,5,51,0.85)";
  for (let i = 0; i < 6; i++) {
    const y = hy - sunR * 0.75 + i * (sunR / 4.2);
    ctx.fillRect(w / 2 - sunR, y, sunR * 2, Math.max(1.5, sunR * 0.035 * (i + 1) * 0.5));
  }
  ctx.restore();

  // horizon glow
  ctx.fillStyle = "rgba(0,229,255,0.25)";
  ctx.fillRect(0, hy - 1, w, 2);

  // perspective grid
  ctx.strokeStyle = "rgba(0,229,255,0.45)";
  ctx.lineWidth = 1;
  for (let i = -7; i <= 7; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * (w * 0.028), hy);
    ctx.lineTo(w / 2 + i * (w * 0.36), h);
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const p = ((i / 9 + (t * 0.18) % (1 / 9)) % 1) ** 2.6;
    const y = hy + p * (h - hy);
    ctx.globalAlpha = 0.2 + p * 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // the car, a silhouette with two taillights
  const cw = w * 0.2;
  const cy = h * 0.86;
  ctx.fillStyle = "#2a0f3d";
  ctx.beginPath();
  ctx.roundRect(w / 2 - cw / 2, cy - cw * 0.3, cw, cw * 0.42, 5);
  ctx.fill();
  ctx.fillStyle = "#ff2e88";
  ctx.shadowColor = "#ff2e88";
  ctx.shadowBlur = 12;
  ctx.fillRect(w / 2 - cw * 0.42, cy - cw * 0.2, cw * 0.24, 4);
  ctx.fillRect(w / 2 + cw * 0.18, cy - cw * 0.2, cw * 0.24, 4);
  ctx.shadowBlur = 0;
}

/** Pixel forest with a real Huntress frame standing on the grass. */
function drawForest(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hero: HTMLImageElement | null,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#79d2f6");
  sky.addColorStop(1, "#c3f0ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // rolling hills, two layers
  const hill = (base: number, amp: number, colour: string, phase: number) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      ctx.lineTo(x, base + Math.sin(x / 46 + phase) * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };
  hill(h * 0.6, h * 0.05, "#6fb8a8", 0.6);
  hill(h * 0.72, h * 0.035, "#3f7f74", 1.9);

  // ground band with a grass rim, the same two-tone as the tileset
  const gy = h * 0.8;
  ctx.fillStyle = "#2c5b53";
  ctx.fillRect(0, gy, w, h - gy);
  ctx.fillStyle = "#aef03c";
  ctx.fillRect(0, gy, w, 4);
  ctx.fillStyle = "rgba(174,240,60,0.55)";
  for (let x = 3; x < w; x += 11) {
    ctx.fillRect(x, gy + 4, 3, 3);
  }

  // a couple of floating coins
  ctx.fillStyle = "#ffd45e";
  for (let i = 0; i < 3; i++) {
    const cx = w * (0.62 + i * 0.11);
    const cy = h * 0.44 + Math.sin(t * 3 + i) * 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.4 + Math.abs(Math.cos(t * 3 + i)) * 0.6, 1);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (hero) {
    // idle.png is 8 frames of 150x150; the character sits at y 55..97
    const frame = Math.floor(t * 9) % 8;
    const s = Math.max(1.6, h / 90);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hero, frame * 150 + 55, 55, 44, 42, w * 0.24, gy - 42 * s, 44 * s, 42 * s);
  }
}

function Poster({ kind }: { kind: "neon" | "plat" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let hero: HTMLImageElement | null = null;
    let live = false;
    const start = performance.now();

    if (kind === "plat") {
      const img = new Image();
      img.onload = () => {
        hero = img;
      };
      img.src = "./games/platformer/heroes/huntress/idle.png";
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(r.width * dpr)) {
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (now - start) / 1000;
      if (kind === "neon") drawNeon(ctx, r.width, r.height, t);
      else drawForest(ctx, r.width, r.height, t, hero);
    };

    // only animate while the card is actually on screen
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !live) {
          live = true;
          raf = requestAnimationFrame(frame);
        } else if (!e.isIntersecting && live) {
          live = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(canvas);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [kind]);
  return <canvas ref={ref} className={styles.poster} aria-hidden="true" />;
}

export default function PetProjects() {
  const { t } = useI18n();
  const scope = useReveal<HTMLElement>();

  const cards = [
    {
      key: "neon" as const,
      name: t("pet.neon_name"),
      desc: t("pet.neon_desc"),
      stack: NEON_STACK,
      open: () => arcade.open(),
    },
    {
      key: "plat" as const,
      name: t("pet.plat_name"),
      desc: t("pet.plat_desc"),
      stack: PLAT_STACK,
      open: () => platformer.open(),
    },
  ];

  return (
    <section id="pet" ref={scope} className="section">
      <div className="container">
        <header className="section-head">
          <span className="kicker" data-reveal>
            {t("pet.kicker")}
          </span>
          <h2 className="section-title" data-reveal>
            {t("pet.title")}
          </h2>
          <p className={styles.lead} data-reveal data-reveal-delay="0.1">
            {t("pet.lead")}
          </p>
        </header>

        <div className={styles.grid}>
          {cards.map((c, i) => (
            <article
              key={c.key}
              className={`${styles.card} ${styles[c.key]}`}
              data-reveal
              data-reveal-delay={String(0.12 + i * 0.1)}
            >
              <Poster kind={c.key} />
              <div className={styles.body}>
                <h3 className={styles.name}>{c.name}</h3>
                <p className={styles.desc}>{c.desc}</p>
                <ul className={styles.stack} aria-label={t("pet.stack")}>
                  {c.stack.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <button type="button" className={`btn ${styles.play}`} onClick={c.open}>
                  <Gamepad width={16} height={16} />
                  {t("pet.play")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
