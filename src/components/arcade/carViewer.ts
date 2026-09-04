/**
 * Garage turntable: real 3D cars (Kenney Car Kit, CC0) rendered with three.js.
 *
 * three.js and the glTF models are BOTH loaded lazily — nothing here is in the
 * initial page bundle, it only downloads when a visitor opens the arcade. One
 * WebGLRenderer is shared by all cards and blitted into each card's own 2D
 * canvas, so three cards cost one WebGL context instead of three.
 *
 * If WebGL is unavailable, the import fails, or a model 404s, the card falls
 * back to the procedural box renderer in carViewer2d.ts — the garage always
 * shows a car.
 */

import { CAR_STYLES } from "./cars";
import { renderCar as renderCar2d } from "./carViewer2d";

/** glTF file per garage slot, matched to each car's silhouette. */
const MODEL_FILES = ["race.glb", "race-future.glb", "sedan-sports.glb"];

const PITCH = 0.28; // camera elevation, radians

/* ------------------------------ shared 3D core ------------------------------ */

type ThreeNS = typeof import("three");

interface Stage {
  THREE: ThreeNS;
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  pivot: import("three").Group;
  /** loaded car root per garage index, already recolored and centred */
  cars: (import("three").Object3D | null)[];
}

let stagePromise: Promise<Stage> | null = null;

/** Build the renderer/scene once and load every car model in parallel. */
function getStage(): Promise<Stage> {
  if (stagePromise) return stagePromise;
  stagePromise = (async () => {
    const THREE = await import("three");
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      // we blit this canvas into each card's 2D context, and reading a
      // WebGL canvas after render is only defined with this flag set
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    // synthwave key/fill: warm magenta from the left, cool cyan from the right
    scene.add(new THREE.AmbientLight(0xb9a7ff, 1.1));
    const key = new THREE.DirectionalLight(0xff5fae, 2.4);
    key.position.set(-4, 5, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x53e8ff, 1.9);
    fill.position.set(4, 2.5, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(0, 2, -6);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const loader = new GLTFLoader();
    const cars = await Promise.all(
      MODEL_FILES.map(
        (file, idx) =>
          new Promise<import("three").Object3D | null>((resolve) => {
            loader.load(
              `./models/${file}`,
              (gltf) => resolve(prepareCar(THREE, gltf.scene, idx)),
              undefined,
              () => resolve(null) // missing model → that card uses the 2D fallback
            );
          })
      )
    );

    return { THREE, renderer, scene, camera, pivot, cars };
  })().catch((e) => {
    stagePromise = null; // let a later card retry
    throw e;
  });
  return stagePromise;
}

/**
 * Normalise a Kenney car: centre it on the origin, scale it to a known size,
 * and repaint it in this garage slot's colours.
 *
 * Every Kenney car shares ONE material ("colormap") driven by a texture atlas,
 * so colours cannot be told apart per material — but the meshes are named
 * (`body`, `wheel-front-left`, ...), so the repaint keys off the mesh name.
 * The atlas stays on the body for panel/window detail and is tinted toward our
 * palette; wheels are forced dark so the tint cannot bleed into the tyres.
 */
function prepareCar(
  THREE: ThreeNS,
  root: import("three").Object3D,
  idx: number
): import("three").Object3D {
  const style = CAR_STYLES[idx];
  // normalise the tint so multiplying the atlas shifts hue without darkening
  const raw = style.v.body;
  const peak = Math.max(raw[0], raw[1], raw[2]) || 255;
  const tint = new THREE.Color(raw[0] / peak, raw[1] / peak, raw[2] / peak);
  const accent = new THREE.Color(
    style.v.accent[0] / 255,
    style.v.accent[1] / 255,
    style.v.accent[2] / 255
  );

  root.traverse((o) => {
    const mesh = o as import("three").Mesh;
    if (!mesh.isMesh) return;
    const single = !Array.isArray(mesh.material);
    const mats: import("three").Material[] = single
      ? [mesh.material as import("three").Material]
      : (mesh.material as import("three").Material[]);
    const name = mesh.name.toLowerCase();
    const next = mats.map((m) => {
      const mat = (m as import("three").MeshStandardMaterial).clone();
      if (name.includes("wheel") || name.includes("tire") || name.includes("tyre")) {
        mat.map = null;
        mat.color.setRGB(0.06, 0.04, 0.1);
        mat.metalness = 0.05;
        mat.roughness = 0.95;
        mat.emissive = accent.clone().multiplyScalar(0.05); // just a hint of rim
      } else {
        mat.color.copy(tint); // multiplies the atlas: keeps detail, shifts hue
        mat.metalness = 0.3;
        mat.roughness = 0.45;
        mat.emissive = tint.clone().multiplyScalar(0.1);
      }
      return mat;
    });
    mesh.material = single ? next[0] : next;
  });

  // centre on the origin and normalise the longest side to 4 units
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = 4 / Math.max(size.x, size.y, size.z || 1);
  const holder = new THREE.Group();
  root.position.set(-centre.x, -box.min.y, -centre.z); // sit on the floor
  holder.add(root);
  holder.scale.setScalar(scale);
  return holder;
}

/* --------------------------------- card API --------------------------------- */

/** Drag-to-spin turntable bound to one card canvas; auto-rotates when idle. */
export class Turntable {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private idx: number;
  private theta = 2.5; // start on a flattering three-quarter rear view
  private vel = 0;
  private dragging = false;
  private lastX = 0;
  private raf = 0;
  private lastT = 0;
  private destroyed = false;
  private ro: ResizeObserver;
  private stage: Stage | null = null;

  constructor(canvas: HTMLCanvasElement, idx: number) {
    this.canvas = canvas;
    this.idx = idx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);

    // 3D is a progressive enhancement: the 2D renderer draws until it arrives
    void getStage()
      .then((stage) => {
        if (!this.destroyed && stage.cars[idx]) this.stage = stage;
      })
      .catch(() => {
        /* stay on the procedural fallback */
      });

    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.theta += dx * 0.012;
    this.vel = dx * 0.012 * 60;
  };

  private onUp = () => {
    this.dragging = false;
  };

  /** Floor glow + neon ring, drawn in 2D under the car on both paths. */
  private drawFloor(w: number, h: number, at?: { x: number; y: number }) {
    const style = CAR_STYLES[this.idx];
    const ctx = this.ctx;
    const cx = at ? at.x : w / 2;
    const cy = at ? at.y : h * 0.78;
    const rx = Math.min(w * 0.42, h * 0.7);
    const ry = rx * 0.26;
    const g = ctx.createRadialGradient(cx, cy, ry * 0.2, cx, cy, rx);
    g.addColorStop(0, style.v.glow.replace("0.5)", "0.34)"));
    g.addColorStop(1, style.v.glow.replace("0.5)", "0)"));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${style.v.accent.join(",")}, 0.28)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Frame the card and return where the world origin lands on screen, so the
      2D floor glow sits exactly under the wheels instead of a fixed guess. */
  private aimCamera(stage: Stage, w: number, h: number) {
    const { THREE, renderer, camera } = stage;
    renderer.setSize(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), false);
    camera.aspect = w / Math.max(1, h);
    const dist = 11;
    camera.position.set(0, Math.sin(PITCH) * dist + 0.5, Math.cos(PITCH) * dist);
    camera.lookAt(new THREE.Vector3(0, 0.75, 0));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, 0, 0).project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  private render3d(stage: Stage, w: number, h: number) {
    const { renderer, scene, camera, pivot } = stage;
    const car = stage.cars[this.idx];
    if (!car) return false;

    // the shared pivot hosts one car at a time — swap in ours for this draw
    pivot.clear();
    pivot.add(car);
    pivot.rotation.set(0, this.theta, 0);
    renderer.render(scene, camera);
    this.ctx.drawImage(renderer.domElement, 0, 0, w, h);
    return true;
  }

  private tick = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.dragging) {
      // inertia bleeding into a lazy auto-spin
      this.vel += (0.55 - this.vel) * Math.min(1, dt * 1.2);
      this.theta += this.vel * dt;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 2) {
      const w = rect.width;
      const h = rect.height;
      if (this.stage) {
        this.ctx.clearRect(0, 0, w, h);
        const ground = this.aimCamera(this.stage, w, h);
        this.drawFloor(w, h, ground);
        if (!this.render3d(this.stage, w, h)) {
          renderCar2d(this.ctx, w, h, this.idx, this.theta);
        }
      } else {
        renderCar2d(this.ctx, w, h, this.idx, this.theta);
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
