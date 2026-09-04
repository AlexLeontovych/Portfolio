import { Suspense, lazy } from "react";
import { usePlatformerOpen } from "../../lib/platformerStore";

/**
 * Gate for the platformer overlay.
 *
 * The game is ~40 kB of engine, sprites and synthesised audio that most
 * visitors never open, so it lives in its own chunk and is only fetched once
 * someone actually presses Play. The store lives outside the lazy boundary,
 * which is what lets any card on the page trigger the load.
 */
const Platformer = lazy(() => import("./Platformer"));

export default function PlatformerHost() {
  const open = usePlatformerOpen();
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Platformer />
    </Suspense>
  );
}
