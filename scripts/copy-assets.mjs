import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dest = join(root, "public", "vad")
mkdirSync(dest, { recursive: true })

function copyMatching(dir, test) {
  if (!existsSync(dir)) return 0
  let copied = 0
  for (const name of readdirSync(dir)) {
    const from = join(dir, name)
    if (!statSync(from).isFile() || !test(name)) continue
    cpSync(from, join(dest, name))
    copied += 1
  }
  return copied
}

const vadDir = join(root, "node_modules/@ricky0123/vad-web/dist")
const vadCount = copyMatching(
  vadDir,
  (name) => name.endsWith(".onnx") || name.includes("worklet"),
)

const ortDirs = [
  join(root, "node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist"),
  join(root, "node_modules/onnxruntime-web/dist"),
]
const ortDir = ortDirs.find((dir) => existsSync(dir))
const ortCount = ortDir
  ? copyMatching(ortDir, (name) => name.endsWith(".wasm") || name.endsWith(".mjs"))
  : 0

if (!vadCount || !ortCount) {
  console.warn(
    `VAD assets incomplete (vad files: ${vadCount}, onnx files: ${ortCount}). Voice turn detection needs these files in public/vad.`,
  )
} else {
  console.log(`Copied ${vadCount} VAD files and ${ortCount} ONNX runtime files to public/vad`)
}
