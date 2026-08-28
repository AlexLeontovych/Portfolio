/**
 * The NEON RUN garage: the three selectable cars. One definition drives
 * everything — the in-game back-view sprite palette (engine.ts bakeCar), the
 * 3D turntable colors (carViewer.ts), and the little car on the page's
 * scrolling road (via carStore CSS variables).
 */

export const CAR_KEY = "portfolio-arcade-car";

export interface CarStyleDef {
  name: string;
  /** 1..5 flavor bars on the garage card (visual character, not physics). */
  stats: { speed: number; grip: number; style: number };
  /** back-view sprite body gradient, top → bottom */
  body: [string, string, string];
  /** rim-light / trim color */
  accent: string;
  /** rear light bar gradient (idle) and while braking */
  bar: [string, string, string];
  barBrake: [string, string, string];
  /** baked glow around the body, as "r, g, b" */
  glowRGB: string;
  /** silhouette: full spoiler wing, clean tail, or a muscle ducktail */
  wing: "wing" | "none" | "duck";
  /** 3D turntable colors (0..255 RGB triplets) */
  v: {
    body: [number, number, number];
    accent: [number, number, number];
    glass: [number, number, number];
    glow: string;
  };
  /** the little scroll-road car on the main page */
  page: { body: string; stroke: string };
}

export const CAR_STYLES: CarStyleDef[] = [
  {
    name: "SUNRISE GT",
    stats: { speed: 4, grip: 4, style: 5 },
    body: ["#ff6cb1", "#e0257b", "#6d123f"],
    accent: "#00e5ff",
    bar: ["#ff9bcb", "#ff2e88", "#c81b68"],
    barBrake: ["#ffe3f1", "#ff8fc4", "#c81b68"],
    glowRGB: "255, 46, 136",
    wing: "wing",
    v: {
      body: [224, 37, 123],
      accent: [0, 229, 255],
      glass: [70, 200, 235],
      glow: "rgba(255, 46, 136, 0.5)",
    },
    page: { body: "#ff3b53", stroke: "#2a0c14" },
  },
  {
    name: "PHANTOM X",
    stats: { speed: 5, grip: 3, style: 4 },
    body: ["#6ee9ff", "#00b7dd", "#083e57"],
    accent: "#ff2e88",
    bar: ["#d9fbff", "#00e5ff", "#0891b2"],
    barBrake: ["#ffffff", "#8df3ff", "#0891b2"],
    glowRGB: "0, 229, 255",
    wing: "none",
    v: {
      body: [0, 183, 221],
      accent: [255, 46, 136],
      glass: [180, 240, 255],
      glow: "rgba(0, 229, 255, 0.5)",
    },
    page: { body: "#00c2e0", stroke: "#062a3a" },
  },
  {
    name: "VOLT MUSCLE",
    stats: { speed: 5, grip: 4, style: 4 },
    body: ["#c9a2ff", "#8f45f5", "#38105e"],
    accent: "#ffb800",
    bar: ["#ffe3a3", "#ffb800", "#b87a00"],
    barBrake: ["#fff6dd", "#ffd25e", "#b87a00"],
    glowRGB: "168, 85, 247",
    wing: "duck",
    v: {
      body: [143, 69, 245],
      accent: [255, 184, 0],
      glass: [215, 190, 255],
      glow: "rgba(168, 85, 247, 0.5)",
    },
    page: { body: "#8f45f5", stroke: "#22093d" },
  },
];
