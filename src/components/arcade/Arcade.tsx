import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";
import { arcade, useArcadeOpen } from "../../lib/arcadeStore";
import { carStore, useSelectedCar } from "../../lib/carStore";
import { sound, useMuted } from "../../lib/muted";
import { lockScroll, unlockScroll } from "../../lib/scrollLock";
import { ArcadeEngine, type ArcadePhase } from "./engine";
import { CAR_STYLES } from "./cars";
import { Turntable } from "./carViewer";
import { Close, Gamepad, Muted, Videocam, Smartphone, Sound } from "../Icons";
import styles from "./arcade.module.css";

/**
 * NEON RUN — full-screen pseudo-3D arcade racer overlay. The canvas + game
 * loop live in engine.ts; this component provides the chrome: the floating
 * launch button, the ready / game-over screens (localized) and open/close
 * plumbing (scroll lock, Escape, focus).
 */

/** One garage card: a live 3D turntable, the name plate and flavor stats. */
function CarCard({
  idx,
  selected,
  onSelect,
}: {
  idx: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tt = new Turntable(canvas, idx);
    return () => tt.destroy();
  }, [idx]);
  const def = CAR_STYLES[idx];
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.cardSel : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={def.name}
    >
      <canvas ref={canvasRef} className={styles.cardCanvas} />
      <span className={styles.cardName}>{def.name}</span>
      <span className={styles.cardStats}>
        {(["speed", "grip", "style"] as const).map((k) => (
          <span key={k} className={styles.statRow}>
            <span className={styles.statLabel}>{k.toUpperCase()}</span>
            <span className={styles.statBar}>
              {[1, 2, 3, 4, 5].map((n) => (
                <i key={n} className={n <= def.stats[k] ? styles.segOn : styles.seg} />
              ))}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}

export default function Arcade() {
  const open = useArcadeOpen();
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArcadeEngine | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<ArcadePhase>("ready");
  const [tiltOn, setTiltOn] = useState(false);
  const muted = useMuted();
  const carIdx = useSelectedCar();
  const [result, setResult] = useState<{
    score: number;
    best: number;
    record: boolean;
    reachedGate: boolean;
  } | null>(null);

  const touch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: none), (pointer: coarse)").matches;

  useEffect(() => {
    engineRef.current?.audio.setMuted(muted);
  }, [muted]);

  // in the garage the arrow keys browse the cars
  useEffect(() => {
    if (!open || phase !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (carStore.get() + dir + CAR_STYLES.length) % CAR_STYLES.length;
      carStore.set(next);
      engineRef.current?.setCar(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    lockScroll();
    setPhase("ready");
    setResult(null);
    const engine = new ArcadeEngine(canvas, {
      onState: setPhase,
      onGameOver: (score, best, record, reachedGate) =>
        setResult({ score, best, record, reachedGate }),
      onCrash: () => {
        // the page shudders from the impact
        overlayRef.current?.animate(
          [
            { transform: "translate(0, 0)" },
            { transform: "translate(-7px, 4px)" },
            { transform: "translate(6px, -5px)" },
            { transform: "translate(-4px, -3px)" },
            { transform: "translate(3px, 2px)" },
            { transform: "translate(0, 0)" },
          ],
          { duration: 420, easing: "ease-out" }
        );
      },
    });
    engineRef.current = engine;
    // the store is the source of truth for the garage selection (survives
    // storage-blocked environments where localStorage silently fails)
    engine.setCar(carStore.get());
    // Dev-only handle for measuring frame cost from the console / tooling.
    if (import.meta.env.DEV) {
      (window as unknown as { __arcadeEngine?: ArcadeEngine }).__arcadeEngine = engine;
    }
    setTiltOn(engine.isTiltEnabled());
    // Focus the dialog itself, NOT the close button: with the button focused,
    // Enter would both start the game (engine) and "click" close (browser).
    overlayRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        arcade.close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      engine.destroy();
      engineRef.current = null;
      if (import.meta.env.DEV) {
        delete (window as unknown as { __arcadeEngine?: ArcadeEngine }).__arcadeEngine;
      }
      unlockScroll();
    };
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          className={styles.launch}
          onClick={() => arcade.open()}
          aria-label={t("arcade.launch")}
          title={t("arcade.launch")}
        >
          <Gamepad width={16} height={16} className={styles.launchIcon} />
          <span className={styles.launchText}>{t("arcade.launch")}</span>
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={overlayRef}
            tabIndex={-1}
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-label="NEON RUN"
          >
            <canvas ref={canvasRef} className={styles.canvas} />

            <button
              ref={closeRef}
              type="button"
              className={styles.close}
              onClick={() => arcade.close()}
              aria-label={t("arcade.exit")}
            >
              <Close />
            </button>


            <button
              type="button"
              className={styles.view}
              onClick={() => engineRef.current?.toggleView()}
              aria-label={t("arcade.view")}
              title={t("arcade.view")}
            >
              <Videocam width={18} height={18} />
            </button>

            <button
              type="button"
              className={styles.speaker}
              onClick={() => sound.toggle()}
              aria-pressed={muted}
              aria-label={t("arcade.sound")}
              title={t("arcade.sound")}
            >
              {muted ? <Muted width={18} height={18} /> : <Sound width={18} height={18} />}
            </button>

            {touch && (
              <button
                type="button"
                className={`${styles.tilt} ${tiltOn ? styles.tiltOn : ""}`}
                onClick={() => {
                  const engine = engineRef.current;
                  if (!engine) return;
                  if (tiltOn) {
                    engine.disableTilt();
                    setTiltOn(false);
                  } else {
                    void engine.enableTilt().then(setTiltOn);
                  }
                }}
                aria-pressed={tiltOn}
                aria-label={t("arcade.tilt")}
                title={t("arcade.tilt")}
              >
                <Smartphone width={18} height={18} />
              </button>
            )}

            {phase === "ready" && (
              <div className={styles.garage}>
                <h2 className={styles.title}>NEON RUN</h2>
                <p className={styles.tagline}>{t("arcade.garage")}</p>
                <div className={styles.cards}>
                  {CAR_STYLES.map((d, i) => (
                    <CarCard
                      key={d.name}
                      idx={i}
                      selected={i === carIdx}
                      onSelect={() => {
                        carStore.set(i);
                        engineRef.current?.setCar(i);
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className={`btn ${styles.startBtn}`}
                  onClick={() => engineRef.current?.play()}
                >
                  {t("arcade.start")}
                </button>
                <p className={styles.controls}>
                  {touch ? t("arcade.controls_touch") : t("arcade.controls")}
                </p>
              </div>
            )}

            {phase === "over" && result && (
              <div className={styles.overWrap}>
                <div className={styles.overCard}>
                  <h2 className={styles.overTitle}>{t("arcade.over")}</h2>
                  {result.record && <p className={styles.record}>{t("arcade.record")}</p>}
                  <dl className={styles.results}>
                    <div>
                      <dt>{t("arcade.score")}</dt>
                      <dd>{result.score}</dd>
                    </div>
                    <div>
                      <dt>{t("arcade.best")}</dt>
                      <dd>{result.best}</dd>
                    </div>
                  </dl>
                  <div className={styles.actions}>
                    {result.reachedGate && (
                      <a
                        className={`btn ${styles.again}`}
                        href="#contact"
                        onClick={() => {
                          arcade.close();
                        }}
                      >
                        {t("arcade.cta")}
                      </a>
                    )}
                    <button
                      type="button"
                      className={`btn ${result.reachedGate ? "btn--ghost" : styles.again}`}
                      onClick={() => {
                        setResult(null);
                        engineRef.current?.play();
                      }}
                    >
                      {t("arcade.again")}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => arcade.close()}
                    >
                      {t("arcade.exit")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
