import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { BLOOM_LAYER, bezel, ellipsoid, glass, recess } from "./layout"
import { createCurvedBezel, createCurvedRoundedRect, createHelmetShell, createSurfaceGroove, pointOnEllipsoid } from "./geometry"
import type { RobotMaterials } from "./materials"
import type { ResourceBin } from "./resources"

const OUTWARD = new THREE.Vector3(1, 0, 0)

export class RobotHead {
  readonly group = new THREE.Group()
  readonly bust = new THREE.Group()
  readonly antennas: THREE.Group[] = []
  readonly earGlow: THREE.MeshStandardMaterial
  readonly bezelMaterial: THREE.MeshStandardMaterial

  constructor(bin: ResourceBin, materials: RobotMaterials) {
    this.earGlow = materials.earGlow
    this.bezelMaterial = materials.bezel

    const shell = new THREE.Mesh(
      bin.geo(createHelmetShell(recess.centerY, recess.width, recess.height, recess.corner, recess.depth)),
      materials.shell,
    )
    this.group.add(shell)

    const visor = new THREE.Mesh(
      bin.geo(createCurvedRoundedRect({
        width: glass.width,
        height: glass.height,
        corner: glass.corner,
        centerY: glass.centerY,
        inset: glass.inset,
      })),
      materials.visor,
    )
    this.group.add(visor)

    const rim = new THREE.Mesh(
      bin.geo(createCurvedBezel({
        outerWidth: recess.width,
        outerHeight: recess.height,
        outerCorner: recess.corner,
        innerWidth: glass.width,
        innerHeight: glass.height,
        innerCorner: glass.corner,
        centerY: glass.centerY,
        inset: bezel.inset,
      })),
      materials.bezel,
    )
    this.group.add(rim)

    const browY = glass.centerY + glass.height / 2 + 0.045
    const chinY = glass.centerY - glass.height / 2 - 0.04
    const brow = new THREE.Mesh(bin.geo(createSurfaceGroove(browY, 0.72, -0.004, 0.006)), materials.seam)
    const chin = new THREE.Mesh(bin.geo(createSurfaceGroove(chinY, 0.62, -0.004, 0.0055)), materials.seam)
    this.group.add(brow, chin)

    const slot = new THREE.Mesh(bin.geo(new RoundedBoxGeometry(0.26, 0.018, 0.045, 2, 0.006)), materials.darker)
    const crown = pointOnEllipsoid(0, ellipsoid.ry * 0.9, -0.01)
    slot.position.copy(crown.point)
    slot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), crown.normal)
    this.group.add(slot)

    this.group.add(this.makeEar(-1, bin, materials), this.makeEar(1, bin, materials))
    this.antennas.push(this.makeAntenna(-0.3, bin, materials), this.makeAntenna(0.3, bin, materials))
    this.group.add(...this.antennas)

    this.bust.add(this.group)
    this.bust.add(this.createNeck(bin, materials))
  }

  private makeEar(side: -1 | 1, bin: ResourceBin, materials: RobotMaterials) {
    const ear = new THREE.Group()
    const y = 0.03
    const z = 0.1
    const xAbs = ellipsoid.rx * Math.sqrt(Math.max(0.08, 1 - (y / ellipsoid.ry) ** 2 - (z / ellipsoid.rz) ** 2))
    const anchor = pointOnEllipsoid(side * xAbs, y, 0.01)
    const outward = anchor.normal.clone()
    if (outward.x * side < 0) outward.negate()
    const aim = outward.clone().add(new THREE.Vector3(0, 0.04, 0.95)).normalize()
    ear.position.copy(anchor.point).addScaledVector(outward, -0.03)
    ear.quaternion.setFromUnitVectors(OUTWARD, aim)

    const housing = new THREE.Mesh(bin.geo(new THREE.TorusGeometry(0.236, 0.052, 20, 48)), materials.shell)
    housing.rotation.y = Math.PI / 2
    housing.position.x = 0.02

    const dome = new THREE.Mesh(bin.geo(new THREE.SphereGeometry(0.22, 40, 28)), materials.blue)
    dome.scale.set(0.36, 1, 1)
    dome.position.x = 0.07

    const ring = new THREE.Mesh(bin.geo(new THREE.TorusGeometry(0.214, 0.018, 14, 56)), materials.earGlow)
    ring.rotation.y = Math.PI / 2
    ring.position.x = 0.1
    ring.layers.enable(BLOOM_LAYER)

    const gasket = new THREE.Mesh(bin.geo(new THREE.TorusGeometry(0.3, 0.012, 10, 36)), materials.dark)
    gasket.rotation.y = Math.PI / 2
    gasket.position.x = -0.01

    ear.add(gasket, housing, dome, ring)
    return ear
  }

  private makeAntenna(x: number, bin: ResourceBin, materials: RobotMaterials) {
    const antenna = new THREE.Group()
    const rod = new THREE.Mesh(bin.geo(new THREE.CylinderGeometry(0.011, 0.015, 0.36, 12)), materials.dark)
    rod.position.y = 0.18
    const tip = new THREE.Mesh(bin.geo(new THREE.SphereGeometry(0.018, 12, 8)), materials.dark)
    tip.position.y = 0.37
    const base = new THREE.Mesh(bin.geo(new THREE.SphereGeometry(0.028, 12, 8)), materials.darker)
    antenna.add(base, rod, tip)
    antenna.position.set(x, 1.0, 0.16)
    antenna.rotation.set(-0.08, 0, x > 0 ? -0.16 : 0.16)
    return antenna
  }

  private createNeck(bin: ResourceBin, materials: RobotMaterials) {
    const neck = new THREE.Group()
    const socket = new THREE.Mesh(bin.geo(new THREE.CylinderGeometry(0.34, 0.4, 0.16, 36)), materials.dark)
    socket.position.y = -1.05
    const ringA = new THREE.Mesh(bin.geo(new THREE.CylinderGeometry(0.29, 0.31, 0.07, 32)), materials.dark)
    ringA.position.y = -1.18
    const gap = new THREE.Mesh(bin.geo(new THREE.CylinderGeometry(0.24, 0.24, 0.045, 28)), materials.darker)
    gap.position.y = -1.24
    const ringB = new THREE.Mesh(bin.geo(new THREE.CylinderGeometry(0.32, 0.36, 0.09, 32)), materials.dark)
    ringB.position.y = -1.33
    neck.add(socket, ringA, gap, ringB)
    return neck
  }
}
