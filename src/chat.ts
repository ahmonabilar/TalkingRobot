export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

let today = new Date().toISOString().split('T')[0];

function systemPrompt(language: string) {
  return `Today is ${today}. You are a friendly robot speaking out loud to one person. Answer in one to three short spoken sentences. Do not use markdown, lists, emojis, or stage directions. Always answer in ${language}, written in its usual script.`
}

const NOT_CHAT = /(flux|z-image|embed|ocr|klein|stable-diffusion|sdxl)/i
const DEFAULT_MODEL = "Llama3.2:latest"
// Keep the model resident so later turns do not pay the cold-load time.
const KEEP_ALIVE = "30m"
// Replies are one to three short sentences, so a small cap keeps generation tight.
const NUM_PREDICT = 120

type TagResponse = {
  models?: Array<{ name?: string }>
}

type ChatChunk = {
  message?: { content?: string }
  done?: boolean
  error?: string
}

export function cleanSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function takeSentences(
  buffer: string,
  flush: boolean,
  allowEarly = false,
): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  let rest = buffer
  // For the very first chunk of a reply, break early at a clause boundary
  // (comma, semicolon, colon, or dash) so speech can start sooner instead of
  // waiting for a full sentence. Requires a trailing space so hyphenated words
  // like "well-known" are not split.
  if (allowEarly) {
    const early = rest.match(/^(.{16,}?[,;:—–-])\s/s)
    if (early) {
      const chunk = early[1].trim()
      if (chunk) sentences.push(chunk)
      rest = rest.slice(early[0].length).trimStart()
    }
  }
  while (rest.length > 180) {
    const cut = rest.lastIndexOf(" ", 180)
    const at = cut > 40 ? cut : 180
    const sentence = rest.slice(0, at).trim()
    if (sentence) sentences.push(sentence)
    rest = rest.slice(at).trimStart()
  }
  while (true) {
    const match = rest.match(/^(.*?[.!?।])(?:\s+|$)/s)
    if (!match) break
    const sentence = match[1].trim()
    if (sentence) sentences.push(sentence)
    rest = rest.slice(match[0].length)
  }
  if (flush && rest.trim()) {
    sentences.push(rest.trim())
    rest = ""
  }
  return { sentences, rest }
}

export function createChat() {
  const history: ChatMessage[] = []
  let model = DEFAULT_MODEL
  let language = "English"

  return {
    get model() {
      return model
    },
    setModel(next: string) {
      model = next
    },
    setLanguage(next: string) {
      language = next
    },
    // Preload the model into memory (no generation) so the first real turn is
    // not slowed by a cold start. Sending empty messages just loads the model.
    async warmUp(): Promise<void> {
      try {
        await fetch("/ollama/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [], keep_alive: KEEP_ALIVE }),
        })
      } catch {
        // A failed warm-up is harmless; the first turn will load the model.
      }
    },
    async listModels(): Promise<string[]> {
      const response = await fetch("/ollama/api/tags")
      if (!response.ok) {
        throw new Error("Ollama is not running. Start it, then try again.")
      }
      const body = (await response.json()) as TagResponse
      const names = (body.models ?? [])
        .map((entry) => entry.name ?? "")
        .filter((name) => name && !NOT_CHAT.test(name))
      const preferred = names.find((name) => name.toLowerCase().startsWith("llama3.2"))
      if (preferred) model = preferred
      else if (names[0]) model = names[0]
      return names.length ? names : [DEFAULT_MODEL]
    },
    async *streamSentences(
      userText: string,
      onPartial: (text: string) => void,
      signal: AbortSignal,
    ): AsyncGenerator<string> {
      history.push({ role: "user", content: userText })
      let full = ""
      let buffer = ""
      let pushed = false
      let early = true
      try {
        const response = await fetch("/ollama/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            model,
            stream: true,
            keep_alive: KEEP_ALIVE,
            messages: [{ role: "system", content: systemPrompt(language) }, ...history],
            options: { temperature: 0.6, num_predict: NUM_PREDICT },
          }),
        })
        if (!response.ok || !response.body) {
          const detail = await response.text()
          throw new Error(detail || "Ollama could not answer. Check that the model is installed.")
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ""
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const lines = pending.split("\n")
          pending = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            const chunk = JSON.parse(line) as ChatChunk
            if (chunk.error) throw new Error(chunk.error)
            const piece = chunk.message?.content ?? ""
            if (!piece) continue
            full += piece
            buffer += piece
            onPartial(cleanSpeech(full))
            const taken = takeSentences(buffer, false, early)
            buffer = taken.rest
            for (const sentence of taken.sentences) {
              const spoken = cleanSpeech(sentence)
              if (spoken) {
                yield spoken
                early = false
              }
            }
          }
        }
        for (const sentence of takeSentences(buffer, true, early).sentences) {
          const spoken = cleanSpeech(sentence)
          if (spoken) {
            yield spoken
            early = false
          }
        }
        const reply = cleanSpeech(full)
        if (reply) {
          history.push({ role: "assistant", content: reply })
          pushed = true
        }
        while (history.length > 16) history.splice(0, 2)
      } catch (error) {
        const reply = cleanSpeech(full)
        if (signal.aborted && reply) {
          history.push({ role: "assistant", content: reply })
          pushed = true
        }
        if (!pushed) history.pop()
        if (signal.aborted) return
        if (error instanceof TypeError) {
          throw new Error("Ollama is not running. Start it, then try again.")
        }
        throw error
      }
    },
  }
}
