export type FaceState = "idle" | "listening" | "thinking" | "speaking" | "happy" | "sleeping" | "error"

export type FaceExpression = "neutral" | "happy" | "sleeping" | "error"

export type Gender = "female" | "male"

export type FaceController = {
  setState: (state: FaceState) => void
  setGender: (gender: Gender) => void
  setExpression: (expression: FaceExpression) => void
  setSpeaking: (isSpeaking: boolean) => void
  setSpeechAmplitude: (value: number) => void
  /** @deprecated Prefer setSpeechAmplitude. Kept for the existing TTS analyser. */
  setMouth: (level: number) => void
  destroy: () => void
}
