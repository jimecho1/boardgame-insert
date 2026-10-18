import { cardStackSize } from './cards';
import { MaxRects, type Rect } from './maxrects';
import type { Compartment, Layout, LayoutInput, Size3, TokenGroup, Tray, Unplaced } from './types';

/** Gap left between the trays and the inside of the game box, per side. */
export const BOX_MARGIN = 0.5;
/** Smallest footprint side worth turning into a token tray. */
const MIN_TOKEN_TRAY = 30;
/** Smallest free height above a column worth stacking a token tray into. */
const MIN_STACK_HEIGHT = 15;
/** Fraction of a pocket's volume that loose pieces actually occupy. */
export const TOKEN_PACKING = 0.6;
/** Preferred minimum height of one token tray layer. */
const TOKEN_LAYER_MIN = 22;
/** Token trays may be up to this much bigger than needed before they are trimmed. */
const TOKEN_SLACK = 1.15;
const EPS = 1e-6;

interface Column {
  blocks: Tray[];
  h: number;
  x: number;
  y: number;
  usedTop: boolean;
}

function fitsBed(w: number, d: number, bed: Size3): boolean {
  return (w <= bed.w + EPS && d <= bed.d + EPS) || (w <= bed.d + EPS && d <= bed.w + EPS);
}

/** Longest second side the bed allows when the first side is `fixed`. */
function maxLenAlong(fixed: number, bed: Size3): number {
  let m = 0;
  if (fixed <= bed.d + EPS) m = Math.max(m, bed.w);
  if (fixed <= bed.w + EPS) m = Math.max(m, bed.d);
  return m;
}

/** Rotate a tray 90° in place (swap X and Y). */
export function rotateTray(t: Tray): void {
  [t.w, t.d] = [t.d, t.w];
  for (const c of t.compartments) {
    [c.x, c.y] = [c.y, c.x];
    [c.w, c.d] = [c.d, c.w];
  }
  if (t.grip) t.grip = t.grip === 'x' ? 'y' : 'x';
}

function tokenUnitVolume(g: TokenGroup): number {
  return g.unit.w * g.unit.d * g.unit.h;
}

/**
 * Turn a list of components into a set of printable trays packed inside the box.
 *
 * 1. Cards become trays: upright (standing on the long edge) when the box is tall enough,
 *    otherwise flat piles. Upright decks of the same card size share one tray with dividers.
 * 2. Trays with a small enough footprint are stacked on top of each other into columns.
 * 3. Columns are packed on the box floor with MaxRects.
 * 4. Tokens fill the largest remaining spaces (floor gaps first, then the space above columns),
 *    split into stackable layers, with one pocket per token type.
 */
export function generateLayout(input: LayoutInput): Layout {
  const { box, tol, bed, groups } = input;
  const availH = box.h - input.reservedTop;
  const area = { w: box.w - 2 * BOX_MARGIN, d: box.d - 2 * BOX_MARGIN };
  const unplaced: Unplaced[] = [];
  const warnings: string[] = [];
  const blocks: Tray[] = [];
  let trayNo = 0;
  const nextId = () => `T${++trayNo}`;

  if (availH <= tol.floor) {
    return {
      box,
      availableHeight: availH,
      trays: [],
      unplaced: groups.map((g, gi) => ({ groupIndex: gi, count: g.count, reason: '盒入面冇可用高度' })),
      warnings,
    };
  }

  // --- 1. Card trays -------------------------------------------------------
  const buckets = new Map<string, { faceW: number; faceD: number; items: { gi: number; count: number; per: number }[] }>();

  groups.forEach((g, gi) => {
    if (g.kind !== 'cards' || g.count <= 0) return;
    const stack = cardStackSize(g);
    const per = stack.h / g.count; // thickness of one (sleeved) card
    const standH = stack.w + tol.fit + tol.floor;
    const orient = g.orientation ?? 'auto';
    const upright = orient === 'upright' || (orient === 'auto' && standH <= availH);

    if (upright) {
      if (standH > availH + EPS) warnings.push(`「${g.name}」企放會高過可用高度 ${availH.toFixed(1)} mm`);
      const key = `${stack.w.toFixed(2)}x${stack.d.toFixed(2)}`;
      const b = buckets.get(key) ?? { faceW: stack.w, faceD: stack.d, items: [] };
      b.items.push({ gi, count: g.count, per });
      buckets.set(key, b);
      return;
    }

    // Flat piles, split into several trays if the pile is taller than the box allows.
    const pocketW = stack.w + tol.fit;
    const pocketD = stack.d + tol.fit;
    const perTray = Math.floor((availH - tol.floor - tol.fit) / per);
    if (perTray < 1) {
      unplaced.push({ groupIndex: gi, count: g.count, reason: '盒太矮，平放都放唔落' });
      return;
    }
    let left = g.count;
    while (left > 0) {
      const take = Math.min(left, perTray);
      const h = take * per + tol.fit + tol.floor;
      blocks.push({
        id: nextId(),
        label: g.name,
        x: 0, y: 0, z: 0,
        w: pocketW + 2 * tol.wall,
        d: pocketD + 2 * tol.wall,
        h,
        compartments: [{
          x: tol.wall, y: tol.wall, w: pocketW, d: pocketD, depth: h - tol.floor,
          groupIndex: gi, count: take, kind: 'cards', cardOrientation: 'flat',
        }],
        grip: 'x',
        gripDepth: h - tol.floor,
      });
      left -= take;
    }
  });

  for (const b of buckets.values()) {
    // Cards stand on their long edge: stack thickness runs along X, long side along Y, short side up.
    const pocketD = b.faceD + tol.fit;
    const trayD = pocketD + 2 * tol.wall;
    const trayH = b.faceW + tol.fit + tol.floor;
    const capW = Math.min(maxLenAlong(trayD, bed), Math.max(area.w, area.d));
    let comps: Compartment[] = [];
    let cursor = tol.wall;
    const names: string[] = [];

    const flush = () => {
      if (!comps.length) return;
      blocks.push({
        id: nextId(),
        label: [...new Set(names)].join(' + '),
        x: 0, y: 0, z: 0,
        w: cursor,
        d: trayD,
        h: trayH,
        compartments: comps,
        grip: 'x',
        gripDepth: (trayH - tol.floor) * 0.6,
      });
      comps = [];
      names.length = 0;
      cursor = tol.wall;
    };

    for (const item of b.items) {
      let left = item.count;
      while (left > 0) {
        const space = capW - cursor - tol.wall;
        const fit = Math.floor((space - tol.fit) / item.per);
        if (fit < 1) {
          if (comps.length) { flush(); continue; }
          unplaced.push({ groupIndex: item.gi, count: left, reason: '打印床太細，放唔落一格卡' });
          break;
        }
        const take = Math.min(left, fit);
        const pocketW = take * item.per + tol.fit;
        comps.push({
          x: cursor, y: tol.wall, w: pocketW, d: pocketD, depth: trayH - tol.floor,
          groupIndex: item.gi, count: take, kind: 'cards', cardOrientation: 'upright',
        });
        names.push((groups[item.gi] as { name: string }).name);
        cursor += pocketW + tol.wall;
        left -= take;
      }
    }
    flush();
  }

  // --- 2. Stack small trays into columns ------------------------------------
  blocks.sort((a, b) => b.w * b.d - a.w * a.d);
  const columns: Column[] = [];
  for (const b of blocks) {
    let best: { col: Column; rotate: boolean; left: number } | null = null;
    for (const col of columns) {
      const top = col.blocks[col.blocks.length - 1];
      const left = availH - col.h - b.h;
      if (left < -EPS) continue;
      const straight = b.w <= top.w + EPS && b.d <= top.d + EPS;
      const rotated = b.d <= top.w + EPS && b.w <= top.d + EPS;
      if ((straight || rotated) && (!best || left < best.left)) best = { col, rotate: !straight, left };
    }
    if (best) {
      if (best.rotate) rotateTray(b);
      b.z = best.col.h;
      best.col.blocks.push(b);
      best.col.h += b.h;
    } else {
      columns.push({ blocks: [b], h: b.h, x: 0, y: 0, usedTop: false });
    }
  }

  // --- 3. Pack columns on the box floor --------------------------------------
  const floor = new MaxRects(area.w, area.d);
  const trays: Tray[] = [];
  const placedColumns: Column[] = [];
  columns.sort((a, b) => b.blocks[0].w * b.blocks[0].d - a.blocks[0].w * a.blocks[0].d);
  for (const col of columns) {
    const base = col.blocks[0];
    const p = floor.find(base.w, base.d);
    if (!p) {
      for (const t of col.blocks)
        for (const c of t.compartments)
          unplaced.push({ groupIndex: c.groupIndex, count: c.count, reason: '盒底面積唔夠' });
      continue;
    }
    if (p.rotated) col.blocks.forEach(rotateTray);
    floor.place(p);
    col.x = p.x + BOX_MARGIN;
    col.y = p.y + BOX_MARGIN;
    for (const t of col.blocks) {
      t.x = col.x;
      t.y = col.y;
      trays.push(t);
    }
    placedColumns.push(col);
  }

  // --- 4. Token trays ----------------------------------------------------------
  const tokenIdx = groups.flatMap((g, gi) => (g.kind === 'tokens' && g.count > 0 ? [gi] : []));
  if (tokenIdx.length) {
    const need = new Map<number, number>();
    for (const gi of tokenIdx) need.set(gi, (tokenUnitVolume(groups[gi] as TokenGroup) * groups[gi].count) / TOKEN_PACKING);
    const thickest = Math.max(...tokenIdx.map((gi) => {
      const u = (groups[gi] as TokenGroup).unit;
      return Math.min(u.w, u.d, u.h);
    }));
    const layerMin = Math.max(TOKEN_LAYER_MIN, thickest + tol.fit + tol.floor);

    const capacity = (w: number, d: number, h: number) =>
      Math.max(0, w - 2 * tol.wall) * Math.max(0, d - 2 * tol.wall) * Math.max(0, h - tol.floor);

    let remaining = [...need.values()].reduce((a, b) => a + b, 0);
    const tokenTrays: { tray: Tray; cap: number }[] = [];

    while (remaining > EPS) {
      type Cand = { rect: Rect; z: number; h: number; col?: Column };
      const cands: Cand[] = [];
      for (const r of floor.free)
        if (r.w >= MIN_TOKEN_TRAY && r.d >= MIN_TOKEN_TRAY && availH >= layerMin)
          cands.push({ rect: { x: r.x + BOX_MARGIN, y: r.y + BOX_MARGIN, w: r.w, d: r.d }, z: 0, h: availH });
      for (const col of placedColumns) {
        if (col.usedTop) continue;
        const free = availH - col.h;
        const top = col.blocks[col.blocks.length - 1];
        if (free >= Math.max(MIN_STACK_HEIGHT, layerMin) && top.w >= MIN_TOKEN_TRAY && top.d >= MIN_TOKEN_TRAY)
          cands.push({ rect: { x: top.x, y: top.y, w: top.w, d: top.d }, z: col.h, h: free, col });
      }
      if (!cands.length) break;
      const c = cands.reduce((a, b) => (b.rect.w * b.rect.d * b.h > a.rect.w * a.rect.d * a.h ? b : a));

      let { w, d } = c.rect;
      if (!fitsBed(w, d, bed)) {
        const a = { w: Math.min(w, bed.w), d: Math.min(d, bed.d) };
        const b = { w: Math.min(w, bed.d), d: Math.min(d, bed.w) };
        ({ w, d } = a.w * a.d >= b.w * b.d ? a : b);
      }
      const layers = Math.max(1, Math.min(3, Math.floor(c.h / layerMin)));
      const layerH = c.h / layers;
      // Trim floor trays that are much bigger than what is left to store.
      const full = capacity(w, d, layerH) * layers;
      if (!c.col && full > remaining * TOKEN_SLACK) {
        // Aim for a squarish tray: shrink to a square if the space allows, else trim the long side only.
        const innerArea = (w - 2 * tol.wall) * (d - 2 * tol.wall) * ((remaining * TOKEN_SLACK) / full);
        const side = Math.sqrt(innerArea) + 2 * tol.wall;
        if (side <= Math.min(w, d)) {
          w = d = Math.max(MIN_TOKEN_TRAY, side);
        } else if (w >= d) {
          w = Math.max(MIN_TOKEN_TRAY, 2 * tol.wall + innerArea / (d - 2 * tol.wall));
        } else {
          d = Math.max(MIN_TOKEN_TRAY, 2 * tol.wall + innerArea / (w - 2 * tol.wall));
        }
      }

      if (c.col) c.col.usedTop = true;
      else floor.place({ x: c.rect.x - BOX_MARGIN, y: c.rect.y - BOX_MARGIN, w, d });

      for (let k = 0; k < layers; k++) {
        const cap = capacity(w, d, layerH);
        tokenTrays.push({
          tray: { id: '', label: '', x: c.rect.x, y: c.rect.y, z: c.z + k * layerH, w, d, h: layerH, compartments: [] },
          cap,
        });
        remaining -= cap;
      }
    }

    // Pour token groups into the trays in order, splitting a group across trays when needed.
    const assigned = tokenTrays.map(() => [] as { gi: number; count: number; vol: number }[]);
    const order = [...tokenIdx].sort((a, b) => need.get(b)! - need.get(a)!);
    let t = 0;
    let room = tokenTrays[0]?.cap ?? 0;
    for (const gi of order) {
      const per = need.get(gi)! / groups[gi].count;
      let left = groups[gi].count;
      while (left > 0 && t < tokenTrays.length) {
        const fit = Math.floor(room / per + EPS);
        if (fit < 1) {
          t++;
          room = tokenTrays[t]?.cap ?? 0;
          continue;
        }
        const take = Math.min(left, fit);
        assigned[t].push({ gi, count: take, vol: take * per });
        room -= take * per;
        left -= take;
      }
      if (left > 0) unplaced.push({ groupIndex: gi, count: left, reason: '剩低嘅空間唔夠放 token' });
    }

    tokenTrays.forEach(({ tray }, i) => {
      const pieces = assigned[i];
      if (!pieces.length) return;
      const alongX = tray.w >= tray.d;
      const innerLong = (alongX ? tray.w : tray.d) - 2 * tol.wall - (pieces.length - 1) * tol.wall;
      const innerShort = (alongX ? tray.d : tray.w) - 2 * tol.wall;
      const total = pieces.reduce((a, p) => a + p.vol, 0);
      let cursor = tol.wall;
      for (const p of pieces) {
        const len = (innerLong * p.vol) / total;
        const unit = (groups[p.gi] as TokenGroup).unit;
        const smallestFace = Math.min(Math.max(unit.w, unit.d), Math.max(unit.w, unit.h), Math.max(unit.d, unit.h));
        if (Math.min(len, innerShort) < smallestFace + tol.fit)
          warnings.push(`「${groups[p.gi].name}」嘅格可能太窄（${len.toFixed(0)} mm）`);
        tray.compartments.push({
          x: alongX ? cursor : tol.wall,
          y: alongX ? tol.wall : cursor,
          w: alongX ? len : innerShort,
          d: alongX ? innerShort : len,
          depth: tray.h - tol.floor,
          groupIndex: p.gi,
          count: p.count,
          kind: 'tokens',
        });
        cursor += len + tol.wall;
      }
      tray.id = nextId();
      tray.label = [...new Set(pieces.map((p) => groups[p.gi].name))].join(' + ');
      trays.push(tray);
    });
  }

  return { box, availableHeight: availH, trays, unplaced, warnings };
}
