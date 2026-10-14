import * as THREE from "three"

export function createEyeTexture() {
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
      const red = Math.round(90 + falloff * 140)
      const green = Math.round(210 + falloff * 40)
      ctx.fillStyle = `rgba(${red}, ${green}, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, 1.55 + falloff * 1.35, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const core = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size * 0.42)
  core.addColorStop(0, "rgba(210, 248, 255, 0.28)")
  core.addColorStop(0.35, "rgba(70, 210, 255, 0.12)")
  core.addColorStop(1, "rgba(0, 120, 255, 0)")
  ctx.fillStyle = core
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export function createSoftGlowTexture() {
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48)
  gradient.addColorStop(0, "rgba(190, 245, 255, 0.9)")
  gradient.addColorStop(0.28, "rgba(70, 210, 255, 0.35)")
  gradient.addColorStop(0.62, "rgba(20, 120, 255, 0.08)")
  gradient.addColorStop(1, "rgba(0, 40, 80, 0)")
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
