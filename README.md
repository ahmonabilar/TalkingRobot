# Talking Robot

A local robot face that listens, answers, and talks. Speech recognition, turn detection, and the voice all run in the browser. Answers come from Ollama on this computer.

## Run

Ollama needs to be running, with a chat model such as `Llama3.2`.

```bash
npm install
npm run dev
```

Open the page Vite prints. The first visit downloads Whisper and Kokoro into the browser cache, so that visit needs a network. After that, listening, speaking, and answering work offline.

Voices come in English, Spanish, French, Italian, Brazilian Portuguese, Hindi, and Polish. Kokoro has no Polish voices, so the Polish ones reuse two Spanish voices and may sound slightly accented. Picking a voice also sets the language the robot listens for and answers in. The first time you pick a non-English voice, the browser downloads a multilingual Whisper model, the voice file, and a full eSpeak build, so that also needs a network.

Click **Pause voice** to stop the microphone. It stays off until you press **Resume voice**. You can still type a question while voice input is paused.
