import * as THREE from "three"
import type { RobotEyes } from "./eyes"
import type { RobotHead } from "./head"
import type { RobotMouth } from "./mouth"
import type { FaceExpression, FaceState } from "./types"

const ACTIVITY: FaceState[] = ["idle", "listening", "thinking", "speaking", "sleeping", "error"]

export class RobotFaceController {
  private state: FaceState = "idle"
  private expression: FaceExpression = "neutral"
  private speaking = false
  private amplitude = 0
  private amplitudeTarget = 0
  private blink = 0
  private blinkDirection = 0
  private nextBlink = 2.6
  private readonly weights: Record<string, number> = {
    idle: 1,
    listening: 0,
    thinking: 0,
    speaking: 0,
    sleeping: 0,
    error: 0,
    happy: 0,
  }

  constructor(
    private readonly rig: THREE.Group,
    private readonly head: RobotHead,
    private readonly eyes: RobotEyes,
    private readonly mouth: RobotMouth,
  ) {}

  setState(state: FaceState) {
    if (state === "happy") {
      this.state = "idle"
      this.expression = "happy"
      this.speaking = false
      return
    }
    this.state = state
    this.expression = "neutral"
    this.speaking = state === "speaking"
  }

  setExpression(expression: FaceExpression) {
    if (expression === "sleeping" || expression === "error") {
      this.setState(expression)
      return
    }
    if (expression === "neutral") {
      this.expression = "neutral"
      if (this.state === "sleeping" || this.state === "error") this.state = "idle"
      return
    }
    this.expression = "happy"
  }

  setSpeaking(isSpeaking: boolean) {
    this.speaking = isSpeaking
  }

  setSpeechAmplitude(value: number) {
    this.amplitudeTarget = THREE.MathUtils.clamp(value, 0, 1)
  }

  update(dt: number, elapsed: number, lookX: number, lookY: number) {
    const damp = (current: number, target: number, speed: number) => THREE.MathUtils.damp(current, target, speed, dt)
    for (const name of ACTIVITY) {
      this.weights[name] = damp(this.weights[name], this.state === name ? 1 : 0, 4.2)
    }
    this.weights.happy = damp(this.weights.happy, this.expression === "happy" ? 1 : 0, 4.2)

    const listening = this.weights.listening
    const thinking = this.weights.thinking
    const speaking = Math.max(this.weights.speaking, this.speaking ? 1 : 0)
    const sleeping = this.weights.sleeping
    const error = this.weights.error
    const happy = this.weights.happy

    this.updateBlink(dt, elapsed, sleeping)
    this.updateMouth(dt)
    this.updatePose(dt, elapsed, lookX, lookY, listening, thinking, speaking, this.amplitude)

    const openness = (1 - sleeping * 0.96) * (1 - this.blink * 0.94)
    const brightness = 0.72 + listening * 0.45 + speaking * 0.22 + happy * 0.18 + thinking * 0.08 - sleeping * 0.68
    this.eyes.update({
      openness,
      brightness: Math.max(0.04, brightness),
      error,
      happy,
      thinking,
      lookX: lookX + Math.sin(elapsed * 0.55) * 0.35 * thinking,
      lookY: lookY * 0.6 - thinking * 0.15,
      elapsed,
    })
    this.mouth.update({ amplitude: this.amplitude, happy, error, sleeping, speaking }, dt)

    this.head.earGlow.emissiveIntensity = 1.35 + listening * 1.1 + speaking * 0.45 + Math.sin(elapsed * 2.2) * 0.12
    this.head.bezelMaterial.emissiveIntensity = 0.85 + listening * 0.4 + speaking * 0.18 + Math.sin(elapsed * 1.5) * 0.06
    for (const [index, antenna] of this.head.antennas.entries()) {
      const direction = index === 0 ? 1 : -1
      antenna.rotation.z = direction * 0.16 + thinking * Math.sin(elapsed * 6 + index) * 0.07
    }
  }

  private updateBlink(dt: number, elapsed: number, sleeping: number) {
    if (sleeping > 0.55) {
      this.blink = 0
      this.blinkDirection = 0
      this.nextBlink = elapsed + 1.4
      return
    }
    if (this.blinkDirection === 0 && elapsed > this.nextBlink) this.blinkDirection = 1
    if (this.blinkDirection === 0) return
    this.blink = THREE.MathUtils.clamp(this.blink + this.blinkDirection * dt * 11, 0, 1)
    if (this.blink === 1) this.blinkDirection = -1
    if (this.blink === 0 && this.blinkDirection < 0) {
      this.blinkDirection = 0
      const doubleBlink = Math.random() < 0.18
      this.nextBlink = elapsed + (doubleBlink ? 0.18 : 3.1 + Math.random() * 3.6)
    }
  }

  private updateMouth(dt: number) {
    const target = this.speaking ? this.amplitudeTarget : 0
    const speed = target < this.amplitude ? 26 : 32
    this.amplitude = THREE.MathUtils.damp(this.amplitude, target, speed, dt)
  }

  private updatePose(
    dt: number,
    elapsed: number,
    lookX: number,
    lookY: number,
    listening: number,
    thinking: number,
    speaking: number,
    amplitude: number,
  ) {
    const damp = (current: number, target: number, speed: number) => THREE.MathUtils.damp(current, target, speed, dt)
    this.rig.position.y = Math.sin(elapsed * 1.05) * (0.018 + (1 - this.weights.sleeping) * 0.004)
    this.rig.rotation.z = Math.sin(elapsed * 0.5) * 0.01
    this.head.bust.position.z = listening * 0.05
    const nod = Math.sin(elapsed * 7.4) * 0.025 * speaking * (0.25 + amplitude)
    const glance = Math.sin(elapsed * 0.65) * 0.14 * thinking
    this.head.group.rotation.y = damp(this.head.group.rotation.y, lookX * 0.14 + glance, 3.4)
    this.head.group.rotation.x = damp(this.head.group.rotation.x, -lookY * 0.05 + nod - thinking * 0.05, 3.4)
  }
}
