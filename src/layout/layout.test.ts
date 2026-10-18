import { describe, expect, it } from 'vitest';
import { BOX_MARGIN, TOKEN_PACKING, generateLayout } from './layout';
import { MaxRects } from './maxrects';
import { WINGSPAN } from './fixtures';
import { cardStackSize } from './cards';
import type { Layout, LayoutInput, TokenGroup, Tray } from './types';

const EPS = 1e-6;

function overlaps(a: Tray, b: Tray): boolean {
  return (
    a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS &&
    a.y < b.y + b.d - EPS && b.y < a.y + a.d - EPS &&
    a.z < b.z + b.h - EPS && b.z < a.z + a.h - EPS
  );
}

/** Invariants every layout must satisfy. */
function checkLayout(input: LayoutInput, layout: Layout) {
  const { box, tol, bed } = input;
  for (const t of layout.trays) {
    // inside the box and under the reserved top space
    expect(t.x).toBeGreaterThanOrEqual(BOX_MARGIN - EPS);
    expect(t.y).toBeGreaterThanOrEqual(BOX_MARGIN - EPS);
    expect(t.x + t.w).toBeLessThanOrEqual(box.w - BOX_MARGIN + EPS);
    expect(t.y + t.d).toBeLessThanOrEqual(box.d - BOX_MARGIN + EPS);
    expect(t.z).toBeGreaterThanOrEqual(-EPS);
    expect(t.z + t.h).toBeLessThanOrEqual(layout.availableHeight + EPS);
    // printable
    const fits = (t.w <= bed.w + EPS && t.d <= bed.d + EPS) || (t.w <= bed.d + EPS && t.d <= bed.w + EPS);
    expect(fits, `${t.id} ${t.w}x${t.d} must fit the bed`).toBe(true);
    // compartments sit inside the walls and don't overlap each other
    for (const c of t.compartments) {
      expect(c.x).toBeGreaterThanOrEqual(tol.wall - EPS);
      expect(c.y).toBeGreaterThanOrEqual(tol.wall - EPS);
      expect(c.x + c.w).toBeLessThanOrEqual(t.w - tol.wall + EPS);
      expect(c.y + c.d).toBeLessThanOrEqual(t.d - tol.wall + EPS);
      expect(c.depth).toBeLessThanOrEqual(t.h - tol.floor + EPS);
    }
  }
  for (let i = 0; i < layout.trays.length; i++)
    for (let j = i + 1; j < layout.trays.length; j++)
      expect(overlaps(layout.trays[i], layout.trays[j]), `${layout.trays[i].id} overlaps ${layout.trays[j].id}`).toBe(false);

  // every piece is either in a compartment or reported as unplaced
  input.groups.forEach((g, gi) => {
    const stored = layout.trays.flatMap((t) => t.compartments).filter((c) => c.groupIndex === gi).reduce((a, c) => a + c.count, 0);
    const missing = layout.unplaced.filter((u) => u.groupIndex === gi).reduce((a, u) => a + u.count, 0);
    expect(stored + missing, `group ${g.name}`).toBe(g.count);
  });
}

describe('MaxRects', () => {
  it('packs four quarters exactly', () => {
    const mr = new MaxRects(100, 100);
    for (let i = 0; i < 4; i++) {
      const p = mr.find(50, 50)!;
      expect(p).not.toBeNull();
      mr.place(p);
    }
    expect(mr.find(1, 1)).toBeNull();
  });

  it('rotates to make a piece fit', () => {
    const mr = new MaxRects(100, 40);
    const p = mr.find(30, 90)!;
    expect(p.rotated).toBe(true);
  });
});

describe('generateLayout — Wingspan', () => {
  const layout = generateLayout(WINGSPAN);

  it('places every component', () => {
    expect(layout.unplaced).toEqual([]);
    checkLayout(WINGSPAN, layout);
  });

  it('stands the cards upright in one shared tray', () => {
    const cardTrays = layout.trays.filter((t) => t.compartments.some((c) => c.kind === 'cards'));
    expect(cardTrays).toHaveLength(1);
    expect(cardTrays[0].compartments).toHaveLength(3);
    expect(cardTrays[0].compartments.every((c) => c.cardOrientation === 'upright')).toBe(true);
  });

  it('gives each card pocket room for its deck', () => {
    for (const t of layout.trays)
      for (const c of t.compartments) {
        if (c.kind !== 'cards') continue;
        const g = WINGSPAN.groups[c.groupIndex];
        if (g.kind !== 'cards') throw new Error('expected cards');
        const stack = cardStackSize({ ...g, count: c.count });
        const thickness = Math.min(c.w, c.d);
        const length = Math.max(c.w, c.d);
        expect(thickness).toBeGreaterThanOrEqual(stack.h);
        expect(length).toBeGreaterThanOrEqual(stack.d);
        expect(c.depth).toBeGreaterThanOrEqual(stack.w);
      }
  });

  it('gives token pockets enough volume', () => {
    WINGSPAN.groups.forEach((g, gi) => {
      if (g.kind !== 'tokens') return;
      const pockets = layout.trays.flatMap((t) => t.compartments).filter((c) => c.groupIndex === gi);
      const vol = pockets.reduce((a, c) => a + c.w * c.d * c.depth, 0);
      const u = (g as TokenGroup).unit;
      expect(vol).toBeGreaterThanOrEqual((u.w * u.d * u.h * g.count) / TOKEN_PACKING - EPS);
    });
  });
});

describe('generateLayout — edge cases', () => {
  const base = WINGSPAN;

  it('lays cards flat when the box is too shallow to stand them', () => {
    const input: LayoutInput = { ...base, box: { ...base.box, h: 45 }, reservedTop: 0 };
    const layout = generateLayout(input);
    checkLayout(input, layout);
    const cards = layout.trays.flatMap((t) => t.compartments).filter((c) => c.kind === 'cards');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.cardOrientation === 'flat')).toBe(true);
  });

  it('honours a forced orientation', () => {
    const groups = base.groups.map((g) => (g.kind === 'cards' ? { ...g, orientation: 'flat' as const } : g));
    const input = { ...base, groups };
    const layout = generateLayout(input);
    checkLayout(input, layout);
    expect(layout.trays.flatMap((t) => t.compartments).filter((c) => c.kind === 'cards').every((c) => c.cardOrientation === 'flat')).toBe(true);
  });

  it('splits a long card row to fit a small printer', () => {
    const groups = [{ ...base.groups[0], count: 600 }];
    const input: LayoutInput = { ...base, groups, bed: { w: 180, d: 180, h: 180 } };
    const layout = generateLayout(input);
    checkLayout(input, layout);
    expect(layout.trays.length).toBeGreaterThan(1);
    expect(layout.unplaced).toEqual([]);
  });

  it('reports what does not fit instead of overflowing', () => {
    const groups = [{ ...base.groups[0], count: 3000 }];
    const input = { ...base, groups };
    const layout = generateLayout(input);
    checkLayout(input, layout);
    expect(layout.unplaced.length).toBeGreaterThan(0);
  });

  it('reports everything when the reserved top leaves no height', () => {
    const input = { ...base, reservedTop: base.box.h };
    const layout = generateLayout(input);
    expect(layout.trays).toEqual([]);
    expect(layout.unplaced).toHaveLength(base.groups.length);
  });
});
