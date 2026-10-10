import { defineConfig, loadEnv } from "vite";
import fs from "node:fs";
import path from "node:path";

// Folders the collector's GitHub Action publishes straight into this repo
// (data/, overseas/, assets/posters/). They are not part of the source tree, so
// the dev server serves them from disk and the build copies them into dist/.
const PUBLISHED = ["data", "overseas", "assets/posters"];

const MIME = {
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function publishedFolders() {
  const root = process.cwd();
  return {
    name: "cbo-published-folders",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || "").split("?")[0]);
        if (!PUBLISHED.some((p) => url.startsWith("/" + p + "/"))) return next();
        const file = path.join(root, url);
        if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const p of PUBLISHED) {
        const from = path.join(root, p);
        if (fs.existsSync(from)) fs.cpSync(from, path.join(root, "dist", p), { recursive: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // VITE_DATA_PROXY=https://cinebotrends.com lets the app run without local data
  // (FR-14). Without it, local data/ and overseas/ folders are served as-is.
  const proxy = env.VITE_DATA_PROXY
    ? Object.fromEntries(
        ["/data", "/overseas", "/assets/posters"].map((p) => [
          p,
          { target: env.VITE_DATA_PROXY, changeOrigin: true },
        ]),
      )
    : undefined;
  return {
    // "assets/" is the brand + poster folder, so hashed bundles go elsewhere.
    build: { assetsDir: "bundle", target: "es2020" },
    server: { port: 5173, proxy },
    plugins: [publishedFolders()],
    test: { include: ["tests/unit/**/*.test.js"], environment: "node" },
  };
});
