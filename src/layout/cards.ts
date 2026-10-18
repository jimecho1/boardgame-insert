import type { CardGroup, CardSizePreset, SleeveKind, Size3 } from './types';

export const CARD_SIZES: CardSizePreset[] = [
  { id: 'standard', label: 'Standard (Poker) 63.5 × 88', w: 63.5, h: 88 },
  { id: 'mini-euro', label: 'Mini Euro 44 × 68', w: 44, h: 68 },
  { id: 'euro', label: 'Euro 59 × 92', w: 59, h: 92 },
  { id: '57x87', label: '57 × 87（Wingspan 等）', w: 57, h: 87 },
  { id: 'square', label: 'Square 70 × 70', w: 70, h: 70 },
  { id: 'tarot', label: 'Tarot 70 × 120', w: 70, h: 120 },
];

/** Approximate thickness of one card including its sleeve (mm). To be calibrated by test prints. */
export const CARD_THICKNESS: Record<SleeveKind, number> = {
  none: 0.32,
  thin: 0.42,
  thick: 0.62,
};

/** Extra width/height a sleeve adds to the card face (mm). */
const SLEEVE_GROWTH: Record<SleeveKind, { w: number; h: number }> = {
  none: { w: 0, h: 0 },
  thin: { w: 2.5, h: 3 },
  thick: { w: 3, h: 3.5 },
};

/** Bounding box of a card stack lying flat: w × d is the card face, h is the stack height. */
export function cardStackSize(group: CardGroup): Size3 {
  const grow = SLEEVE_GROWTH[group.sleeve];
  return {
    w: group.size.w + grow.w,
    d: group.size.h + grow.h,
    h: group.count * CARD_THICKNESS[group.sleeve],
  };
}
