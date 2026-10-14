import { pipeline } from "@huggingface/transformers"

type Transcript = { text?: string }

type Transcriber = (
  audio: Float32Array,
  options?: { language: string; task: "transcribe" },
) => Promise<Transcript | Transcript[]>

// The English-only model is more accurate for English, so the multilingual one loads only when another language is chosen.
const ENGLISH_MODEL = "onnx-community/whisper-base.en"
const MULTILINGUAL_MODEL = "onnx-community/whisper-base"

// Whisper loses accuracy when the encoder is quantized, so only the decoder is shrunk on the GPU.
const DTYPES = {
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
  wasm: { encoder_model: "q8", decoder_model_merged: "q8" },
} as const

const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g

export type ProgressUpdate = (message: string) => void

type ProgressEvent = {
  status?: string
  file?: string
  progress?: number
}

function progressMessage(label: string, update: ProgressEvent): string {
  if (update.status === "progress" && typeof update.progress === "number") {
    const file = update.file ? ` ${update.file}` : ""
    return `${label}${file} ${Math.round(update.progress)}%`
  }
  if (update.status === "ready" || update.status === "done") return `${label} ready`
  return `${label}…`
}

async function loadTranscriber(onProgress: ProgressUpdate, model: string, device: "webgpu" | "wasm") {
  onProgress(device === "webgpu" ? "Loading the ear…" : "Loading the ear on this CPU…")
  const create = pipeline as (
    task: "automatic-speech-recognition",
    model: string,
    options: {
      device: "webgpu" | "wasm"
      dtype: (typeof DTYPES)[keyof typeof DTYPES]
      progress_callback: (update: ProgressEvent) => void
    },
  ) => Promise<Transcriber>
  return create("automatic-speech-recognition", model, {
    device,
    dtype: DTYPES[device],
    progress_callback: (update) => {
      onProgress(progressMessage("Loading the ear", update))
    },
  })
}

export function createTranscriber(onProgress: ProgressUpdate) {
  const loaded = new Map<string, Promise<Transcriber>>()
  let language = "en"

  function load(model: string) {
    let transcriber = loaded.get(model)
    if (!transcriber) {
      transcriber = (async () => {
        try {
          if (!("gpu" in navigator)) throw new Error("WebGPU unavailable")
          return await loadTranscriber(onProgress, model, "webgpu")
        } catch {
          return await loadTranscriber(onProgress, model, "wasm")
        }
      })()
      transcriber.catch(() => loaded.delete(model))
      loaded.set(model, transcriber)
    }
    return transcriber
  }

  const ready = load(ENGLISH_MODEL)

  return {
    ready: ready.then(() => undefined),
    setLanguage(code: string) {
      language = code
      if (code !== "en") void load(MULTILINGUAL_MODEL).catch(() => undefined)
    },
    async transcribe(audio: Float32Array): Promise<string> {
      const english = language === "en"
      const transcriber = await load(english ? ENGLISH_MODEL : MULTILINGUAL_MODEL)
      const result = await (english ? transcriber(audio) : transcriber(audio, { language, task: "transcribe" }))
      const text = Array.isArray(result) ? result.map((part) => part.text ?? "").join(" ") : (result.text ?? "")
      return text.replace(NON_SPEECH, " ").replace(/\s+/g, " ").trim()
    },
  }
}
