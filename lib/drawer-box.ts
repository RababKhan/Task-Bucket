// The View drawer stands beside its table: same top, same bottom. A very short
// table would squeeze the drawer's own controls out of sight, so it never
// shrinks below MIN_HEIGHT and simply hangs lower than the table instead.
const MIN_HEIGHT = 380;
const EDGE_GAP = 16;

export type DrawerBox = { top: number; bottom: number };

export function drawerBoxFor(
  tableTop: number,
  tableBottom: number,
  viewportHeight: number = typeof window === "undefined" ? 0 : window.innerHeight
): DrawerBox {
  const top = Math.max(0, tableTop);
  let bottom = Math.max(0, viewportHeight - tableBottom);
  const height = viewportHeight - top - bottom;
  if (height < MIN_HEIGHT) {
    bottom = Math.max(EDGE_GAP, viewportHeight - top - MIN_HEIGHT);
  }
  return { top, bottom };
}
