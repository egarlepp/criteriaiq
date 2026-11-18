import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hidden source maps (vite `build.sourcemap: "hidden"`) ship to
  // dist/public/assets so the server can de-minify error stacks
  // (server/lib/sourcemap-resolver.ts), but they must NOT be downloadable by
  // browsers — that would expose the original source. Block public `.map`
  // requests before the static handler can serve them.
  app.use((req, res, next) => {
    if (req.path.endsWith(".map")) {
      return res.status(404).end();
    }
    next();
  });

  app.use(express.static(distPath));

  app.use("/{*path}", (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API endpoint not found' });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
