/**
 * Procedural fallback renderer for the garage cards, used when WebGL or the
 * glTF models are unavailable. Each car is a set of convex boxes
 * ("parts"); the renderer is built for FRAME-TO-FRAME STABILITY rather than
 * general correctness, because a spinning card must never flicker:
 *
 *  - Parts are convex, so after backface culling their own faces can never
 *    overlap each other — no intra-part sorting, nothing to swap.
 *  - Details (light bars, headlights, stripes) are OVERLAYS pinned to a host
 *    face and drawn immediately after it, so a decal can never separate from
 *    its panel or lose a depth tie.
 *  - Parts carry an authored `layer` (0 chassis, 1 cabin, 2 roof furniture).
 *    The camera looks down, so anything stacked higher always occludes what it
 *    sits on: layer order is correct at every yaw, and constant per frame.
 *  - Backfaces are culled by SIGNED SCREEN AREA, exactly matching what is
 *    drawn — a face fades out through zero area instead of popping.
 *  - Everything is opaque (no alpha blending) and each polygon is stroked in
 *    its own fill color to close antialiasing seams between neighbours.
 *
 * No WebGL, no dependencies; ~35 quads per car.
 */

import { CAR_STYLES } from "./cars";

type V3 = [number, number, number];
type RGB = [number, number, number];
type FaceId = "front" | "back" | "top" | "left" | "right";

/** A decal pinned to one face of its part; drawn right after that face. */
interface Overlay {
  face: FaceId;
  /** in-plane rect, model units: front/back → x,y · top → x,z · sides → z,y */
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  rgb: RGB;
  emissive?: boolean;
}

interface PartDef {
  hw: number;
  zBack: number;
  zFront: number;
  y0: number;
  /** top edge at the front / at the back — one slab covers hoods and fastbacks */
  yF: number;
  yB: number;
  rgb: RGB;
  /** 0 chassis · 1 cabin & anything standing on the deck · 2 roof furniture */
  layer: number;
  xOff?: number;
  overlays?: Overlay[];
}

interface WheelDef {
  x: number;
  z: number;
  r: number;
  rim: RGB;
}

interface Part {
  layer: number;
  centre: V3;
  faces: { id: FaceId; pts: V3[]; rgb: RGB }[];
  overlays: { host: FaceId; pts: V3[]; rgb: RGB; emissive?: boolean }[];
}

interface CarModel {
  parts: Part[];
  wheels: WheelDef[];
}

const PITCH = 0.22; // camera pitch, radians — the camera sits ABOVE the car

/* ------------------------------- model build ------------------------------- */

function buildPart(d: PartDef): Part {
  const x = d.xOff ?? 0;
  const { hw, zBack: zb, zFront: zf, y0, yF, yB } = d;
  const FBL: V3 = [x - hw, y0, zf];
  const FBR: V3 = [x + hw, y0, zf];
  const FTL: V3 = [x - hw, yF, zf];
  const FTR: V3 = [x + hw, yF, zf];
  const BBL: V3 = [x - hw, y0, zb];
  const BBR: V3 = [x + hw, y0, zb];
  const BTL: V3 = [x - hw, yB, zb];
  const BTR: V3 = [x + hw, yB, zb];

  // outward CCW winding; the bottom face is omitted (never seen from above)
  const faces: Part["faces"] = [
    { id: "front", pts: [FBL, FBR, FTR, FTL], rgb: d.rgb },
    { id: "back", pts: [BBR, BBL, BTL, BTR], rgb: d.rgb },
    { id: "right", pts: [FBR, BBR, BTR, FTR], rgb: d.rgb },
    { id: "left", pts: [BBL, FBL, FTL, BTL], rgb: d.rgb },
    { id: "top", pts: [FTL, FTR, BTR, BTL], rgb: d.rgb },
  ];

  /** y of the sloped top face at a given z */
  const topY = (z: number) => yB + ((z - zb) / (zf - zb || 1)) * (yF - yB);

  const overlays: Part["overlays"] = (d.overlays ?? []).map((o) => {
    let pts: V3[];
    if (o.face === "back") {
      pts = [
        [o.a1, o.b0, zb],
        [o.a0, o.b0, zb],
        [o.a0, o.b1, zb],
        [o.a1, o.b1, zb],
      ];
    } else if (o.face === "front") {
      pts = [
        [o.a0, o.b0, zf],
        [o.a1, o.b0, zf],
        [o.a1, o.b1, zf],
        [o.a0, o.b1, zf],
      ];
    } else if (o.face === "top") {
      pts = [
        [o.a0, topY(o.b1), o.b1],
        [o.a1, topY(o.b1), o.b1],
        [o.a1, topY(o.b0), o.b0],
        [o.a0, topY(o.b0), o.b0],
      ];
    } else if (o.face === "right") {
      const px = x + hw;
      pts = [
        [px, o.b0, o.a1],
        [px, o.b0, o.a0],
        [px, o.b1, o.a0],
        [px, o.b1, o.a1],
      ];
    } else {
      const px = x - hw;
      pts = [
        [px, o.b0, o.a0],
        [px, o.b0, o.a1],
        [px, o.b1, o.a1],
        [px, o.b1, o.a0],
      ];
    }
    return { host: o.face, pts, rgb: o.rgb, emissive: o.emissive };
  });

  return {
    layer: d.layer,
    centre: [x, (y0 + Math.max(yF, yB)) / 2, (zb + zf) / 2],
    faces,
    overlays,
  };
}

const modelCache = new Map<number, CarModel>();

function buildModel(idx: number): CarModel {
  const s = CAR_STYLES[idx];
  const B = s.v.body;
  const A = s.v.accent;
  const G = s.v.glass;
  const dim = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
  const DARK = dim(B, 0.34);
  const LAMP: RGB = [255, 244, 200];
  const defs: PartDef[] = [];
  const wheels: WheelDef[] = [];

  if (idx === 0) {
    /* SUNRISE GT — wide coupe crowned by the big wing */
    defs.push({
      hw: 0.92, zBack: -1.95, zFront: -1.15, y0: 0.22, yF: 0.78, yB: 0.78, rgb: B, layer: 0,
      overlays: [
        { face: "back", a0: -0.8, a1: 0.8, b0: 0.48, b1: 0.64, rgb: A, emissive: true },
        { face: "back", a0: -0.5, a1: 0.5, b0: 0.28, b1: 0.4, rgb: dim(B, 0.2) },
      ],
    });
    defs.push({
      hw: 0.9, zBack: -1.15, zFront: 1.25, y0: 0.22, yF: 0.74, yB: 0.76, rgb: B, layer: 0,
      overlays: [
        { face: "right", a0: -1.0, a1: 1.1, b0: 0.28, b1: 0.34, rgb: A, emissive: true },
        { face: "left", a0: -1.0, a1: 1.1, b0: 0.28, b1: 0.34, rgb: A, emissive: true },
      ],
    });
    defs.push({
      hw: 0.86, zBack: 1.25, zFront: 2.0, y0: 0.26, yF: 0.48, yB: 0.74, rgb: B, layer: 0,
      overlays: [
        { face: "front", a0: -0.78, a1: -0.4, b0: 0.34, b1: 0.42, rgb: LAMP, emissive: true },
        { face: "front", a0: 0.4, a1: 0.78, b0: 0.34, b1: 0.42, rgb: LAMP, emissive: true },
      ],
    });
    defs.push({ hw: 0.58, zBack: -1.12, zFront: 0.72, y0: 0.76, yF: 1.06, yB: 0.98, rgb: G, layer: 1 });
    defs.push({ hw: 0.07, zBack: -1.82, zFront: -1.58, y0: 0.78, yF: 1.16, yB: 1.16, rgb: DARK, layer: 1, xOff: -0.55 });
    defs.push({ hw: 0.07, zBack: -1.82, zFront: -1.58, y0: 0.78, yF: 1.16, yB: 1.16, rgb: DARK, layer: 1, xOff: 0.55 });
    defs.push({
      hw: 0.86, zBack: -1.92, zFront: -1.48, y0: 1.16, yF: 1.28, yB: 1.22, rgb: B, layer: 2,
      overlays: [{ face: "top", a0: -0.8, a1: 0.8, b0: -1.88, b1: -1.52, rgb: A, emissive: true }],
    });
    defs.push({ hw: 0.05, zBack: -1.96, zFront: -1.44, y0: 1.12, yF: 1.34, yB: 1.28, rgb: A, layer: 2, xOff: -0.88 });
    defs.push({ hw: 0.05, zBack: -1.96, zFront: -1.44, y0: 1.12, yF: 1.34, yB: 1.28, rgb: A, layer: 2, xOff: 0.88 });
    wheels.push({ x: 0.9, z: 1.25, r: 0.32, rim: A }, { x: -0.9, z: 1.25, r: 0.32, rim: A });
    wheels.push({ x: 0.92, z: -1.3, r: 0.34, rim: A }, { x: -0.92, z: -1.3, r: 0.34, rim: A });
  } else if (idx === 1) {
    /* PHANTOM X — doorstop wedge, clean tail, tall light blade */
    defs.push({
      hw: 0.88, zBack: -2.0, zFront: 0.2, y0: 0.2, yF: 0.66, yB: 0.66, rgb: B, layer: 0,
      overlays: [
        { face: "back", a0: -0.82, a1: 0.82, b0: 0.4, b1: 0.6, rgb: [245, 252, 255], emissive: true },
        { face: "back", a0: -0.7, a1: 0.7, b0: 0.26, b1: 0.32, rgb: A, emissive: true },
      ],
    });
    defs.push({
      hw: 0.85, zBack: 0.2, zFront: 2.1, y0: 0.24, yF: 0.34, yB: 0.66, rgb: B, layer: 0,
      overlays: [
        { face: "front", a0: -0.78, a1: -0.34, b0: 0.27, b1: 0.33, rgb: LAMP, emissive: true },
        { face: "front", a0: 0.34, a1: 0.78, b0: 0.27, b1: 0.33, rgb: LAMP, emissive: true },
        { face: "top", a0: -0.3, a1: 0.3, b0: 0.5, b1: 1.9, rgb: dim(B, 0.55) },
      ],
    });
    defs.push({ hw: 0.94, zBack: -0.6, zFront: 0.9, y0: 0.16, yF: 0.3, yB: 0.3, rgb: DARK, layer: 0 });
    defs.push({
      hw: 0.6, zBack: -1.9, zFront: 0.12, y0: 0.66, yF: 0.98, yB: 0.72, rgb: G, layer: 1,
      overlays: [{ face: "top", a0: -0.55, a1: 0.55, b0: -1.85, b1: -1.1, rgb: dim(B, 0.3) }],
    });
    // pop-up housings: buried in the nose and following its slope, so they
    // read as raised panels instead of tiles floating above the hood
    defs.push({ hw: 0.26, zBack: 0.95, zFront: 1.5, y0: 0.3, yF: 0.5, yB: 0.6, rgb: DARK, layer: 1, xOff: -0.5,
      overlays: [{ face: "top", a0: -0.72, a1: -0.3, b0: 1.02, b1: 1.44, rgb: LAMP, emissive: true }] });
    defs.push({ hw: 0.26, zBack: 0.95, zFront: 1.5, y0: 0.3, yF: 0.5, yB: 0.6, rgb: DARK, layer: 1, xOff: 0.5,
      overlays: [{ face: "top", a0: 0.3, a1: 0.72, b0: 1.02, b1: 1.44, rgb: LAMP, emissive: true }] });
    wheels.push({ x: 0.88, z: 1.35, r: 0.3, rim: A }, { x: -0.88, z: 1.35, r: 0.3, rim: A });
    wheels.push({ x: 0.9, z: -1.35, r: 0.32, rim: A }, { x: -0.9, z: -1.35, r: 0.32, rim: A });
  } else {
    /* VOLT MUSCLE — long hood, boxy cabin, ducktail */
    defs.push({
      hw: 0.92, zBack: -2.0, zFront: 0.4, y0: 0.26, yF: 0.9, yB: 0.9, rgb: B, layer: 0,
      overlays: [
        { face: "back", a0: -0.84, a1: 0.84, b0: 0.46, b1: 0.64, rgb: A, emissive: true },
        { face: "right", a0: -1.9, a1: 0.3, b0: 0.32, b1: 0.38, rgb: A, emissive: true },
        { face: "left", a0: -1.9, a1: 0.3, b0: 0.32, b1: 0.38, rgb: A, emissive: true },
      ],
    });
    defs.push({
      hw: 0.88, zBack: 0.4, zFront: 2.0, y0: 0.3, yF: 0.78, yB: 0.9, rgb: B, layer: 0,
      overlays: [
        { face: "top", a0: -0.34, a1: -0.1, b0: 0.45, b1: 1.95, rgb: A, emissive: true },
        { face: "top", a0: 0.1, a1: 0.34, b0: 0.45, b1: 1.95, rgb: A, emissive: true },
        { face: "front", a0: -0.8, a1: -0.42, b0: 0.4, b1: 0.52, rgb: LAMP, emissive: true },
        { face: "front", a0: 0.42, a1: 0.8, b0: 0.4, b1: 0.52, rgb: LAMP, emissive: true },
      ],
    });
    defs.push({ hw: 0.94, zBack: -0.5, zFront: 0.8, y0: 0.2, yF: 0.34, yB: 0.34, rgb: DARK, layer: 0 });
    defs.push({
      hw: 0.64, zBack: -1.5, zFront: 0.3, y0: 0.9, yF: 1.3, yB: 1.18, rgb: G, layer: 1,
      overlays: [
        { face: "top", a0: -0.28, a1: -0.06, b0: -1.45, b1: 0.25, rgb: A, emissive: true },
        { face: "top", a0: 0.06, a1: 0.28, b0: -1.45, b1: 0.25, rgb: A, emissive: true },
      ],
    });
    defs.push({
      hw: 0.9, zBack: -2.05, zFront: -1.72, y0: 0.9, yF: 1.1, yB: 1.02, rgb: B, layer: 1,
      overlays: [{ face: "top", a0: -0.86, a1: 0.86, b0: -2.0, b1: -1.76, rgb: A, emissive: true }],
    });
    wheels.push({ x: 0.92, z: 1.3, r: 0.32, rim: A }, { x: -0.92, z: 1.3, r: 0.32, rim: A });
    wheels.push({ x: 0.96, z: -1.3, r: 0.38, rim: A }, { x: -0.96, z: -1.3, r: 0.38, rim: A });
  }

  return { parts: defs.map(buildPart), wheels };
}

function getModel(idx: number): CarModel {
  let m = modelCache.get(idx);
  if (!m) {
    m = buildModel(idx);
    modelCache.set(idx, m);
  }
  return m;
}

/* --------------------------------- render --------------------------------- */

/** Render one car at yaw `theta`. Exported so the look can be checked headlessly. */
export function renderCar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  idx: number,
  theta: number
) {
  const model = getModel(idx);
  const style = CAR_STYLES[idx];
  const s = Math.min(W / 5.5, H / 3.7);
  const cx = W / 2;
  const cy = H * 0.56;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const cosP = Math.cos(PITCH);
  const sinP = Math.sin(PITCH);

  // yaw, then a fixed downward pitch: +y and +z both move toward the camera
  const view = (p: V3, mirror: boolean): V3 => {
    const y = mirror ? -p[1] : p[1];
    const x = p[0] * cosT + p[2] * sinT;
    const z = -p[0] * sinT + p[2] * cosT;
    return [x, y * cosP - z * sinP, z * cosP + y * sinP];
  };
  const sx = (v: V3) => cx + v[0] * s;
  const sy = (v: V3) => cy - v[1] * s;

  ctx.clearRect(0, 0, W, H);

  /* floor: glow pool + neon ring, projected through the same camera */
  const groundRing = (radius: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const p = view([Math.cos(a) * radius, 0, Math.sin(a) * radius], false);
      pts.push([sx(p), sy(p)]);
    }
    return pts;
  };
  const trace = (pts: [number, number][]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  trace(groundRing(2.55));
  ctx.fillStyle = style.v.glow.replace("0.5)", "0.16)");
  ctx.fill();
  trace(groundRing(1.35));
  ctx.fillStyle = style.v.glow.replace("0.5)", "0.28)");
  ctx.fill();
  trace(groundRing(2.6));
  ctx.strokeStyle = `rgba(${style.v.accent.join(",")}, 0.3)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const L: V3 = [0.35, 0.75, 0.56]; // view-space key light

  interface Item {
    layer: number;
    depth: number;
    draw: () => void;
  }

  for (const pass of [
    { mirror: true, alpha: 0.14 },
    { mirror: false, alpha: 1 },
  ]) {
    const items: Item[] = [];

    /** Screen-space signed area: negative = facing the camera. */
    const project = (pts: V3[]) => {
      // mirroring flips winding — reverse so the area test keeps its meaning
      const src = pass.mirror ? [...pts].reverse() : pts;
      const vp = src.map((p) => view(p, pass.mirror));
      const sp = vp.map((v) => [sx(v), sy(v)] as [number, number]);
      let area = 0;
      for (let i = 0; i < sp.length; i++) {
        const [x1, y1] = sp[i];
        const [x2, y2] = sp[(i + 1) % sp.length];
        area += x1 * y2 - x2 * y1;
      }
      return { vp, sp, area: area / 2 };
    };

    const paint = (sp: [number, number][], fill: string) => {
      ctx.beginPath();
      ctx.moveTo(sp[0][0], sp[0][1]);
      for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      // stroke in the fill color: closes AA seams without drawing an outline
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const shade = (rgb: RGB, vp: V3[], emissive: boolean, alpha: number): string => {
      let k = 1;
      if (!emissive) {
        const ax = vp[1][0] - vp[0][0];
        const ay = vp[1][1] - vp[0][1];
        const az = vp[1][2] - vp[0][2];
        const bx = vp[2][0] - vp[1][0];
        const by = vp[2][1] - vp[1][1];
        const bz = vp[2][2] - vp[1][2];
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const dot = (nx * L[0] + ny * L[1] + nz * L[2]) / nl;
        k = 0.34 + 0.66 * Math.max(0, Math.abs(dot));
      }
      const r = Math.min(255, rgb[0] * k) | 0;
      const g = Math.min(255, rgb[1] * k) | 0;
      const b = Math.min(255, rgb[2] * k) | 0;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    /* one item per part: its own faces never overlap, so they need no sorting */
    for (const part of model.parts) {
      const centre = view(part.centre, pass.mirror);
      const visible = new Set<FaceId>();
      const draws: (() => void)[] = [];

      for (const f of part.faces) {
        const { vp, sp, area } = project(f.pts);
        if (area > -0.5) continue; // back-facing or degenerate
        visible.add(f.id);
        const fill = shade(f.rgb, vp, false, pass.alpha);
        draws.push(() => paint(sp, fill));
      }
      for (const o of part.overlays) {
        if (!visible.has(o.host)) continue; // its panel is not facing us
        const { vp, sp, area } = project(o.pts);
        if (area > -0.5) continue;
        const fill = shade(o.rgb, vp, !!o.emissive, pass.alpha);
        draws.push(() => paint(sp, fill));
      }
      if (draws.length) {
        items.push({
          layer: part.layer,
          depth: centre[2],
          draw: () => draws.forEach((d) => d()),
        });
      }
    }

    /* wheels: one flat disc on the outboard face, depth-sorted with the chassis */
    for (const w of model.wheels) {
      const sign = Math.sign(w.x);
      const xf = w.x + 0.16 * sign;
      const centre = view([xf, w.r, w.z], pass.mirror);
      const ring = (radius: number): [number, number][] => {
        const pts: [number, number][] = [];
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const p = view([xf, w.r + Math.sin(a) * radius, w.z + Math.cos(a) * radius], pass.mirror);
          pts.push([sx(p), sy(p)]);
        }
        return pts;
      };
      // outboard normal, to know whether we see the face or just the tyre edge
      const n = view([sign, 0, 0], false);
      const outer = ring(w.r);
      const rim = ring(w.r * 0.58);
      const hub = ring(w.r * 0.2);
      const faceOn = n[2] > 0.02;
      items.push({
        layer: 0,
        depth: centre[2],
        draw: () => {
          paint(outer, `rgba(14, 9, 22, ${pass.alpha})`);
          if (faceOn) {
            paint(rim, `rgba(${w.rim.join(",")}, ${0.5 * pass.alpha})`);
            paint(hub, `rgba(214, 214, 230, ${0.65 * pass.alpha})`);
          }
        },
      });
    }

    // layer first (stacking is correct at every yaw), then depth; Array#sort is
    // stable, so equal keys keep authoring order — no frame-to-frame swapping
    items.sort((a, b) => a.layer - b.layer || a.depth - b.depth);
    for (const it of items) it.draw();
  }
}
