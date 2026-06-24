import { Star } from "../Icons";
import styles from "./works.module.css";

/** Complexity meter 1..5. */
export default function Stars({ value, label }: { value: number; label?: string }) {
  return (
    <span className={styles.stars} title={`${label ?? "Complexity"}: ${value}/5`} aria-label={`${label ?? "Complexity"} ${value} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          width={13}
          height={13}
          className={i < value ? styles.starOn : styles.starOff}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
