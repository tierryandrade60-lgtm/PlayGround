import * as THREE from 'three'

const PARTICLE_VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (320.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`

const PARTICLE_FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    if (tex.a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
  }`

class ParticlePool {
  constructor(scene, texture, count, additive = true) {
    this.count = count
    this.cursor = 0
    this.pos = new Float32Array(count * 3)
    this.col = new Float32Array(count * 3)
    this.size = new Float32Array(count)
    this.alpha = new Float32Array(count)
    this.vel = new Float32Array(count * 3)
    this.life = new Float32Array(count)
    this.maxLife = new Float32Array(count)
    this.gravity = new Float32Array(count)
    this.drag = new Float32Array(count)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1))
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1))
    this.geo = geo
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, tint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = 4
    scene.add(points)
    this.points = points
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, gravity = 0, drag = 1.5) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.count
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b
    this.size[i] = size
    this.alpha[i] = 1
    this.life[i] = life
    this.maxLife[i] = life
    this.gravity[i] = gravity
    this.drag[i] = drag
  }

  update(dt) {
    const p = this.pos, v = this.vel
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue }
      this.life[i] -= dt
      const d = Math.max(0, 1 - this.drag[i] * dt)
      v[i * 3] *= d; v[i * 3 + 1] = v[i * 3 + 1] * d - this.gravity[i] * dt; v[i * 3 + 2] *= d
      p[i * 3] += v[i * 3] * dt
      p[i * 3 + 1] += v[i * 3 + 1] * dt
      p[i * 3 + 2] += v[i * 3 + 2] * dt
      this.alpha[i] = Math.max(0, this.life[i] / this.maxLife[i])
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.alpha.needsUpdate = true
    this.geo.attributes.size.needsUpdate = true
    this.geo.attributes.color.needsUpdate = true
  }
}

export class Effects {
  constructor(scene, textures) {
    this.scene = scene
    this.tex = textures
    this.sparks = new ParticlePool(scene, textures.soft, 520, true)
    this.smoke = new ParticlePool(scene, textures.soft, 220, false)
    this.sparks.points.material.uniforms.tint.value.setRGB(1, 1, 1)
    this.smoke.points.material.uniforms.tint.value.setRGB(1, 1, 1)

    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true)
    this.tracers = []
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      const mesh = new THREE.Mesh(this.tracerGeo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      scene.add(mesh)
      this.tracers.push({ mesh, life: 0 })
    }
    this.tracerCursor = 0

    const decalGeo = new THREE.PlaneGeometry(0.26, 0.26)
    this.decals = []
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: textures.scorch, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
      const mesh = new THREE.Mesh(decalGeo, mat)
      mesh.visible = false
      this.scene.add(mesh)
      this.decals.push({ mesh, life: 0 })
    }
    this.decalCursor = 0

    this.numbers = []
    this.flashLights = []
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffa860, 0, 12, 2)
      scene.add(light)
      this.flashLights.push({ light, life: 0 })
    }
    this.flashCursor = 0

    this.tmpV = new THREE.Vector3()
    this.tmpQ = new THREE.Quaternion()
  }

  spawnTracer(from, to, color = 0xffd28a, width = 1) {
    const t = this.tracers[this.tracerCursor]
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length
    const dir = this.tmpV.copy(to).sub(from)
    const len = dir.length()
    if (len < 0.01) return
    t.mesh.position.copy(from).addScaledVector(dir, 0.5)
    t.mesh.scale.set(width, len, width)
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    t.mesh.material.color.setHex(color)
    t.mesh.material.opacity = 0.9
    t.mesh.visible = true
    t.life = 0.11
  }

  impact(point, normal, { color = 0xffb060, sparks = 9, decal = true, smoke = true } = {}) {
    const c = new THREE.Color(color)
    for (let i = 0; i < sparks; i++) {
      const v = new THREE.Vector3(normal.x + (Math.random() - 0.5) * 1.6, normal.y + Math.random() * 1.5, normal.z + (Math.random() - 0.5) * 1.6).normalize().multiplyScalar(1.6 + Math.random() * 5)
      this.sparks.spawn(point.x, point.y, point.z, v.x, v.y, v.z, c.clone().offsetHSL(0, 0, Math.random() * 0.2 - 0.05), 0.035 + Math.random() * 0.05, 0.25 + Math.random() * 0.4, 9, 2.2)
    }
    if (smoke) {
      for (let i = 0; i < 3; i++) {
        this.smoke.spawn(point.x + normal.x * 0.06, point.y + normal.y * 0.06, point.z + normal.z * 0.06,
          normal.x * 0.5 + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.4, normal.z * 0.5 + (Math.random() - 0.5) * 0.4,
          new THREE.Color(0x555049), 0.28 + Math.random() * 0.2, 0.5 + Math.random() * 0.6, -0.2, 1.2)
      }
    }
    if (decal) this.addDecal(point, normal)
  }

  addDecal(point, normal) {
    const d = this.decals[this.decalCursor]
    this.decalCursor = (this.decalCursor + 1) % this.decals.length
    d.mesh.position.copy(point).addScaledVector(normal, 0.012)
    d.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    d.mesh.rotateZ(Math.random() * Math.PI * 2)
    const s = 0.65 + Math.random() * 0.6
    d.mesh.scale.set(s, s, s)
    d.mesh.material.opacity = 0.95
    d.mesh.visible = true
    d.life = 9
  }

  muzzle(x, y, z, dir, color = 0xffc070) {
    const light = this.flashLights[this.flashCursor]
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length
    light.light.position.set(x, y, z)
    light.light.color.setHex(color)
    light.light.intensity = 45
    light.life = 0.07
    for (let i = 0; i < 5; i++) {
      const vx = dir.x * (2 + Math.random() * 6) + (Math.random() - 0.5) * 1.6
      const vy = dir.y * (2 + Math.random() * 6) + (Math.random() - 0.5) * 1.6 + 0.4
      const vz = dir.z * (2 + Math.random() * 6) + (Math.random() - 0.5) * 1.6
      this.sparks.spawn(x, y, z, vx, vy, vz, new THREE.Color(0xffc070), 0.03 + Math.random() * 0.04, 0.12 + Math.random() * 0.18, 1, 3)
    }
    for (let i = 0; i < 2; i++) {
      this.smoke.spawn(x, y, z, dir.x * 0.7 + (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.4, dir.z * 0.7 + (Math.random() - 0.5) * 0.3, new THREE.Color(0x8a8378), 0.18 + Math.random() * 0.16, 0.5 + Math.random() * 0.5, -0.3, 1.4)
    }
  }

  ejectShell(pos, dir) {
    this.sparks.spawn(pos.x, pos.y, pos.z, dir.x * 2 + 1.2, 1.6 + Math.random(), dir.z * 2 + 0.4, new THREE.Color(0xd8a24c), 0.05, 1.2, 9, 0.6)
  }

  enemyHit(point, normal, head = false) {
    const color = head ? 0xffd37a : 0xff8a3a
    for (let i = 0; i < (head ? 14 : 7); i++) {
      const v = new THREE.Vector3(normal.x + (Math.random() - 0.5) * 1.8, normal.y + (Math.random() - 0.5) * 1.8 + 0.4, normal.z + (Math.random() - 0.5) * 1.8).normalize().multiplyScalar(2 + Math.random() * 5)
      this.sparks.spawn(point.x, point.y, point.z, v.x, v.y, v.z, new THREE.Color(color), 0.035 + Math.random() * 0.05, 0.2 + Math.random() * 0.35, 7, 2)
    }
    this.smoke.spawn(point.x, point.y, point.z, 0.3, 0.4, 0.3, new THREE.Color(0x2a2a2a), 0.22, 0.5, 0, 1)
  }

  enemyDeath(pos) {
    this.explosion(pos.clone().add(new THREE.Vector3(0, 0.7, 0)), 0xff7a30, 34)
    for (let i = 0; i < 10; i++) {
      this.smoke.spawn(pos.x, pos.y + 0.4, pos.z, (Math.random() - 0.5) * 1.4, 0.5 + Math.random(), (Math.random() - 0.5) * 1.4, new THREE.Color(0x2c2e2e), 0.55 + Math.random() * 0.5, 1.2 + Math.random(), -0.3, 1.1)
    }
  }

  explosion(pos, color = 0xff8a30, count = 60) {
    const c = new THREE.Color(color)
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1)
      const sp = 3 + Math.random() * 11
      this.sparks.spawn(pos.x, pos.y, pos.z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 1, Math.sin(ph) * Math.sin(th) * sp,
        c.clone().offsetHSL((Math.random() - 0.5) * 0.08, 0, Math.random() * 0.15), 0.06 + Math.random() * 0.1, 0.4 + Math.random() * 0.8, 8, 1.1)
    }
    for (let i = 0; i < 12; i++) {
      this.smoke.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 2, new THREE.Color(0x3a3532), 0.8 + Math.random() * 0.8, 1.4 + Math.random(), -0.5, 0.9)
    }
    const light = this.flashLights[this.flashCursor]
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length
    light.light.position.copy(pos)
    light.light.color.setHex(color)
    light.light.intensity = 120
    light.life = 0.18
  }

  damageNumber(pos, text, color = '#ffd58a', size = 1) {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 128
    const ctx = c.getContext('2d')
    ctx.font = '700 76px "Chakra Petch", "Arial Narrow", sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10
    ctx.fillStyle = color
    ctx.fillText(text, 128, 66)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.position.copy(pos)
    sprite.scale.set(0.85 * size, 0.42 * size, 1)
    sprite.renderOrder = 10
    this.scene.add(sprite)
    this.numbers.push({ sprite, life: 0.9, max: 0.9, vy: 1.25, seed: Math.random() * 10 })
    if (this.numbers.length > 26) {
      const old = this.numbers.shift()
      this.scene.remove(old.sprite); old.sprite.material.map.dispose(); old.sprite.material.dispose()
    }
  }

  update(dt, camera) {
    this.sparks.update(dt)
    this.smoke.update(dt)
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue
      t.life -= dt
      t.mesh.material.opacity = Math.max(0, t.life / 0.11) * 0.9
      if (t.life <= 0) t.mesh.visible = false
    }
    for (const d of this.decals) {
      if (!d.mesh.visible) continue
      d.life -= dt
      if (d.life < 1.5) d.mesh.material.opacity = Math.max(0, d.life / 1.5) * 0.95
      if (d.life <= 0) d.mesh.visible = false
    }
    for (const l of this.flashLights) {
      if (l.life > 0) {
        l.life -= dt
        l.light.intensity *= Math.max(0, 1 - dt * 18)
        if (l.life <= 0) l.light.intensity = 0
      }
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i]
      n.life -= dt
      n.sprite.position.y += n.vy * dt
      n.vy *= Math.max(0, 1 - dt * 3)
      const a = Math.min(1, n.life / (n.max * 0.5))
      n.sprite.material.opacity = a
      n.sprite.scale.x += dt * 0.06
      n.sprite.scale.y += dt * 0.03
      if (n.life <= 0) {
        this.scene.remove(n.sprite)
        n.sprite.material.map.dispose()
        n.sprite.material.dispose()
        this.numbers.splice(i, 1)
      }
    }
  }
}
