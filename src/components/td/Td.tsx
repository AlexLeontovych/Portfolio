import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";
import { td, useTdOpen } from "../../lib/tdStore";
import { lockScroll, unlockScroll } from "../../lib/scrollLock";
import { Close } from "../Icons";
import { LEVELS } from "./levels";
import { TdEngine, type Hud, type Phase } from "./engine";
import { DIFFICULTIES, TOWERS, type DifficultyId, type TowerId } from "./units";
import styles from "./td.module.css";

/**
 * IRONWOOD KEEP — the tower-defense overlay.
 *
 * The engine owns the canvas and every rule; this component is the chrome and
 * the only thing that ever speaks a language: level and difficulty select, the
 * HUD, the build and upgrade menus, and the end cards.
 */

const TOWER_ORDER: TowerId[] = ["archer", "barracks", "mage", "gatling", "bombard"];
const TOWER_GLYPH: Record<TowerId, string> = {
  archer: "🏹", barracks: "🛡", mage: "✦", gatling: "⁙", bombard: "☄",
};

export default function Td() {
  const open = useTdOpen();
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TdEngine | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [screen, setScreen] = useState<"select" | "game">("select");
  const [phase, setPhase] = useState<Phase>("loading");
  const [hud, setHud] = useState<Hud | null>(null);
  const [toast, setToast] = useState<string>("");
  const [level, setLevel] = useState(0);
  const [diff, setDiff] = useState<DifficultyId>("normal");
  const [unlocked, setUnlocked] = useState(0);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    setScreen("select");
    setUnlocked(td.unlocked());
    overlayRef.current?.focus();
    return () => unlockScroll();
  }, [open]);

  const boot = useCallback(async (lv: number, d: DifficultyId) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engineRef.current?.destroy();
    const engine = new TdEngine(canvas, {
      onPhase: setPhase,
      onHud: setHud,
      onToast: (msg) => {
        const text =
          msg.kind === "wave" ? `${t("td.wave")} ${msg.index}`
          : msg.kind === "boss" ? t("td.boss")
          : t("td.leak");
        setToast(text);
        window.setTimeout(() => setToast((c) => (c === text ? "" : c)), 1800);
      },
    });
    engineRef.current = engine;
    if (import.meta.env.DEV) {
      (window as unknown as { __td?: TdEngine }).__td = engine;
    }
    await engine.load();
    if (engineRef.current !== engine) return;
    engine.start(lv, d);
  }, [t]);

  useEffect(() => {
    if (open) return;
    engineRef.current?.destroy();
    engineRef.current = null;
  }, [open]);
  useEffect(() => () => engineRef.current?.destroy(), []);

  useEffect(() => {
    if (!open) return;
    const onResize = () => engineRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (phase === "won") {
      td.recordClear(level, diff);
      setUnlocked(td.unlocked());
    }
  }, [phase, level, diff]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        const eng = engineRef.current;
        if (screen === "game" && eng && (phase === "playing" || phase === "paused")) {
          if (hud?.selected) eng.clearSelection();
          else eng.setPaused(phase !== "paused");
        } else td.close();
        return;
      }
      if (screen !== "game") return;
      if (e.code === "Space") {
        e.preventDefault();
        engineRef.current?.callWave();
      }
      if (e.code === "KeyF") engineRef.current?.setSpeed(hud?.speed === 2 ? 1 : 2);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, screen, phase, hud]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    engineRef.current?.pick((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
  };

  if (!open) return null;

  const sel = hud?.selected ?? null;

  return createPortal(
    <div
      ref={overlayRef}
      tabIndex={-1}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="IRONWOOD KEEP"
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-hidden={screen !== "game"}
        onClick={onCanvasClick}
      />

      <button type="button" className={styles.close} onClick={() => td.close()} aria-label={t("td.exit")}>
        <Close />
      </button>

      {/* ------------------------------ level select ----------------------------- */}
      {screen === "select" && (
        <div className={styles.select}>
          <p className={styles.kicker}>{t("plat.kicker")}</p>
          <h2 className={styles.title}>IRONWOOD KEEP</h2>
          <p className={styles.tagline}>{t("td.tagline")}</p>

          <div className={styles.levels}>
            {LEVELS.map((l, i) => {
              const locked = i > unlocked;
              const done = td.cleared()[i];
              return (
                <button
                  key={l.name}
                  type="button"
                  disabled={locked}
                  className={`${styles.levelCard} ${i === level ? styles.levelSel : ""}`}
                  onClick={() => setLevel(i)}
                >
                  <span className={styles.levelNo}>{i + 1}</span>
                  <span className={styles.levelName}>{locked ? "???" : l.name}</span>
                  <span className={styles.levelMeta}>
                    {locked ? t("td.locked") : `${l.waves.length} ${t("td.waves")}`}
                  </span>
                  {done && <span className={styles.levelDone}>{DIFFICULTIES[done].name}</span>}
                </button>
              );
            })}
          </div>

          <div className={styles.diffs}>
            {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.diff} ${d === diff ? styles.diffSel : ""}`}
                onClick={() => setDiff(d)}
              >
                <span className={styles.diffName}>{t(`td.diff_${d}`)}</span>
                <span className={styles.diffMeta}>
                  ♥{DIFFICULTIES[d].lives} · ◉{DIFFICULTIES[d].gold}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.play}
            onClick={() => {
              setScreen("game");
              void boot(level, diff);
            }}
          >
            {t("td.start")}
          </button>
          <p className={styles.controls}>{t("td.controls")}</p>
        </div>
      )}

      {/* ---------------------------------- HUD ---------------------------------- */}
      {screen === "game" && hud && (
        <>
          <div className={styles.hud}>
            <span className={styles.stat} data-kind="gold">◉ {hud.gold}</span>
            <span className={styles.stat} data-kind="lives">♥ {hud.lives}</span>
            <span className={styles.stat}>
              {t("td.wave")} {hud.wave}/{hud.waves}
            </span>
            <span className={styles.levelTag}>{hud.levelName}</span>
          </div>

          <div className={styles.tools}>
            <button
              type="button"
              className={styles.tool}
              onClick={() => engineRef.current?.setSpeed(hud.speed === 2 ? 1 : 2)}
            >
              {hud.speed === 2 ? "▶▶" : "▶"}
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => engineRef.current?.setPaused(phase !== "paused")}
            >
              {phase === "paused" ? "▶" : "❚❚"}
            </button>
          </div>

          {hud.countdown !== null && phase === "playing" && (
            <button type="button" className={styles.callWave} onClick={() => engineRef.current?.callWave()}>
              <span className={styles.callTop}>{t("td.call")}</span>
              <span className={styles.callSub}>
                {Math.ceil(hud.countdown)}s · +{hud.earlyBonus} ◉
              </span>
            </button>
          )}

          {toast && <div className={styles.toast}>{toast}</div>}
        </>
      )}

      {/* ------------------------- build / upgrade menu --------------------------- */}
      {screen === "game" && sel && phase === "playing" && (
        <div className={styles.menu}>
          {!sel.tower ? (
            <>
              <p className={styles.menuTitle}>{t("td.build")}</p>
              <div className={styles.menuRow}>
                {TOWER_ORDER.map((id) => {
                  const def = TOWERS[id];
                  const cost = def.tiers[0].cost;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!sel.affordable[id]}
                      className={styles.buildBtn}
                      onClick={() => engineRef.current?.build(id)}
                      title={t(`td.tower_${id}_blurb`)}
                    >
                      <span className={styles.buildGlyph}>{TOWER_GLYPH[id]}</span>
                      <span className={styles.buildName}>{t(`td.tower_${id}`)}</span>
                      <span className={styles.buildCost}>◉ {cost}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className={styles.menuTitle}>
                {t(`td.tower_${sel.tower.id}`)} · {t("td.tier")} {sel.tower.tier + 1}
              </p>
              <div className={styles.menuRow}>
                {sel.tower.upgradeCost !== null ? (
                  <button
                    type="button"
                    className={styles.buildBtn}
                    disabled={hud!.gold < sel.tower.upgradeCost}
                    onClick={() => engineRef.current?.upgrade()}
                  >
                    <span className={styles.buildGlyph}>▲</span>
                    <span className={styles.buildName}>{t("td.upgrade")}</span>
                    <span className={styles.buildCost}>◉ {sel.tower.upgradeCost}</span>
                  </button>
                ) : (
                  <span className={styles.maxed}>{t("td.maxed")}</span>
                )}
                <button type="button" className={styles.buildBtn} onClick={() => engineRef.current?.sell()}>
                  <span className={styles.buildGlyph}>✕</span>
                  <span className={styles.buildName}>{t("td.sell")}</span>
                  <span className={styles.buildCost}>+◉ {sel.tower.sellValue}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* -------------------------------- end cards ------------------------------ */}
      {screen === "game" && (phase === "won" || phase === "lost" || phase === "paused") && (
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <h3 className={`${styles.cardTitle} ${phase === "won" ? styles.win : phase === "lost" ? styles.lose : ""}`}>
              {phase === "won" ? t("td.won") : phase === "lost" ? t("td.lost") : t("plat.paused")}
            </h3>
            {phase !== "paused" && (
              <p className={styles.cardBody}>
                {phase === "won" ? t("td.won_body") : t("td.lost_body")}
              </p>
            )}
            <div className={styles.actions}>
              {phase === "paused" && (
                <button type="button" className={styles.play} onClick={() => engineRef.current?.setPaused(false)}>
                  {t("plat.resume")}
                </button>
              )}
              {phase === "won" && level + 1 < LEVELS.length && (
                <button
                  type="button"
                  className={styles.play}
                  onClick={() => {
                    const next = level + 1;
                    setLevel(next);
                    void boot(next, diff);
                  }}
                >
                  {t("plat.next")}
                </button>
              )}
              <button
                type="button"
                className={`${styles.play} ${styles.ghost}`}
                onClick={() => engineRef.current?.restart()}
              >
                {t("plat.retry")}
              </button>
              <button
                type="button"
                className={`${styles.play} ${styles.ghost}`}
                onClick={() => setScreen("select")}
              >
                {t("td.levels")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
