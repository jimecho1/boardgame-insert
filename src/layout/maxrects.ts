/** Axis-aligned rectangle on the box floor. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface Placement extends Rect {
  rotated: boolean;
}

const EPS = 1e-6;

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.d - EPS && b.y < a.y + a.d - EPS;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.d <= outer.y + outer.d + EPS
  );
}

/**
 * MaxRects 2D bin packer (Jukka Jylänki's "best short side fit" heuristic).
 * Free space is kept as a list of maximal, possibly overlapping rectangles.
 */
export class MaxRects {
  free: Rect[];

  constructor(public readonly w: number, public readonly d: number) {
    this.free = [{ x: 0, y: 0, w, d }];
  }

  /** Find the best spot for a w × d rectangle without placing it. */
  find(w: number, d: number, allowRotate = true): Placement | null {
    let best: Placement | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    const tryFit = (fw: number, fd: number, rotated: boolean) => {
      for (const r of this.free) {
        if (fw > r.w + EPS || fd > r.d + EPS) continue;
        const short = Math.min(r.w - fw, r.d - fd);
        const long = Math.max(r.w - fw, r.d - fd);
        if (short < bestShort - EPS || (Math.abs(short - bestShort) <= EPS && long < bestLong)) {
          best = { x: r.x, y: r.y, w: fw, d: fd, rotated };
          bestShort = short;
          bestLong = long;
        }
      }
    };
    tryFit(w, d, false);
    if (allowRotate && Math.abs(w - d) > EPS) tryFit(d, w, true);
    return best;
  }

  /** Mark a rectangle as used and update the free list. */
  place(used: Rect): void {
    const next: Rect[] = [];
    for (const r of this.free) {
      if (!intersects(r, used)) {
        next.push(r);
        continue;
      }
      // Split r into up to four maximal rectangles around `used`.
      if (used.x > r.x + EPS) next.push({ x: r.x, y: r.y, w: used.x - r.x, d: r.d });
      if (used.x + used.w < r.x + r.w - EPS)
        next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - (used.x + used.w), d: r.d });
      if (used.y > r.y + EPS) next.push({ x: r.x, y: r.y, w: r.w, d: used.y - r.y });
      if (used.y + used.d < r.y + r.d - EPS)
        next.push({ x: r.x, y: used.y + used.d, w: r.w, d: r.y + r.d - (used.y + used.d) });
    }
    // Drop rectangles fully contained in another one.
    this.free = next.filter(
      (a, i) => !next.some((b, j) => j !== i && contains(b, a) && (!contains(a, b) || j < i)),
    );
  }
}
