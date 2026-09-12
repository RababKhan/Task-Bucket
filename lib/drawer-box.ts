// The View drawer opens beside its table: it starts at the top of the table
// and runs to the bottom of the page. In a view whose table already fills the
// page that is the table's own height; in one with a short table the drawer
// still has room for its controls.
const EDGE_GAP = 16;

export type DrawerBox = { top: number; bottom: number };

export function drawerBoxFor(tableTop: number): DrawerBox {
  return { top: Math.max(0, tableTop), bottom: EDGE_GAP };
}
