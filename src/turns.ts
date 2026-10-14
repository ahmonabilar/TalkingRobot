import { MicVAD } from "@ricky0123/vad-web"

const ASSETS = "/vad/"

const MIC: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression: true,
  },
}

export type TurnListener = {
  start: () => Promise<void>
  pauseByUser: () => Promise<void>
  resumeByUser: () => Promise<void>
  pauseForSpeech: () => Promise<void>
  resumeAfterSpeech: () => Promise<void>
  wake: () => void
  readonly asleep: boolean
  readonly userPaused: boolean
  readonly active: boolean
}

export async function createTurnListener(handlers: {
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void
}): Promise<TurnListener> {
  let userPaused = false
  let heldForSpeech = false
  let active = false
  let stream: MediaStream | null = null
  // Browsers keep a context made before a click suspended, so the app has to resume it after one.
  const context = new AudioContext()

  function wake() {
    if (context.state !== "running") void context.resume().catch(() => undefined)
  }

  async function openMic() {
    stream = await navigator.mediaDevices.getUserMedia(MIC)
    return stream
  }

  function closeMic() {
    stream?.getTracks().forEach((track) => track.stop())
  }

  // MicVAD breaks if start and pause overlap: a pause during start's getUserMedia leaves a second source connected.
  let queue: Promise<void> = Promise.resolve()
  function serial(task: () => Promise<void>) {
    const run = queue.then(task)
    queue = run.catch(() => undefined)
    return run
  }

  const vad = await MicVAD.new({
    model: "v5",
    audioContext: context,
    baseAssetPath: ASSETS,
    onnxWASMBasePath: ASSETS,
    startOnLoad: false,
    submitUserSpeechOnPause: false,
    positiveSpeechThreshold: 0.4,
    negativeSpeechThreshold: 0.2,
    preSpeechPadMs: 1000,
    redemptionMs: 1200,
    minSpeechMs: 250,
    getStream: openMic,
    // The microphone stays open while the robot talks, so reopening it does not clip the next words.
    pauseStream: async () => undefined,
    resumeStream: async (current) => {
      const live = current.getAudioTracks().some((track) => track.readyState === "live")
      return live ? current : openMic()
    },
    ortConfig(ort) {
      // One thread keeps this runtime off the worker pool shared with Whisper and Kokoro.
      // Extra threads wait forever and leave listening, speech, and the mouth stuck.
      ort.env.wasm.numThreads = 1
      ort.env.wasm.initTimeout = 20000
    },
    onSpeechStart: () => {
      if (userPaused || heldForSpeech) return
      handlers.onSpeechStart()
    },
    onSpeechEnd: (audio) => {
      if (userPaused || heldForSpeech) return
      handlers.onSpeechEnd(audio)
    },
  })

  async function listen() {
    if (userPaused || heldForSpeech) return
    await vad.start()
    wake()
    active = true
  }

  return {
    wake,
    get asleep() {
      return context.state !== "running"
    },
    get userPaused() {
      return userPaused
    },
    get active() {
      return active
    },
    start: () =>
      serial(async () => {
        userPaused = false
        await listen()
      }),
    pauseByUser: () =>
      serial(async () => {
        userPaused = true
        active = false
        await vad.pause()
        // The VAD may already be paused for speech, so the microphone is closed here rather than in pauseStream.
        closeMic()
      }),
    resumeByUser: () =>
      serial(async () => {
        userPaused = false
        await listen()
      }),
    pauseForSpeech: () =>
      serial(async () => {
        heldForSpeech = true
        active = false
        await vad.pause()
      }),
    resumeAfterSpeech: () =>
      serial(async () => {
        heldForSpeech = false
        await listen()
      }),
  }
}
