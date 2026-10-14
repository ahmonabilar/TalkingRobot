import * as THREE from "three"
import { BLOOM_LAYER, eyes as eyeLayout } from "./layout"
import { pointOnEllipsoid } from "./geometry"
import type { RobotMaterials } from "./materials"
import type { ResourceBin } from "./resources"

const FACING = new THREE.Vector3(0, 0, 1)
const idleTint = new THREE.Color(0xffffff)
const errorTint = new THREE.Color(0xff5a32)
const idleEmissive = new THREE.Color(0x8af4ff)
const errorEmissive = new THREE.Color(0xff4a28)
const idleGlow = new THREE.Color().setRGB(0.2, 0.85, 1.2, THREE.LinearSRGBColorSpace)
const errorGlow = new THREE.Color().setRGB(1.3, 0.28, 0.08, THREE.LinearSRGBColorSpace)

export type EyePose = {
  openness: number
  brightness: number
  error: number
  happy: number
  thinking: number
  lookX: number
  lookY: number
  elapsed: number
}

export class RobotEyes {
  readonly group = new THREE.Group()
  private readonly pivots: THREE.Group[] = []
  private readonly bases: THREE.Vector3[] = []
  private readonly quaternions: THREE.Quaternion[] = []

  constructor(bin: ResourceBin, materials: RobotMaterials) {
    for (const side of [-1, 1]) {
      const eye = new THREE.Group()
      const placed = pointOnEllipsoid(side * eyeLayout.x, eyeLayout.y, 0)
      eye.position.copy(placed.point).addScaledVector(placed.normal, eyeLayout.lift)
      eye.quaternion.setFromUnitVectors(FACING, placed.normal)
      this.bases.push(eye.position.clone())
      this.quaternions.push(eye.quaternion.clone())

      const pivot = new THREE.Group()
      const radius = eyeLayout.radius
      const glow = new THREE.Mesh(bin.geo(new THREE.CircleGeometry(radius * 1.65, 40)), materials.eyeGlow)
      glow.position.z = -0.003
      const lens = new THREE.Mesh(bin.geo(new THREE.CircleGeometry(radius, 48)), materials.eye)
      lens.position.z = 0.001
      lens.layers.enable(BLOOM_LAYER)
      const scan = new THREE.Mesh(bin.geo(new THREE.PlaneGeometry(radius * 1.7, 0.014)), materials.scan)
      scan.position.z = 0.004
      scan.name = "scan"
      pivot.add(glow, lens, scan)
      eye.add(pivot)
      this.pivots.push(pivot)
      this.group.add(eye)
    }
  }

  update(pose: EyePose) {
    const squint = 1 - pose.happy * 0.2
    const scaleY = Math.max(0.045, pose.openness * squint)
    const pulse = 1 + Math.sin(pose.elapsed * (pose.thinking > 0.2 ? 7.5 : 2.1)) * (0.04 + pose.thinking * 0.08)
    const brightness = pose.brightness * pulse * (0.15 + pose.openness * 0.85)

    this.materialsColor(pose.error, brightness)

    for (const [index, pivot] of this.pivots.entries()) {
      const eye = pivot.parent!
      eye.position.copy(this.bases[index])
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternions[index])
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternions[index])
      eye.position.addScaledVector(right, pose.lookX * 0.016)
      eye.position.addScaledVector(up, pose.lookY * 0.01)
      pivot.scale.set(1 + pose.happy * 0.03, scaleY, 1)
      const scan = pivot.getObjectByName("scan")
      if (scan) {
        scan.visible = pose.thinking > 0.08 && pose.openness > 0.4
        scan.position.y = Math.sin(pose.elapsed * 2.6 + index) * eyeLayout.radius * 0.72
      }
    }
  }

  private materialsColor(error: number, brightness: number) {
    const pivot = this.pivots[0]
    const glow = pivot.children[0] as THREE.Mesh
    const lens = pivot.children[1] as THREE.Mesh
    const lensMaterial = lens.material as THREE.MeshStandardMaterial
    const glowMaterial = glow.material as THREE.MeshBasicMaterial
    const scanMaterial = (pivot.children[2] as THREE.Mesh).material as THREE.MeshBasicMaterial

    lensMaterial.color.copy(idleTint).lerp(errorTint, error)
    lensMaterial.emissive.copy(idleEmissive).lerp(errorEmissive, error)
    lensMaterial.emissiveIntensity = 1.15 + brightness * 0.95
    glowMaterial.color.copy(idleGlow).lerp(errorGlow, error)
    glowMaterial.opacity = 0.22 + brightness * 0.2
    scanMaterial.opacity = 0.35 + brightness * 0.25
  }
}
