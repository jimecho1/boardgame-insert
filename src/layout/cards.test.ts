import { describe, expect, it } from 'vitest';
import { CARD_SIZES, cardStackSize } from './cards';

const standard = CARD_SIZES.find((s) => s.id === 'standard')!;

describe('cardStackSize', () => {
  it('uses the bare card face when unsleeved', () => {
    const s = cardStackSize({ kind: 'cards', name: 'deck', size: standard, count: 100, sleeve: 'none' });
    expect(s.w).toBeCloseTo(63.5);
    expect(s.d).toBeCloseTo(88);
    expect(s.h).toBeCloseTo(32);
  });

  it('grows the face and the stack when sleeved', () => {
    const bare = cardStackSize({ kind: 'cards', name: 'a', size: standard, count: 50, sleeve: 'none' });
    const thick = cardStackSize({ kind: 'cards', name: 'b', size: standard, count: 50, sleeve: 'thick' });
    expect(thick.w).toBeGreaterThan(bare.w);
    expect(thick.d).toBeGreaterThan(bare.d);
    expect(thick.h).toBeGreaterThan(bare.h);
  });
});
