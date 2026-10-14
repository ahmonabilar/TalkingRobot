/** Head ellipsoid. Width is substantially greater than depth. */
export const ellipsoid = { rx: 1.22, ry: 1.06, rz: 0.84 }

/** White shell is pushed inward so the glass sits in a recess. */
export const recess = {
  width: 1.9,
  height: 1.12,
  corner: 0.36,
  centerY: 0.05,
  depth: 0.072,
}

export const glass = {
  width: 1.82,
  height: 1.04,
  corner: 0.33,
  centerY: 0.05,
  inset: 0.034,
}

export const BLOOM_LAYER = 1

export const bezel = {
  inset: 0.01,
}

export const eyes = {
  x: 0.355,
  y: 0.16,
  radius: 0.245,
  lift: 0.016,
}

export const mouth = {
  y: -0.25,
  halfWidth: 0.16,
  depth: 0.045,
  lift: 0.018,
}
