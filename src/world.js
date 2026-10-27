import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const rand = (a, b) => a + Math.random() * (b - a)

function makeEnvMap(renderer) {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 512
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, '#02040a')
  g.addColorStop(0.34, '#0a1726')
  g.addColorStop(0.52, '#1d2f40')
  g.addColorStop(0.6, '#4e4438')
  g.addColorStop(0.665, '#2a2119')
  g.addColorStop(0.78, '#090b0d')
  g.addColorStop(1, '#040506')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1024, 512)

  const sun = ctx.createRadialGradient(690, 300, 4, 690, 300, 220)
  sun.addColorStop(0, 'rgba(255,214,160,1)')
  sun.addColorStop(0.06, 'rgba(255,168,92,0.85)')
  sun.addColorStop(0.35, 'rgba(255,120,45,0.18)')
  sun.addColorStop(1, 'rgba(255,110,40,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, 1024, 512)

  const rng = (() => { let s = 8831; return () => (s = (s * 16807) % 2147483647) / 2147483647 })()
  for (let i = 0; i < 24; i++) {
    const x = rng() * 1024, y = 180 + rng() * 190, w = 3 + rng() * 14, h = 1 + rng() * 8
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,190,120,0.55)' : 'rgba(150,220,255,0.4)'
    ctx.fillRect(x, y, w, h)
  }
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const rt = pmrem.fromEquirectangular(t)
  t.dispose(); pmrem.dispose()
  return rt.texture
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#01030a') },
      midColor: { value: new THREE.Color('#0c1a2b') },
      horizonColor: { value: new THREE.Color('#38414c') },
      glowColor: { value: new THREE.Color('#ff7a32') },
      sunDir: { value: new THREE.Vector3(-0.55, 0.08, -0.83).normalize() },
      time: { value: 0 }
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      uniform vec3 sunDir;
      uniform float time;
      varying vec3 vDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
                   mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        float h = clamp(vDir.y, -0.15, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
        col = mix(col, topColor, smoothstep(0.16, 0.85, h));

        float sunAmt = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        float horizonGlow = exp(-abs(h - 0.035) * 9.0);
        col += glowColor * pow(sunAmt, 5.0) * 0.42;
        col += glowColor * horizonGlow * (0.16 + 0.3 * pow(sunAmt, 2.0));
        col += vec3(1.0, 0.55, 0.25) * pow(sunAmt, 260.0) * 2.4;

        vec2 cp = vDir.xz / max(0.09, abs(vDir.y) + 0.18) * 0.85;
        float clouds = fbm(cp * 1.25 + vec2(time * 0.006, time * 0.0025));
        float cloudMask = smoothstep(0.44, 0.72, clouds) * smoothstep(0.015, 0.24, h) * (1.0 - smoothstep(0.75, 1.0, h));
        vec3 cloudCol = mix(vec3(0.035, 0.048, 0.064), vec3(0.09, 0.085, 0.08), pow(sunAmt, 2.0));
        col = mix(col, cloudCol, cloudMask * 0.82);

        vec2 sp = vDir.xz / (abs(vDir.y) + 0.22) * 240.0;
        float star = step(0.9975, hash21(floor(sp))) * smoothstep(0.12, 0.4, h);
        star *= 0.4 + 0.6 * hash21(floor(sp) + floor(time * 0.6));
        col += vec3(0.65, 0.8, 1.0) * star * 1.5;

        float band = fbm(vec2(atan(vDir.z, vDir.x) * 1.6, h * 3.0) + 12.0);
        col += vec3(0.02, 0.035, 0.05) * smoothstep(0.6, 0.9, band) * smoothstep(0.2, 0.7, h);

        gl_FragColor = vec4(col, 1.0);
      }`
  })
}

function labelTexture(text, { bg = 'rgba(8,12,15,0.92)', color = '#dfe9ee', border = '#ff8f38', w = 512, h = 128, font = 600 } = {}) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = border; ctx.lineWidth = 4; ctx.strokeRect(6, 6, w - 12, h - 12)
  ctx.fillStyle = color
  ctx.font = `${font} ${h * 0.46}px "Arial Narrow", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function helipadTexture() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, S, S)
  ctx.strokeStyle = 'rgba(172,192,200,0.45)'
  ctx.lineWidth = 16
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.43, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.32, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = 'rgba(182,202,208,0.52)'
  ctx.fillRect(S * 0.29, S * 0.3, S * 0.07, S * 0.4)
  ctx.fillRect(S * 0.64, S * 0.3, S * 0.07, S * 0.4)
  ctx.fillRect(S * 0.36, S * 0.465, S * 0.28, S * 0.07)
  ctx.save()
  ctx.translate(S / 2, S / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.font = '600 34px "Arial Narrow", sans-serif'
  ctx.fillStyle = 'rgba(255,143,56,0.9)'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('LZ-07 // BLACKSITE', 0, -S * 0.17)
  ctx.restore()
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    ctx.fillStyle = i % 2 ? 'rgba(255,143,56,0.55)' : 'rgba(20,24,26,0.7)'
    const x = S / 2 + Math.cos(a) * S * 0.462, y = S / 2 + Math.sin(a) * S * 0.462
    ctx.save(); ctx.translate(x, y); ctx.rotate(a)
    ctx.fillRect(-8, -3, 16, 6)
    ctx.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export class World {
  constructor(scene, renderer, textures, quality = 'balanced') {
    this.scene = scene
    this.renderer = renderer
    this.tex = textures
    this.quality = quality
    this.colliders = []
    this.occluders = []
    this.spawnPoints = []
    this.animated = []
    this.smokeEmitters = []
    this.time = 0
    this.high = quality === 'high'
    this.buildEnvironment()
    this.buildLights()
    this.buildGround()
    this.buildPerimeter()
    this.buildStructures()
    this.buildProps()
    this.buildSkyline()
    this.buildAtmosphere()
    this.buildDust()
    this.buildRain()
  }

  buildEnvironment() {
    this.scene.environment = makeEnvMap(this.renderer)
    this.scene.environmentIntensity = 1.18
    this.scene.fog = new THREE.FogExp2(0x0a1420, 0.0138)

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(170, 40, 24), skyMaterial())
    this.sky.frustumCulled = false
    this.scene.add(this.sky)

    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex.soft, color: 0xffb070, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }))
    moonGlow.scale.set(46, 46, 1)
    moonGlow.position.set(-92, 18, -138)
    this.scene.add(moonGlow)

    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(6.4, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd2a0, fog: false, toneMapped: true })
    )
    moon.position.set(-92, 18, -138)
    moon.lookAt(0, 1.7, 0)
    this.scene.add(moon)
    this.moon = moon
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x7fa4c6, 0x2c2118, 1.12)
    this.scene.add(hemi)

    const dir = new THREE.DirectionalLight(0xc7ddff, 2.85)
    dir.position.set(-38, 48, -46)
    dir.castShadow = true
    const sm = this.high ? 2048 : 1024
    dir.shadow.mapSize.set(sm, sm)
    dir.shadow.camera.near = 1
    dir.shadow.camera.far = 140
    dir.shadow.camera.left = -42
    dir.shadow.camera.right = 42
    dir.shadow.camera.top = 42
    dir.shadow.camera.bottom = -42
    dir.shadow.bias = -0.0006
    dir.shadow.normalBias = 0.035
    this.scene.add(dir)
    this.scene.add(dir.target)
    dir.target.position.set(0, 0, 0)
    this.dirLight = dir

    const rim = new THREE.DirectionalLight(0xff9a4c, 1.55)
    rim.position.set(42, 10, 38)
    this.scene.add(rim)
    this.rimLight = rim

    const faceFill = new THREE.DirectionalLight(0x9bc4dd, 1.4)
    faceFill.position.set(12, 20, 46)
    this.scene.add(faceFill)
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(190, 190, 1, 1)
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex.asphalt.map,
      normalMap: this.tex.asphalt.normalMap,
      roughnessMap: this.tex.asphalt.roughnessMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: 0xc2ccd4,
      metalness: 0.16,
      roughness: 0.86,
      envMapIntensity: 1.15
    })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.userData.solid = true
    this.scene.add(ground)
    this.ground = ground
    this.occluders.push(ground)

    const padMat = new THREE.MeshStandardMaterial({
      map: helipadTexture(), transparent: true, roughness: 0.62, metalness: 0.1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    })
    const pad = new THREE.Mesh(new THREE.CircleGeometry(7.4, 64), padMat)
    pad.rotation.x = -Math.PI / 2
    pad.position.set(0, 0.012, 0)
    pad.receiveShadow = true
    this.scene.add(pad)

    const puddleMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1118, metalness: 0.92, roughness: 0.055, clearcoat: 1, clearcoatRoughness: 0.08,
      transparent: true, opacity: 0.62, envMapIntensity: 1.8,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    })
    const puddleGeo = new THREE.CircleGeometry(1, 22)
    const spots = [
      [7.6, 5.4, 2.5, 1.1, 0.6], [-6.2, 8.2, 1.8, 0.9, 1.7], [-11.5, -4.5, 2.9, 1.4, 0.4],
      [12.8, -8.8, 2.2, 1.0, 2.2], [-3.5, -13.2, 3.5, 1.6, 1.2], [18.2, 9.4, 1.6, 0.8, 0.9],
      [-18.6, 12.4, 2.4, 1.1, 2.6], [3.8, 18.2, 2.0, 0.9, 0.2], [24.5, -2.2, 1.7, 0.8, 1.9],
      [-23.2, -14.5, 2.1, 1.0, 1.1]
    ]
    for (const [x, z, sx, sz, r] of spots) {
      const p = new THREE.Mesh(puddleGeo, puddleMat)
      p.rotation.x = -Math.PI / 2
      p.rotation.z = r
      p.position.set(x, 0.018, z)
      p.scale.set(sx, sz, 1)
      this.scene.add(p)
    }

    const lineMat = new THREE.MeshStandardMaterial({ color: 0xc9c3a8, roughness: 0.8, metalness: 0.05, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 })
    for (const [x, z, w, d, r] of [[-16, 0, 0.18, 20, 0], [16, 0, 0.18, 20, 0], [0, -16, 20, 0.18, 0], [0, 16, 20, 0.18, 0]]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat)
      line.rotation.x = -Math.PI / 2
      line.rotation.z = r
      line.position.set(x, 0.016, z)
      this.scene.add(line)
    }
  }

  addBox({ w, h, d, x, y, z, ry = 0, mat, collide = false, solid = false, shadow = true, rx = 0, rz = 0 }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    this.scene.add(mesh)
    if (solid) { mesh.userData.solid = true; this.occluders.push(mesh) }
    if (collide) {
      const hx = (Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d) / 2
      const hz = (Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d) / 2
      this.colliders.push({ type: 'box', x, z, hx, hz })
    }
    return mesh
  }

  addCollider(x, z, hx, hz) { this.colliders.push({ type: 'box', x, z, hx, hz }) }
  addCircleCollider(x, z, r) { this.colliders.push({ type: 'circle', x, z, r }) }

  buildPerimeter() {
    const metal = this.tex.metal.map
    const postMat = new THREE.MeshStandardMaterial({ map: metal, color: 0x5b656d, metalness: 0.82, roughness: 0.42 })
    const chainMat = new THREE.MeshStandardMaterial({
      map: this.tex.chainlink, color: 0x9aacb6, metalness: 0.6, roughness: 0.5,
      transparent: true, alphaTest: 0.28, side: THREE.DoubleSide, depthWrite: true
    })
    const R = 32
    const postGeo = new THREE.CylinderGeometry(0.075, 0.09, 3.9, 8)
    for (let side = 0; side < 4; side++) {
      const along = side < 2 ? 1 : 0
      for (let i = -R; i <= R; i += 4) {
        const x = along ? i : (side === 2 ? -R : R)
        const z = along ? (side === 2 ? -R : R) : i
        const post = new THREE.Mesh(postGeo, postMat)
        post.position.set(x, 1.95, z)
        post.castShadow = true
        this.scene.add(post)
      }
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, 3.6), chainMat.clone())
      fence.material.map = this.tex.chainlink.clone()
      fence.material.map.needsUpdate = true
      fence.material.map.repeat.set(28, 2)
      if (along) {
        fence.position.set(0, 1.8, side === 2 ? -R : R)
      } else {
        fence.position.set(side === 2 ? -R : R, 1.8, 0)
        fence.rotation.y = Math.PI / 2
      }
      this.scene.add(fence)
    }
    const wallMat = new THREE.MeshStandardMaterial({ map: this.tex.concrete.map, roughness: 0.92, metalness: 0.04, color: 0x919aa0 })
    this.addBox({ w: R * 2 + 2, h: 0.55, d: 0.5, x: 0, y: 0.27, z: -R - 0.4, mat: wallMat, collide: true, solid: true })
    this.addBox({ w: R * 2 + 2, h: 0.55, d: 0.5, x: 0, y: 0.27, z: R + 0.4, mat: wallMat, collide: true, solid: true })
    this.addBox({ w: 0.5, h: 0.55, d: R * 2 + 2, x: -R - 0.4, y: 0.27, z: 0, mat: wallMat, collide: true, solid: true })
    this.addBox({ w: 0.5, h: 0.55, d: R * 2 + 2, x: R + 0.4, y: 0.27, z: 0, mat: wallMat, collide: true, solid: true })

    const gateMat = new THREE.MeshStandardMaterial({ color: 0x171d22, metalness: 0.8, roughness: 0.4 })
    for (const [x, z, ry] of [[0, -R, 0], [0, R, 0], [-R, 0, Math.PI / 2], [R, 0, Math.PI / 2]]) {
      const gate = new THREE.Group()
      gate.position.set(x, 0, z)
      gate.rotation.y = ry
      for (const sx of [-2.4, 2.4]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 0.4), gateMat)
        p.position.set(sx, 2.6, 0)
        p.castShadow = true
        gate.add(p)
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 0.5), gateMat)
      top.position.y = 5.1
      top.castShadow = true
      gate.add(top)
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 0.2), new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff5a00, emissiveIntensity: 2.2, roughness: 0.4 }))
      bar.position.y = 4.62
      gate.add(bar)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color: 0xff6a20, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
      glow.scale.set(1.9, 1.9, 1)
      glow.position.set(0, 4.3, 0.35)
      gate.add(glow)
      this.scene.add(gate)
    }
    this.spawnPoints = [
      new THREE.Vector3(0, 0, -26), new THREE.Vector3(-26, 0, -8), new THREE.Vector3(26, 0, -8),
      new THREE.Vector3(-24, 0, 20), new THREE.Vector3(24, 0, 20), new THREE.Vector3(0, 0, 27)
    ]
  }

  buildStructures() {
    const concrete = new THREE.MeshStandardMaterial({ map: this.tex.concrete.map, normalMap: this.tex.concrete.normalMap, roughness: 0.9, metalness: 0.05, color: 0x99a1a6 })
    const containerMats = [
      new THREE.MeshStandardMaterial({ map: this.tex.containerA.map, metalness: 0.55, roughness: 0.56, color: 0xaab6bd }),
      new THREE.MeshStandardMaterial({ map: this.tex.containerB.map, metalness: 0.5, roughness: 0.62, color: 0xb8ab9b }),
      new THREE.MeshStandardMaterial({ map: this.tex.containerC.map, metalness: 0.55, roughness: 0.58, color: 0x9fb8ad })
    ]
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x22292e, metalness: 0.85, roughness: 0.35 })
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture('SECTOR 07'), transparent: true })

    const addContainer = (x, z, ry, matIndex, y = 1.38, label = true) => {
      const g = new THREE.Group()
      g.position.set(x, y, z)
      g.rotation.y = ry
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.65, 2.55), containerMats[matIndex])
      body.castShadow = true; body.receiveShadow = true
      body.userData.solid = true
      g.add(body)
      this.occluders.push(body)
      for (const sx of [-3.12, 3.12]) {
        for (const sz of [-1.3, 1.3]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.7, 0.18), trimMat)
          post.position.set(sx, 0, sz)
          post.castShadow = true
          g.add(post)
        }
      }
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 2.4), trimMat)
      doorFrame.position.set(3.14, 0, 0)
      g.add(doorFrame)
      for (const sz of [-0.62, 0.62]) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0xff8f38, emissive: 0xff6a10, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.4 }))
        handle.position.set(3.2, 0, sz)
        g.add(handle)
      }
      if (label) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), labelMat)
        sign.position.set(0, 0.35, -1.285)
        sign.rotation.y = Math.PI
        g.add(sign)
      }
      this.scene.add(g)
      const hx = (Math.abs(Math.cos(ry)) * 6.2 + Math.abs(Math.sin(ry)) * 2.55) / 2
      const hz = (Math.abs(Math.sin(ry)) * 6.2 + Math.abs(Math.cos(ry)) * 2.55) / 2
      this.colliders.push({ type: 'box', x, z, hx, hz })
      return g
    }

    addContainer(-14.5, -12.5, 0, 0)
    addContainer(14.5, -13.2, 0, 1)
    addContainer(-19.5, 3.5, Math.PI / 2, 2)
    addContainer(19.8, 4.2, Math.PI / 2, 0)
    addContainer(-11.5, 16.8, 0.06, 1)
    addContainer(12.8, 17.6, -0.04, 2)
    addContainer(-17.2, -18.2, Math.PI / 2, 0, 1.38, false)
    const stacked = addContainer(-17.2, -18.2, Math.PI / 2, 2, 4.1, false)
    stacked.position.x += 0.2
    const stacked2 = addContainer(20.8, -19.8, 0.02, 1, 4.1, false)
    stacked2.rotation.y = 0.03

    const barrierGeo = new THREE.BoxGeometry(2.7, 1.05, 0.62)
    const barrierSpots = [
      [-8, -5, 0.18], [8, -5, -0.18], [-8, 5, 0.14], [8, 5, -0.14],
      [-4.2, -9.5, 0], [4.2, -9.5, 0], [-15.8, 10.5, 0.5], [15.8, 10.5, -0.5],
      [-22.8, -6.2, 1.2], [22.8, -6.2, -1.2], [-3, 22.5, 0.15], [3, 22.5, -0.15]
    ]
    for (const [x, z, r] of barrierSpots) {
      const m = this.addBox({ w: 2.7, h: 1.05, d: 0.62, x, y: 0.525, z, ry: r, mat: concrete, collide: true, solid: true })
      m.geometry = barrierGeo
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.5), new THREE.MeshBasicMaterial({ map: this.tex.warning, transparent: true, opacity: 0.75 }))
      stripe.position.set(0, 0.02, 0.315)
      m.add(stripe)
    }

    const sandMat = new THREE.MeshStandardMaterial({ map: this.tex.sandbag.map, roughness: 0.98, metalness: 0.01, color: 0xb4a57c })
    const bagGeo = new RoundedBoxGeometry(0.88, 0.3, 0.5, 3, 0.09)
    const addSandWall = (x, z, ry, rows = 3, len = 5) => {
      const g = new THREE.Group()
      g.position.set(x, 0, z); g.rotation.y = ry
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < len; i++) {
          const bag = new THREE.Mesh(bagGeo, sandMat)
          bag.position.set((i - (len - 1) / 2) * 0.9 + (row % 2) * 0.45, 0.16 + row * 0.29, rand(-0.03, 0.03))
          bag.rotation.y = rand(-0.08, 0.08)
          bag.rotation.z = rand(-0.03, 0.03)
          bag.castShadow = true; bag.receiveShadow = true
          g.add(bag)
        }
      }
      this.scene.add(g)
      const hx = (Math.abs(Math.cos(ry)) * len * 0.9 + Math.abs(Math.sin(ry)) * 0.55) / 2 + 0.3
      const hz = (Math.abs(Math.sin(ry)) * len * 0.9 + Math.abs(Math.cos(ry)) * 0.55) / 2 + 0.3
      this.colliders.push({ type: 'box', x, z, hx, hz })
      return g
    }
    addSandWall(0, 13.4, 0, 3, 7)
    addSandWall(-11, -20.5, 0.2, 2, 5)
    addSandWall(22.4, 12.4, Math.PI / 2, 2, 4)

    this.buildWatchtower(24.5, -24.5, this.tex.metal.map)
    this.buildWatchtower(-25.5, 20.5, this.tex.metal.map)
    this.buildAntenna(-27.5, -25.5)
    this.buildVTOL(16.5, 22.5)
  }

  buildWatchtower(x, z, metalMap) {
    const metal = new THREE.MeshStandardMaterial({ map: metalMap, color: 0x69737a, metalness: 0.85, roughness: 0.4 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b2227, metalness: 0.8, roughness: 0.42 })
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    for (const sx of [-1.6, 1.6]) {
      for (const sz of [-1.6, 1.6]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8), metal)
        leg.position.set(sx, 3.1, sz)
        leg.castShadow = true
        g.add(leg)
      }
    }
    for (let i = 0; i < 3; i++) {
      const y = 1.5 + i * 2
      for (const [w, d, px, pz] of [[3.4, 0.06, 0, -1.6], [3.4, 0.06, 0, 1.6], [0.06, 3.4, -1.6, 0], [0.06, 3.4, 1.6, 0]]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), metal)
        brace.position.set(px, y, pz)
        g.add(brace)
      }
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.24, 4.4), dark)
    deck.position.y = 6.25
    deck.castShadow = true; deck.receiveShadow = true
    g.add(deck)
    for (const [w, d, px, pz] of [[4.4, 0.08, 0, -2.18], [4.4, 0.08, 0, 2.18], [0.08, 4.4, -2.18, 0], [0.08, 4.4, 2.18, 0], [4.4, 0.08, 0, -2.15], [4.4, 0.08, 0, 2.15]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.95, d), metal)
      rail.position.set(px, 6.85, pz)
      g.add(rail)
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.16, 5.4), dark)
    roof.position.y = 8.35
    roof.castShadow = true
    g.add(roof)
    for (const sx of [-2.4, 2.4]) for (const sz of [-2.4, 2.4]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), metal)
      p.position.set(sx, 7.3, sz)
      g.add(p)
    }
    const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 12), dark)
    lampHead.position.set(0, 8.2, 0)
    g.add(lampHead)
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), lensMat)
    lens.rotation.x = Math.PI / 2
    lens.position.set(0, 7.98, 0)
    g.add(lens)
    const light = new THREE.PointLight(0xffb168, 38, 26, 2)
    light.position.set(0, 7.7, 0)
    g.add(light)
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(5.2, 11, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffae62, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true })
    )
    cone.position.set(0, 2.8, 0)
    g.add(cone)

    const ladder = new THREE.Group()
    ladder.position.set(0, 0, 2.25)
    for (const sx of [-0.25, 0.25]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 6.2, 6), metal)
      rail.position.set(sx, 3.1, 0)
      ladder.add(rail)
    }
    for (let y = 0.6; y < 6.2; y += 0.42) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.035, 0.035), metal)
      rung.position.set(0, y, 0)
      ladder.add(rung)
    }
    g.add(ladder)
    this.scene.add(g)
    this.addCollider(x, z, 1.85, 1.85)
    this.animated.push({ kind: 'lightflicker', light, base: 38, seed: Math.random() * 10 })
  }

  buildAntenna(x, z) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const metal = new THREE.MeshStandardMaterial({ color: 0x59646c, metalness: 0.9, roughness: 0.35 })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 0.5, 8), new THREE.MeshStandardMaterial({ map: this.tex.concrete.map, color: 0x8c9499, roughness: 0.95 }))
    base.position.y = 0.25
    base.castShadow = true
    g.add(base)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, 17, 8), metal)
    mast.position.y = 8.5
    mast.castShadow = true
    g.add(mast)
    for (let i = 0; i < 6; i++) {
      const y = 2.5 + i * 2.3
      const w = 1.7 - i * 0.22
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), metal)
      bar.position.y = y
      bar.rotation.y = i % 2 ? Math.PI / 2 : 0
      g.add(bar)
      for (const sx of [-w / 2, w / 2]) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.03), metal)
        tip.position.set(i % 2 ? 0 : sx, y + 0.3, i % 2 ? sx : 0)
        g.add(tip)
      }
    }
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a })
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), beaconMat)
    beacon.position.y = 17.2
    g.add(beacon)
    const beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color: 0xff2a1a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
    beaconGlow.position.y = 17.2
    beaconGlow.scale.set(2.2, 2.2, 1)
    g.add(beaconGlow)
    this.scene.add(g)
    this.addCircleCollider(x, z, 1.4)
    this.animated.push({ kind: 'beacon', mat: beaconMat, glow: beaconGlow, seed: Math.random() * 10 })
  }

  buildVTOL(x, z) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = -0.45
    g.rotation.z = 0.08
    const hull = new THREE.MeshStandardMaterial({ color: 0x353c3d, metalness: 0.78, roughness: 0.44 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x14191c, metalness: 0.7, roughness: 0.55 })
    const accent = new THREE.MeshStandardMaterial({ color: 0xff6a18, emissive: 0xff4a00, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.5 })

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 4.4, 8, 18), hull)
    body.rotation.z = Math.PI / 2
    body.position.set(0, 1.9, 0)
    body.castShadow = true
    g.add(body)
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), dark)
    nose.rotation.z = -Math.PI / 2
    nose.position.set(-3.2, 1.9, 0)
    nose.scale.set(1, 1.3, 1)
    g.add(nose)
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 12), new THREE.MeshPhysicalMaterial({ color: 0x0a1820, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.82, envMapIntensity: 2 }))
    cockpit.position.set(-3.0, 2.32, 0)
    cockpit.scale.set(1.4, 0.8, 1)
    g.add(cockpit)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 6.4), hull)
    wing.position.set(0.4, 1.95, 0)
    wing.rotation.z = 0.18
    wing.castShadow = true
    g.add(wing)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 3.2), hull)
    tail.position.set(2.6, 2.35, 0)
    tail.rotation.z = -0.15
    g.add(tail)
    for (const sz of [-3.3, 3.3]) {
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.3, 10), dark)
      rotor.position.set(0.4, 2.1, sz)
      g.add(rotor)
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.035, 0.16), dark)
        blade.position.set(0.4, 2.16, sz)
        blade.rotation.y = i * Math.PI / 3
        blade.rotation.z = 0.22
        blade.translateX(1.2)
        g.add(blade)
      }
    }
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.4, 12), dark)
    engine.position.set(2.9, 2.7, 0)
    g.add(engine)
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), accent)
    ember.position.set(2.9, 2.7, 0)
    g.add(ember)
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: this.tex.scorch, transparent: true, opacity: 0.85, depthWrite: false }))
    scorch.rotation.x = -Math.PI / 2
    scorch.position.y = 0.03
    scorch.scale.set(1.4, 1, 1)
    g.add(scorch)
    const light = new THREE.PointLight(0xff5a12, 26, 18, 2)
    light.position.set(2.9, 3.4, 0)
    g.add(light)
    this.scene.add(g)
    this.addCollider(x - 1.2, z, 4.2, 4.4)
    this.smokeEmitters.push(new THREE.Vector3(x + 2.4, 2.6, z))
    this.animated.push({ kind: 'fire', light, seed: Math.random() * 10 })
    this.colliders.push({ type: 'box', x: x - 0.8, z, hx: 4.0, hz: 4.0 })
  }

  buildProps() {
    const metal = new THREE.MeshStandardMaterial({ map: this.tex.metal.map, color: 0x6a747b, metalness: 0.85, roughness: 0.42 })
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x20262b, metalness: 0.75, roughness: 0.5 })
    const rust = new THREE.MeshStandardMaterial({ map: this.tex.metal.map, color: 0x7c5d45, metalness: 0.6, roughness: 0.72 })
    const wood = new THREE.MeshStandardMaterial({ color: 0x6e5a3e, roughness: 0.9, metalness: 0.02 })
    const warning = new THREE.MeshStandardMaterial({ map: this.tex.warning, roughness: 0.6, metalness: 0.2 })

    const barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.94, 18)
    const ringGeo = new THREE.TorusGeometry(0.37, 0.028, 6, 20)
    const barrelSpots = [
      [-21.2, -15.4], [-20.3, -16.3], [-24.1, 6.2], [-23.4, 7.4], [20.6, -10.4], [21.8, -9.3],
      [8.4, 23.2], [9.4, 22.4], [-6.8, 24.0], [-14.2, -3.1], [26.8, 13.5], [-28.2, -2.2]
    ]
    barrelSpots.forEach(([x, z], i) => {
      const b = new THREE.Mesh(barrelGeo, i % 4 === 0 ? warning : i % 3 === 0 ? rust : metal)
      b.position.set(x, 0.47, z)
      b.rotation.y = Math.random() * Math.PI
      b.castShadow = true
      this.scene.add(b)
      for (const y of [0.14, 0.8]) {
        const ring = new THREE.Mesh(ringGeo, darkMetal)
        ring.rotation.x = Math.PI / 2
        ring.position.set(x, y, z)
        this.scene.add(ring)
      }
      this.addCircleCollider(x, z, 0.46)
    })

    const crate = (x, z, s, y = 0) => {
      const g = new THREE.Group()
      g.position.set(x, y, z)
      g.rotation.y = rand(-0.2, 0.2)
      const body = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), i2mat(s))
      body.position.y = s / 2
      body.castShadow = true; body.receiveShadow = true
      g.add(body)
      const frameMat = darkMetal
      for (const [w, h, d, px, py, pz] of [
        [s * 1.02, 0.07, 0.07, 0, s * 0.06, s / 2], [s * 1.02, 0.07, 0.07, 0, s * 0.94, s / 2],
        [s * 1.02, 0.07, 0.07, 0, s * 0.06, -s / 2], [s * 1.02, 0.07, 0.07, 0, s * 0.94, -s / 2],
        [0.07, s, 0.07, s / 2, s / 2, s / 2], [0.07, s, 0.07, s / 2, s / 2, -s / 2],
        [0.07, s, 0.07, -s / 2, s / 2, s / 2], [0.07, s, 0.07, -s / 2, s / 2, -s / 2]
      ]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat)
        f.position.set(px, py, pz)
        g.add(f)
      }
      this.scene.add(g)
      this.addCollider(x, z, s * 0.62, s * 0.62)
    }
    function i2mat(s) { return s > 1.1 ? wood : metal }
    crate(-25.8, -21.6, 1.2)
    crate(-24.2, -21.0, 0.8)
    crate(-25.4, -20.2, 0.9, 1.2)
    crate(24.2, 18.4, 1.1)
    crate(25.4, 19.4, 0.8)
    crate(4.4, -22.6, 0.9)
    crate(5.6, -23.2, 0.7)
    crate(-2.6, -23.0, 1.1)

    const pallet = (x, z, ry = 0) => {
      const g = new THREE.Group()
      g.position.set(x, 0, z); g.rotation.y = ry
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 1.2), wood)
        p.position.set(-0.5 + i * 0.25, 0.16, 0)
        p.castShadow = true
        g.add(p)
      }
      for (const sz of [-0.5, 0, 0.5]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.12), wood)
        beam.position.set(0, 0.07, sz)
        g.add(beam)
      }
      this.scene.add(g)
    }
    pallet(6.4, 20.8, 0.1); pallet(7.6, 21.2, 0.2); pallet(-21.4, 14.2, 1.2)
    for (let i = 0; i < 3; i++) {
      const bag = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.28, 0.55, 2, 0.08), new THREE.MeshStandardMaterial({ map: this.tex.sandbag.map, color: 0xa99a72, roughness: 0.96 }))
      bag.position.set(6.4, 0.34 + i * 0.26, 20.8)
      bag.rotation.y = rand(-0.1, 0.1)
      bag.castShadow = true
      this.scene.add(bag)
    }

    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffc27a })
    const bulbGeo = new THREE.SphereGeometry(0.11, 10, 8)
    for (const [x, z, ry] of [[-16, -5.5, 0.4], [16, -5.5, -0.4], [-16, 7, Math.PI], [16, 7, Math.PI]]) {
      const g = new THREE.Group()
      g.position.set(x, 0, z)
      g.rotation.y = ry
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 3.4, 8), metal)
      pole.position.y = 1.7
      pole.castShadow = true
      g.add(pole)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.07), metal)
      arm.position.set(0.6, 3.4, 0)
      g.add(arm)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.34), darkMetal)
      head.position.set(1.15, 3.3, 0)
      g.add(head)
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), bulbMat)
      lens.position.set(1.15, 3.18, 0)
      lens.rotation.x = Math.PI / 2
      g.add(lens)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color: 0xffb36a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
      glow.scale.set(1.5, 1.5, 1)
      glow.position.set(1.15, 3.1, 0)
      g.add(glow)
      this.scene.add(g)
      this.addCircleCollider(x, z, 0.3)
    }

    const cableMat = new THREE.LineBasicMaterial({ color: 0x10171c, transparent: true, opacity: 0.85 })
    const cablePoints = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      const x = -25.5 + t * 51
      const y = 8.2 - Math.sin(t * Math.PI) * 1.35
      cablePoints.push(new THREE.Vector3(x, y, 20.5))
    }
    const curve = new THREE.CatmullRomCurve3(cablePoints)
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), cableMat)
    this.scene.add(cable)

    this.addBeam(new THREE.Vector3(24.5, 7.6, -24.5), new THREE.Vector3(6, 0.1, -8), 4.6, 0xffb060, 0.055)
    this.addBeam(new THREE.Vector3(-25.5, 7.6, 20.5), new THREE.Vector3(-6, 0.1, 8), 4.2, 0xffb060, 0.045)
    this.addBeam(new THREE.Vector3(16, 3.15, 7), new THREE.Vector3(13.6, 0.1, 7), 2.4, 0xffa050, 0.05)

    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a })
    const hazardGeo = new THREE.BoxGeometry(0.34, 0.055, 0.1)
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2
      const hz = new THREE.Mesh(hazardGeo, hazardMat.clone())
      hz.position.set(Math.cos(a) * 8.2, 0.05, Math.sin(a) * 8.2)
      hz.rotation.y = -a
      this.scene.add(hz)
      this.animated.push({ kind: 'hazard', mat: hz.material, seed: i * 0.55 })
    }

    const signTex = labelTexture('DANGER // LIVE FIRE', { color: '#ffd6d0', border: '#ff4030', bg: 'rgba(30,6,5,0.94)' })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.72), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }))
    sign.position.set(6.6, 1.55, 13.18)
    sign.rotation.y = Math.PI
    this.scene.add(sign)

    const flagMat = new THREE.MeshStandardMaterial({ color: 0x7d1f12, side: THREE.DoubleSide, roughness: 0.9 })
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 4.2, 8), metal)
    flagPole.position.set(27.5, 2.1, 20.5)
    this.scene.add(flagPole)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85, 6, 3), flagMat)
    flag.position.set(28.25, 3.6, 20.5)
    this.scene.add(flag)
    this.flag = flag
    this.flagBase = flag.geometry.attributes.position.array.slice()

    const wireMat = new THREE.MeshStandardMaterial({ color: 0x0d1114, metalness: 0.8, roughness: 0.6 })
    for (const [x, z, ry] of [[-7, 12.3, 0.2], [8.2, 11.4, -0.3], [-19, -9.2, 1.1]]) {
      const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), concreteMatFallback(this.tex))
      rubble.position.set(x, 0.2, z)
      rubble.rotation.set(rand(0, 2), rand(0, 2), rand(0, 2))
      rubble.scale.set(rand(0.8, 1.7), rand(0.5, 1.0), rand(0.8, 1.5))
      rubble.castShadow = true
      this.scene.add(rubble)
    }
    function concreteMatFallback(tex) {
      return new THREE.MeshStandardMaterial({ map: tex.concrete.map, color: 0x80888c, roughness: 0.95, metalness: 0.05 })
    }
    const wireSpool = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 20), darkMetal)
    wireSpool.rotation.z = Math.PI / 2
    wireSpool.position.set(-5.6, 0.55, 11.2)
    this.scene.add(wireSpool)
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 24), wireMat)
    wire.position.set(-5.6, 0.55, 11.2)
    wire.rotation.y = Math.PI / 2
    this.scene.add(wire)
  }

  buildSkyline() {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.city, fog: true, color: 0x9fb3c4 })
    const geo = new THREE.BoxGeometry(1, 1, 1)
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rand(-0.04, 0.04)
      const r = rand(96, 142)
      const w = rand(6, 18), h = rand(10, 42), d = rand(6, 16)
      const m = new THREE.Mesh(geo, mat)
      m.scale.set(w, h, d)
      m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r)
      m.rotation.y = rand(-0.4, 0.4)
      this.scene.add(m)
    }
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2b1a })
    for (const [x, y, z] of [[-82, 32, -54], [64, 26, -76], [88, 38, 32], [-56, 24, 82], [22, 30, -96]]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), redMat)
      dot.position.set(x, y, z)
      this.scene.add(dot)
      this.animated.push({ kind: 'beacon', mat: redMat, glow: null, seed: Math.random() * 10, slow: true, mesh: dot })
    }
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x1c2429, metalness: 0.8, roughness: 0.5 })
    for (const [x, z, h] of [[-54, -62, 44], [58, -54, 38], [76, 66, 30]]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, h, 6), towerMat)
      tower.position.set(x, h / 2, z)
      this.scene.add(tower)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 0.4), towerMat)
      arm.position.set(x, h - 4, z)
      arm.rotation.y = 0.6
      this.scene.add(arm)
    }
  }

  buildAtmosphere() {
    const puffGeo = new THREE.BufferGeometry()
    const count = 90
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(-8, 8)
      pos[i * 3 + 1] = rand(0, 12)
      pos[i * 3 + 2] = rand(-8, 8)
    }
    puffGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.smoke = new THREE.Points(puffGeo, new THREE.PointsMaterial({
      map: this.tex.soft, color: 0x23262a, size: 2.6, transparent: true, opacity: 0.16,
      depthWrite: false, sizeAttenuation: true
    }))
    this.smoke.frustumCulled = false
    this.smoke.position.copy(this.smokeEmitters[0])
    this.scene.add(this.smoke)
    this.smokeSeed = pos.slice()
  }

  buildDust() {
    const count = 420
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand(-30, 30)
      pos[i * 3 + 1] = rand(0.2, 12)
      pos[i * 3 + 2] = rand(-30, 30)
      const warm = Math.random() > 0.6
      col[i * 3] = warm ? 1 : 0.55
      col[i * 3 + 1] = warm ? 0.72 : 0.78
      col[i * 3 + 2] = warm ? 0.42 : 0.95
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this.tex.soft, size: 0.14, transparent: true, opacity: 0.45, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }))
    this.dust.frustumCulled = false
    this.scene.add(this.dust)
  }

  buildRain() {
    const count = this.quality === 'performance' ? 420 : this.quality === 'high' ? 1100 : 760
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 6)
    this.rainCount = count
    this.rainData = []
    for (let i = 0; i < count; i++) {
      const x = rand(-32, 32), y = rand(0, 26), z = rand(-32, 32)
      const len = rand(0.35, 0.85)
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z
      pos[i * 6 + 3] = x + 0.05; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z
      this.rainData.push({ len, speed: rand(16, 26) })
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x9fc4e0, transparent: true, opacity: 0.26, depthWrite: false, fog: true
    }))
    this.rain.frustumCulled = false
    this.scene.add(this.rain)
    this.rainPos = pos
  }

  addBeam(from, to, radius, color, opacity) {
    const dir = new THREE.Vector3().subVectors(to, from)
    const len = dir.length()
    const geo = new THREE.ConeGeometry(radius, len, 26, 1, true)
    geo.translate(0, -len / 2, 0)
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: true
    })
    const cone = new THREE.Mesh(geo, mat)
    cone.position.copy(from)
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate())
    this.scene.add(cone)
    const lens = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color, transparent: true, opacity: Math.min(0.9, opacity * 9), blending: THREE.AdditiveBlending, depthWrite: false }))
    lens.position.copy(from)
    lens.scale.set(1.6, 1.6, 1)
    this.scene.add(lens)
    this.animated.push({ kind: 'beam', mat, base: opacity, seed: Math.random() * 10 })
    return cone
  }

  resolveCircle(pos, radius) {
    for (const c of this.colliders) {
      if (c.type === 'circle') {
        const dx = pos.x - c.x, dz = pos.z - c.z
        const d = Math.hypot(dx, dz)
        const min = radius + c.r
        if (d < min && d > 1e-4) {
          pos.x = c.x + dx / d * min
          pos.z = c.z + dz / d * min
        }
      } else {
        const dx = pos.x - c.x, dz = pos.z - c.z
        const px = c.hx + radius - Math.abs(dx)
        const pz = c.hz + radius - Math.abs(dz)
        if (px > 0 && pz > 0) {
          if (px < pz) pos.x = c.x + Math.sign(dx || 1) * (c.hx + radius)
          else pos.z = c.z + Math.sign(dz || 1) * (c.hz + radius)
        }
      }
    }
    const bound = 30.2
    pos.x = Math.max(-bound, Math.min(bound, pos.x))
    pos.z = Math.max(-bound, Math.min(bound, pos.z))
  }

  update(dt, time, playerPos) {
    this.time = time
    this.sky.position.copy(playerPos)
    this.sky.material.uniforms.time.value = time
    this.moon.lookAt(playerPos)
    this.dirLight.position.set(playerPos.x - 38, 48, playerPos.z - 46)
    this.dirLight.target.position.set(playerPos.x, 0, playerPos.z)
    this.dirLight.target.updateMatrixWorld()

    for (const a of this.animated) {
      if (a.kind === 'lightflicker') {
        const f = 0.9 + Math.sin(time * 17 + a.seed) * 0.05 + Math.sin(time * 41 + a.seed * 2) * 0.04
        a.light.intensity = a.base * f
      } else if (a.kind === 'beacon') {
        const on = Math.sin(time * 2.2 + a.seed) > 0.1
        a.mat.color.setHex(on ? 0xff2a1a : 0x330a06)
        if (a.glow) a.glow.material.opacity = on ? 0.85 : 0.1
        if (a.mesh) a.mesh.visible = on || a.slow
      } else if (a.kind === 'fire') {
        a.light.intensity = 18 + Math.sin(time * 23 + a.seed) * 7 + Math.random() * 5
      } else if (a.kind === 'hazard') {
        a.mat.opacity = 0.55 + Math.sin(time * 2.4 + a.seed) * 0.35
      } else if (a.kind === 'beam') {
        a.mat.opacity = a.base * (0.82 + Math.sin(time * 3.1 + a.seed) * 0.18)
      }
    }

    if (this.flag) {
      const p = this.flag.geometry.attributes.position
      const base = this.flagBase
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1]
        p.array[i * 3 + 2] = Math.sin(x * 4 + time * 6) * 0.09 * (x + 0.75)
        p.array[i * 3 + 1] = y + Math.sin(x * 3 + time * 4.5) * 0.03
      }
      p.needsUpdate = true
    }

    if (this.smoke) {
      const p = this.smoke.geometry.attributes.position
      for (let i = 0; i < p.count; i++) {
        let y = p.array[i * 3 + 1] + dt * (1.6 + (i % 5) * 0.24)
        let x = p.array[i * 3] + Math.sin(time * 0.8 + i) * dt * 0.24
        if (y > 13) {
          y = rand(0, 2)
          x = rand(-8, 8)
          p.array[i * 3 + 2] = rand(-8, 8)
        }
        p.array[i * 3] = x
        p.array[i * 3 + 1] = y
      }
      p.needsUpdate = true
      this.smoke.position.set(this.smokeEmitters[0].x, 0.3, this.smokeEmitters[0].z)
    }

    if (this.dust) {
      const p = this.dust.geometry.attributes.position
      for (let i = 0; i < p.count; i++) {
        p.array[i * 3] += Math.sin(time * 0.3 + i) * dt * 0.12
        p.array[i * 3 + 1] += Math.cos(time * 0.22 + i * 1.7) * dt * 0.06
        if (p.array[i * 3 + 1] > 13) p.array[i * 3 + 1] = 0.2
      }
      p.needsUpdate = true
    }

    if (this.rain) {
      this.rain.position.set(playerPos.x, 0, playerPos.z)
      const p = this.rainPos
      for (let i = 0; i < this.rainCount; i++) {
        const d = this.rainData[i]
        let y = p[i * 6 + 1] - d.speed * dt
        let x = p[i * 6] + dt * 2.1
        if (y < -1) { y = rand(22, 28); x = rand(-32, 32); p[i * 6 + 2] = rand(-32, 32) }
        if (x > 32) x -= 64
        p[i * 6] = x; p[i * 6 + 1] = y
        p[i * 6 + 3] = x + 0.09; p[i * 6 + 4] = y - d.len; p[i * 6 + 5] = p[i * 6 + 2]
      }
      this.rain.geometry.attributes.position.needsUpdate = true
    }
  }
}
