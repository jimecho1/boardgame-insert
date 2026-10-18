import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Tray } from '../layout/types';

const GRIP_RADIUS = 11;

/**
 * Build the solid for one tray from the layout, with its origin corner at (0, 0, 0), Z up.
 * Pockets are cut down from the top face; card trays get a U-shaped finger channel
 * running across the tray (through the walls and dividers) so a deck can be pinched out.
 */
export function buildTray(wasm: ManifoldToplevel, tray: Tray): Manifold {
  const { Manifold } = wasm;
  let solid = Manifold.cube([tray.w, tray.d, tray.h]);

  for (const c of tray.compartments) {
    const pocket = Manifold.cube([c.w, c.d, c.depth + 1]).translate([c.x, c.y, tray.h - c.depth]);
    solid = solid.subtract(pocket);
  }

  if (tray.grip && tray.gripDepth) {
    const across = tray.grip === 'x' ? tray.d : tray.w; // the side the channel is centred on
    const length = (tray.grip === 'x' ? tray.w : tray.d) + 2;
    const r = Math.min(GRIP_RADIUS, across / 4);
    const bottom = tray.h - tray.gripDepth;
    let round = Manifold.cylinder(length, r, r, 48);
    let slot = Manifold.cube([2 * r, length, tray.h]);
    if (tray.grip === 'x') {
      round = round.rotate([0, 90, 0]).translate([-1, tray.d / 2, bottom + r]);
      slot = Manifold.cube([length, 2 * r, tray.h]).translate([-1, tray.d / 2 - r, bottom + r]);
    } else {
      round = round.rotate([-90, 0, 0]).translate([tray.w / 2, -1, bottom + r]);
      slot = slot.translate([tray.w / 2 - r, -1, bottom + r]);
    }
    solid = solid.subtract(round.add(slot));
  }
  return solid;
}
