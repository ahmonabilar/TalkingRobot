import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, sep } from "node:path"
import { defineConfig, type Plugin } from "vite"

const vadTypes: Record<string, string> = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
}

function serveVadAssets(): Plugin {
  const dir = join(process.cwd(), "public", "vad")
  return {
    name: "serve-vad-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? ""
        if (!url.startsWith("/vad/")) return next()
        const relative = normalize(decodeURIComponent(url.slice("/vad/".length)))
        if (relative.startsWith("..")) return next()
        const file = join(dir, relative)
        if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader("Content-Type", vadTypes[extname(file)] ?? "application/octet-stream")
        createReadStream(file).pipe(res)
      })
    },
  }
}

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
}

const ollamaProxy = {
  "/ollama": {
    target: "http://127.0.0.1:11434",
    rewrite: (path: string) => path.replace(/^\/ollama/, ""),
  },
}

export default defineConfig({
  plugins: [serveVadAssets()],
  server: {
    port: 5173,
    headers: isolationHeaders,
    proxy: ollamaProxy,
  },
  preview: {
    headers: isolationHeaders,
    proxy: ollamaProxy,
  },
  optimizeDeps: {
    include: ["@ricky0123/vad-web"],
    exclude: ["@huggingface/transformers", "kokoro-js"],
  },
  worker: {
    format: "es",
  },
})
