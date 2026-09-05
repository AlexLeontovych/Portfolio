import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useReveal } from "../hooks/useReveal";
import { arcade } from "../lib/arcadeStore";
import { platformer } from "../lib/platformerStore";
import { td } from "../lib/tdStore";
import { Gamepad } from "./Icons";
import styles from "./PetProjects.module.css";

/**
 * "Pet projects" — the playable games that live inside this site.
 *
 * Each card paints its own poster on a small canvas instead of shipping a
 * screenshot: the art is a few dozen lines, it stays sharp on any display,
 * and it can move a little without a video file. The platformer poster is the
 * only one that loads a real asset, and only once the card is on screen.
 */

const NEON_STACK = ["TypeScript", "Canvas 2D", "three.js", "Web Audio"];
const PLAT_STACK = ["TypeScript", "Canvas 2D", "Fixed-step", "Web Audio"];
const TD_STACK = ["TypeScript", "Canvas 2D", "Pathfinding", "Wave AI"];

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

/** A scrap of the tower-defense board: winding road, two towers, a creep. */
/**
 * The keep's poster is a still of the real game, baked by scripts/td_poster.py
 * — the painted map, the painted towers on the pads the artist drew, creeps on
 * the road he painted. It drifts slowly so the card is not dead, and it is a
 * picture rather than the live board because the live board would have the
 * landing page fetch a megabyte of map and atlas before anyone clicked.
 *
 * The drawn board below is what shows until the image lands.
 */
function drawKeep(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  art: HTMLImageElement | null,
) {
  if (art) {
    // cover the card, then drift by the overhang the cover left over
    const k = Math.max(w / art.width, h / art.height) * 1.06;
    const dw = art.width * k;
    const dh = art.height * k;
    const drift = Math.sin(t * 0.13) * 0.5;
    ctx.drawImage(art, (w - dw) / 2 + (dw - w) * drift, (h - dh) / 2, dw, dh);
    return;
  }

  ctx.fillStyle = "#4a8a3c";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#5aa347";
  for (let i = 0; i < 14; i++) {
    const x = ((i * 97) % 100) / 100 * w;
    const y = ((i * 53) % 100) / 100 * h;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.09, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // an S of road, drawn twice for the dark rim
  const road = (width: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-10, h * 0.28);
    ctx.bezierCurveTo(w * 0.34, h * 0.24, w * 0.2, h * 0.82, w * 0.56, h * 0.74);
    ctx.bezierCurveTo(w * 0.86, h * 0.68, w * 0.78, h * 0.2, w + 10, h * 0.3);
    ctx.stroke();
  };
  road(h * 0.2, "#3b6b30");
  road(h * 0.15, "#e6d59b");

  // two towers beside it
  const tower = (x: number, y: number, roof: string) => {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.035, w * 0.035, h * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6f7b8c";
    ctx.fillRect(x - w * 0.032, y - h * 0.02, w * 0.064, h * 0.055);
    ctx.fillStyle = "#8a5a33";
    ctx.fillRect(x - w * 0.026, y - h * 0.085, w * 0.052, h * 0.07);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.036, y - h * 0.085);
    ctx.lineTo(x, y - h * 0.15);
    ctx.lineTo(x + w * 0.036, y - h * 0.085);
    ctx.closePath();
    ctx.fill();
  };
  tower(w * 0.26, h * 0.62, "#c6d831");
  tower(w * 0.7, h * 0.42, "#8f7bff");

  // a creep trudging along
  const p = (t * 0.16) % 1;
  const cx = w * (0.08 + p * 0.8);
  const cy = h * (0.32 + Math.sin(p * Math.PI * 2) * 0.2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 7, 8, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7a3f8f";
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd45e";
  ctx.fillRect(cx - 3, cy - 2, 2, 2);
  ctx.fillRect(cx + 1, cy - 2, 2, 2);
}

function Poster({ kind }: { kind: "neon" | "plat" | "td" }) {
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

    if (kind === "plat" || kind === "td") {
      const img = new Image();
      img.onload = () => {
        hero = img;
      };
      img.src =
        kind === "td"
          ? "./games/td/poster.webp"
          : "./games/platformer/heroes/huntress/idle.png";
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
      else if (kind === "td") drawKeep(ctx, r.width, r.height, t, hero);
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
    {
      key: "td" as const,
      name: t("pet.td_name"),
      desc: t("pet.td_desc"),
      stack: TD_STACK,
      open: () => td.open(),
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
