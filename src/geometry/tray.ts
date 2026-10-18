import type { ManifoldToplevel, Manifold } from 'manifold-3d';
import type { Size3, Tolerances } from '../layout/types';

/**
 * A single-pocket card tray. Cards stand upright: the pocket is
 * (stack thickness) wide, (card width) deep and holds the card's long edge vertically,
 * with a finger notch cut through the front wall.
 */
export function cardTray(wasm: ManifoldToplevel, stack: Size3, tol: Tolerances): { solid: Manifold; outer: Size3 } {
  const { Manifold } = wasm;

  const pocket: Size3 = {
    w: stack.h + tol.fit * 2, // stack thickness lies along X
    d: stack.w + tol.fit * 2, // card width along Y
    h: Math.min(stack.d * 0.6, 60), // cards stick out above the walls so they are easy to grab
  };
  const outer: Size3 = {
    w: pocket.w + tol.wall * 2,
    d: pocket.d + tol.wall * 2,
    h: pocket.h + tol.floor,
  };

  const body = Manifold.cube([outer.w, outer.d, outer.h]);
  const hole = Manifold.cube([pocket.w, pocket.d, pocket.h + 1]).translate([tol.wall, tol.wall, tol.floor]);

  // Finger notch: a U-shaped cut through the front (Y = 0) wall, down to 40% of the wall height.
  const notchR = Math.min(12, (pocket.w - 2) / 2);
  const notchBottom = tol.floor + pocket.h * 0.4;
  const through = tol.wall + 2;
  const round = Manifold.cylinder(through, notchR, notchR, 48)
    .rotate([-90, 0, 0]) // lay the cylinder along +Y
    .translate([outer.w / 2, -1, notchBottom + notchR]);
  const slot = Manifold.cube([notchR * 2, through, outer.h])
    .translate([outer.w / 2 - notchR, -1, notchBottom + notchR]);
  const notch = round.add(slot);

  return { solid: body.subtract(hole).subtract(notch), outer };
}
