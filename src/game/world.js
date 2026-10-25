import * as THREE from 'three'
import {
  asphaltTexture,
  concreteTexture,
  metalTexture,
  crateTexture,
  containerTexture,
  sandbagTexture,
  rustTexture,
  hazardTexture,
  tarpaulinTexture,
  grateTexture,
  noiseTexture,
  skyTexture,
  bulletHoleTexture,
  smokeTexture,
  rainStreakTexture,
  makeGlowTexture
} from '../textures.js'

function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function signTexture(text, color, sub = '', wide = false) {
  return canvasTexture(wide ? 1024 : 512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(0,0,0,0)'
    ctx.fillRect(0, 0, w, h)
    ctx.font = `700 ${wide ? 116 : 118}px "DejaVu Sans Condensed", "DejaVu Sans", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = color
    ctx.shadowBlur = 34
    ctx.fillStyle = color
    ctx.fillText(text, w / 2, sub ? h * 0.44 : h * 0.52)
    if (sub) {
      ctx.shadowBlur = 14
      ctx.font = '600 34px "DejaVu Sans Mono", monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText(sub, w / 2, h * 0.76)
    }
  })
}

function windowTexture() {
  const random = seeded(90210)
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#04070b'
    ctx.fillRect(0, 0, w, h)
    for (let y = 12; y < h - 8; y += 18) {
      for (let x = 10; x < w - 8; x += 16) {
        const lit = random()
        if (lit > 0.82) {
          const warm = random() > 0.45
          ctx.fillStyle = warm ? 'rgba(255,196,120,0.9)' : 'rgba(150,215,255,0.85)'
          ctx.globalAlpha = 0.28 + random() * 0.7
          ctx.fillRect(x, y, 5, 8)
        } else {
          ctx.fillStyle = 'rgba(40,60,80,0.18)'
          ctx.fillRect(x, y, 5, 8)
        }
      }
    }
    ctx.globalAlpha = 1
  })
}

function blobTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    gradient.addColorStop(0, 'rgba(0,0,0,0.72)')
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.34)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  })
}

function setTiling(texture, x, y) {
  if (texture) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(x, y)
    texture.needsUpdate = true
  }
  return texture
}

function addBox(parent, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

export class World {
  constructor(scene, renderer, quality = 'high') {
    this.scene = scene
    this.renderer = renderer
    this.quality = quality
    this.time = 0
    this.colliders = []
    this.hitMeshes = []
    this.minimapObstacles = []
    this.spawnPoints = [
      new THREE.Vector3(-24, 0, -10),
      new THREE.Vector3(23, 0, -7),
      new THREE.Vector3(-10, 0, -31),
      new THREE.Vector3(17, 0, -30)
    ]
    this.spawnFlares = []
    this.animated = []
    this.flickerLights = []
    this.random = seeded(1337)
    this.blob = blobTexture()
    this.glowWarm = makeGlowTexture('#ffb066')
    this.glowCyan = makeGlowTexture('#66ddff')
    this.glowRed = makeGlowTexture('#ff4433')
    this.windowTex = windowTexture()
    this.mistTex = smokeTexture()
    this.build()
  }

  build() {
    const scene = this.scene
    const sky = skyTexture()
    sky.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    pmrem.compileEquirectangularShader()
    this.environment = pmrem.fromEquirectangular(sky).texture
    scene.background = sky
    scene.environment = this.environment
    scene.environmentIntensity = 0.75
    scene.backgroundIntensity = 1.0
    scene.fog = new THREE.FogExp2(0x091018, 0.0165)
    pmrem.dispose()

    this.buildLights()
    this.buildGround()
    this.buildPerimeter()
    this.buildContainers()
    this.buildProps()
    this.buildCatwalk()
    this.buildSignage()
    this.buildSkyline()
    this.buildAtmosphere()
    this.finalizeStatics()
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x4a6a8c, 0x0a0c10, 0.85)
    this.scene.add(hemi)

    const moon = new THREE.DirectionalLight(0x9db9e6, 1.55)
    moon.position.set(-32, 42, 20)
    moon.target.position.set(2, 0, -8)
    moon.castShadow = true
    const size = this.quality === 'low' ? 1024 : 2048
    moon.shadow.mapSize.set(size, size)
    moon.shadow.camera.left = -52
    moon.shadow.camera.right = 52
    moon.shadow.camera.top = 52
    moon.shadow.camera.bottom = -52
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 120
    moon.shadow.bias = -0.0007
    moon.shadow.normalBias = 0.035
    moon.shadow.radius = 2
    this.scene.add(moon)
    this.scene.add(moon.target)
    this.moon = moon

    const fill = new THREE.DirectionalLight(0x2b5b78, 0.5)
    fill.position.set(26, 16, -30)
    this.scene.add(fill)

    this.floodA = new THREE.SpotLight(0xffb066, 340, 55, 0.62, 0.72, 1.8)
    this.floodA.position.set(-17, 11.4, -15)
    this.floodA.target.position.set(-10, 0, -14)
    this.floodA.castShadow = false
    this.scene.add(this.floodA, this.floodA.target)

    this.floodB = new THREE.SpotLight(0xffc27a, 300, 50, 0.6, 0.8, 1.8)
    this.floodB.position.set(17, 10.4, -24)
    this.floodB.target.position.set(11, 0, -21)
    this.scene.add(this.floodB, this.floodB.target)

    this.floodC = new THREE.SpotLight(0xffa557, 260, 58, 0.66, 0.85, 1.8)
    this.floodC.position.set(1, 13.5, -33)
    this.floodC.target.position.set(0, 0, -24)
    this.scene.add(this.floodC, this.floodC.target)

    this.neonCyan = new THREE.PointLight(0x54d8ff, 26, 26, 2)
    this.neonCyan.position.set(-15.6, 5.2, -4)
    this.scene.add(this.neonCyan)

    this.neonRed = new THREE.PointLight(0xff3b2b, 18, 20, 2)
    this.neonRed.position.set(16.5, 4.4, -12)
    this.scene.add(this.neonRed)

    this.flickerLights.push(this.floodB)
  }

  buildGround() {
    const asphalt = setTiling(asphaltTexture(), 14, 14)
    const groundMaterial = new THREE.MeshStandardMaterial({
      map: asphalt,
      roughness: 0.38,
      metalness: 0.42,
      envMapIntensity: 1.15,
      color: 0xb9c0c6
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.userData.surface = 'asphalt'
    this.scene.add(ground)
    this.hitMeshes.push(ground)
    this.ground = ground

    const padMat = new THREE.MeshStandardMaterial({
      map: setTiling(concreteTexture(), 8, 8),
      roughness: 0.55,
      metalness: 0.18,
      envMapIntensity: 0.7,
      color: 0x9ba1a3
    })
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(44, 60), padMat)
    pad.rotation.x = -Math.PI / 2
    pad.position.set(0, 0.012, -8)
    pad.receiveShadow = true
    pad.userData.surface = 'concrete'
    this.scene.add(pad)
    this.hitMeshes.push(pad)

    const lineMat = new THREE.MeshStandardMaterial({ color: 0xd6c9a5, roughness: 0.7, metalness: 0.1, transparent: true, opacity: 0.5 })
    for (let i = 0; i < 7; i += 1) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.4), lineMat)
      mark.rotation.x = -Math.PI / 2
      mark.position.set(-3.6, 0.02, 20 - i * 8)
      this.scene.add(mark)
      const mark2 = mark.clone()
      mark2.position.x = 3.6
      this.scene.add(mark2)
    }

    const puddleMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a141c,
      metalness: 1,
      roughness: 0.045,
      envMapIntensity: 2.1,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    })
    const puddles = [
      [-6, 14, 2.6, 1.3, 0.5],
      [5, 6, 1.9, 1.0, 1.4],
      [-9, -7, 3.4, 1.7, 0.2],
      [8, -15, 2.7, 1.2, 2.2],
      [-2, -27, 3.8, 1.8, 1.1],
      [15, 16, 2.1, 1.0, 0.7],
      [-16, -24, 2.4, 1.4, 1.9]
    ]
    for (const [x, z, rx, rz, rot] of puddles) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 28), puddleMat)
      puddle.rotation.x = -Math.PI / 2
      puddle.rotation.z = rot
      puddle.scale.set(rx, rz, 1)
      puddle.position.set(x, 0.021, z)
      puddle.renderOrder = 1
      this.scene.add(puddle)
    }

    const reflectionMat = new THREE.MeshBasicMaterial({
      map: makeGlowTexture('#ffb066'),
      color: 0xffb066,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const reflection = new THREE.Mesh(new THREE.PlaneGeometry(10, 18), reflectionMat)
    reflection.rotation.x = -Math.PI / 2
    reflection.position.set(-8, 0.028, -13)
    this.scene.add(reflection)
    this.animated.push({ type: 'reflection', mesh: reflection, base: 0.22 })

    const cyanReflection = reflection.clone()
    cyanReflection.material = reflectionMat.clone()
    cyanReflection.material.map = makeGlowTexture('#54d8ff')
    cyanReflection.material.color.set(0x54d8ff)
    cyanReflection.position.set(13, 0.028, -10)
    cyanReflection.rotation.z = 1.2
    cyanReflection.scale.set(0.7, 0.8, 1)
    this.scene.add(cyanReflection)
  }

  addColliderBox(mesh, pad = 0, minimap = true) {
    const box = new THREE.Box3().setFromObject(mesh)
    box.min.x -= pad
    box.min.z -= pad
    box.max.x += pad
    box.max.z += pad
    this.colliders.push(box)
    if (minimap) {
      const size = new THREE.Vector3()
      box.getSize(size)
      const center = new THREE.Vector3()
      box.getCenter(center)
      this.minimapObstacles.push({ x: center.x, z: center.z, w: size.x, d: size.z })
    }
    return box
  }

  buildPerimeter() {
    const concrete = setTiling(concreteTexture(), 10, 2)
    const wallMat = new THREE.MeshStandardMaterial({
      map: concrete,
      roughness: 0.82,
      metalness: 0.08,
      envMapIntensity: 0.45,
      color: 0x8d9193
    })
    const makeWall = (w, h, d, x, y, z, ry = 0) => {
      const mesh = addBox(this.scene, new THREE.BoxGeometry(w, h, d), wallMat, new THREE.Vector3(x, y, z), { y: ry })
      mesh.userData.surface = 'concrete'
      this.hitMeshes.push(mesh)
      this.addColliderBox(mesh)
      return mesh
    }
    makeWall(92, 4.4, 1.8, 0, 2.2, -39)
    makeWall(1.8, 3.6, 80, -39, 1.8, 0)
    makeWall(1.8, 3.6, 80, 39, 1.8, 0)
    makeWall(92, 3.6, 1.8, 0, 1.8, 39)

    const warehouseMat = new THREE.MeshStandardMaterial({
      map: setTiling(metalTexture(), 6, 3),
      roughness: 0.72,
      metalness: 0.55,
      envMapIntensity: 0.6,
      color: 0x585f63
    })
    const warehouse = addBox(this.scene, new THREE.BoxGeometry(30, 9, 10), warehouseMat, new THREE.Vector3(2, 4.5, -34))
    warehouse.userData.surface = 'metal'
    this.hitMeshes.push(warehouse)
    this.addColliderBox(warehouse)

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x0c141b, metalness: 0.6, roughness: 0.4, emissive: 0x0a2431, emissiveIntensity: 0.7 })
    const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 6.2), doorMat)
    door.position.set(2, 3.2, -28.96)
    this.scene.add(door)
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x1b232a, metalness: 0.8, roughness: 0.4 })
    for (const x of [-2.2, 6.2]) {
      const frame = addBox(this.scene, new THREE.BoxGeometry(0.28, 7.2, 0.4), doorFrameMat, new THREE.Vector3(x, 3.6, -28.8))
      frame.castShadow = true
    }
    addBox(this.scene, new THREE.BoxGeometry(8.8, 0.3, 0.5), doorFrameMat, new THREE.Vector3(2, 7.1, -28.8))

    const stripeMat = new THREE.MeshStandardMaterial({ map: setTiling(hazardTexture(), 8, 1), roughness: 0.7, metalness: 0.2 })
    for (const x of [-2.2, 6.2]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 7.1), stripeMat)
      stripe.position.set(x, 3.55, -28.58)
      this.scene.add(stripe)
    }

    const fenceMat = new THREE.MeshStandardMaterial({
      map: setTiling(grateTexture(), 12, 3),
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      metalness: 0.7,
      roughness: 0.5,
      color: 0x8b949c
    })
    for (const x of [-32, 30]) {
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.2), fenceMat)
      fence.position.set(x, 6.8, -38)
      this.scene.add(fence)
    }

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: 0.85, roughness: 0.42 })
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd5a0, emissive: 0xffa858, emissiveIntensity: 3.4, metalness: 0.3, roughness: 0.5 })
    const poles = [
      [-17, 11.4, -15, this.floodA],
      [17, 10.4, -24, this.floodB],
      [1, 13.5, -33, this.floodC]
    ]
    for (const [x, y, z, light] of poles) {
      addBox(this.scene, new THREE.CylinderGeometry(0.13, 0.2, y, 8), poleMat, new THREE.Vector3(x, y / 2, z))
      const arm = addBox(this.scene, new THREE.BoxGeometry(1.8, 0.16, 0.16), poleMat, new THREE.Vector3(x + 0.7, y, z))
      arm.castShadow = true
      const housing = addBox(this.scene, new THREE.BoxGeometry(1.1, 0.34, 0.62), poleMat, new THREE.Vector3(x + 0.6, y - 0.22, z))
      housing.rotation.z = -0.18
      const lamp = addBox(this.scene, new THREE.BoxGeometry(0.92, 0.08, 0.46), lampMat, new THREE.Vector3(x + 0.6, y - 0.4, z))
      lamp.rotation.z = -0.18
      lamp.castShadow = false
      this.addGlow(x + 0.6, y - 0.5, z, 5.2, this.glowWarm, 0.5)
      const cone = this.makeLightCone(0xffab5e)
      cone.position.set(x + 1.4, 6.9, z + 1.2)
      this.scene.add(cone)
    }
  }

  addGlow(x, y, z, size, texture, opacity = 0.55) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(x, y, z)
    sprite.scale.set(size, size, 1)
    this.scene.add(sprite)
    return sprite
  }

  makeLightCone(color) {
    const geometry = new THREE.ConeGeometry(4.2, 12.6, 26, 1, true)
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 0.085 }
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vHeight = position.y / 6.3;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vHeight;
        void main() {
          float t = smoothstep(-1.0, 1.0, vHeight);
          float alpha = uOpacity * (0.16 + 0.84 * t) * (0.65 + 0.35 * smoothstep(-1.0, -0.2, vHeight));
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
    return new THREE.Mesh(geometry, material)
  }

  buildContainers() {
    const containerMat = (hue, repeatX = 2) => {
      const tex = setTiling(containerTexture(hue), repeatX, 1)
      return new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.62,
        metalness: 0.48,
        envMapIntensity: 0.75,
        color: 0xb9b3a8
      })
    }
    const matHue = [18, 190, 120, 8, 205, 35]
    const placements = [
      { x: -13, z: -5, ry: 0, stack: 1, hue: 18 },
      { x: -13.1, z: -5.4, ry: 0.02, stack: 2, hue: 18 },
      { x: 12.6, z: -3, ry: 0, stack: 1, hue: 205 },
      { x: 12.2, z: -3.6, ry: -0.03, stack: 2, hue: 8 },
      { x: -14, z: -19, ry: 0.05, stack: 1, hue: 120 },
      { x: 13.4, z: -19, ry: -0.02, stack: 1, hue: 35 },
      { x: 2, z: -33.5, ry: Math.PI / 2, stack: 1, hue: 8 },
      { x: -24, z: -2, ry: Math.PI / 2, stack: 1, hue: 190 },
      { x: 25, z: 6, ry: 0.04, stack: 1, hue: 18 },
      { x: 25.2, z: 6.4, ry: 0.02, stack: 2, hue: 120 }
    ]
    const containerGeo = new THREE.BoxGeometry(2.5, 2.62, 12.2)
    const doorGeo = new THREE.BoxGeometry(0.06, 2.3, 11.6)
    const rodGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6)
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x54595c, metalness: 0.9, roughness: 0.35 })
    for (const item of placements) {
      for (let level = 0; level < item.stack; level += 1) {
        const group = new THREE.Group()
        const body = new THREE.Mesh(containerGeo, containerMat(item.hue))
        body.castShadow = true
        body.receiveShadow = true
        group.add(body)
        const door = new THREE.Mesh(doorGeo, rodMat)
        door.position.set(0, 0, 6.12)
        door.material = new THREE.MeshStandardMaterial({ color: 0x3a3f42, metalness: 0.75, roughness: 0.45 })
        group.add(door)
        for (let i = 0; i < 4; i += 1) {
          const rod = new THREE.Mesh(rodGeo, rodMat)
          rod.position.set(-1.05 + i * 0.7, 0, 6.18)
          group.add(rod)
        }
        group.position.set(item.x, 1.31 + level * 2.66, item.z)
        group.rotation.y = item.ry
        this.scene.add(group)
        body.userData.surface = 'metal'
        this.addColliderBox(body)
        this.hitMeshes.push(body)
        this.addBlob(item.x, item.z, 4.5, 1.9)
      }
    }

    const railMat = new THREE.MeshStandardMaterial({ color: 0x343a3e, metalness: 0.85, roughness: 0.4 })
    for (const [x, z, len] of [[-13, -5, 14], [12.6, -3, 14], [-24, -2, 14], [25, 6, 14]]) {
      for (const side of [-1, 1]) {
        const rail = addBox(this.scene, new THREE.BoxGeometry(0.08, 0.08, len), railMat, new THREE.Vector3(x + side * 1.35, 0.08, z))
        rail.castShadow = false
      }
    }
  }

  addBlob(x, z, w, d, opacity = 0.5) {
    const material = new THREE.MeshBasicMaterial({
      map: this.blob,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0x000000
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.031, z)
    mesh.renderOrder = 2
    this.scene.add(mesh)
    return mesh
  }

  buildProps() {
    const crateMat = new THREE.MeshStandardMaterial({
      map: setTiling(crateTexture(), 1, 1),
      roughness: 0.78,
      metalness: 0.12,
      envMapIntensity: 0.45
    })
    const crateGeo = new THREE.BoxGeometry(1, 1, 1)
    const crates = [
      [6.4, 0.45, 10.5, 0.9, 0.4],
      [6.9, 1.25, 10.6, 0.7, 0.3],
      [5.6, 0.4, 11.2, 0.8, -0.2],
      [-7.2, 0.5, 3.4, 1.0, 0.15],
      [-7.6, 0.45, 4.5, 0.9, -0.4],
      [15.2, 0.5, -27.5, 1.1, 0.2],
      [-20.5, 0.55, -27, 1.0, 0.5],
      [-21.2, 1.55, -27.1, 0.8, 0.2],
      [22, 0.45, -17, 0.9, -0.3],
      [-25, 0.4, 12, 0.8, 0.1]
    ]
    for (const [x, y, z, s, ry] of crates) {
      const crate = addBox(this.scene, crateGeo, crateMat, new THREE.Vector3(x, y, z), { y: ry })
      crate.scale.setScalar(s)
      crate.rotation.z = (this.random() - 0.5) * 0.04
      crate.userData.surface = 'wood'
      this.hitMeshes.push(crate)
      if (s > 0.85) this.addColliderBox(crate, 0.02)
      this.addBlob(x, z, s * 1.7, s * 1.7, 0.42)
    }

    const barrelMat = new THREE.MeshStandardMaterial({
      map: setTiling(rustTexture(), 2, 1),
      roughness: 0.65,
      metalness: 0.6,
      envMapIntensity: 0.6
    })
    const barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.92, 14)
    const barrels = [
      [-11.8, 0.46, 2.6],
      [-12.3, 0.46, 3.2],
      [17.8, 0.46, 0.4],
      [18.4, 0.46, 0.9],
      [18.1, 1.38, 0.6],
      [-18.9, 0.46, -13.4],
      [8.5, 0.46, -24.6]
    ]
    for (const [x, y, z] of barrels) {
      const barrel = addBox(this.scene, barrelGeo, barrelMat, new THREE.Vector3(x, y, z))
      barrel.rotation.y = this.random() * 3
      barrel.userData.surface = 'metal'
      this.hitMeshes.push(barrel)
      this.addColliderBox(barrel, 0)
      this.addBlob(x, z, 1.1, 1.1, 0.5)
    }

    this.buildSandbags()
    this.buildBarriers()

    const debrisGeo = new THREE.BoxGeometry(1, 1, 1)
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2b, roughness: 0.9, metalness: 0.1 })
    const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, 90)
    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const pos = new THREE.Vector3()
    for (let i = 0; i < 90; i += 1) {
      const angle = this.random() * Math.PI * 2
      const radius = 8 + this.random() * 28
      pos.set(Math.cos(angle) * radius, 0.012 + this.random() * 0.01, Math.sin(angle) * radius - 4)
      quat.setFromEuler(new THREE.Euler(0, this.random() * Math.PI, 0))
      const s = 0.04 + this.random() * 0.14
      scale.set(s, s * 0.35, s * (0.4 + this.random()))
      matrix.compose(pos, quat, scale)
      debris.setMatrixAt(i, matrix)
    }
    debris.instanceMatrix.needsUpdate = true
    debris.receiveShadow = true
    this.scene.add(debris)

    const palletMat = new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 0.92, metalness: 0.05 })
    for (const [x, z, ry] of [[-4.5, 8.2, 0.4], [9.5, -12, 1.1], [-16, 5, 0.2]]) {
      const group = new THREE.Group()
      for (let i = 0; i < 5; i += 1) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.22), palletMat)
        plank.position.set(0, 0.03, -0.5 + i * 0.25)
        plank.castShadow = true
        group.add(plank)
      }
      for (const sx of [-0.6, 0.6]) {
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 1.4), palletMat)
        runner.position.set(sx, 0.1, 0)
        group.add(runner)
      }
      group.position.set(x, 0.02, z)
      group.rotation.y = ry
      this.scene.add(group)
    }

    const cableMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.8 })
    for (const [x1, z1, x2, z2, y] of [[-19, 14, -19, -18, 7.2], [20, 18, 20, -20, 7.6], [-6, 20, 6, 20, 6.2]]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x1, y, z1),
        new THREE.Vector3((x1 + x2) / 2, y - 0.9, (z1 + z2) / 2),
        new THREE.Vector3(x2, y, z2)
      ])
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.02, 4, false), cableMat)
      this.scene.add(tube)
    }

    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffb060, emissiveIntensity: 4 })
    for (const [x, y, z] of [[-19, 6.7, 2], [20, 7.1, 4], [0, 5.6, 20]]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), bulbMat)
      bulb.position.set(x, y, z)
      this.scene.add(bulb)
      const light = new THREE.PointLight(0xffa860, 12, 12, 2)
      light.position.set(x, y, z)
      this.scene.add(light)
      this.addGlow(x, y, z, 1.5, this.glowWarm, 0.4)
    }
  }

  buildSandbags() {
    const mat = new THREE.MeshStandardMaterial({
      map: setTiling(sandbagTexture(), 1, 1),
      roughness: 0.95,
      metalness: 0.02,
      envMapIntensity: 0.25,
      color: 0x9a8f74
    })
    const geo = new THREE.BoxGeometry(0.86, 0.3, 0.52)
    const positions = []
    const bays = [
      { x: -1.2, z: 18, rot: 0.12, len: 5 },
      { x: 9.5, z: 1.5, rot: -0.3, len: 5 },
      { x: -13.8, z: -12, rot: 0.6, len: 4 }
    ]
    for (const bay of bays) {
      for (let row = 0; row < 4; row += 1) {
        for (let i = 0; i < bay.len; i += 1) {
          const offset = (row % 2) * 0.43
          positions.push({
            x: bay.x + Math.cos(bay.rot) * (i * 0.9 - bay.len * 0.45 + offset) + (this.random() - 0.5) * 0.05,
            z: bay.z + Math.sin(bay.rot) * (i * 0.9 - bay.len * 0.45 + offset) + (this.random() - 0.5) * 0.05,
            y: 0.15 + row * 0.29,
            ry: bay.rot + (this.random() - 0.5) * 0.06
          })
        }
      }
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(bay.len * 0.95, 1.2, 0.62), mat)
      proxy.position.set(bay.x, 0.6, bay.z)
      proxy.rotation.y = -bay.rot
      proxy.visible = false
      this.scene.add(proxy)
      this.addColliderBox(proxy)
      this.addBlob(bay.x, bay.z, bay.len * 1.1, 1.4, 0.5)
    }
    const instanced = new THREE.InstancedMesh(geo, mat, positions.length)
    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3(1, 1, 1)
    positions.forEach((p, i) => {
      pos.set(p.x, p.y, p.z)
      quat.setFromEuler(new THREE.Euler(0, p.ry, (this.random() - 0.5) * 0.04))
      matrix.compose(pos, quat, scale)
      instanced.setMatrixAt(i, matrix)
    })
    instanced.instanceMatrix.needsUpdate = true
    instanced.castShadow = true
    instanced.receiveShadow = true
    this.scene.add(instanced)
  }

  buildBarriers() {
    const mat = new THREE.MeshStandardMaterial({
      map: setTiling(concreteTexture(), 3, 1),
      roughness: 0.8,
      metalness: 0.08,
      envMapIntensity: 0.4,
      color: 0x9da2a3
    })
    const hazardMat = new THREE.MeshStandardMaterial({ map: setTiling(hazardTexture(), 4, 0.4), roughness: 0.75, metalness: 0.1 })
    const placements = [
      [-4.8, 0.55, 14.5, 0.06],
      [4.2, 0.55, 19, -0.18],
      [0.8, 0.55, -16.5, 0.02],
      [10, 0.55, -9, 0.3],
      [-8.5, 0.55, -25.5, -0.1]
    ]
    for (const [x, y, z, ry] of placements) {
      const group = new THREE.Group()
      const base = addBox(group, new THREE.BoxGeometry(2.6, 1.05, 0.72), mat, new THREE.Vector3(0, 0, 0))
      base.castShadow = true
      base.userData.surface = 'concrete'
      const lip = addBox(group, new THREE.BoxGeometry(2.6, 0.16, 0.34), mat, new THREE.Vector3(0, 0.56, 0))
      lip.castShadow = true
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.26), hazardMat)
      stripe.position.set(0, 0.2, 0.37)
      group.add(stripe)
      group.position.set(x, y, z)
      group.rotation.y = ry
      this.scene.add(group)
      this.addColliderBox(base, 0.02)
      this.addBlob(x, z, 3.1, 1.2, 0.5)
    }
  }

  buildCatwalk() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x343b40, metalness: 0.85, roughness: 0.42 })
    const grate = new THREE.MeshStandardMaterial({ map: setTiling(grateTexture(), 10, 2), metalness: 0.8, roughness: 0.5, color: 0x8f989e })
    const group = new THREE.Group()
    const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 0.16, 2.2), grate)
    deck.position.y = 0
    deck.castShadow = true
    group.add(deck)
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 0.14), steel)
      beam.position.set(0, -0.18, side * 1.05)
      beam.castShadow = true
      group.add(beam)
      const rail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.06, 0.06), steel)
      rail.position.set(0, 1.05, side * 1.05)
      group.add(rail)
      const midrail = new THREE.Mesh(new THREE.BoxGeometry(30, 0.04, 0.04), steel)
      midrail.position.set(0, 0.55, side * 1.05)
      group.add(midrail)
      for (let i = -7; i <= 7; i += 1) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), steel)
        post.position.set(i * 2, 0.55, side * 1.05)
        group.add(post)
      }
    }
    const supportMat = steel
    for (const x of [-12, 12]) {
      for (const z of [-1, 1]) {
        const support = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.2, 0.22), supportMat)
        support.position.set(x, -3.1, z)
        support.castShadow = true
        group.add(support)
      }
    }
    const stair = new THREE.Group()
    for (let i = 0; i < 14; i += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.32), steel)
      step.position.set(0, -i * 0.36, i * 0.32)
      step.rotation.x = -0.4
      stair.add(step)
    }
    stair.position.set(14.4, -0.2, 0)
    stair.rotation.y = 0
    group.add(stair)
    group.position.set(0, 6.4, -29)
    this.scene.add(group)
    this.catwalk = group
  }

  buildSignage() {
    const makeSign = (text, color, sub, x, y, z, ry, scale = 1) => {
      const texture = signTexture(text, color, sub, true)
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.8 * scale, 1.7 * scale), material)
      sign.position.set(x, y, z)
      sign.rotation.y = ry
      this.scene.add(sign)
      const glow = this.addGlow(x + Math.sin(ry) * 0.1, y, z + Math.cos(ry) * 0.1, 7 * scale, color === '#66ddff' ? this.glowCyan : this.glowRed, 0.22)
      glow.material.color.set(color)
      this.animated.push({ type: 'sign', mesh: sign, glow, phase: this.random() * 6, base: 0.85 })
      return sign
    }
    makeSign('BLACKSITE', '#66ddff', 'SECTOR 07 // RESTRICTED', 2, 8.2, -28.8, 0, 1.15)
    makeSign('07', '#ff4433', 'CARGO BAY', 11.4, 4.9, 3.5, Math.PI, 0.7)
    makeSign('DANGER', '#ffb066', 'LIVE FIRE ZONE', -12.8, 4.6, -11.1, 0, 0.6)

    const stripMat = new THREE.MeshBasicMaterial({ color: 0x54d8ff, toneMapped: false })
    for (const [x, y, z, w, ry] of [[-15.6, 5.2, -4.3, 8, 0], [16.5, 4.4, -12.3, 6, Math.PI]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), stripMat)
      strip.position.set(x, y, z)
      strip.rotation.y = ry
      this.scene.add(strip)
    }
  }

  buildSkyline() {
    const random = seeded(55221)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x10161c,
      emissive: 0x0a1218,
      emissiveMap: this.windowTex,
      emissiveIntensity: 0.9,
      map: this.windowTex,
      roughness: 0.9,
      metalness: 0.05,
      fog: true
    })
    for (let i = 0; i < 24; i += 1) {
      const width = 6 + random() * 12
      const height = 10 + random() * 34
      const depth = 6 + random() * 12
      const angle = random() * Math.PI * 2
      const radius = 62 + random() * 34
      const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat)
      box.position.set(Math.cos(angle) * radius, height / 2 - 2, Math.sin(angle) * radius - 10)
      box.rotation.y = random() * Math.PI
      this.scene.add(box)
    }
    const beacons = new THREE.MeshBasicMaterial({ color: 0xff3322, toneMapped: false })
    for (let i = 0; i < 4; i += 1) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), beacons)
      beacon.position.set(-40 + i * 28, 22 + i * 4, -70 - i * 6)
      this.scene.add(beacon)
      this.animated.push({ type: 'beacon', mesh: beacon, phase: i * 1.7 })
    }
  }

  buildAtmosphere() {
    const count = this.quality === 'low' ? 700 : 1700
    const positions = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    const random = seeded(77123)
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (random() - 0.5) * 92
      positions[i * 3 + 1] = random() * 34
      positions[i * 3 + 2] = (random() - 0.5) * 92 + 4
      speeds[i] = 16 + random() * 16
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      map: rainStreakTexture(),
      color: 0xb9d9ef,
      size: 0.42,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      alphaTest: 0.02
    })
    const rain = new THREE.Points(geometry, material)
    rain.frustumCulled = false
    rain.renderOrder = 3
    this.scene.add(rain)
    this.rain = rain
    this.rainSpeeds = speeds

    const mistMat = new THREE.SpriteMaterial({
      map: this.mistTex,
      color: 0x8fb7cc,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    this.mist = []
    for (let i = 0; i < 8; i += 1) {
      const sprite = new THREE.Sprite(mistMat.clone())
      sprite.position.set((random() - 0.5) * 56, 0.9 + random() * 1.6, (random() - 0.5) * 56 - 6)
      sprite.scale.set(16 + random() * 14, 7 + random() * 4, 1)
      sprite.material.opacity = 0.03 + random() * 0.05
      sprite.userData.phase = random() * 10
      this.scene.add(sprite)
      this.mist.push(sprite)
    }

    const emberCount = 90
    const emberPositions = new Float32Array(emberCount * 3)
    for (let i = 0; i < emberCount; i += 1) {
      emberPositions[i * 3] = (random() - 0.5) * 60
      emberPositions[i * 3 + 1] = 0.2 + random() * 6
      emberPositions[i * 3 + 2] = (random() - 0.5) * 60 - 8
    }
    const emberGeo = new THREE.BufferGeometry()
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3))
    const emberMat = new THREE.PointsMaterial({
      map: makeGlowTexture('#ffb066'),
      color: 0xffb066,
      size: 0.06,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
    this.embers = new THREE.Points(emberGeo, emberMat)
    this.embers.frustumCulled = false
    this.scene.add(this.embers)
  }

  finalizeStatics() {
    this.renderer.shadowMap.needsUpdate = true
    this.staticShadowFrames = 4
  }

  update(dt, camera) {
    this.time += dt
    const time = this.time

    if (this.rain) {
      const pos = this.rain.geometry.attributes.position
      const array = pos.array
      for (let i = 0; i < array.length; i += 3) {
        array[i + 1] -= this.rainSpeeds[i / 3] * dt
        array[i] += dt * 1.6
        if (array[i + 1] < 0) {
          array[i + 1] = 34
          array[i] = (Math.random() - 0.5) * 92
          array[i + 2] = (Math.random() - 0.5) * 92 + 4
        }
        if (array[i] > 46) array[i] = -46
      }
      pos.needsUpdate = true
    }

    if (this.mist) {
      for (const sprite of this.mist) {
        const phase = sprite.userData.phase
        sprite.position.x += Math.sin(time * 0.08 + phase) * dt * 0.25
        sprite.position.z -= dt * 0.18
        if (sprite.position.z < -36) sprite.position.z = 32
      }
    }

    if (this.embers) {
      const pos = this.embers.geometry.attributes.position
      const array = pos.array
      for (let i = 0; i < array.length; i += 3) {
        array[i + 1] += dt * (0.08 + ((i / 3) % 3) * 0.03)
        array[i] += Math.sin(time * 0.4 + i) * dt * 0.08
        if (array[i + 1] > 8) array[i + 1] = 0.2
      }
      pos.needsUpdate = true
    }

    for (const item of this.animated) {
      if (item.type === 'sign') {
        const pulse = 0.82 + Math.sin(time * 9 + item.phase) * 0.05 + (Math.sin(time * 41 + item.phase) > 0.93 ? -0.35 : 0)
        item.mesh.material.opacity = pulse
        item.glow.material.opacity = 0.16 * pulse
      } else if (item.type === 'beacon') {
        item.mesh.visible = Math.sin(time * 2.2 + item.phase) > 0.2
      } else if (item.type === 'reflection') {
        item.mesh.material.opacity = item.base * (0.8 + Math.sin(time * 1.7) * 0.12)
      }
    }

    if (this.flickerLights.length) {
      const flicker = Math.sin(time * 32) > 0.96 || (Math.sin(time * 7.1) > 0.985)
      const light = this.flickerLights[0]
      const base = 300
      light.intensity = flicker ? base * 0.25 : base
    }

    if (this.staticShadowFrames > 0) {
      this.staticShadowFrames -= 1
      this.renderer.shadowMap.needsUpdate = true
      if (this.staticShadowFrames === 0) this.renderer.shadowMap.autoUpdate = false
    }
  }

  collide(position, radius, eyeHeight = 1.8) {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const box of this.colliders) {
        if (box.max.y < position.y + 0.15) continue
        if (box.min.y > position.y + eyeHeight) continue
        const closestX = Math.max(box.min.x, Math.min(position.x, box.max.x))
        const closestZ = Math.max(box.min.z, Math.min(position.z, box.max.z))
        let dx = position.x - closestX
        let dz = position.z - closestZ
        let distance = Math.hypot(dx, dz)
        if (distance >= radius) continue
        if (distance < 0.0001) {
          const pushLeft = position.x - box.min.x
          const pushRight = box.max.x - position.x
          const pushBack = position.z - box.min.z
          const pushFront = box.max.z - position.z
          const min = Math.min(pushLeft, pushRight, pushBack, pushFront)
          if (min === pushLeft) position.x = box.min.x - radius
          else if (min === pushRight) position.x = box.max.x + radius
          else if (min === pushBack) position.z = box.min.z - radius
          else position.z = box.max.z + radius
        } else {
          const overlap = (radius - distance) / distance
          position.x += dx * overlap
          position.z += dz * overlap
        }
      }
    }
    position.x = Math.max(-36.5, Math.min(36.5, position.x))
    position.z = Math.max(-36.5, Math.min(36.5, position.z))
  }

  raycast(raycaster) {
    return raycaster.intersectObjects(this.hitMeshes, false)
  }

  lineBlocked(from, to) {
    const direction = new THREE.Vector3().subVectors(to, from)
    const distance = direction.length()
    if (distance < 0.001) return false
    direction.normalize()
    const ray = new THREE.Raycaster(from, direction, 0.05, distance - 0.15)
    const hits = ray.intersectObjects(this.hitMeshes, false)
    return hits.length > 0
  }
}

export { bulletHoleTexture }
