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

export type CardOrientation = 'auto' | 'upright' | 'flat';

export interface CardGroup {
  kind: 'cards';
  name: string;
  size: CardSizePreset;
  count: number;
  sleeve: SleeveKind;
  orientation?: CardOrientation;
}

export interface TokenGroup {
  kind: 'tokens';
  name: string;
  /** Bounding box of a single piece. */
  unit: Size3;
  count: number;
}

export type ComponentGroup = CardGroup | TokenGroup;

export interface Tolerances {
  wall: number; // tray wall thickness
  floor: number; // tray floor thickness
  fit: number; // total clearance added to each pocket dimension
  lid: number; // clearance for sliding lids
}

export const DEFAULT_TOLERANCES: Tolerances = {
  wall: 1.2,
  floor: 1.2,
  fit: 1.0,
  lid: 0.3,
};

export interface PrinterPreset {
  id: string;
  label: string;
  bed: Size3;
}

export const PRINTERS: PrinterPreset[] = [
  { id: 'a1mini', label: 'Bambu A1 mini (180)', bed: { w: 180, d: 180, h: 180 } },
  { id: 'a1', label: 'Bambu A1 / P1S / X1C (256)', bed: { w: 256, d: 256, h: 256 } },
  { id: 'mk4', label: 'Prusa MK4 (250×210)', bed: { w: 250, d: 210, h: 220 } },
];

export interface LayoutInput {
  /** Inner size of the game box. */
  box: Size3;
  /** Height kept free at the top of the box for boards, mats and rulebooks. */
  reservedTop: number;
  groups: ComponentGroup[];
  tol: Tolerances;
  bed: Size3;
}

/** A pocket inside a tray. Coordinates are relative to the tray's origin corner. */
export interface Compartment {
  x: number;
  y: number;
  w: number;
  d: number;
  /** Pocket depth measured down from the tray's top face. */
  depth: number;
  groupIndex: number;
  /** How many pieces of the group this pocket holds. */
  count: number;
  kind: 'cards' | 'tokens';
  cardOrientation?: 'upright' | 'flat';
}

export interface Tray {
  id: string;
  label: string;
  /** Position of the tray's origin corner inside the box. */
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  compartments: Compartment[];
  /** Axis of the finger channel cut across card trays, if any. */
  grip?: 'x' | 'y';
  gripDepth?: number;
}

export interface Unplaced {
  groupIndex: number;
  count: number;
  reason: string;
}

export interface Layout {
  box: Size3;
  availableHeight: number;
  trays: Tray[];
  unplaced: Unplaced[];
  warnings: string[];
}
