import * as THREE from "three"
import type { ResourceBin } from "./resources"
import { createEyeTexture, createSoftGlowTexture } from "./textures"

export type RobotMaterials = ReturnType<typeof createRobotMaterials>

export type Gender = "female" | "male"

// Accent colors that change with the robot's gender. The eye lens color/emissive
// and the eye glow color are driven per-frame in eyes.ts, so they live there.
type Palette = {
  domeColor: number
  domeEmissive: number
  bezelColor: number
  bezelEmissive: number
  earGlowColor: number
  earGlowEmissive: number
}

const PALETTES: Record<Gender, Palette> = {
  male: {
    domeColor: 0x1c74e6,
    domeEmissive: 0x0a2c66,
    bezelColor: 0x12384a,
    bezelEmissive: 0x1ecfff,
    earGlowColor: 0x9af6ff,
    earGlowEmissive: 0x3ce4ff,
  },
  female: {
    domeColor: 0xe0439a,
    domeEmissive: 0x661038,
    bezelColor: 0x3a1230,
    bezelEmissive: 0xff5ec4,
    earGlowColor: 0xffb0dc,
    earGlowEmissive: 0xff4fb0,
  },
}

export function createRobotMaterials(bin: ResourceBin) {
  const eyeMaps: Record<Gender, THREE.Texture> = {
    male: bin.tex(createEyeTexture("male")),
    female: bin.tex(createEyeTexture("female")),
  }
  const eyeGlowMaps: Record<Gender, THREE.Texture> = {
    male: bin.tex(createSoftGlowTexture("male")),
    female: bin.tex(createSoftGlowTexture("female")),
  }
  const eyeMap = eyeMaps.male

  const shell = bin.mat(new THREE.MeshPhysicalMaterial({
    color: 0xf7f8fb,
    metalness: 0.08,
    roughness: 0.38,
    clearcoat: 0.45,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.55,
  }))

  const blue = bin.mat(new THREE.MeshPhysicalMaterial({
    color: 0x1c74e6,
    metalness: 0.28,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: 0x0a2c66,
    emissiveIntensity: 0.18,
    envMapIntensity: 1,
  }))

  const visor = bin.mat(new THREE.MeshPhysicalMaterial({
    color: 0x02050a,
    metalness: 0.02,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    reflectivity: 0.35,
    ior: 1.45,
    envMapIntensity: 0.16,
    side: THREE.DoubleSide,
  }))

  const bezel = bin.mat(new THREE.MeshStandardMaterial({
    color: 0x12384a,
    emissive: 0x1ecfff,
    emissiveIntensity: 0.7,
    metalness: 0.2,
    roughness: 0.32,
    side: THREE.DoubleSide,
  }))

  const seam = bin.mat(new THREE.MeshStandardMaterial({
    color: 0x9aa6b4,
    metalness: 0.35,
    roughness: 0.45,
  }))

  const dark = bin.mat(new THREE.MeshStandardMaterial({
    color: 0x1a2129,
    metalness: 0.62,
    roughness: 0.38,
  }))

  const darker = bin.mat(new THREE.MeshStandardMaterial({
    color: 0x10151b,
    metalness: 0.5,
    roughness: 0.46,
  }))

  const smile = bin.mat(new THREE.MeshStandardMaterial({
    color: 0xd7e8f2,
    emissive: 0xc5e8f4,
    emissiveIntensity: 0.9,
    metalness: 0.05,
    roughness: 0.32,
    side: THREE.DoubleSide,
  }))

  const earGlow = bin.mat(new THREE.MeshStandardMaterial({
    color: 0x9af6ff,
    emissive: 0x3ce4ff,
    emissiveIntensity: 2.1,
    metalness: 0.08,
    roughness: 0.22,
  }))

  const eye = bin.mat(new THREE.MeshStandardMaterial({
    map: eyeMap,
    emissiveMap: eyeMap,
    emissive: 0x3adfff,
    emissiveIntensity: 1.7,
    roughness: 0.42,
    metalness: 0,
    color: 0xffffff,
  }))

  const eyeGlow = bin.mat(new THREE.MeshBasicMaterial({
    map: eyeGlowMaps.male,
    color: new THREE.Color().setRGB(0.35, 0.9, 1.15, THREE.LinearSRGBColorSpace),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))

  const scan = bin.mat(new THREE.MeshBasicMaterial({
    color: 0xe9fbff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))

  return { shell, blue, visor, bezel, seam, dark, darker, smile, earGlow, eye, eyeGlow, scan, eyeMap, eyeMaps, eyeGlowMaps }
}

// Repaints the gender-colored accents on existing materials without recreating them.
export function applyPalette(materials: RobotMaterials, gender: Gender) {
  const palette = PALETTES[gender]
  materials.blue.color.setHex(palette.domeColor)
  materials.blue.emissive.setHex(palette.domeEmissive)
  materials.bezel.color.setHex(palette.bezelColor)
  materials.bezel.emissive.setHex(palette.bezelEmissive)
  materials.earGlow.color.setHex(palette.earGlowColor)
  materials.earGlow.emissive.setHex(palette.earGlowEmissive)

  const eyeMap = materials.eyeMaps[gender]
  materials.eye.map = eyeMap
  materials.eye.emissiveMap = eyeMap
  materials.eye.needsUpdate = true
  materials.eyeGlow.map = materials.eyeGlowMaps[gender]
  materials.eyeGlow.needsUpdate = true
}
