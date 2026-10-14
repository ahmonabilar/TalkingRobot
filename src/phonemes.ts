import ESpeakNg from "espeak-ng"
import wasmUrl from "espeak-ng/dist/espeak-ng.wasm?url"

// The phonemizer inside kokoro-js only knows English, so other languages go through a full eSpeak build.
// Kokoro was trained on eSpeak output with these tied pairs collapsed into single symbols.
const MERGED: Array<[string, string]> = [
  ["a\u200dɪ", "I"],
  ["a\u200dʊ", "W"],
  ["d\u200dz", "ʣ"],
  ["d\u200dʑ", "ʥ"],
  ["d\u200dʒ", "ʤ"],
  ["e\u200dɪ", "A"],
  ["o\u200dʊ", "O"],
  ["ə\u200dʊ", "Q"],
  ["s\u200ds", "S"],
  ["t\u200ds", "ʦ"],
  ["t\u200dɕ", "ʨ"],
  ["t\u200dʃ", "ʧ"],
  ["ɔ\u200dɪ", "Y"],
]

// Kokoro's vocabulary has no ʑ outside the ʥ affricate, and the tokenizer silently drops unknown symbols.
const SUBSTITUTED: Array<[string, string]> = [["ʑ", "ʒ"]]

const PUNCTUATION = /(\s*[;:,.!?¡¿—…"«»“”।]+\s*)+/g

let compiled: Promise<WebAssembly.Module> | null = null

function loadWasm() {
  compiled ??= WebAssembly.compileStreaming(fetch(wasmUrl)).catch((error: unknown) => {
    compiled = null
    throw error
  })
  return compiled
}

export function preloadPhonemizer() {
  void loadWasm().catch(() => undefined)
}

// eSpeak runs as a command-line program, so each call boots a fresh instance from the compiled module.
async function run(text: string, language: string): Promise<string> {
  const wasm = await loadWasm()
  const espeak = await ESpeakNg({
    arguments: ["--phonout", "out", "-q", "-b", "1", "--ipa=3", "-v", language, "-f", "in"],
    instantiateWasm(imports, done) {
      void WebAssembly.instantiate(wasm, imports).then((instance) => done(instance, wasm))
      return {}
    },
    preRun: [(module) => module.FS.writeFile("in", text)],
    print: () => undefined,
    printErr: () => undefined,
  })
  return espeak.FS.readFile("out", { encoding: "utf8" })
}

function clean(phonemes: string) {
  let out = phonemes.replace(/\([a-z-]+\)/g, "").replace(/\s+/g, " ").trim()
  for (const [tied, single] of MERGED) out = out.replaceAll(tied, single)
  for (const [missing, nearest] of SUBSTITUTED) out = out.replaceAll(missing, nearest)
  return out.replace(/\u200d|-/g, "")
}

export async function phonemize(text: string, language: string): Promise<string> {
  const normalized = text.replace(/[‘’]/g, "'").replace(/[«»“”]/g, '"')
  const parts: string[] = []
  let last = 0
  for (const match of normalized.matchAll(PUNCTUATION)) {
    if (match.index > last) parts.push(clean(await run(normalized.slice(last, match.index), language)))
    parts.push(match[0])
    last = match.index + match[0].length
  }
  if (last < normalized.length) parts.push(clean(await run(normalized.slice(last), language)))
  return parts.join("").trim()
}
