// `react-big-calendar` doesn't publish types for its internal layout
// algorithm modules (only the top-level package is typed, via
// @types/react-big-calendar) — this loosely types the two deep-imported
// modules used by src/lib/noOverlapFixed.ts to patch a known bug in the
// built-in "no-overlap" dayLayoutAlgorithm (see that file for details).
declare module "react-big-calendar/lib/utils/layout-algorithms/overlap" {
  import type { DayLayoutFunction } from "react-big-calendar";
  const overlapAlgorithm: DayLayoutFunction<object>;
  export default overlapAlgorithm;
}
