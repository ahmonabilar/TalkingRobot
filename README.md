# Talking Robot

A local robot face that listens, answers, and talks. Speech recognition, turn detection, and the voice all run in the browser. Answers come from Ollama on this computer.

## Run

Ollama needs to be running, with a chat model such as `Llama3.2`.

```bash
npm install
npm run dev
```

Open the page Vite prints. The first visit downloads Whisper and Kokoro into the browser cache, so that visit needs a network. After that, listening, speaking, and answering work offline.

Click **Pause voice** to stop the microphone. It stays off until you press **Resume voice**. You can still type a question while voice input is paused.
