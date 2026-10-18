import { CARD_SIZES } from './layout/cards';
import { DEFAULT_TOLERANCES, PRINTERS, type CardOrientation, type LayoutInput, type SleeveKind, type Size3 } from './layout/types';

/** Serializable app state; this is what goes into the share link. */
export interface CardRow {
  kind: 'cards';
  name: string;
  sizeId: string; // a CARD_SIZES id or 'custom'
  cw: number; // custom card width
  ch: number; // custom card height
  count: number;
  sleeve: SleeveKind;
  orientation: CardOrientation;
}

export interface TokenRow {
  kind: 'tokens';
  name: string;
  w: number;
  d: number;
  h: number;
  count: number;
}

export type Row = CardRow | TokenRow;

export interface AppState {
  v: 1;
  box: Size3;
  reservedTop: number;
  printerId: string;
  rows: Row[];
}

export const newCardRow = (): CardRow => ({
  kind: 'cards', name: '卡牌', sizeId: 'standard', cw: 63.5, ch: 88, count: 60, sleeve: 'none', orientation: 'auto',
});

export const newTokenRow = (): TokenRow => ({ kind: 'tokens', name: 'Token', w: 20, d: 20, h: 3, count: 30 });

export const WINGSPAN_STATE: AppState = {
  v: 1,
  box: { w: 288, d: 288, h: 68 },
  reservedTop: 8,
  printerId: 'a1',
  rows: [
    { ...newCardRow(), name: '雀卡', sizeId: '57x87', count: 170 },
    { ...newCardRow(), name: 'Bonus 卡', sizeId: '57x87', count: 26 },
    { ...newCardRow(), name: 'Automa 卡', sizeId: '57x87', count: 16 },
    { kind: 'tokens', name: '食物 token', w: 16, d: 16, h: 2, count: 103 },
    { kind: 'tokens', name: '蛋', w: 12, d: 12, h: 15, count: 75 },
    { kind: 'tokens', name: '行動方塊', w: 8, d: 8, h: 8, count: 40 },
    { kind: 'tokens', name: '骰', w: 22, d: 22, h: 22, count: 5 },
  ],
};

export function toLayoutInput(s: AppState): LayoutInput {
  const bed = (PRINTERS.find((p) => p.id === s.printerId) ?? PRINTERS[1]).bed;
  return {
    box: s.box,
    reservedTop: s.reservedTop,
    tol: DEFAULT_TOLERANCES,
    bed,
    groups: s.rows.map((r) =>
      r.kind === 'cards'
        ? {
            kind: 'cards',
            name: r.name,
            size: CARD_SIZES.find((c) => c.id === r.sizeId) ?? { id: 'custom', label: '自訂', w: r.cw, h: r.ch },
            count: r.count,
            sleeve: r.sleeve,
            orientation: r.orientation,
          }
        : { kind: 'tokens', name: r.name, unit: { w: r.w, d: r.d, h: r.h }, count: r.count },
    ),
  };
}

// --- Share link: state is stored in the URL hash so GitHub Pages never sees it. ---

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function encodeState(s: AppState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(s)));
}

export function decodeState(text: string): AppState | null {
  try {
    const s = JSON.parse(new TextDecoder().decode(fromBase64Url(text)));
    if (s?.v !== 1 || !Array.isArray(s.rows) || !s.box) return null;
    return s as AppState;
  } catch {
    return null;
  }
}
