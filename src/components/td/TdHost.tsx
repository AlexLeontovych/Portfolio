import { Suspense, lazy } from "react";
import { useTdOpen } from "../../lib/tdStore";

/**
 * Gate for the tower-defense overlay: its own chunk, fetched only when
 * somebody presses Play, the same way the platformer is loaded.
 */
const Td = lazy(() => import("./Td"));

export default function TdHost() {
  const open = useTdOpen();
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Td />
    </Suspense>
  );
}
