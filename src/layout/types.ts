/** All lengths are in millimetres. */
export interface Size3 {
  w: number; // X
  d: number; // Y
  h: number; // Z
}

export type SleeveKind = 'none' | 'thin' | 'thick';

export interface CardSizePreset {
  id: string;
  label: string;
  w: number;
  h: number;
}

export interface CardGroup {
  kind: 'cards';
  name: string;
  size: CardSizePreset;
  count: number;
  sleeve: SleeveKind;
}

export interface Tolerances {
  wall: number; // tray wall thickness
  floor: number; // tray floor thickness
  fit: number; // clearance around components
  lid: number; // clearance for sliding lids
}

export const DEFAULT_TOLERANCES: Tolerances = {
  wall: 1.2,
  floor: 1.2,
  fit: 1.0,
  lid: 0.3,
};
