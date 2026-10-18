import type { Manifold } from 'manifold-3d';

/** Encode a manifold as a binary STL (millimetres, Z up). */
export function toBinaryStl(solid: Manifold): Blob {
  const mesh = solid.getMesh();
  const { numProp, vertProperties: v, triVerts: t } = mesh;
  const triCount = t.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  view.setUint32(80, triCount, true);

  let off = 84;
  for (let i = 0; i < triCount; i++) {
    const p = [0, 1, 2].map((k) => {
      const vi = t[i * 3 + k] * numProp;
      return [v[vi], v[vi + 1], v[vi + 2]];
    });
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    for (const c of n) { view.setFloat32(off, c / len, true); off += 4; }
    for (const q of p) for (const c of q) { view.setFloat32(off, c, true); off += 4; }
    off += 2; // attribute byte count
  }
  return new Blob([buf], { type: 'model/stl' });
}
