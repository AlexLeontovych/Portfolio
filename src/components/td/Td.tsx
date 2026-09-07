import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";
import { td, useTdOpen } from "../../lib/tdStore";
import { lockScroll, unlockScroll } from "../../lib/scrollLock";
import { Close } from "../Icons";
import { LEVELS } from "./levels";
import { MAPS } from "./maps";
import { TdEngine, type Hud, type Phase } from "./engine";
import { DIFFICULTIES, TOWERS, type DifficultyId, type TowerId } from "./units";
import styles from "./td.module.css";
import { UI_VARS } from "./ui";

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

/**
 * The tower itself, painted into the menu at the tier on offer.
 *
 * A price and the word "upgrade" tell you nothing about what you are buying.
 * This is the frame the board draws, so the choice between two tiers is made
 * on the two towers. The glyph stays underneath as the fallback for a level
 * whose atlas has not arrived, or a tower that has no art yet.
 */
function TowerShot({ engine, id, tier }: {
  engine: TdEngine | null; id: TowerId; tier: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let alive = true;
    const paint = () => {
      const cv = ref.current;
      if (!alive || !cv || !engine) return false;
      const ok = engine.drawPreview(cv, id, tier);
      if (ok) setDrawn(true);
      return ok;
    };
    // the atlas is loaded with the level, so it is normally already here;
    // one retry covers a menu opened in the same frame it finished
    if (!paint()) {
      const again = window.setTimeout(paint, 250);
      return () => { alive = false; window.clearTimeout(again); };
    }
    return () => { alive = false; };
  }, [engine, id, tier]);
  return (
    <span className={styles.shotWrap}>
      <canvas ref={ref} width={80} height={78} className={styles.shot} />
      {!drawn && <span className={styles.buildGlyph}>{TOWER_GLYPH[id]}</span>}
    </span>
  );
}

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
      style={UI_VARS as React.CSSProperties}
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
        <div
          className={styles.select}
          style={
            {
              ...UI_VARS,
              // the map behind the menu is the one about to be played, so the
              // choice is made looking at the place rather than at a name
              "--td-map": LEVELS[level].map
                ? `url(${new URL(`games/td/maps/${MAPS[LEVELS[level].map as string].image}`,
                                    document.baseURI).href})`
                : "none",
            } as React.CSSProperties
          }
        >
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
                  <i className={styles.icon} data-icon="lives" />{DIFFICULTIES[d].lives} · <i className={styles.icon} data-icon="gold" />{DIFFICULTIES[d].gold}
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
            <span className={styles.stat} data-kind="gold"><i className={styles.icon} data-icon="gold" /> {hud.gold}</span>
            <span className={styles.stat} data-kind="lives"><i className={styles.icon} data-icon="lives" /> {hud.lives}</span>
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
                {Math.ceil(hud.countdown)}s · +{hud.earlyBonus} <i className={styles.icon} data-icon="gold" />
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
                      <TowerShot engine={engineRef.current} id={id} tier={0} />
                      <span className={styles.buildName}>{t(`td.tower_${id}`)}</span>
                      <span className={styles.buildCost}><i className={styles.icon} data-icon="gold" /> {cost}</span>
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
                {sel.tower.upgrades.length > 0 ? (
                  sel.tower.upgrades.map((up) => (
                    <button
                      key={up.tier}
                      type="button"
                      className={styles.buildBtn}
                      disabled={hud!.gold < up.cost}
                      onClick={() => engineRef.current?.upgradeTo(up.tier)}
                      title={`${t("td.tier")} ${up.tier + 1} · ${up.blurb}`}
                    >
                      <TowerShot engine={engineRef.current} id={sel.tower!.id} tier={up.tier} />
                      <span className={styles.buildName}>
                        {t("td.tier")} {up.tier + 1}
                      </span>
                      <span className={styles.buildCost}><i className={styles.icon} data-icon="gold" /> {up.cost}</span>
                    </button>
                  ))
                ) : (
                  <span className={styles.maxed}>{t("td.maxed")}</span>
                )}
                <button type="button" className={styles.buildBtn} onClick={() => engineRef.current?.sell()}>
                  <span className={styles.shotWrap}><i className={styles.icon} data-icon="sell" /></span>
                  <span className={styles.buildName}>{t("td.sell")}</span>
                  <span className={styles.buildCost}>+<i className={styles.icon} data-icon="gold" /> {sel.tower.sellValue}</span>
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
