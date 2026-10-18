import './style.css';
import Module, { type Manifold } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CARD_SIZES, cardStackSize } from './layout/cards';
import { DEFAULT_TOLERANCES, type SleeveKind } from './layout/types';
import { cardTray } from './geometry/tray';
import { toBinaryStl } from './export/stl';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cardSizeEl = $<HTMLSelectElement>('cardSize');
const countEl = $<HTMLInputElement>('count');
const sleeveEl = $<HTMLSelectElement>('sleeve');
const dimsEl = $<HTMLParagraphElement>('dims');
const statusEl = $<HTMLParagraphElement>('status');
const downloadEl = $<HTMLButtonElement>('download');
const viewerEl = $<HTMLElement>('viewer');

for (const s of CARD_SIZES) cardSizeEl.add(new Option(s.label, s.id));

// --- Three.js viewer -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
viewerEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3efe7);
const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(200, 400, 300);
scene.add(sun);
const grid = new THREE.GridHelper(400, 40, 0xc9bfae, 0xe0d8ca);
scene.add(grid);

const material = new THREE.MeshStandardMaterial({ color: 0xd9643a, roughness: 0.6, flatShading: true });
let meshObj: THREE.Mesh | null = null;

function resize() {
  const { clientWidth: w, clientHeight: h } = viewerEl;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewerEl);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

function show(solid: Manifold) {
  const mesh = solid.getMesh();
  const geom = new THREE.BufferGeometry();
  // Manifold may carry extra per-vertex properties; keep only xyz.
  const pos = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k];
  }
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geom.computeVertexNormals();
  geom.rotateX(-Math.PI / 2); // Manifold/STL are Z-up, Three.js is Y-up
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  const centre = box.getCenter(new THREE.Vector3());
  geom.translate(-centre.x, -box.min.y, -centre.z);

  if (meshObj) { scene.remove(meshObj); meshObj.geometry.dispose(); }
  meshObj = new THREE.Mesh(geom, material);
  scene.add(meshObj);

  const size = box.getSize(new THREE.Vector3()).length();
  camera.position.set(size * 0.9, size * 0.8, size * 1.1);
  controls.target.set(0, (box.max.y - box.min.y) / 3, 0);
}

// --- Generation -------------------------------------------------------------
const wasm = await Module({ locateFile: () => wasmUrl });
wasm.setup();
statusEl.textContent = '';
downloadEl.disabled = false;

let current: Manifold | null = null;

function regenerate() {
  const size = CARD_SIZES.find((s) => s.id === cardSizeEl.value) ?? CARD_SIZES[0];
  const count = Math.max(1, Math.min(500, Number(countEl.value) || 1));
  const stack = cardStackSize({ kind: 'cards', name: 'deck', size, count, sleeve: sleeveEl.value as SleeveKind });
  const { solid, outer } = cardTray(wasm, stack, DEFAULT_TOLERANCES);
  current?.delete();
  current = solid;
  dimsEl.textContent = `Tray 外尺寸：${outer.w.toFixed(1)} × ${outer.d.toFixed(1)} × ${outer.h.toFixed(1)} mm`;
  show(solid);
}

for (const el of [cardSizeEl, countEl, sleeveEl]) el.addEventListener('input', regenerate);
downloadEl.addEventListener('click', () => {
  if (!current) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(toBinaryStl(current));
  a.download = `card-tray-${cardSizeEl.value}-${countEl.value}.stl`;
  a.click();
  URL.revokeObjectURL(a.href);
});

regenerate();
