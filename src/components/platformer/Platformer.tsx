import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";
import { platformer, usePlatformerOpen } from "../../lib/platformerStore";
import { lockScroll, unlockScroll } from "../../lib/scrollLock";
import { Close } from "../Icons";
import { LEVELS } from "./level";
import { PlatformerEngine, type Action, type Hud, type Phase, type Toast } from "./engine";
import { Animator, HERO_INFO, HERO_SHEETS, loadAnimSet, type HeroId } from "./sprites";
import styles from "./platformer.module.css";

/**
 * EMBERWOOD — full-screen pixel-art platformer overlay.
 *
 * The engine owns the canvas and the game loop; this component is the chrome:
 * hero select, HUD, pause/death/clear cards, touch pad and open/close
 * plumbing. Everything the engine wants to say comes back through three
 * callbacks, so React re-renders on HUD ticks and never inside the loop.
 */

/**
 * The 9-slice skin lives in public/, so its URLs must resolve against the
 * document — the same "./games/..." form the engine uses for sprites. Handing
 * them to CSS as custom properties keeps that one rule in one place and lets
 * the stylesheet stay declarative.
 */
const UI_BASE = "./games/platformer/ui";
const UI_VARS = {
  "--ui-panel": `url(${UI_BASE}/panel.png)`,
  "--ui-panel-dark": `url(${UI_BASE}/panel-dark.png)`,
  "--ui-chip": `url(${UI_BASE}/chip.png)`,
  "--ui-button": `url(${UI_BASE}/button.png)`,
  "--ui-button-hover": `url(${UI_BASE}/button-hover.png)`,
  "--ui-button-down": `url(${UI_BASE}/button-down.png)`,
  "--ui-bar": `url(${UI_BASE}/bar.png)`,
  "--ui-fill": `url(${UI_BASE}/bar-fill.png)`,
  "--ui-fill-cyan": `url(${UI_BASE}/bar-fill-cyan.png)`,
  "--ui-heart-full": `url(${UI_BASE}/heart-full.png)`,
  "--ui-heart-empty": `url(${UI_BASE}/heart-empty.png)`,
  "--ui-coin": `url(${UI_BASE}/coin.png)`,
} as React.CSSProperties;

const KEYS: Record<string, Action> = {
  arrowleft: "left", a: "left",
  arrowright: "right", d: "right",
  arrowup: "up", w: "up",
  arrowdown: "down", s: "down",
  " ": "jump", z: "jump",
  j: "light", x: "light",
  k: "heavy", c: "heavy",
  l: "special", v: "special",
  shift: "dash", q: "dash",
};

/** A looping sprite preview, so the hero cards show the actual animation. */
function HeroPreview({ hero, active }: { hero: HeroId; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let dead = false;
    let anim: Animator | null = null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    void loadAnimSet(HERO_SHEETS[hero].base, {
      idle: HERO_SHEETS[hero].specs.idle,
      run: HERO_SHEETS[hero].specs.run,
      attack1: HERO_SHEETS[hero].specs.attack1,
    }).then((set) => {
      if (dead) return;
      anim = new Animator(set, "idle");
      let last = performance.now();
      let cycle = 0;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!anim) return;
        cycle += dt;
        // idle, then a swing, then idle again — a three-second loop
        const want = cycle % 3.4 > 2.6 ? "attack1" : "idle";
        anim.play(want, want === "attack1" && anim.current !== "attack1");
        anim.update(dt);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const r = canvas.getBoundingClientRect();
        if (canvas.width !== Math.round(r.width * dpr)) {
          canvas.width = Math.round(r.width * dpr);
          canvas.height = Math.round(r.height * dpr);
        }
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        anim.draw(ctx, r.width / 2, r.height - 8, 1, hero === "knight" ? 2.1 : 2.6);
        ctx.restore();
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
    };
  }, [hero]);
  return <canvas ref={ref} className={styles.preview} data-active={active} />;
}

export default function Platformer() {
  const open = usePlatformerOpen();
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PlatformerEngine | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [screen, setScreen] = useState<"select" | "game">("select");
  const [hero, setHero] = useState<HeroId>("huntress");
  const [phase, setPhase] = useState<Phase>("loading");
  const [hud, setHud] = useState<Hud | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [muted, setMuted] = useState(false);
  const [startLevel, setStartLevel] = useState(0);
  const unlocked = useMemo(() => (open ? platformer.unlocked() : 0), [open, screen]);

  const touch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: none), (pointer: coarse)").matches;

  /* --------------------------- open / close chrome -------------------------- */

  useEffect(() => {
    if (!open) return;
    lockScroll();
    setScreen("select");
    setPhase("loading");
    setHud(null);
    overlayRef.current?.focus();
    return () => {
      unlockScroll();
    };
  }, [open]);

  /* ------------------------------- engine life ------------------------------ */

  const boot = useCallback(
    async (heroId: HeroId, level: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      engineRef.current?.destroy();
      const engine = new PlatformerEngine(canvas, {
        onPhase: setPhase,
        onHud: setHud,
        onToast: (msg) => {
          setToast(msg);
          window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
        },
      });
      engineRef.current = engine;
      engine.audio.resume();
      engine.audio.setMuted(muted);
      if (import.meta.env.DEV) {
        (window as unknown as { __platformer?: PlatformerEngine }).__platformer = engine;
      }
      await engine.load(heroId);
      if (engineRef.current !== engine) return; // superseded while loading
      engine.start(level);
    },
    [muted],
  );

  useEffect(() => {
    if (open) return;
    engineRef.current?.destroy();
    engineRef.current = null;
  }, [open]);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [],
  );

  /* --------------------------------- input --------------------------------- */

  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") {
        e.stopPropagation();
        e.preventDefault();
        const engine = engineRef.current;
        if (screen === "game" && engine && (phase === "playing" || phase === "paused")) {
          engine.setPaused(phase !== "paused");
        } else {
          platformer.close();
        }
        return;
      }
      if (screen !== "game") return;
      if (k === "p") {
        engineRef.current?.setPaused(phase !== "paused");
        return;
      }
      if (k === "r" && (phase === "playing" || phase === "paused")) {
        engineRef.current?.restart();
        return;
      }
      const action = KEYS[k];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) engineRef.current?.press(action);
    };
    const up = (e: KeyboardEvent) => {
      const action = KEYS[e.key.toLowerCase()];
      if (action) engineRef.current?.release(action);
    };
    const blur = () => engineRef.current?.clearInput();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, [open, screen, phase]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => engineRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  /* ------------------------------- progression ------------------------------ */

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (phase === "cleared") {
      platformer.unlock(Math.min(LEVELS.length - 1, engine.levelIndex + 1));
      if (hud?.rank) platformer.recordRank(engine.levelIndex, hud.rank);
    }
    if (phase === "won" || phase === "dead") platformer.recordScore(engine.score);
  }, [phase]);

  const holdProps = (action: Action) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      engineRef.current?.press(action);
    },
    onPointerUp: () => engineRef.current?.release(action),
    onPointerCancel: () => engineRef.current?.release(action),
    onPointerLeave: () => engineRef.current?.release(action),
  });

  if (!open) return null;

  const info = HERO_INFO[hero];
  const specialName = t(`plat.special_${info.special}`);
  const cleared = phase === "cleared";
  const lastLevel = (engineRef.current?.levelIndex ?? 0) >= LEVELS.length - 1;

  return createPortal(
    <div
      ref={overlayRef}
      tabIndex={-1}
      className={styles.overlay}
      style={UI_VARS}
      role="dialog"
      aria-modal="true"
      aria-label="EMBERWOOD"
    >
      <canvas ref={canvasRef} className={styles.canvas} data-hidden={screen !== "game"} />

      <button
        type="button"
        className={styles.close}
        onClick={() => platformer.close()}
        aria-label={t("plat.exit")}
      >
        <Close />
      </button>

      <button
        type="button"
        className={styles.mute}
        onClick={() => {
          const next = !muted;
          setMuted(next);
          engineRef.current?.audio.setMuted(next);
        }}
        aria-pressed={muted}
        aria-label={t("plat.sound")}
        title={t("plat.sound")}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {/* ------------------------------ hero select ----------------------------- */}
      {screen === "select" && (
        <div className={styles.select}>
          <p className={styles.kicker}>{t("plat.kicker")}</p>
          <h2 className={styles.title}>EMBERWOOD</h2>
          <p className={styles.tagline}>{t("plat.tagline")}</p>

          <div className={styles.heroes}>
            {(Object.keys(HERO_INFO) as HeroId[]).map((id) => {
              const h = HERO_INFO[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`${styles.heroCard} ${id === hero ? styles.heroSel : ""}`}
                  onClick={() => setHero(id)}
                  aria-pressed={id === hero}
                >
                  <span className={styles.heroTag}>{t(`plat.hero_${id}_tag`)}</span>
                  <HeroPreview hero={id} active={id === hero} />
                  <span className={styles.heroName}>{h.name}</span>
                  <span className={styles.heroBlurb}>{t(`plat.hero_${id}_blurb`)}</span>
                  <span className={styles.stats}>
                    {(["power", "reach", "tough"] as const).map((k) => (
                      <span key={k} className={styles.statRow}>
                        <span className={styles.statLabel}>{t(`plat.stat_${k}`)}</span>
                        <span className={styles.statBar}>
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <i key={n} className={n <= h.stats[k] ? styles.segOn : styles.seg} />
                          ))}
                        </span>
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {unlocked > 0 && (
            <div className={styles.levelPick}>
              <span className={styles.levelPickLabel}>{t("plat.start_from")}</span>
              {LEVELS.map((l, i) => (
                <button
                  key={l.name}
                  type="button"
                  disabled={i > unlocked}
                  className={`${styles.levelChip} ${i === startLevel ? styles.levelChipSel : ""}`}
                  onClick={() => setStartLevel(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className={`${styles.pixBtn} ${styles.startBtn}`}
            onClick={() => {
              setScreen("game");
              void boot(hero, Math.min(startLevel, unlocked));
            }}
          >
            {t("plat.start")} — {info.name}
          </button>

          <p className={styles.controls}>{touch ? t("plat.controls_touch") : t("plat.controls")}</p>
        </div>
      )}

      {/* ---------------------------------- HUD --------------------------------- */}
      {screen === "game" && hud && (
        <>
          <div className={styles.hud}>
            <div className={styles.hearts} aria-label={`${hud.hearts}/${hud.maxHearts}`}>
              {Array.from({ length: hud.maxHearts }, (_, i) => (
                <i key={i} className={i < hud.hearts ? styles.heartOn : styles.heartOff} />
              ))}
            </div>
            <div className={styles.counters}>
              <span className={styles.coin}>{hud.coins}</span>
              <span className={styles.score}>{String(hud.score).padStart(6, "0")}</span>
            </div>
            <div className={styles.meters}>
              <div
                className={styles.special}
                data-ready={hud.specialCd >= 1}
                style={{ ["--fill" as string]: `${Math.round(Math.min(1, hud.specialCd) * 100)}%` }}
              >
                <span>{specialName}</span>
              </div>
              <div
                className={styles.dash}
                data-ready={hud.dashCd >= 1}
                style={{ ["--fill" as string]: `${Math.round(Math.min(1, hud.dashCd) * 100)}%` }}
                title={t("plat.dash")}
              >
                <span>»</span>
              </div>
            </div>
          </div>

          <div className={styles.levelTag}>
            {hud.level + 1}/{LEVELS.length} · {hud.levelName}
          </div>

          {hud.boss !== null && (
            <div className={styles.bossBar}>
              <span className={styles.bossName}>EVIL WIZARD</span>
              <span className={styles.bossTrack}>
                <i style={{ width: `${Math.max(0, hud.boss) * 100}%` }} />
              </span>
            </div>
          )}

          {toast && (
            <div className={styles.toast}>
              {toast.kind === "level"
                ? `${toast.index}. ${toast.name}`
                : toast.kind === "checkpoint"
                  ? t("plat.checkpoint")
                  : t(`plat.boss_phase_${toast.phase}`)}
            </div>
          )}
        </>
      )}

      {/* ------------------------------ touch pad ------------------------------- */}
      {screen === "game" && touch && phase === "playing" && (
        <div className={styles.pad}>
          <div className={styles.padLeft}>
            <button type="button" className={styles.padBtn} {...holdProps("left")} aria-label="←">◀</button>
            <button type="button" className={styles.padBtn} {...holdProps("right")} aria-label="→">▶</button>
            <button type="button" className={styles.padBtn} {...holdProps("down")} aria-label="↓">▼</button>
          </div>
          <div className={styles.padRight}>
            <button type="button" className={styles.padBtn} {...holdProps("dash")} aria-label={t("plat.dash")}>»</button>
            <button type="button" className={styles.padBtn} {...holdProps("special")} aria-label={specialName}>✦</button>
            <button type="button" className={styles.padBtn} {...holdProps("heavy")} aria-label="heavy">✹</button>
            <button type="button" className={styles.padBtn} {...holdProps("light")} aria-label="light">⚔</button>
            <button type="button" className={`${styles.padBtn} ${styles.padJump}`} {...holdProps("jump")} aria-label="jump">⤒</button>
          </div>
        </div>
      )}

      {/* -------------------------------- cards --------------------------------- */}
      {screen === "game" && phase === "loading" && (
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <p className={styles.loading}>{t("plat.loading")}</p>
          </div>
        </div>
      )}

      {screen === "game" && phase === "paused" && (
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>{t("plat.paused")}</h3>
            <div className={styles.actions}>
              <button type="button" className={styles.pixBtn} onClick={() => engineRef.current?.setPaused(false)}>
                {t("plat.resume")}
              </button>
              <button type="button" className={`${styles.pixBtn} ${styles.pixBtnGhost}`} onClick={() => engineRef.current?.restart()}>
                {t("plat.retry")}
              </button>
              <button type="button" className={`${styles.pixBtn} ${styles.pixBtnGhost}`} onClick={() => setScreen("select")}>
                {t("plat.heroes")}
              </button>
            </div>
            <p className={styles.controls}>{touch ? t("plat.controls_touch") : t("plat.controls")}</p>
          </div>
        </div>
      )}

      {screen === "game" && phase === "dead" && (
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <h3 className={`${styles.cardTitle} ${styles.dead}`}>{t("plat.dead")}</h3>
            <p className={styles.cardBody}>
              {hud?.checkpoint ? t("plat.dead_checkpoint") : t("plat.dead_body")}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.pixBtn} onClick={() => engineRef.current?.respawn()}>
                {t("plat.continue")}
              </button>
              <button
                type="button"
                className={`${styles.pixBtn} ${styles.pixBtnGhost}`}
                onClick={() => engineRef.current?.restart()}
              >
                {t("plat.retry")}
              </button>
              <button type="button" className={`${styles.pixBtn} ${styles.pixBtnGhost}`} onClick={() => setScreen("select")}>
                {t("plat.heroes")}
              </button>
              <button type="button" className={`${styles.pixBtn} ${styles.pixBtnGhost}`} onClick={() => platformer.close()}>
                {t("plat.exit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "game" && cleared && hud && (
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <h3 className={`${styles.cardTitle} ${styles.win}`}>{t("plat.cleared")}</h3>
            <p className={styles.cardBody}>{hud.levelName}</p>
            {hud.rank && (
              <div className={styles.rankWrap}>
                <span className={styles.rankLetter} data-rank={hud.rank}>{hud.rank}</span>
                <span className={styles.rankNote}>{t(`plat.rank_${hud.rank.toLowerCase()}`)}</span>
              </div>
            )}
            <dl className={styles.results}>
              <div><dt>{t("plat.coins")}</dt><dd>{hud.coins}/{hud.coinsTotal}</dd></div>
              <div><dt>{t("plat.damage")}</dt><dd>{hud.damage}</dd></div>
              <div>
                <dt>{t("plat.time")}</dt>
                <dd data-good={hud.time <= hud.par}>{hud.time.toFixed(1)}s</dd>
              </div>
              <div><dt>{t("plat.score")}</dt><dd>{hud.score}</dd></div>
            </dl>
            <div className={styles.actions}>
              <button type="button" className={styles.pixBtn} onClick={() => engineRef.current?.next()}>
                {lastLevel ? t("plat.finish") : t("plat.next")}
              </button>
              <button type="button" className={`${styles.pixBtn} ${styles.pixBtnGhost}`} onClick={() => engineRef.current?.restart()}>
                {t("plat.retry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "game" && phase === "won" && (
        <div className={styles.cardWrap}>
          <div className={`${styles.card} ${styles.cardWin}`}>
            <h3 className={`${styles.cardTitle} ${styles.win}`}>{t("plat.won")}</h3>
            <p className={styles.cardBody}>{t("plat.won_body")}</p>
            <dl className={styles.results}>
              <div><dt>{t("plat.score")}</dt><dd>{engineRef.current?.score ?? 0}</dd></div>
              <div><dt>{t("plat.best")}</dt><dd>{platformer.best()}</dd></div>
            </dl>
            <div className={styles.actions}>
              <a className={styles.pixBtn} href="#contact" onClick={() => platformer.close()}>
                {t("plat.cta")}
              </a>
              <button type="button" className={`${styles.pixBtn} ${styles.pixBtnGhost}`} onClick={() => setScreen("select")}>
                {t("plat.heroes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
