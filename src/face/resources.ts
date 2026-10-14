import type * as THREE from "three"

export class ResourceBin {
  private geometries = new Set<THREE.BufferGeometry>()
  private materials = new Set<THREE.Material>()
  private textures = new Set<THREE.Texture>()

  geo<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry)
    return geometry
  }

  mat<T extends THREE.Material>(material: T): T {
    this.materials.add(material)
    return material
  }

  tex<T extends THREE.Texture>(texture: T): T {
    this.textures.add(texture)
    return texture
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    for (const texture of this.textures) texture.dispose()
    this.geometries.clear()
    this.materials.clear()
    this.textures.clear()
  }
}
