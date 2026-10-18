import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Manifold } from 'manifold-3d';
import type { Layout } from '../layout/types';

const PALETTE = ['#d9643a', '#3a7d8c', '#c9a227', '#6b8e4e', '#8c5a9e', '#c4554d', '#4f6fb3', '#9a7b4f'];

/** 3D preview of the whole insert sitting in the game box. */
export class Viewer {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
  private controls: OrbitControls;
  /** Holds everything in Manifold's Z-up box coordinates; rotated to Three's Y-up. */
  private root = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private lastBoxKey = '';
  private boxSize = 300;
  private boxH = 60;

  constructor(private host: HTMLElement) {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xf3efe7);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(300, 600, 400);
    this.scene.add(sun);
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root);
    new ResizeObserver(() => this.resize()).observe(host);
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  colorOf(i: number): string {
    return PALETTE[i % PALETTE.length];
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lastBoxKey) this.frame();
  }

  /** Fit the box's bounding sphere in view, using whichever of the vertical/horizontal FOV is narrower. */
  private frame() {
    const halfV = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const dist = (this.boxSize * 1.08) / Math.sin(Math.min(halfV, halfH));
    const dir = new THREE.Vector3(0.75, 1.05, 1.15).normalize();
    this.controls.target.set(0, this.boxH / 3, 0);
    this.camera.position.copy(dir.multiplyScalar(dist).add(this.controls.target));
  }

  show(layout: Layout, solids: Manifold[]) {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    this.meshes = [];
    const { box } = layout;
    const offset = new THREE.Vector3(-box.w / 2, -box.d / 2, 0);

    // Game box outline, plus the reserved top space as a faint second outline.
    const outline = (h: number, color: number, opacity: number) => {
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(box.w, box.d, h));
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      line.position.set(0, 0, h / 2);
      this.root.add(line);
    };
    outline(box.h, 0x7a6f63, 0.9);
    if (layout.availableHeight < box.h) outline(layout.availableHeight, 0x7a6f63, 0.3);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(box.w, box.d),
      new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 1 }),
    );
    floor.position.z = -0.05;
    this.root.add(floor);

    layout.trays.forEach((t, i) => {
      const mesh = solids[i].getMesh();
      const pos = new Float32Array(mesh.numVert * 3);
      for (let v = 0; v < mesh.numVert; v++)
        for (let k = 0; k < 3; k++) pos[v * 3 + k] = mesh.vertProperties[v * mesh.numProp + k];
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
      geom.computeVertexNormals();
      const m = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color: this.colorOf(i), roughness: 0.65, flatShading: true }),
      );
      m.position.set(t.x + offset.x, t.y + offset.y, t.z);
      this.root.add(m);
      this.meshes.push(m);
    });

    // Only re-frame the camera when the box itself changes, so editing doesn't reset the view.
    const key = `${box.w}x${box.d}x${box.h}`;
    if (key !== this.lastBoxKey) {
      this.lastBoxKey = key;
      this.boxSize = Math.hypot(box.w, box.d, box.h) / 2; // bounding-sphere radius
      this.boxH = box.h;
      this.frame();
    }
  }

  highlight(index: number) {
    this.meshes.forEach((m, i) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissive.set(i === index ? 0x333333 : 0x000000);
      mat.transparent = index >= 0 && i !== index;
      mat.opacity = mat.transparent ? 0.35 : 1;
    });
  }
}
