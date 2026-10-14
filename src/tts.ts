import "./polyfills"
import { KokoroTTS } from "kokoro-js"
import { phonemize, preloadPhonemizer } from "./phonemes"

type KokoroVoice = keyof KokoroTTS["voices"]

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX"

export type VoiceLanguage = {
  // ISO 639-1 code, as Whisper expects it.
  code: string
  name: string
  // eSpeak voice for languages the built-in kokoro-js phonemizer cannot handle.
  espeak?: string
}

// Kokoro voice names start with a letter for their language.
const LANGUAGES: Record<string, VoiceLanguage> = {
  a: { code: "en", name: "American English" },
  b: { code: "en", name: "British English" },
  e: { code: "es", name: "Spanish", espeak: "es" },
  f: { code: "fr", name: "French", espeak: "fr-fr" },
  h: { code: "hi", name: "Hindi", espeak: "hi" },
  i: { code: "it", name: "Italian", espeak: "it" },
  p: { code: "pt", name: "Brazilian Portuguese", espeak: "pt-br" },
}

// Kokoro has no Polish voices, so Polish borrows Spanish ones, whose clear vowels and rolled r suit it best.
const POLISH: VoiceLanguage = { code: "pl", name: "Polish", espeak: "pl" }
const POLISH_SUFFIX = "@pl"
const POLISH_VOICES = ["ef_dora", "em_alex"].map((voice) => voice + POLISH_SUFFIX)

const EXTRA_VOICES = [
  "ef_dora",
  "em_alex",
  "em_santa",
  "ff_siwis",
  "hf_alpha",
  "hf_beta",
  "hm_omega",
  "hm_psi",
  "if_sara",
  "im_nicola",
  "pf_dora",
  "pm_alex",
  "pm_santa",
]

export function voiceLanguage(voice: string): VoiceLanguage {
  if (voice.endsWith(POLISH_SUFFIX)) return POLISH
  return LANGUAGES[voice[0]] ?? LANGUAGES.a
}

function voiceFile(voice: string) {
  return voice.replace(POLISH_SUFFIX, "") as KokoroVoice
}

type ProgressEvent = {
  status?: string
  file?: string
  progress?: number
}

type SpeechAudio = {
  audio: Float32Array
  sampling_rate: number
}

type Clip = {
  envelope: Float32Array
  startAt: number
}

const ENVELOPE_FRAME = 0.01
// The jaw eases toward its target, so reading slightly ahead lands each opening on its syllable.
const MOUTH_LEAD = 0.03

export type Speaker = {
  ready: Promise<void>
  unlock: () => void
  voices: () => string[]
  setVoice: (voice: string) => void
  enqueue: (sentence: string) => void
  stop: () => void
  finish: () => Promise<void>
}

export function createSpeaker(
  onProgress: (message: string) => void,
  onLevel: (level: number) => void,
  onAudioStart?: () => void,
): Speaker {
  let voice: KokoroVoice = "af_heart"
  let voiceList: string[] = [voice]
  // Safari plays silence from a context whose rate differs from the system's, so clips are resampled instead.
  const context = new AudioContext()

  let engine: KokoroTTS | null = null
  let current: AudioBufferSourceNode | null = null
  let clip: Clip | null = null
  let token = 0
  let playing = false
  let pending = 0
  let finishing = false
  const queue: string[] = []
  const idleWaiters: Array<() => void> = []
  let pumping = false
  let monitoring = false

  const progress_callback = (update: ProgressEvent) => {
    if (update.status === "progress" && typeof update.progress === "number") {
      const file = update.file ? ` ${update.file}` : ""
      onProgress(`Loading the voice${file} ${Math.round(update.progress)}%`)
    } else if (update.status === "ready" || update.status === "done") {
      onProgress("Voice ready")
    } else {
      onProgress("Loading the voice…")
    }
  }

  // The GPU runs Kokoro several times faster than the CPU, so prefer WebGPU
  // (fp32, as the docs recommend) and fall back to the WASM/q8 build when it
  // is unavailable or fails to load.
  async function loadEngine(): Promise<KokoroTTS> {
    const useGpu = "gpu" in navigator
    if (useGpu) {
      try {
        return await KokoroTTS.from_pretrained(MODEL, {
          dtype: "fp32",
          device: "webgpu",
          progress_callback,
        })
      } catch (error) {
        console.warn("Kokoro WebGPU load failed, falling back to CPU", error)
      }
    }
    return KokoroTTS.from_pretrained(MODEL, {
      dtype: "q8",
      device: "wasm",
      progress_callback,
    })
  }

  const ready = loadEngine().then((tts) => {
    engine = tts
    voiceList = [...Object.keys(tts.voices), ...EXTRA_VOICES, ...POLISH_VOICES]
    if (!voiceList.includes(voice)) voice = (voiceList[0] as KokoroVoice | undefined) ?? voice
  })

  function level() {
    if (!monitoring) return
    onLevel(clip ? heardLevel(clip) : 0)
    requestAnimationFrame(level)
  }

  // currentTime is the sample being rendered now; the listener hears it only after the output latency.
  function heardLevel({ envelope, startAt }: Clip) {
    const latency = (context.outputLatency || 0) + (context.baseLatency || 0)
    const position = context.currentTime - latency - startAt + MOUTH_LEAD
    const frame = Math.floor(position / ENVELOPE_FRAME)
    return frame >= 0 && frame < envelope.length ? envelope[frame] : 0
  }

  function settle() {
    if (pending === 0 && !playing && (finishing || queue.length === 0)) {
      monitoring = false
      onLevel(0)
      const waiters = idleWaiters.splice(0)
      for (const resolve of waiters) resolve()
    }
  }

  async function play(audio: SpeechAudio, myToken: number) {
    if (myToken !== token) return
    const data = matchRate(Float32Array.from(audio.audio), audio.sampling_rate, context.sampleRate)
    const buffer = context.createBuffer(1, data.length, context.sampleRate)
    buffer.copyToChannel(data, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    current = source
    const sentenceClip: Clip = { envelope: loudness(data, context.sampleRate), startAt: 0 }
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, (buffer.duration + 0.35) * 1000)
      source.onended = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      sentenceClip.startAt = context.currentTime
      source.start(sentenceClip.startAt)
      clip = sentenceClip
      onAudioStart?.()
    })
    if (current === source) current = null
    if (clip === sentenceClip) clip = null
  }

  async function pump(myToken: number) {
    if (pumping) return
    pumping = true
    playing = true
    monitoring = true
    requestAnimationFrame(level)
    try {
      await ready
      // resume() never settles until the page gets a click, so it must not block the queue.
      void context.resume().catch(() => undefined)
      // Synthesize one sentence ahead: while the current clip plays, the next
      // clip is already being generated, so there is no silent gap between them.
      const synthNext = (): Promise<SpeechAudio> | null => {
        const sentence = queue.shift()
        if (!sentence || !engine) return null
        return withTimeout(synthesize(engine, sentence, voice), 30000)
      }
      let ahead = synthNext()
      while (myToken === token) {
        // A sentence can arrive while the last clip plays, after the look-ahead already found the queue empty.
        ahead ??= synthNext()
        if (!ahead) break
        pending += 1
        try {
          const audio = await ahead
          if (myToken !== token) return
          // Kick off the following sentence before playing this one.
          ahead = synthNext()
          await play(audio, myToken)
        } catch (error) {
          if (myToken !== token) return
          console.warn("Could not speak a sentence", error)
          ahead = synthNext()
        } finally {
          if (myToken === token) pending -= 1
        }
      }
    } finally {
      if (myToken === token) {
        pumping = false
        playing = false
        settle()
      }
    }
  }

  return {
    ready: ready.then(() => undefined),
    unlock() {
      if (context.state === "running") return
      void context.resume().catch(() => undefined)
      // Safari only unlocks output when a sound starts inside the gesture itself.
      const silence = context.createBufferSource()
      silence.buffer = context.createBuffer(1, 1, context.sampleRate)
      silence.connect(context.destination)
      silence.start()
    },
    voices() {
      return voiceList
    },
    setVoice(next: string) {
      if (!voiceList.includes(next)) return
      voice = next as KokoroVoice
      if (voiceLanguage(next).espeak) preloadPhonemizer()
    },
    enqueue(sentence: string) {
      const trimmed = sentence.trim()
      if (!trimmed) return
      finishing = false
      queue.push(trimmed)
      void pump(token)
    },
    stop() {
      token += 1
      queue.length = 0
      pending = 0
      finishing = true
      try {
        current?.stop()
      } catch {
        // Already stopped.
      }
      current = null
      clip = null
      playing = false
      pumping = false
      settle()
    },
    finish() {
      finishing = true
      if (!pumping && queue.length === 0) {
        settle()
        return Promise.resolve()
      }
      return new Promise((resolve) => idleWaiters.push(resolve))
    },
  }
}

async function synthesize(engine: KokoroTTS, sentence: string, voice: KokoroVoice): Promise<SpeechAudio> {
  const language = voiceLanguage(voice).espeak
  if (!language) return engine.generate(sentence, { voice }) as Promise<SpeechAudio>
  // generate() rejects voices outside the English list, but generate_from_ids() loads any voice file by name.
  const { input_ids } = engine.tokenizer(await phonemize(sentence, language), { truncation: true })
  return engine.generate_from_ids(input_ids, { voice: voiceFile(voice) }) as Promise<SpeechAudio>
}

// Loudness per 10 ms frame, scaled so the loudest syllable of the clip opens the mouth fully.
function loudness(data: Float32Array, rate: number) {
  const size = Math.max(1, Math.round(rate * ENVELOPE_FRAME))
  const envelope = new Float32Array(Math.ceil(data.length / size))
  let loudest = 0
  for (let frame = 0; frame < envelope.length; frame++) {
    const start = frame * size
    const end = Math.min(start + size, data.length)
    let sum = 0
    for (let i = start; i < end; i++) sum += data[i] * data[i]
    envelope[frame] = Math.sqrt(sum / (end - start))
    loudest = Math.max(loudest, envelope[frame])
  }
  const scale = loudest > 0 ? 1 / (loudest * 0.8) : 0
  for (let frame = 0; frame < envelope.length; frame++) envelope[frame] = Math.min(1, envelope[frame] * scale)
  return envelope
}

function matchRate(input: Float32Array, fromRate: number, toRate: number) {
  const sameRate = !fromRate || !toRate || Math.abs(fromRate - toRate) < 1
  const length = sameRate ? input.length : Math.max(1, Math.round((input.length * toRate) / fromRate))
  const output = new Float32Array(length)
  if (sameRate) {
    output.set(input)
    return output
  }
  const step = fromRate / toRate
  for (let i = 0; i < length; i++) {
    const position = i * step
    const index = Math.min(Math.floor(position), input.length - 1)
    const next = Math.min(index + 1, input.length - 1)
    const frac = position - index
    output[i] = input[index] * (1 - frac) + input[next] * frac
  }
  return output
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("The voice took too long.")), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}
