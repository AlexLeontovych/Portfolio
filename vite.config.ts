import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base ("./") makes the build work on GitHub Pages project pages
// (https://<user>.github.io/<repo>/) AND on a custom domain / root, with no
// extra config. If you ever switch to client-side routing, change this to
// "/<repo-name>/" instead.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsInlineLimit: 4096,
  },
});
