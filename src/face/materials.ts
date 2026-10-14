import * as THREE from "three"
import type { ResourceBin } from "./resources"
import { createEyeTexture, createSoftGlowTexture } from "./textures"

export type RobotMaterials = ReturnType<typeof createRobotMaterials>

export function createRobotMaterials(bin: ResourceBin) {
  const eyeMap = bin.tex(createEyeTexture())

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
    map: bin.tex(createSoftGlowTexture()),
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

  return { shell, blue, visor, bezel, seam, dark, darker, smile, earGlow, eye, eyeGlow, scan, eyeMap }
}
