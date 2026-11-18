import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { cpSync, existsSync } from "fs";

/**
 * Copies node_modules/tinymce to client/public/tinymce so TinyMCE can be
 * loaded via <Editor scriptSrc="/tinymce/tinymce.min.js"> rather than
 * bundled ES module imports. The bundled approach triggers a Rolldown
 * (Vite 8) circular-dependency TDZ ReferenceError because TinyMCE 8's
 * plugins reference `tinymce` before the core module finishes initialising
 * within the chunk. Self-hosting via scriptSrc bypasses bundling entirely.
 *
 * This plugin runs at both `vite serve` (configureServer) and `vite build`
 * (buildStart). The output directory is gitignored; regenerated automatically.
 */
function tinymceSelfHostPlugin() {
  const copyTinyMCE = () => {
    const src = path.resolve(import.meta.dirname, "node_modules/tinymce");
    const dest = path.resolve(import.meta.dirname, "client/public/tinymce");
    if (!existsSync(dest)) {
      console.log("[tinymce-self-host] Copying TinyMCE to client/public/tinymce …");
      // Exclude *.md files (CHANGELOG.md, README.md, license.md) that ship
      // with the TinyMCE npm package. They are not needed at runtime and
      // would trip the verify-no-internal-docs.sh gate in the Docker build.
      cpSync(src, dest, { recursive: true, filter: (src) => !src.endsWith(".md") });
      console.log("[tinymce-self-host] Done.");
    }
  };
  return {
    name: "tinymce-self-host",
    buildStart() { copyTinyMCE(); },
    configureServer() { copyTinyMCE(); },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), tinymceSelfHostPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  optimizeDeps: {
    // Pre-bundle the rich-text editor's dynamic imports at server startup so
    // Vite's dep optimizer doesn't have to discover them on demand. Without
    // this, opening a card that mounts the Tiptap editor triggers ~20
    // simultaneous on-the-fly optimizations and the dev proxy times out at
    // 504 before they finish.
    include: [
      "@tiptap/core",
      "@tiptap/react",
      "@tiptap/react/menus",
      "@tiptap/starter-kit",
      "@tiptap/suggestion",
      "@tiptap/extension-bubble-menu",
      "@tiptap/extension-character-count",
      "@tiptap/extension-code-block-lowlight",
      "@tiptap/extension-color",
      "@tiptap/extension-highlight",
      "@tiptap/extension-image",
      "@tiptap/extension-mention",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-subscript",
      "@tiptap/extension-superscript",
      "@tiptap/extension-table",
      "@tiptap/extension-task-item",
      "@tiptap/extension-task-list",
      "@tiptap/extension-text-style",
      "@tiptap/extension-youtube",
      "tiptap-markdown",
      "lowlight",
    ],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    cssMinify: "esbuild",
    // Hidden source maps: emit `*.js.map` next to each chunk but DON'T add the
    // `//# sourceMappingURL=` comment to the JS. Browsers never auto-fetch them
    // (and server/vite.ts blocks public `.map` requests), but the server reads
    // them to de-minify Error Audit Log stack traces
    // (server/lib/sourcemap-resolver.ts). Source is not exposed to clients.
    sourcemap: "hidden",
    // Tightened from the default 500 kB to 1100 kB. We deliberately keep the
    // limit *below* our two known-large editor chunks so any new oversize
    // chunk introduced by a future commit still surfaces a warning — but
    // above the routine app-wide vendor chunks below so the log isn't full
    // of noise that would train reviewers to ignore it.
    //
    // Documented oversize chunks that are expected to keep firing the
    // warning (each is fetched lazily, not on initial paint):
    //   - `vendor-editors` (~1.5 MB, gz ~500 kB): every Tiptap extension we
    //     use. Loaded on demand the first time `TiptapEditor` mounts.
    //   - `vendor-tinymce` (~1.3 MB, gz ~440 kB): TinyMCE core + skin +
    //     plugins. Loaded on demand the first time the email design /
    //     content drawer opens.
    // Chunks under the threshold but worth noting so they're not "fixed"
    // accidentally:
    //   - `config` (~150 kB after task #573): admin Configuration page
    //     shell. Each top-level tab and each Messaging & Alerts sub-tab is
    //     now `React.lazy`'d so opening /config no longer pulls in every
    //     tab's code. The largest remaining per-tab chunk is
    //     `WorkflowAutomationSection` (~200 kB), only fetched when an admin
    //     opens that tab.
    //   - `lucide-react` (~610 kB): tree-shaken icon set used app-wide;
    //     lives in its own long-lived chunk so revisits hit the HTTP cache.
    //   - `vendor-charts` (~460 kB): Recharts + Chart.js, only loaded on
    //     routes that actually render charts.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "vendor-react";
          if (id.includes("node_modules/@tanstack/react-query")) return "vendor-query";
          if (id.includes("node_modules/recharts")) return "vendor-charts";
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/tiptap-markdown") || id.includes("node_modules/lowlight")) return "vendor-editors";
          // TinyMCE is no longer bundled — it's self-hosted via scriptSrc
          // (see tinymceSelfHostPlugin above). Only @tinymce/tinymce-react
          // (the thin React wrapper, ~5 kB) remains as a bundled import.
          if (id.includes("node_modules/@dnd-kit")) return "vendor-dnd";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    hmr: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
