import { pipeline } from "@huggingface/transformers"

type Transcript = { text?: string }

type Transcriber = (audio: Float32Array) => Promise<Transcript | Transcript[]>

const MODEL = "onnx-community/whisper-base.en"

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

async function loadTranscriber(onProgress: ProgressUpdate, device: "webgpu" | "wasm") {
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
  return create("automatic-speech-recognition", MODEL, {
    device,
    dtype: DTYPES[device],
    progress_callback: (update) => {
      onProgress(progressMessage("Loading the ear", update))
    },
  })
}

export function createTranscriber(onProgress: ProgressUpdate) {
  const ready = (async () => {
    try {
      if (!("gpu" in navigator)) throw new Error("WebGPU unavailable")
      return await loadTranscriber(onProgress, "webgpu")
    } catch {
      return await loadTranscriber(onProgress, "wasm")
    }
  })()

  return {
    ready: ready.then(() => undefined),
    async transcribe(audio: Float32Array): Promise<string> {
      const transcriber = await ready
      const result = await transcriber(audio)
      const text = Array.isArray(result) ? result.map((part) => part.text ?? "").join(" ") : (result.text ?? "")
      return text.replace(NON_SPEECH, " ").replace(/\s+/g, " ").trim()
    },
  }
}
