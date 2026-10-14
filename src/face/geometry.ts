import * as THREE from "three"
import { ellipsoid } from "./layout"

const normal = new THREE.Vector3()

export function roundedRectSDF(x: number, y: number, halfWidth: number, halfHeight: number, radius: number) {
  const qx = Math.abs(x) - halfWidth + radius
  const qy = Math.abs(y) - halfHeight + radius
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

export function pointOnEllipsoid(x: number, y: number, inset = 0) {
  const { rx, ry, rz } = ellipsoid
  const nx = THREE.MathUtils.clamp(x / rx, -0.995, 0.995)
  const ny = THREE.MathUtils.clamp(y / ry, -0.995, 0.995)
  const nz = Math.sqrt(Math.max(0.0004, 1 - nx * nx - ny * ny))
  const z = nz * rz
  normal.set(x / (rx * rx), y / (ry * ry), z / (rz * rz)).normalize()
  const point = new THREE.Vector3(x, y, z).addScaledVector(normal, -inset)
  return { point, normal: normal.clone() }
}

export function createHelmetShell(centerY: number, width: number, height: number, corner: number, depth: number) {
  const geometry = new THREE.SphereGeometry(1, 128, 96)
  const position = geometry.getAttribute("position")
  const { rx, ry, rz } = ellipsoid
  const halfWidth = width / 2
  const halfHeight = height / 2
  const lip = 0.055

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) * rx
    const y = position.getY(i) * ry
    const z = position.getZ(i) * rz
    let px = x
    let py = y
    let pz = z
    if (z > 0.02) {
      const sdf = roundedRectSDF(x, y - centerY, halfWidth, halfHeight, corner)
      if (sdf < lip) {
        const inside = 1 - THREE.MathUtils.smoothstep(sdf, -0.015, lip)
        normal.set(x / (rx * rx), y / (ry * ry), Math.max(z, 0.001) / (rz * rz)).normalize()
        const carve = inside * depth
        px -= normal.x * carve
        py -= normal.y * carve
        pz -= normal.z * carve
      }
    }
    position.setXYZ(i, px, py, pz)
  }

  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export function createCurvedRoundedRect(options: {
  width: number
  height: number
  corner: number
  centerY: number
  inset: number
  segX?: number
  segY?: number
}) {
  const segX = options.segX ?? 64
  const segY = options.segY ?? 40
  const halfWidth = options.width / 2
  const halfHeight = options.height / 2
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let iy = 0; iy <= segY; iy++) {
    for (let ix = 0; ix <= segX; ix++) {
      let x = THREE.MathUtils.lerp(-halfWidth, halfWidth, ix / segX)
      let y = THREE.MathUtils.lerp(-halfHeight, halfHeight, iy / segY)
      const sdf = roundedRectSDF(x, y, halfWidth, halfHeight, options.corner)
      if (sdf > 0) {
        const epsilon = 0.0012
        const dx = roundedRectSDF(x + epsilon, y, halfWidth, halfHeight, options.corner) - roundedRectSDF(x - epsilon, y, halfWidth, halfHeight, options.corner)
        const dy = roundedRectSDF(x, y + epsilon, halfWidth, halfHeight, options.corner) - roundedRectSDF(x, y - epsilon, halfWidth, halfHeight, options.corner)
        const length = Math.hypot(dx, dy) || 1
        x -= (dx / length) * sdf
        y -= (dy / length) * sdf
      }
      const { point } = pointOnEllipsoid(x, y + options.centerY, options.inset)
      positions.push(point.x, point.y, point.z)
      uvs.push(ix / segX, iy / segY)
    }
  }

  const stride = segX + 1
  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iy * stride + ix
      const b = a + 1
      const c = a + stride
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

type OutlinePoint = { x: number; y: number }

function roundedRectOutline(halfWidth: number, halfHeight: number, radius: number, edgeSteps: number, arcSteps: number) {
  const r = Math.min(radius, halfWidth - 0.001, halfHeight - 0.001)
  const points: OutlinePoint[] = []

  const pushLine = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < edgeSteps; i++) {
      const t = i / edgeSteps
      points.push({ x: THREE.MathUtils.lerp(x0, x1, t), y: THREE.MathUtils.lerp(y0, y1, t) })
    }
  }
  const pushArc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i < arcSteps; i++) {
      const a = THREE.MathUtils.lerp(a0, a1, i / arcSteps)
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
    }
  }

  pushLine(-halfWidth + r, -halfHeight, halfWidth - r, -halfHeight)
  pushArc(halfWidth - r, -halfHeight + r, -Math.PI / 2, 0)
  pushLine(halfWidth, -halfHeight + r, halfWidth, halfHeight - r)
  pushArc(halfWidth - r, halfHeight - r, 0, Math.PI / 2)
  pushLine(halfWidth - r, halfHeight, -halfWidth + r, halfHeight)
  pushArc(-halfWidth + r, halfHeight - r, Math.PI / 2, Math.PI)
  pushLine(-halfWidth, halfHeight - r, -halfWidth, -halfHeight + r)
  pushArc(-halfWidth + r, -halfHeight + r, Math.PI, Math.PI * 1.5)
  return points
}

export function createCurvedBezel(options: {
  outerWidth: number
  outerHeight: number
  outerCorner: number
  innerWidth: number
  innerHeight: number
  innerCorner: number
  centerY: number
  inset: number
}) {
  const outer = roundedRectOutline(options.outerWidth / 2, options.outerHeight / 2, options.outerCorner, 10, 8)
  const inner = roundedRectOutline(options.innerWidth / 2, options.innerHeight / 2, options.innerCorner, 10, 8)
  const count = Math.min(outer.length, inner.length)
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i < count; i++) {
    const outerPoint = pointOnEllipsoid(outer[i].x, outer[i].y + options.centerY, options.inset)
    const innerPoint = pointOnEllipsoid(inner[i].x, inner[i].y + options.centerY, options.inset + 0.006)
    positions.push(outerPoint.point.x, outerPoint.point.y, outerPoint.point.z)
    positions.push(innerPoint.point.x, innerPoint.point.y, innerPoint.point.z)
  }

  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count
    const a = i * 2
    const b = a + 1
    const c = next * 2
    const d = c + 1
    indices.push(a, c, b, b, c, d)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export function createSurfaceGroove(y: number, halfSpan: number, inset: number, radius: number) {
  const points: THREE.Vector3[] = []
  const steps = 28
  for (let i = 0; i <= steps; i++) {
    const x = THREE.MathUtils.lerp(-halfSpan, halfSpan, i / steps)
    const arch = Math.sin((i / steps) * Math.PI) * 0.03
    points.push(pointOnEllipsoid(x, y + arch, inset).point)
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, radius, 6, false)
}
