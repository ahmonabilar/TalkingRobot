import { env } from "@huggingface/transformers"
import { createChat } from "./chat"
import { createFace, type FaceState } from "./face"
import { createSpeaker, voiceLanguage } from "./tts"
import { createTranscriber } from "./stt"
import type { TurnListener } from "./turns"

env.allowLocalModels = false
env.useBrowserCache = true

const statusEl = document.querySelector<HTMLElement>("#status")!
const logEl = document.querySelector<HTMLElement>("#log")!
const form = document.querySelector<HTMLFormElement>("#composer")!
const textInput = document.querySelector<HTMLInputElement>("#text")!
const modelSelect = document.querySelector<HTMLSelectElement>("#model")!
const voiceSelect = document.querySelector<HTMLSelectElement>("#voice")!
const voiceButton = document.querySelector<HTMLButtonElement>("#voice-toggle")!
const canvas = document.querySelector<HTMLCanvasElement>("#face")!

const face = createFace(canvas)
const chat = createChat()
let loadingNote = "Waking up"
let mode: FaceState | "paused" = "idle"
let generation = 0
let turns: TurnListener | null = null
let startingTurns: Promise<TurnListener> | null = null
let voiceError = ""

const transcriber = createTranscriber((message) => {
  loadingNote = message
  renderStatus()
})
const speaker = createSpeaker(
  (message) => {
    loadingNote = message
    renderStatus()
  },
  (level) => face.setMouth(level),
  () => markTurn("firstAudio"),
)

// Per-turn latency marks. There is only one turn at a time, so a single
// module-level record is enough to time every stage against speech end.
type TurnMarks = {
  start: number
  transcript?: number
  firstToken?: number
  firstSentence?: number
  firstAudio?: number
}
let turnMarks: TurnMarks | null = null

function startTurnTimer() {
  turnMarks = { start: performance.now() }
}

function markTurn(stage: Exclude<keyof TurnMarks, "start">) {
  if (turnMarks && turnMarks[stage] === undefined) turnMarks[stage] = performance.now()
}

function logTurnTimer() {
  const marks = turnMarks
  turnMarks = null
  if (!marks) return
  const since = (value?: number) => (value === undefined ? "—" : `${Math.round(value - marks.start)}ms`)
  console.log(
    `[turn] stt ${since(marks.transcript)} | llm-first-token ${since(marks.firstToken)} | first-sentence ${since(marks.firstSentence)} | tts ${since(marks.firstAudio)}`,
  )
}

function renderStatus() {
  if (voiceError && mode !== "thinking" && mode !== "speaking") {
    statusEl.textContent = voiceError
    return
  }
  if (mode === "thinking") statusEl.textContent = "Thinking"
  else if (mode === "speaking") statusEl.textContent = "Speaking"
  else if (mode === "listening") statusEl.textContent = "Listening"
  else if (turns?.userPaused) statusEl.textContent = "Voice paused"
  else if (turns?.active && turns.asleep) statusEl.textContent = "Click anywhere to start listening"
  else if (turns?.active) statusEl.textContent = loadingNote === "Ready" ? "Listening" : `Listening · ${loadingNote}`
  else statusEl.textContent = loadingNote
}

function setMode(next: FaceState) {
  mode = next
  face.setState(next)
  renderStatus()
}

function addBubble(who: "you" | "robot", text: string) {
  logEl.querySelector(".empty")?.remove()
  const bubble = document.createElement("p")
  bubble.className = `bubble ${who}`
  const label = document.createElement("span")
  label.textContent = who === "you" ? "You" : "Robot"
  bubble.append(label, document.createTextNode(text))
  logEl.append(bubble)
  logEl.scrollTop = logEl.scrollHeight
  return bubble
}

function setBubbleText(bubble: HTMLElement, text: string) {
  const label = bubble.querySelector("span")
  bubble.replaceChildren(label ?? "", document.createTextNode(text))
  logEl.scrollTop = logEl.scrollHeight
}

function updateVoiceButton() {
  if (!turns) {
    voiceButton.textContent = "Start voice"
    voiceButton.classList.remove("is-paused")
    voiceButton.disabled = false
    return
  }
  voiceButton.textContent = turns.userPaused ? "Resume voice" : "Pause voice"
  voiceButton.classList.toggle("is-paused", turns.userPaused)
  voiceButton.disabled = false
}

async function ensureTurns() {
  if (turns) return turns
  if (!startingTurns) {
    voiceButton.disabled = true
    voiceError = ""
    renderStatus()
    startingTurns = import("./turns")
      .then(({ createTurnListener }) =>
        createTurnListener({
          onSpeechStart() {
            if (mode === "thinking" || mode === "speaking") return
            setMode("listening")
          },
          onSpeechEnd(audio) {
            void askFromAudio(audio)
          },
        }),
      )
      .then((listener) => {
        turns = listener
        return listener
      })
      .catch((error: unknown) => {
        startingTurns = null
        throw error
      })
  }
  return startingTurns
}

async function ask(text: string, existingGen?: number) {
  const spoken = text.trim()
  if (!spoken) return
  const gen = existingGen ?? ++generation
  // Typed turns start timing here; spoken turns already started at speech end.
  if (existingGen === undefined) startTurnTimer()
  speaker.stop()
  speaker.unlock()
  if (turns) await turns.pauseForSpeech()
  setMode("thinking")
  face.setMouth(0)
  addBubble("you", spoken)
  const reply = addBubble("robot", "…")
  try {
    let queued = false
    for await (const sentence of chat.streamSentences(spoken, (partial) => {
      markTurn("firstToken")
      if (gen === generation) setBubbleText(reply, partial || "…")
    }, abortFor(gen))) {
      if (gen !== generation) return
      markTurn("firstSentence")
      queued = true
      setMode("speaking")
      speaker.enqueue(sentence)
    }
    if (gen !== generation) return
    if (queued) await speaker.finish()
    else setBubbleText(reply, "I could not think of a reply.")
  } catch (error) {
    if (gen !== generation) return
    const message = error instanceof Error ? error.message : "Something went wrong."
    setBubbleText(reply, message)
    loadingNote = message
  } finally {
    if (gen === generation) {
      logTurnTimer()
      face.setMouth(0)
      setMode("idle")
      if (turns && !turns.userPaused) await turns.resumeAfterSpeech()
      updateVoiceButton()
      renderStatus()
    }
  }
}

const aborts = new Map<number, AbortController>()

function abortFor(gen: number) {
  for (const [id, controller] of aborts) {
    if (id !== gen) controller.abort()
  }
  const controller = new AbortController()
  aborts.set(gen, controller)
  return controller.signal
}

async function askFromAudio(audio: Float32Array) {
  if (mode === "thinking" || mode === "speaking") return
  const gen = ++generation
  startTurnTimer()
  speaker.stop()
  if (turns) await turns.pauseForSpeech()
  setMode("thinking")
  let handedOff = false
  try {
    await transcriber.ready
    if (gen !== generation) return
    const text = (await transcriber.transcribe(audio)).trim()
    markTurn("transcript")
    if (gen !== generation || !text) return
    handedOff = true
    await ask(text, gen)
  } catch (error) {
    if (gen !== generation) return
    loadingNote = error instanceof Error ? error.message : "I could not hear that."
  } finally {
    if (gen === generation && !handedOff) {
      turnMarks = null
      face.setMouth(0)
      setMode("idle")
      if (turns && !turns.userPaused) await turns.resumeAfterSpeech()
      updateVoiceButton()
      renderStatus()
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault()
  const text = textInput.value
  textInput.value = ""
  void ask(text)
})

voiceButton.addEventListener("click", () => {
  speaker.unlock()
  void (async () => {
    try {
      const listener = await ensureTurns()
      if (!listener.active && !listener.userPaused && mode !== "thinking" && mode !== "speaking") {
        await listener.start()
      } else if (listener.userPaused) {
        await listener.resumeByUser()
        if (mode !== "thinking" && mode !== "speaking") setMode("idle")
      } else {
        await listener.pauseByUser()
        if (mode === "listening") setMode("idle")
      }
      voiceError = ""
    } catch (error) {
      voiceError = error instanceof Error ? error.message : "Microphone permission is needed."
      turns = null
    }
    updateVoiceButton()
    renderStatus()
  })()
})

modelSelect.addEventListener("change", () => {
  chat.setModel(modelSelect.value)
  void chat.warmUp()
})

function useVoice(voice: string) {
  speaker.setVoice(voice)
  const language = voiceLanguage(voice)
  transcriber.setLanguage(language.code)
  chat.setLanguage(language.name)
}

voiceSelect.addEventListener("change", () => {
  useVoice(voiceSelect.value)
})

function wakeAudio() {
  speaker.unlock()
  turns?.wake()
  window.setTimeout(renderStatus, 100)
}

window.addEventListener("pointerdown", wakeAudio)
window.addEventListener("keydown", wakeAudio)

function fillSelect(
  select: HTMLSelectElement,
  values: string[],
  selected: string,
  label: (value: string) => string = (value) => value,
) {
  select.replaceChildren()
  for (const value of values) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = label(value)
    option.selected = value === selected
    select.append(option)
  }
  select.disabled = values.length === 0
}

async function boot() {
  renderStatus()
  const models = chat
    .listModels()
    .then((names) => {
      fillSelect(modelSelect, names, chat.model)
      void chat.warmUp()
    })
    .catch((error: unknown) => {
      fillSelect(modelSelect, [chat.model], chat.model)
      loadingNote = error instanceof Error ? error.message : "Ollama is not running."
      renderStatus()
    })

  const voice = speaker.ready.then(() => {
    fillSelect(
      voiceSelect,
      speaker.voices(),
      speaker.voices()[0] ?? "af_heart",
      (voice) => `${voice} (${voiceLanguage(voice).name})`,
    )
    useVoice(voiceSelect.value)
  })

  const ear = transcriber.ready
  await Promise.all([models, voice, ear])
  if (!voiceError) loadingNote = "Ready"
  renderStatus()

  try {
    await ensureTurns()
    await turns?.start()
    updateVoiceButton()
    renderStatus()
  } catch (error) {
    voiceError = error instanceof Error ? error.message : "Allow the microphone to talk."
    voiceButton.textContent = "Start voice"
    renderStatus()
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => face.destroy())
}

void boot()
