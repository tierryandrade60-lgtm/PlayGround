import * as THREE from 'three'
import { PALETTE, WORLD } from './config.js'

const TAU = Math.PI * 2

function randRange(rng, min, max) {
  return min + (max - min) * rng()
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length]
}

function hashNoise(x, y, z) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return value - Math.floor(value)
}

export function makeRng(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function glowCanvas(size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.18, 'rgba(255,246,220,0.95)')
  gradient.addColorStop(0.42, 'rgba(255,220,160,0.45)')
  gradient.addColorStop(0.72, 'rgba(255,200,140,0.12)')
  gradient.addColorStop(1, 'rgba(255,190,130,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return canvas
}

function cloudCanvas(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  const blobs = [
    [0.5, 0.54, 0.3, 1],
    [0.32, 0.52, 0.24, 0.9],
    [0.68, 0.5, 0.25, 0.92],
    [0.43, 0.4, 0.2, 0.8],
    [0.6, 0.62, 0.2, 0.7],
    [0.5, 0.66, 0.17, 0.6],
  ]
  for (const [x, y, r, alpha] of blobs) {
    const g = ctx.createRadialGradient(size * x, size * y, 0, size * x, size * y, size * r)
    g.addColorStop(0, `rgba(255,255,255,${alpha})`)
    g.addColorStop(0.55, `rgba(255,252,244,${alpha * 0.55})`)
    g.addColorStop(1, 'rgba(255,250,240,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  return canvas
}

let cachedAssets = null

function assets() {
  if (cachedAssets) return cachedAssets

  const rock = [
    new THREE.MeshStandardMaterial({ color: PALETTE.rock[0], roughness: 0.96, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: PALETTE.rock[1], roughness: 0.96, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: PALETTE.rock[2], roughness: 0.96, flatShading: true }),
  ]
  const grass = [
    new THREE.MeshStandardMaterial({ color: PALETTE.grass[0], roughness: 0.92, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: PALETTE.grass[1], roughness: 0.92, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: PALETTE.grass[2], roughness: 0.92, flatShading: true }),
  ]
  const rim = new THREE.MeshStandardMaterial({ color: PALETTE.grassEdge, roughness: 0.95, flatShading: true })
  const trunk = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 0.95, flatShading: true })
  const foliage = PALETTE.foliage.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
  )
  const blossom = PALETTE.blossom.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissive: color, emissiveIntensity: 0.18 }),
  )
  const crystal = PALETTE.crystal.map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.28,
        metalness: 0.05,
        emissive: color,
        emissiveIntensity: 0.85,
        flatShading: true,
      }),
  )
  const darkRock = new THREE.MeshStandardMaterial({ color: PALETTE.rockDeep, roughness: 0.98, flatShading: true })

  cachedAssets = {
    rock,
    grass,
    rim,
    trunk,
    foliage,
    blossom,
    crystal,
    darkRock,
    sphere: new THREE.SphereGeometry(1, 16, 12),
    icosa: new THREE.IcosahedronGeometry(1, 0),
    dodeca: new THREE.DodecahedronGeometry(1, 0),
    octa: new THREE.OctahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 1, 7, 1),
    trunkGeo: new THREE.CylinderGeometry(0.55, 0.85, 1, 6, 1),
    glow: new THREE.CanvasTexture(glowCanvas()),
    cloud: new THREE.CanvasTexture(cloudCanvas()),
  }
  cachedAssets.glow.colorSpace = THREE.SRGBColorSpace
  cachedAssets.cloud.colorSpace = THREE.SRGBColorSpace
  return cachedAssets
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uLow;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.5, 0.68, h));
    col = mix(col, uTop, smoothstep(0.66, 0.99, h));
    col = mix(uLow, col, smoothstep(0.33, 0.505, h));

    float sun = max(dot(vDir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sun, 420.0) * 1.55;
    col += uSunColor * pow(sun, 18.0) * 0.12;
    col += uSunColor * pow(sun, 3.0) * 0.028;

    float dither = (hash2(gl_FragCoord.xy) - 0.5) / 255.0 * 2.0;
    col += dither;
    gl_FragColor = vec4(col, 1.0);
  }
`

export class SkyWorld {
  constructor(scene, { mobile = false } = {}) {
    this.scene = scene
    this.mobile = mobile
    this.a = assets()
    this.time = 0
    this.floaters = []
    this.fireflies = []
    this.bursts = []
    this.shockwaves = []
    this.clouds = []
    this.motes = []
    this.trailCursor = 0
    this.sunDir = new THREE.Vector3(0.34, 0.19, 0.92).normalize()

    this.buildSky()
    this.buildLights()
    this.buildClouds()
    this.buildMotes()
    this.buildTrail()
    this.buildMarker()
    this.buildPreview()
  }

  buildSky() {
    const uniforms = {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uMid: { value: new THREE.Color(PALETTE.skyMid) },
      uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      uLow: { value: new THREE.Color(PALETTE.skyLow) },
      uSunColor: { value: new THREE.Color(PALETTE.sun) },
      uSunDir: { value: this.sunDir.clone() },
    }
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 20), material)
    this.sky.renderOrder = -100
    this.sky.frustumCulled = false
    this.scene.add(this.sky)

    const sunMaterial = new THREE.SpriteMaterial({
      map: this.a.glow,
      color: new THREE.Color('#fff3cb'),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
    this.sunGlow = new THREE.Sprite(sunMaterial)
    this.sunGlow.scale.set(52, 52, 1)
    this.sunGlow.position.copy(this.sunDir).multiplyScalar(250)
    this.sunGlow.renderOrder = -99
    this.sky.add(this.sunGlow)
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#c6e0ff', '#ffab7a', 0.62)
    this.scene.add(this.hemi)

    const sun = new THREE.DirectionalLight('#ffe2b0', 2.0)
    sun.castShadow = true
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 120
    sun.shadow.camera.left = -24
    sun.shadow.camera.right = 24
    sun.shadow.camera.top = 24
    sun.shadow.camera.bottom = -24
    sun.shadow.bias = -0.0007
    sun.shadow.normalBias = 0.035
    sun.shadow.radius = 3
    this.sun = sun
    this.sunOffset = new THREE.Vector3(18, 32, 16)
    this.scene.add(sun)
    this.scene.add(sun.target)

    const fill = new THREE.DirectionalLight('#9fc4ff', 0.28)
    fill.position.set(-14, 10, -18)
    this.scene.add(fill)
    this.fill = fill
  }

  buildClouds() {
    const rng = makeRng(1337)
    const count = this.mobile ? 22 : 34
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.a.cloud,
        color: new THREE.Color(i % 5 === 0 ? '#ffdccb' : '#fff6e8'),
        transparent: true,
        opacity: randRange(rng, 0.14, 0.32),
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: true,
      })
      const sprite = new THREE.Sprite(material)
      const wide = randRange(rng, 24, 68)
      sprite.scale.set(wide, wide * randRange(rng, 0.3, 0.48), 1)
      const below = rng() < 0.62
      sprite.position.set(
        randRange(rng, -105, 105),
        below ? randRange(rng, -34, -10) : randRange(rng, 21, 48),
        randRange(rng, 30, 170),
      )
      sprite.userData.drift = randRange(rng, 0.12, 0.4)
      sprite.userData.baseY = sprite.position.y
      sprite.userData.sway = randRange(rng, 0, TAU)
      this.clouds.push(sprite)
      this.scene.add(sprite)
    }
  }

  buildMotes() {
    const rng = makeRng(99)
    const count = this.mobile ? 38 : 64
    const positions = new Float32Array(count * 3)
    this.moteData = []
    for (let i = 0; i < count; i += 1) {
      const p = new THREE.Vector3(randRange(rng, -26, 26), randRange(rng, -8, 20), randRange(rng, -26, 26))
      this.moteData.push({ p, offset: randRange(rng, 0, TAU), speed: randRange(rng, 0.2, 0.7) })
      positions.set([p.x, p.y, p.z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      map: this.a.glow,
      color: '#ffe6b8',
      size: 0.34,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.motes = new THREE.Points(geo, mat)
    this.motes.frustumCulled = false
    this.scene.add(this.motes)
  }

  buildTrail() {
    const count = WORLD.trailCount
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) positions.set([0, -999, 0], i * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({
      map: this.a.glow,
      size: 0.42,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.trail = new THREE.Points(geo, mat)
    this.trail.frustumCulled = false
    this.trail.renderOrder = 3
    this.scene.add(this.trail)
    this.trailParticles = Array.from({ length: count }, () => ({
      pos: new THREE.Vector3(0, -999, 0),
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
    }))
    this.trailClock = 0
  }

  buildMarker() {
    const group = new THREE.Group()
    const ringGeo = new THREE.TorusGeometry(1, 0.045, 8, 64)
    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.marker,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    this.markerRing = new THREE.Mesh(ringGeo, ringMat)
    this.markerRing.rotation.x = -Math.PI / 2
    group.add(this.markerRing)

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.a.glow,
        color: '#ffd98e',
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    )
    halo.scale.set(3.2, 3.2, 1)
    group.add(halo)
    this.markerHalo = halo

    const gem = new THREE.Mesh(
      this.a.octa,
      new THREE.MeshStandardMaterial({
        color: '#ffe6a8',
        emissive: '#ffc568',
        emissiveIntensity: 1.05,
        roughness: 0.35,
        flatShading: true,
      }),
    )
    gem.scale.setScalar(0.34)
    gem.position.y = 3.7
    group.add(gem)
    this.markerGem = gem

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.22, 4.6, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ffd88f',
        transparent: true,
        opacity: 0.045,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    )
    beam.position.y = 2.3
    group.add(beam)
    this.markerBeam = beam

    this.marker = group
    this.marker.visible = false
    this.scene.add(group)
  }

  buildPreview() {
    const count = 34
    const positions = new Float32Array(count * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setDrawRange(0, 0)
    const mat = new THREE.PointsMaterial({
      map: this.a.glow,
      color: '#ffe2a0',
      size: 0.3,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    })
    this.preview = new THREE.Points(geo, mat)
    this.preview.frustumCulled = false
    this.preview.visible = false
    this.preview.renderOrder = 4
    this.scene.add(this.preview)

    const haloMat = new THREE.PointsMaterial({
      map: this.a.glow,
      color: '#2b1a3d',
      size: 0.56,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      fog: false,
    })
    this.previewHalo = new THREE.Points(geo, haloMat)
    this.previewHalo.frustumCulled = false
    this.previewHalo.visible = false
    this.previewHalo.renderOrder = 3
    this.scene.add(this.previewHalo)

    const landMat = new THREE.MeshBasicMaterial({
      color: '#ffe2a0',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    this.previewRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 40), landMat)
    this.previewRing.rotation.x = -Math.PI / 2
    this.previewRing.visible = false
    this.previewRing.renderOrder = 4
    this.scene.add(this.previewRing)

    this.previewDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 16),
      new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 1, depthWrite: false, fog: false }),
    )
    this.previewDot.rotation.x = -Math.PI / 2
    this.previewDot.visible = false
    this.previewDot.renderOrder = 5
    this.scene.add(this.previewDot)
  }

  buildDistantIslands() {
    const rng = makeRng(4242)
    const count = this.mobile ? 7 : 11
    for (let i = 0; i < count; i += 1) {
      const group = new THREE.Group()
      const radius = randRange(rng, 4, 11)
      const depth = randRange(rng, 6, 18)
      const rock = new THREE.Mesh(
        this.a.cone,
        new THREE.MeshStandardMaterial({
          color: i % 2 ? '#a57a86' : '#8f7387',
          roughness: 1,
          flatShading: true,
        }),
      )
      rock.scale.set(radius, depth, radius)
      rock.rotation.x = Math.PI
      rock.position.y = -depth / 2
      group.add(rock)
      const cap = new THREE.Mesh(
        this.a.sphere,
        new THREE.MeshStandardMaterial({ color: '#9bcfae', roughness: 1, flatShading: true }),
      )
      cap.scale.set(radius, radius * 0.22, radius)
      group.add(cap)
      group.position.set(randRange(rng, -110, 110), randRange(rng, -14, 36), randRange(rng, 40, 230))
      group.userData.far = true
      this.farIslands = this.farIslands || []
      this.farIslands.push(group)
      this.scene.add(group)
    }
  }

  makeIsland({ radius = 3, depth = 9, seed = 1 } = {}) {
    const rng = makeRng(seed)
    const group = new THREE.Group()
    const rockMat = pick(rng, this.a.rock)
    const grassMat = pick(rng, this.a.grass)
    const variant = Math.floor(rng() * 3)

    const profile = [
      new THREE.Vector2(radius * 0.1, -depth),
      new THREE.Vector2(radius * 0.42, -depth * 0.8),
      new THREE.Vector2(radius * 0.68, -depth * 0.53),
      new THREE.Vector2(radius * 0.87, -depth * 0.27),
      new THREE.Vector2(radius * 0.97, -0.12),
      new THREE.Vector2(radius, 0),
    ]
    const rockGeo = new THREE.LatheGeometry(profile, 11)
    const rock = new THREE.Mesh(rockGeo, rockMat)
    rock.castShadow = false
    rock.receiveShadow = true
    rock.scale.set(1, 1, randRange(rng, 0.88, 1.06))
    rock.rotation.y = rng() * TAU
    group.add(rock)

    const underCount = 2 + Math.floor(rng() * 2)
    for (let i = 0; i < underCount; i += 1) {
      const chunk = new THREE.Mesh(this.a.dodeca, rockMat)
      const angle = rng() * TAU
      const dist = radius * randRange(rng, 0.2, 0.52)
      chunk.position.set(
        Math.cos(angle) * dist,
        -depth * randRange(rng, 0.22, 0.62),
        Math.sin(angle) * dist,
      )
      chunk.scale.setScalar(randRange(rng, 0.25, 0.62))
      chunk.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU)
      group.add(chunk)
    }

    const capGeo = new THREE.CylinderGeometry(radius, radius * 0.93, 0.65, 20, 1)
    capGeo.translate(0, -0.33, 0)
    const cap = new THREE.Mesh(capGeo, grassMat)
    cap.castShadow = false
    cap.receiveShadow = true
    group.add(cap)

    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, 0.06, 5, 28), this.a.rim)
    rim.rotation.x = -Math.PI / 2
    rim.position.y = 0.01
    group.add(rim)

    const decorations = []
    const addDecor = (mesh, x, z, scale, rot = 0) => {
      mesh.position.set(x, 0, z)
      mesh.scale.multiplyScalar(scale)
      mesh.rotation.y = rot
      mesh.castShadow = true
      mesh.receiveShadow = true
      group.add(mesh)
      decorations.push(mesh)
    }

    const backAngle = () => {
      let angle = rng() * TAU
      let guard = 0
      while (Math.sin(angle) < -0.08 && guard < 12) {
        angle = rng() * TAU
        guard += 1
      }
      return angle
    }
    const decorCount = 2 + Math.floor(rng() * 3)
    for (let i = 0; i < decorCount; i += 1) {
      const angle = backAngle()
      const dist = radius * randRange(rng, 0.58, 0.82)
      const x = Math.cos(angle) * dist
      const z = Math.sin(angle) * dist
      const kind = rng()
      if (kind < 0.58) {
        const tree = new THREE.Group()
        const trunk = new THREE.Mesh(this.a.trunkGeo, this.a.trunk)
        trunk.scale.set(0.11, 0.9, 0.11)
        trunk.position.y = 0.45
        trunk.castShadow = true
        tree.add(trunk)
        const leafCount = 2 + Math.floor(rng() * 2)
        for (let l = 0; l < leafCount; l += 1) {
          const leaf = new THREE.Mesh(this.a.icosa, pick(rng, this.a.foliage))
          leaf.scale.setScalar(randRange(rng, 0.34, 0.52))
          leaf.position.set(randRange(rng, -0.22, 0.22), 1.0 + l * 0.33, randRange(rng, -0.22, 0.22))
          leaf.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU)
          leaf.castShadow = true
          tree.add(leaf)
        }
        addDecor(tree, x, z, randRange(rng, 0.85, 1.25), rng() * TAU)
      } else if (kind < 0.82) {
        const crystal = new THREE.Mesh(this.a.octa, pick(rng, this.a.crystal))
        crystal.scale.set(randRange(rng, 0.16, 0.3), randRange(rng, 0.45, 0.9), randRange(rng, 0.16, 0.3))
        crystal.position.y = 0.35
        crystal.castShadow = true
        addDecor(crystal, x, z, 1, rng() * TAU)
      } else {
        const stone = new THREE.Mesh(this.a.dodeca, pick(rng, this.a.rock))
        stone.scale.setScalar(randRange(rng, 0.13, 0.27))
        stone.position.y = 0.09
        stone.castShadow = true
        addDecor(stone, x, z, 1, rng() * TAU)
      }
    }

    for (let i = 0; i < 7; i += 1) {
      const angle = rng() * TAU
      const dist = radius * randRange(rng, 0.7, 0.95)
      const flower = new THREE.Mesh(this.a.icosa, pick(rng, this.a.blossom))
      flower.scale.setScalar(randRange(rng, 0.045, 0.085))
      flower.position.set(Math.cos(angle) * dist, 0.07, Math.sin(angle) * dist)
      group.add(flower)
    }

    const shardCount = this.mobile ? 2 : 3
    for (let i = 0; i < shardCount; i += 1) {
      const shard = new THREE.Mesh(this.a.dodeca, this.a.darkRock)
      const angle = rng() * TAU
      const dist = radius * randRange(rng, 1.15, 1.5)
      const base = new THREE.Vector3(Math.cos(angle) * dist, randRange(rng, -2.4, 0.4), Math.sin(angle) * dist)
      shard.position.copy(base)
      shard.scale.setScalar(randRange(rng, 0.16, 0.34))
      shard.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU)
      group.add(shard)
      this.floaters.push({
        mesh: shard,
        base,
        phase: rng() * TAU,
        speed: randRange(rng, 0.4, 0.8),
        amp: randRange(rng, 0.2, 0.6),
      })
    }

    group.userData.variant = variant
    return {
      group,
      radius,
      seed,
      rock,
      cap,
      rim,
      shardCount,
    }
  }

  removeIsland(island) {
    this.scene.remove(island.group)
    island.group.traverse((obj) => {
      if (obj.isMesh && obj.geometry && !Object.values(this.a).some((asset) => asset === obj.geometry)) {
        obj.geometry.dispose()
      }
    })
    this.floaters = this.floaters.filter((f) => {
      let parent = f.mesh.parent
      let onIsland = false
      while (parent) {
        if (parent === island.group) onIsland = true
        parent = parent.parent
      }
      return !onIsland
    })
  }

  disposeWorld() {
    for (const island of this.islands || []) this.removeIsland(island)
  }

  setTarget(island) {
    if (!island) {
      this.marker.visible = false
      return
    }
    this.marker.visible = true
    this.marker.position.set(island.group.position.x, island.group.position.y + 0.06, island.group.position.z)
    this.markerRing.userData.baseScale = island.radius * 0.66
    this.markerRing.scale.setScalar(this.markerRing.userData.baseScale)
    this.markerBeam.position.y = 2.3
  }

  createFirefly(position) {
    const group = new THREE.Group()
    const puff = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.a.glow,
        color: '#ffe9a6',
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    )
    puff.scale.set(0.95, 0.95, 1)
    group.add(puff)
    const core = new THREE.Mesh(
      this.a.sphere,
      new THREE.MeshBasicMaterial({ color: '#fff6cf', fog: false }),
    )
    core.scale.setScalar(0.075)
    group.add(core)
    group.position.copy(position)
    this.scene.add(group)
    const firefly = { group, base: position.clone(), phase: Math.random() * TAU, alive: true }
    this.fireflies.push(firefly)
    return firefly
  }

  removeFirefly(firefly) {
    if (!firefly || !firefly.alive) return
    firefly.alive = false
    this.scene.remove(firefly.group)
    this.fireflies = this.fireflies.filter((f) => f !== firefly)
  }

  clearFireflies() {
    for (const firefly of [...this.fireflies]) this.removeFirefly(firefly)
  }

  showPreview(points, landing, onTarget) {
    const attr = this.preview.geometry.attributes.position
    const count = Math.min(points.length, attr.count)
    for (let i = 0; i < count; i += 1) {
      attr.setXYZ(i, points[i].x, points[i].y, points[i].z)
    }
    attr.needsUpdate = true
    this.preview.geometry.setDrawRange(0, count)
    this.preview.visible = count > 1
    this.previewHalo.visible = count > 1

    const color = onTarget ? '#c9f7d6' : '#ffb08f'
    this.preview.material.color.set(color)
    this.previewRing.material.color.set(color)
    this.previewDot.material.color.set(onTarget ? '#eafff0' : '#ffd3c1')

    if (landing) {
      this.previewRing.visible = true
      this.previewRing.position.copy(landing)
      this.previewDot.visible = true
      this.previewDot.position.set(landing.x, landing.y + 0.012, landing.z)
    } else {
      this.previewRing.visible = false
      this.previewDot.visible = false
    }
  }

  hidePreview() {
    this.preview.visible = false
    this.previewHalo.visible = false
    this.previewRing.visible = false
    this.previewDot.visible = false
  }

  spliceTrail(position, color = '#ffd695', count = 2) {
    for (let i = 0; i < count; i += 1) {
      const particle = this.trailParticles[this.trailCursor]
      this.trailCursor = (this.trailCursor + 1) % this.trailParticles.length
      particle.pos.copy(position)
      particle.pos.x += (Math.random() - 0.5) * 0.24
      particle.pos.y += (Math.random() - 0.5) * 0.2
      particle.pos.z += (Math.random() - 0.5) * 0.24
      particle.vel.set((Math.random() - 0.5) * 0.35, Math.random() * 0.35 + 0.1, (Math.random() - 0.5) * 0.35)
      particle.life = 0.65 + Math.random() * 0.5
      particle.maxLife = particle.life
      particle.color = new THREE.Color(color)
    }
  }

  burst(position, { color = '#ffe4a3', count = 18, speed = 3.2, gravity = 6, size = 0.32, life = 0.8 } = {}) {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const velocities = []
    const lives = []
    const base = new THREE.Color(color)
    for (let i = 0; i < count; i += 1) {
      positions.set([position.x, position.y, position.z], i * 3)
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize()
      dir.multiplyScalar(speed * (0.35 + Math.random() * 0.9))
      velocities.push(dir)
      const l = life * (0.55 + Math.random() * 0.6)
      lives.push({ life: l, max: l })
      colors.set([base.r, base.g, base.b], i * 3)
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({
      map: this.a.glow,
      size,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = 6
    this.scene.add(points)
    this.bursts.push({ points, velocities, lives, gravity, base, alive: true })
    return points
  }

  shockwave(position, color = '#ffe1a0', maxScale = 4) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    })
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.copy(position)
    mesh.position.y += 0.06
    mesh.scale.setScalar(0.6)
    mesh.renderOrder = 5
    this.scene.add(mesh)
    this.shockwaves.push({ mesh, age: 0, life: 0.6, maxScale })
  }

  clearFirefliesAndEffects() {
    this.clearFireflies()
    for (const burst of this.bursts) this.scene.remove(burst.points)
    this.bursts = []
    for (const wave of this.shockwaves) this.scene.remove(wave.mesh)
    this.shockwaves = []
    for (const p of this.trailParticles) {
      p.life = 0
      p.pos.set(0, -999, 0)
    }
  }

  update(dt, elapsed, camera) {
    this.time = elapsed
    this.sky.position.copy(camera.position)
    this.sunGlow.position.copy(this.sunDir).multiplyScalar(250)

    const focus = camera.position
    this.sun.position.copy(focus).add(this.sunOffset)
    this.sun.target.position.set(focus.x, focus.y - 4, focus.z + 8)
    this.sun.target.updateMatrixWorld()
    this.fill.position.set(focus.x - 14, focus.y + 8, focus.z - 18)

    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.drift * dt
      cloud.position.y =
        cloud.userData.baseY + Math.sin(elapsed * 0.18 + cloud.userData.sway) * 0.7
      const dx = cloud.position.x - focus.x
      if (dx > 110) cloud.position.x -= 220
      else if (dx < -110) cloud.position.x += 220
      if (cloud.position.z < focus.z + 24) {
        cloud.position.z = focus.z + randRange(Math.random, 45, 165)
        const below = Math.random() < 0.62
        cloud.position.y = below ? randRange(Math.random, -34, -10) : randRange(Math.random, 21, 48)
        cloud.position.x = focus.x + randRange(Math.random, -105, 105)
        cloud.userData.baseY = cloud.position.y
      }
    }

    const moteAttr = this.motes.geometry.attributes.position
    this.moteData.forEach((mote, i) => {
      let x = mote.p.x + Math.sin(elapsed * mote.speed + mote.offset) * 1.4
      let y = mote.p.y + Math.sin(elapsed * mote.speed * 0.7 + mote.offset) * 0.9
      let z = mote.p.z + Math.cos(elapsed * mote.speed * 0.8 + mote.offset) * 1.4
      const wrap = 30
      x = focus.x + ((((x - focus.x + wrap) % (wrap * 2)) + wrap * 2) % (wrap * 2)) - wrap
      z = focus.z + ((((z - focus.z + wrap) % (wrap * 2)) + wrap * 2) % (wrap * 2)) - wrap
      moteAttr.setXYZ(i, x, y, z)
    })
    moteAttr.needsUpdate = true
    this.motes.position.set(0, 0, 0)

    for (const floater of this.floaters) {
      floater.mesh.position.y = floater.base.y + Math.sin(elapsed * floater.speed + floater.phase) * floater.amp
      floater.mesh.rotation.y += dt * 0.25
      floater.mesh.rotation.x += dt * 0.12
    }

    for (const firefly of this.fireflies) {
      firefly.group.position.y = firefly.base.y + Math.sin(elapsed * 1.7 + firefly.phase) * 0.22
      firefly.group.position.x = firefly.base.x + Math.cos(elapsed * 1.1 + firefly.phase) * 0.13
      const pulse = 1 + Math.sin(elapsed * 3.2 + firefly.phase) * 0.08
      firefly.group.scale.setScalar(pulse)
    }

    if (this.farIslands) {
      for (const far of this.farIslands) {
        if (far.position.z < focus.z - 35) {
          far.position.set(focus.x + randRange(Math.random, -110, 110), randRange(Math.random, -14, 36), focus.z + randRange(Math.random, 80, 220))
        } else if (far.position.z > focus.z + 260) {
          far.position.z = focus.z + randRange(Math.random, 80, 220)
        }
      }
    }

    if (this.marker.visible) {
      const pulse = 1 + Math.sin(elapsed * 2.6) * 0.06
      this.markerRing.scale.setScalar((this.markerRing.userData.baseScale || 1) * pulse)
      this.markerRing.material.opacity = 0.42 + Math.sin(elapsed * 2.6) * 0.14
      this.markerGem.position.y = 3.7 + Math.sin(elapsed * 1.9) * 0.16
      this.markerGem.rotation.y += dt * 1.1
      this.markerHalo.material.opacity = 0.5 + Math.sin(elapsed * 2.1) * 0.12
      this.markerBeam.material.opacity = 0.035 + Math.sin(elapsed * 1.6) * 0.015
    }

    this.updateTrail(dt)
    this.updateBursts(dt)
    this.updateShockwaves(dt)
  }

  updateTrail(dt) {
    const posAttr = this.trail.geometry.attributes.position
    const colAttr = this.trail.geometry.attributes.color
    this.trailParticles.forEach((particle, i) => {
      if (particle.life > 0) {
        particle.life -= dt
        particle.pos.addScaledVector(particle.vel, dt)
        particle.vel.y += dt * 0.4
        const k = Math.max(0, particle.life / particle.maxLife)
        posAttr.setXYZ(i, particle.pos.x, particle.pos.y, particle.pos.z)
        colAttr.setXYZ(i, particle.color.r * k, particle.color.g * k, particle.color.b * k)
      } else {
        posAttr.setXYZ(i, 0, -999, 0)
        colAttr.setXYZ(i, 0, 0, 0)
      }
    })
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  }

  updateBursts(dt) {
    for (const burst of this.bursts) {
      if (!burst.alive) continue
      const posAttr = burst.points.geometry.attributes.position
      const colAttr = burst.points.geometry.attributes.color
      let alive = false
      for (let i = 0; i < burst.velocities.length; i += 1) {
        const state = burst.lives[i]
        if (state.life <= 0) continue
        alive = true
        state.life -= dt
        const vel = burst.velocities[i]
        vel.y -= burst.gravity * dt
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + vel.x * dt,
          posAttr.getY(i) + vel.y * dt,
          posAttr.getZ(i) + vel.z * dt,
        )
        const k = Math.max(0, state.life / state.max)
        colAttr.setXYZ(i, burst.base.r * k, burst.base.g * k, burst.base.b * k)
      }
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
      if (!alive) {
        burst.alive = false
        this.scene.remove(burst.points)
        burst.points.geometry.dispose()
        burst.points.material.dispose()
      }
    }
    this.bursts = this.bursts.filter((burst) => burst.alive)
  }

  updateShockwaves(dt) {
    for (const wave of this.shockwaves) {
      wave.age += dt
      const t = Math.min(1, wave.age / wave.life)
      const eased = 1 - Math.pow(1 - t, 3)
      wave.mesh.scale.setScalar(0.6 + eased * wave.maxScale)
      wave.mesh.material.opacity = 0.75 * (1 - t)
    }
    const dead = this.shockwaves.filter((wave) => wave.age >= wave.life)
    for (const wave of dead) {
      this.scene.remove(wave.mesh)
      wave.mesh.geometry.dispose()
      wave.mesh.material.dispose()
    }
    this.shockwaves = this.shockwaves.filter((wave) => wave.age < wave.life)
  }
}
