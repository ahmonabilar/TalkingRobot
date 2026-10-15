import * as THREE from "three"

export type Gender = "female" | "male"

// Eye/glow gradients are cyan for the male robot and pink for the female robot.
type EyePalette = {
  // Per-pixel dot color: base RGB plus the amount added toward the center (falloff).
  dotBase: [number, number, number]
  dotFalloff: [number, number, number]
  coreStops: [string, string, string]
  glowStops: [string, string, string, string]
}

const EYE_PALETTES: Record<Gender, EyePalette> = {
  male: {
    dotBase: [90, 210, 255],
    dotFalloff: [140, 40, 0],
    coreStops: ["rgba(210, 248, 255, 0.28)", "rgba(70, 210, 255, 0.12)", "rgba(0, 120, 255, 0)"],
    glowStops: [
      "rgba(190, 245, 255, 0.9)",
      "rgba(70, 210, 255, 0.35)",
      "rgba(20, 120, 255, 0.08)",
      "rgba(0, 40, 80, 0)",
    ],
  },
  female: {
    dotBase: [255, 150, 210],
    dotFalloff: [0, 60, 20],
    coreStops: ["rgba(255, 220, 245, 0.28)", "rgba(255, 110, 200, 0.12)", "rgba(255, 0, 140, 0)"],
    glowStops: [
      "rgba(255, 215, 240, 0.9)",
      "rgba(255, 110, 200, 0.35)",
      "rgba(255, 40, 150, 0.08)",
      "rgba(80, 0, 40, 0)",
    ],
  },
}

export function createEyeTexture(gender: Gender = "male") {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return new THREE.CanvasTexture(canvas)

  ctx.clearRect(0, 0, size, size)
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = "#031018"
  ctx.fillRect(0, 0, size, size)

  const palette = EYE_PALETTES[gender]
  const spacing = 9
  const margin = 18
  for (let y = margin; y <= size - margin; y += spacing) {
    for (let x = margin; x <= size - margin; x += spacing) {
      const dx = x - size / 2
      const dy = y - size / 2
      const distance = Math.hypot(dx, dy)
      if (distance > size * 0.45) continue
      const falloff = 1 - distance / (size * 0.5)
      const flicker = 0.88 + ((x * 13 + y * 7) % 11) / 55
      const alpha = (0.72 + falloff * 0.28) * flicker
      const red = Math.round(palette.dotBase[0] + falloff * palette.dotFalloff[0])
      const green = Math.round(palette.dotBase[1] + falloff * palette.dotFalloff[1])
      const blue = Math.round(palette.dotBase[2] + falloff * palette.dotFalloff[2])
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, 1.55 + falloff * 1.35, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const core = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size * 0.42)
  core.addColorStop(0, palette.coreStops[0])
  core.addColorStop(0.35, palette.coreStops[1])
  core.addColorStop(1, palette.coreStops[2])
  ctx.fillStyle = core
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export function createSoftGlowTexture(gender: Gender = "male") {
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const stops = EYE_PALETTES[gender].glowStops
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48)
  gradient.addColorStop(0, stops[0])
  gradient.addColorStop(0.28, stops[1])
  gradient.addColorStop(0.62, stops[2])
  gradient.addColorStop(1, stops[3])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createBackdropTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext("2d")
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const gradient = ctx.createRadialGradient(256, 210, 30, 256, 250, 390)
  gradient.addColorStop(0, "#1a2836")
  gradient.addColorStop(0.45, "#141c26")
  gradient.addColorStop(1, "#121820")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
