import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { mouth as mouthLayout } from "./layout"
import { pointOnEllipsoid } from "./geometry"
import type { RobotMaterials } from "./materials"
import type { ResourceBin } from "./resources"

const FACING = new THREE.Vector3(0, 0, 1)
const SEGMENTS = 44
const REST_HALF_WIDTH = 0.145

const VOWELS = [
  { halfW: 0.158, upper: 0.015, lower: 0.024, power: 0.82 },
  { halfW: 0.126, upper: 0.046, lower: 0.09, power: 0.86 },
  { halfW: 0.058, upper: 0.05, lower: 0.054, power: 1 },
] as const

type Point = { x: number; y: number }

export type MouthPose = {
  amplitude: number
  happy: number
  error: number
  sleeping: number
  speaking: number
}

export class RobotMouth {
  readonly group = new THREE.Group()
  private readonly smile: THREE.Mesh
  private readonly lips: THREE.Mesh
  private readonly cavity: THREE.Mesh
  private readonly teeth: THREE.Mesh
  private readonly smileMaterial: THREE.MeshStandardMaterial
  private readonly lipMaterial: THREE.MeshStandardMaterial
  private readonly cavityMaterial: THREE.MeshStandardMaterial
  private readonly lipPositions: THREE.BufferAttribute
  private readonly lipNormals: THREE.BufferAttribute
  private readonly cavityPositions: THREE.BufferAttribute
  private talk = 0
  private vowel = 1
  private syllableOpen = false

  constructor(bin: ResourceBin, materials: RobotMaterials) {
    this.smileMaterial = materials.smile
    this.smileMaterial.transparent = true
    this.lipMaterial = bin.mat(materials.smile.clone())
    this.lipMaterial.transparent = true
    this.cavityMaterial = bin.mat(new THREE.MeshStandardMaterial({
      color: 0x07090d,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
    }))

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-mouthLayout.halfWidth, 0.03, -0.008),
      new THREE.Vector3(0, -mouthLayout.depth, 0.012),
      new THREE.Vector3(mouthLayout.halfWidth, 0.03, -0.008),
    )
    this.smile = new THREE.Mesh(bin.geo(new THREE.TubeGeometry(curve, 28, 0.011, 8, false)), this.smileMaterial)

    const lipGeometry = bin.geo(createStripGeometry(SEGMENTS))
    const cavityGeometry = bin.geo(createFanGeometry(SEGMENTS))
    this.lipPositions = lipGeometry.getAttribute("position") as THREE.BufferAttribute
    this.lipNormals = lipGeometry.getAttribute("normal") as THREE.BufferAttribute
    this.cavityPositions = cavityGeometry.getAttribute("position") as THREE.BufferAttribute
    this.lips = new THREE.Mesh(lipGeometry, this.lipMaterial)
    this.cavity = new THREE.Mesh(cavityGeometry, this.cavityMaterial)
    this.teeth = new THREE.Mesh(
      bin.geo(new RoundedBoxGeometry(0.092, 0.015, 0.01, 2, 0.004)),
      bin.mat(new THREE.MeshStandardMaterial({
        color: 0xf3f6f8,
        roughness: 0.42,
        metalness: 0.02,
        emissive: 0xd7e4ea,
        emissiveIntensity: 0.2,
      })),
    )
    this.lips.frustumCulled = false
    this.cavity.frustumCulled = false
    this.teeth.frustumCulled = false
    this.cavity.renderOrder = 2
    this.teeth.renderOrder = 3
    this.lips.renderOrder = 4
    this.smile.renderOrder = 5
    this.lips.visible = false
    this.cavity.visible = false
    this.teeth.visible = false
    this.group.add(this.cavity, this.teeth, this.lips, this.smile)

    const placed = pointOnEllipsoid(0, mouthLayout.y, 0)
    this.group.position.copy(placed.point).addScaledVector(placed.normal, mouthLayout.lift)
    this.group.quaternion.setFromUnitVectors(FACING, placed.normal)
  }

  update(pose: MouthPose, dt: number) {
    const talking = pose.speaking * (1 - THREE.MathUtils.smoothstep(pose.sleeping, 0.4, 0.75))
    const talkSpeed = talking < this.talk ? 34 : 14
    this.talk = THREE.MathUtils.damp(this.talk, talking, talkSpeed, dt)

    const level = pose.sleeping > 0.65 ? 0 : pose.amplitude
    const jaw = Math.pow(THREE.MathUtils.smoothstep(level, 0.04, 0.52), 0.85)
    this.advanceSyllable(jaw)

    const shape = VOWELS[this.vowel]
    const halfW = THREE.MathUtils.lerp(REST_HALF_WIDTH, shape.halfW, jaw)
    const upper = THREE.MathUtils.lerp(0.0024, shape.upper, jaw)
    const lower = THREE.MathUtils.lerp(0.0024, shape.lower, jaw)
    const power = THREE.MathUtils.lerp(1, shape.power, jaw)
    this.writeMouth(halfW, upper, lower, power)

    const smileMix = 1 - THREE.MathUtils.smoothstep(jaw, 0.06, 0.24)
    const talkMix = THREE.MathUtils.smoothstep(jaw, 0.045, 0.2)
    const restDim = 1 - pose.sleeping * 0.7
    const smileCurve = (1 + pose.happy * 0.45) * (1 - pose.error * 1.65)
    this.smile.scale.set(1 + pose.happy * 0.08, smileCurve, 1)
    this.smileMaterial.opacity = smileMix * restDim
    this.smile.visible = this.smileMaterial.opacity > 0.04

    const hole = upper + lower
    const cavityMix = talkMix * THREE.MathUtils.smoothstep(hole, 0.014, 0.032)
    this.lipMaterial.opacity = talkMix * restDim
    this.cavityMaterial.opacity = cavityMix
    this.lips.visible = talkMix > 0.04
    this.cavity.visible = cavityMix > 0.04

    const showTeeth = cavityMix > 0.45 && this.vowel === 1 && lower > 0.04
    this.teeth.visible = showTeeth
    this.teeth.position.set(0, upper - 0.022, 0.008)
    this.teeth.scale.x = THREE.MathUtils.clamp(halfW / 0.11, 0.55, 1.2)

    const glow = (0.45 + jaw * 0.45 + pose.happy * 0.15 * smileMix) * restDim
    this.smileMaterial.emissiveIntensity = glow
    this.lipMaterial.emissiveIntensity = glow
  }

  private advanceSyllable(jaw: number) {
    if (this.talk < 0.45) {
      this.syllableOpen = false
      return
    }
    if (jaw > 0.34) this.syllableOpen = true
    if (!this.syllableOpen || jaw > 0.12) return
    let next = Math.floor(Math.random() * VOWELS.length)
    if (next === this.vowel) next = (next + 1) % VOWELS.length
    this.vowel = next
    this.syllableOpen = false
  }

  private writeMouth(halfW: number, upper: number, lower: number, power: number) {
    const centerline: Point[] = []
    for (let i = 0; i < SEGMENTS; i++) centerline.push(openingPoint(i / SEGMENTS, halfW, upper, lower, power))
    const normals = loopNormals(centerline)

    let cx = 0
    let cy = 0
    for (const point of centerline) {
      cx += point.x
      cy += point.y
    }
    cx /= SEGMENTS
    cy /= SEGMENTS
    this.cavityPositions.setXYZ(0, cx, cy - 0.01, surfaceZ(cx) - 0.003)

    for (let i = 0; i < SEGMENTS; i++) {
      const point = centerline[i]
      const normal = normals[i]
      const thickness = lipThickness(normal.y, normal.x)
      const outerX = point.x + normal.x * thickness
      const outerY = point.y + normal.y * thickness
      const crestX = point.x + normal.x * thickness * 0.5
      const crestY = point.y + normal.y * thickness * 0.5
      const innerX = point.x + normal.x * 0.0025
      const innerY = point.y + normal.y * 0.0025
      const base = i * 3
      this.lipPositions.setXYZ(base, outerX, outerY - 0.01, surfaceZ(outerX))
      this.lipPositions.setXYZ(base + 1, crestX, crestY - 0.01, surfaceZ(crestX) + 0.007)
      this.lipPositions.setXYZ(base + 2, point.x, point.y - 0.01, surfaceZ(point.x) + 0.001)
      setUnitNormal(this.lipNormals, base, normal.x * 0.45, normal.y * 0.45, 0.78)
      setUnitNormal(this.lipNormals, base + 1, normal.x * 0.2, normal.y * 0.2, 0.96)
      setUnitNormal(this.lipNormals, base + 2, -normal.x * 0.15, -normal.y * 0.15, 0.9)
      this.cavityPositions.setXYZ(i + 1, innerX, innerY - 0.01, surfaceZ(innerX) - 0.004)
    }

    this.lipPositions.needsUpdate = true
    this.lipNormals.needsUpdate = true
    this.cavityPositions.needsUpdate = true
  }
}

function openingPoint(t: number, halfW: number, upper: number, lower: number, power: number): Point {
  const angle = t * Math.PI * 2
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: Math.sign(cosine) * Math.pow(Math.abs(cosine), power) * halfW,
    y: Math.sign(sine) * Math.pow(Math.abs(sine), power) * (sine >= 0 ? upper : lower),
  }
}

function loopNormals(points: Point[]) {
  const normals: Point[] = []
  const count = points.length
  for (let i = 0; i < count; i++) {
    const prev = points[(i + count - 1) % count]
    const next = points[(i + 1) % count]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    let nx = ty
    let ny = -tx
    const length = Math.hypot(nx, ny) || 1
    nx /= length
    ny /= length
    const point = points[i]
    if (nx * point.x + ny * point.y < 0) {
      nx = -nx
      ny = -ny
    }
    normals.push({ x: nx, y: ny })
  }
  return normals
}

function setUnitNormal(attribute: THREE.BufferAttribute, index: number, x: number, y: number, z: number) {
  const length = Math.hypot(x, y, z) || 1
  attribute.setXYZ(index, x / length, y / length, z / length)
}

function lipThickness(normalY: number, normalX: number) {
  const lower = THREE.MathUtils.clamp(-normalY, 0, 1)
  const body = THREE.MathUtils.lerp(0.015, 0.023, lower)
  return body * THREE.MathUtils.lerp(1, 0.42, normalX * normalX)
}

function surfaceZ(x: number) {
  return 0.012 - x * x * 0.48
}

function createStripGeometry(segments: number) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(segments * 3 * 3)
  const normals = new Float32Array(segments * 3 * 3)
  for (let i = 0; i < segments * 3; i++) normals[i * 3 + 2] = 1
  const indices = new Uint16Array(segments * 12)
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments
    for (let span = 0; span < 2; span++) {
      const a = i * 3 + span
      const b = a + 1
      const c = next * 3 + span
      const d = c + 1
      const offset = (i * 2 + span) * 6
      indices[offset] = a
      indices[offset + 1] = c
      indices[offset + 2] = b
      indices[offset + 3] = b
      indices[offset + 4] = c
      indices[offset + 5] = d
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}

function createFanGeometry(segments: number) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array((segments + 1) * 3)
  const normals = new Float32Array((segments + 1) * 3)
  for (let i = 0; i <= segments; i++) normals[i * 3 + 2] = 1
  const indices = new Uint16Array(segments * 3)
  for (let i = 0; i < segments; i++) {
    indices[i * 3] = 0
    indices[i * 3 + 1] = i + 1
    indices[i * 3 + 2] = (i + 1) % segments + 1
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}
