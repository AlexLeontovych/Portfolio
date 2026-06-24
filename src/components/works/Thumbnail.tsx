import { useEffect, useMemo, useRef, useState } from "react";
import type { Work } from "../../data/types";
import { getThumb, posterFor } from "../../utils/thumb";
import styles from "./works.module.css";

/**
 * Lazy screenshot for a live demo. Uses the auto-screenshot service, retries
 * once (mShots warms up on first hit), then falls back to a generated poster.
 */
export default function Thumbnail({
  work,
  width = 640,
  alt,
  eager = false,
}: {
  work: Work;
  width?: number;
  alt: string;
  eager?: boolean;
}) {
  const poster = useMemo(() => posterFor(work), [work]);
  const primary = useMemo(() => getThumb(work, width), [work, width]);
  const [src, setSrc] = useState(primary);
  const [loaded, setLoaded] = useState(false);
  const triedRetry = useRef(false);
  const retryTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setSrc(primary);
    setLoaded(false);
    triedRetry.current = false;
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [primary]);

  const handleError = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (!triedRetry.current && !work.thumb) {
      // mShots often needs a second hit once the screenshot is generated.
      triedRetry.current = true;
      const bust = `${primary}${primary.includes("?") ? "&" : "?"}r=${Date.now()}`;
      retryTimer.current = window.setTimeout(() => setSrc(bust), 1500);
    } else {
      setSrc(poster);
      setLoaded(true);
    }
  };

  return (
    <div className={styles.thumb} data-loaded={loaded}>
      <img
        src={src}
        alt={alt}
        width={width}
        height={Math.round((width * 3) / 4)}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={styles.thumbImg}
      />
      <span className={styles.thumbShimmer} aria-hidden="true" />
    </div>
  );
}
