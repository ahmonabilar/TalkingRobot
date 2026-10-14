import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { RobotFaceController } from "./controller"
import { RobotEyes } from "./eyes"
import { RobotHead } from "./head"
import { BLOOM_LAYER } from "./layout"
import { createRobotMaterials } from "./materials"
import { RobotMouth } from "./mouth"
import { ResourceBin } from "./resources"
import { createBackdropTexture } from "./textures"
import type { FaceController, FaceExpression, FaceState } from "./types"

export type { FaceController, FaceExpression, FaceState }

export function createFace(canvas: HTMLCanvasElement): FaceController {
  const bin = new ResourceBin()
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x121820, 1)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.02
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x121820)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40)
  camera.position.set(0.28, 0.12, 5.15)
  camera.lookAt(0, 0.06, 0)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = 0.62
  pmrem.dispose()
  disposeObject(room)

  scene.add(new THREE.HemisphereLight(0xf4f8fc, 0x1c2a38, 0.62))
  const key = new THREE.DirectionalLight(0xfff7f0, 1.75)
  key.position.set(-2.4, 4.4, 2.4)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xd5e0ee, 0.78)
  fill.position.set(2.8, 0.8, 2.6)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0x5adfff, 1.35)
  rim.position.set(-1.6, -0.8, -2.4)
  scene.add(rim)
  const rimRight = new THREE.DirectionalLight(0x8fd4ff, 0.55)
  rimRight.position.set(2.1, 0.1, -1.6)
  scene.add(rimRight)

  const backdrop = new THREE.Mesh(
    bin.geo(new THREE.PlaneGeometry(9, 9)),
    bin.mat(new THREE.MeshBasicMaterial({ map: bin.tex(createBackdropTexture()) })),
  )
  backdrop.position.set(0, 0.05, -1.8)
  scene.add(backdrop)

  const materials = createRobotMaterials(bin)
  const rig = new THREE.Group()
  const head = new RobotHead(bin, materials)
  const eyes = new RobotEyes(bin, materials)
  const mouth = new RobotMouth(bin, materials)
  head.group.add(eyes.group, mouth.group)
  rig.add(head.bust)
  scene.add(rig)

  const shadow = new THREE.Mesh(
    bin.geo(new THREE.CircleGeometry(1.15, 40)),
    bin.mat(new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.38 })),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -2.05
  scene.add(shadow)

  const face = new RobotFaceController(rig, head, eyes, mouth)
  const { bloomComposer, finalComposer, bloomPass, outputPass, mixMaterial, darkMaterial, renderBloom } = createBloomPipeline(renderer, scene, camera)

  let pointerX = 0
  let pointerY = 0
  const onPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1
  }
  window.addEventListener("pointermove", onPointer)

  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height, false)
    bloomComposer.setPixelRatio(renderer.getPixelRatio())
    bloomComposer.setSize(width, height)
    finalComposer.setPixelRatio(renderer.getPixelRatio())
    finalComposer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    face.update(dt, clock.elapsedTime, pointerX, pointerY)
    renderBloom()
  })

  const api: FaceController = {
    setState(state) {
      face.setState(state)
    },
    setExpression(expression) {
      face.setExpression(expression)
    },
    setSpeaking(isSpeaking) {
      face.setSpeaking(isSpeaking)
    },
    setSpeechAmplitude(value) {
      face.setSpeechAmplitude(value)
    },
    setMouth(level) {
      face.setSpeechAmplitude(level)
    },
    destroy() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      window.removeEventListener("pointermove", onPointer)
      bloomPass.dispose()
      outputPass.dispose()
      mixMaterial.dispose()
      darkMaterial.dispose()
      bloomComposer.dispose()
      finalComposer.dispose()
      environment.dispose()
      bin.dispose()
      renderer.dispose()
    },
  }
  return api
}

function createBloomPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const bloomLayer = new THREE.Layers()
  bloomLayer.set(BLOOM_LAYER)
  const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const stored = new Map<string, THREE.Material | THREE.Material[]>()
  const background = scene.background

  const bloomComposer = new EffectComposer(renderer)
  bloomComposer.renderToScreen = false
  bloomComposer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.32, 0.22)
  bloomComposer.addPass(bloomPass)

  const mixMaterial = new THREE.ShaderMaterial({
    uniforms: {
      baseTexture: { value: null },
      bloomTexture: { value: bloomComposer.readBuffer.texture },
      bloomStrength: { value: 0.45 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D baseTexture;
      uniform sampler2D bloomTexture;
      uniform float bloomStrength;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(baseTexture, vUv);
        vec4 bloom = texture2D(bloomTexture, vUv);
        gl_FragColor = vec4(base.rgb + bloom.rgb * bloomStrength, base.a);
      }
    `,
  })
  const mixPass = new ShaderPass(mixMaterial, "baseTexture")
  mixPass.needsSwap = true

  const finalComposer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
  )
  finalComposer.addPass(new RenderPass(scene, camera))
  finalComposer.addPass(mixPass)
  const outputPass = new OutputPass()
  finalComposer.addPass(outputPass)

  const darken = (object: THREE.Object3D) => {
    if (!(object instanceof THREE.Mesh) || bloomLayer.test(object.layers)) return
    stored.set(object.uuid, object.material)
    object.material = darkMaterial
  }
  const restore = (object: THREE.Object3D) => {
    if (!(object instanceof THREE.Mesh)) return
    const material = stored.get(object.uuid)
    if (!material) return
    object.material = material
    stored.delete(object.uuid)
  }

  return {
    bloomComposer,
    finalComposer,
    bloomPass,
    outputPass,
    mixMaterial,
    darkMaterial,
    renderBloom() {
      scene.background = null
      renderer.setClearColor(0x000000, 1)
      scene.traverse(darken)
      try {
        bloomComposer.render()
      } finally {
        scene.traverse(restore)
        scene.background = background
        renderer.setClearColor(0x121820, 1)
      }
      mixMaterial.uniforms.bloomTexture.value = bloomComposer.readBuffer.texture
      finalComposer.render()
    },
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) material.dispose()
  })
}
