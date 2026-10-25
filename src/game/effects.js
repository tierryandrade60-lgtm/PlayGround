import * as THREE from 'three'
import { sparkTexture, smokeTexture, bulletHoleTexture, muzzleFlashTexture, makeGlowTexture } from '../textures.js'

const MAX_SPARKS = 420
const MAX_SMOKE = 22
const MAX_TRACERS = 26
const MAX_DECALS = 44
const MAX_SHELLS = 24
const MAX_FLASHES = 12

const Z_AXIS = new THREE.Vector3(0, 0, 1)

export class Effects {
  constructor(scene) {
    this.scene = scene
    this.sparkTexture = sparkTexture()
    this.smokeTexture = smokeTexture()
    this.glowWarm = makeGlowTexture('#ffb066')
    this.glowRed = makeGlowTexture('#ff4433')
    this.buildSparks()
    this.buildSmoke()
    this.buildTracers()
    this.buildDecals()
    this.buildShells()
    this.buildFlashes()
    this.buildExplosion()
  }

  buildSparks() {
    this.sparkPos = new Float32Array(MAX_SPARKS * 3)
    this.sparkVel = new Float32Array(MAX_SPARKS * 3)
    this.sparkColor = new Float32Array(MAX_SPARKS * 3)
    this.sparkBase = new Float32Array(MAX_SPARKS * 3)
    this.sparkLife = new Float32Array(MAX_SPARKS)
    this.sparkMax = new Float32Array(MAX_SPARKS)
    for (let i = 0; i < MAX_SPARKS; i += 1) this.sparkPos[i * 3 + 1] = -999
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColor, 3))
    const material = new THREE.PointsMaterial({
      map: this.sparkTexture,
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
    this.sparks = new THREE.Points(geometry, material)
    this.sparks.frustumCulled = false
    this.sparks.renderOrder = 4
    this.scene.add(this.sparks)
    this.sparkCursor = 0
  }

  buildSmoke() {
    this.smokes = []
    for (let i = 0; i < MAX_SMOKE; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.smokeTexture,
        color: 0x8b8f92,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending
      })
      const sprite = new THREE.Sprite(material)
      sprite.visible = false
      sprite.renderOrder = 3
      this.scene.add(sprite)
      this.smokes.push({ sprite, life: 0, max: 1, velocity: new THREE.Vector3(), grow: 1, baseOpacity: 0.3, spin: 0 })
    }
    this.smokeCursor = 0
  }

  buildTracers() {
    this.tracers = []
    for (let i = 0; i < MAX_TRACERS; i += 1) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const material = new THREE.LineBasicMaterial({
        color: 0xffd39a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
      const line = new THREE.Line(geometry, material)
      line.frustumCulled = false
      line.visible = false
      line.renderOrder = 4
      this.scene.add(line)
      this.tracers.push({ line, life: 0, max: 0.08 })
    }
    this.tracerCursor = 0
  }

  buildDecals() {
    this.decals = []
    const geometry = new THREE.PlaneGeometry(0.24, 0.24)
    for (let i = 0; i < MAX_DECALS; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: bulletHoleTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      mesh.renderOrder = 2
      this.scene.add(mesh)
      this.decals.push({ mesh, life: 0, max: 26 })
    }
    this.decalCursor = 0
  }

  buildShells() {
    this.shells = []
    const geometry = new THREE.CylinderGeometry(0.011, 0.013, 0.055, 7)
    const material = new THREE.MeshStandardMaterial({ color: 0xc9a35a, metalness: 0.92, roughness: 0.28 })
    for (let i = 0; i < MAX_SHELLS; i += 1) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      mesh.castShadow = false
      this.scene.add(mesh)
      this.shells.push({
        mesh,
        life: 0,
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        bounced: false
      })
    }
    this.shellCursor = 0
  }

  buildFlashes() {
    this.flashes = []
    for (let i = 0; i < MAX_FLASHES; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: muzzleFlashTexture(),
        color: 0xffc477,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
      const sprite = new THREE.Sprite(material)
      sprite.visible = false
      sprite.renderOrder = 5
      this.scene.add(sprite)
      this.flashes.push({ sprite, life: 0, max: 0.055 })
    }
    this.flashCursor = 0
  }

  buildExplosion() {
    this.blastLight = new THREE.PointLight(0xffa04a, 0, 30, 2)
    this.blastLight.position.set(0, -50, 0)
    this.scene.add(this.blastLight)
    this.blastLife = 0
    this.rings = []
    for (let i = 0; i < 4; i += 1) {
      const geometry = new THREE.RingGeometry(0.6, 0.9, 40)
      const material = new THREE.MeshBasicMaterial({
        color: 0xffb066,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      mesh.renderOrder = 4
      this.scene.add(mesh)
      this.rings.push({ mesh, life: 0, max: 0.7 })
    }
    this.ringCursor = 0
    this.flares = []
  }

  tracer(from, to, color = 0xffd39a) {
    const item = this.tracers[this.tracerCursor]
    this.tracerCursor = (this.tracerCursor + 1) % MAX_TRACERS
    const pos = item.line.geometry.attributes.position
    pos.array[0] = from.x
    pos.array[1] = from.y
    pos.array[2] = from.z
    pos.array[3] = to.x
    pos.array[4] = to.y
    pos.array[5] = to.z
    pos.needsUpdate = true
    item.line.material.color.set(color)
    item.line.material.opacity = 0.9
    item.line.visible = true
    item.life = 0.075
    item.max = 0.075
  }

  flash(position, scale = 1, color = 0xffc477) {
    const item = this.flashes[this.flashCursor]
    this.flashCursor = (this.flashCursor + 1) % MAX_FLASHES
    item.sprite.position.copy(position)
    item.sprite.scale.set(scale * (0.9 + Math.random() * 0.5), scale * (0.9 + Math.random() * 0.5), 1)
    item.sprite.material.color.set(color)
    item.sprite.material.rotation = Math.random() * Math.PI * 2
    item.sprite.material.opacity = 0.95
    item.sprite.visible = true
    item.life = 0.05
    item.max = 0.05
  }

  impact(point, normal, surface = 'concrete') {
    const flesh = surface === 'flesh'
    if (!flesh) this.decal(point, normal)
    const metal = surface === 'metal'
    const count = flesh ? 8 : metal ? 16 : 11
    const base = new THREE.Color(flesh ? 0xff4a36 : metal ? 0xffb066 : 0xd8cdb8)
    const accent = new THREE.Color(flesh ? 0xff2418 : metal ? 0xfff0c0 : 0xffa858)
    for (let i = 0; i < count; i += 1) {
      const dir = normal.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.9 + 0.1, (Math.random() - 0.5) * 1.2)).normalize()
      const speed = metal ? 2.5 + Math.random() * 5 : 1 + Math.random() * 2.6
      this.spawnSpark(point, dir.multiplyScalar(speed), Math.random() > 0.6 ? accent : base, 0.22 + Math.random() * 0.42)
    }
    this.smoke(
      point.clone().addScaledVector(normal, 0.06),
      flesh ? 0.22 : 0.32 + Math.random() * 0.25,
      flesh ? 0.5 : 0.42,
      0.03,
      flesh ? 0x7a2a22 : metal ? 0x777c80 : 0x9a938a,
      flesh ? 0.2 : 0.16
    )
    if (metal) this.flash(point.clone().addScaledVector(normal, 0.03), 0.32, 0xffb066)
  }

  decal(point, normal) {
    const item = this.decals[this.decalCursor]
    this.decalCursor = (this.decalCursor + 1) % MAX_DECALS
    item.mesh.position.copy(point).addScaledVector(normal, 0.013)
    item.mesh.quaternion.setFromUnitVectors(Z_AXIS, normal)
    item.mesh.rotateZ(Math.random() * Math.PI * 2)
    const scale = 0.75 + Math.random() * 0.8
    item.mesh.scale.setScalar(scale)
    item.mesh.material.opacity = 0.95
    item.mesh.visible = true
    item.life = item.max
  }

  spawnSpark(position, velocity, color, life) {
    const index = this.sparkCursor
    this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS
    const i3 = index * 3
    this.sparkPos[i3] = position.x
    this.sparkPos[i3 + 1] = position.y
    this.sparkPos[i3 + 2] = position.z
    this.sparkVel[i3] = velocity.x
    this.sparkVel[i3 + 1] = velocity.y
    this.sparkVel[i3 + 2] = velocity.z
    this.sparkBase[i3] = color.r
    this.sparkBase[i3 + 1] = color.g
    this.sparkBase[i3 + 2] = color.b
    this.sparkColor[i3] = color.r
    this.sparkColor[i3 + 1] = color.g
    this.sparkColor[i3 + 2] = color.b
    this.sparkLife[index] = life
    this.sparkMax[index] = life
  }

  smoke(position, scale = 0.4, lifetime = 1.2, rise = 0.2, color = 0x8b8f92, opacity = 0.3) {
    const item = this.smokes[this.smokeCursor]
    this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE
    item.sprite.position.copy(position)
    item.sprite.scale.set(scale, scale, 1)
    item.sprite.material.color.set(color)
    item.sprite.material.opacity = opacity
    item.sprite.material.rotation = Math.random() * Math.PI * 2
    item.sprite.visible = true
    item.life = lifetime
    item.max = lifetime
    item.baseOpacity = opacity
    item.grow = scale * (1.6 + Math.random())
    item.velocity.set((Math.random() - 0.5) * 0.35, rise + Math.random() * 0.25, (Math.random() - 0.5) * 0.35)
    item.spin = (Math.random() - 0.5) * 0.4
  }

  muzzleSmoke(position, direction) {
    this.smoke(position.clone().addScaledVector(direction, 0.1), 0.16, 0.7, 0.25, 0xb8b2a8, 0.1)
  }

  shell(position, direction) {
    const item = this.shells[this.shellCursor]
    this.shellCursor = (this.shellCursor + 1) % MAX_SHELLS
    item.mesh.position.copy(position)
    item.mesh.visible = true
    item.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
    item.velocity.copy(direction).multiplyScalar(2.2 + Math.random() * 1.5)
    item.velocity.x += (Math.random() - 0.5) * 0.6
    item.velocity.y += 1.6 + Math.random() * 0.9
    item.velocity.z += (Math.random() - 0.5) * 0.6
    item.spin.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22)
    item.life = 4.5
    item.bounced = false
  }

  killBurst(position) {
    const red = new THREE.Color(0xff3b2b)
    const warm = new THREE.Color(0xffb066)
    for (let i = 0; i < 22; i += 1) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 2).normalize()
      this.spawnSpark(position, dir.multiplyScalar(1 + Math.random() * 3.4), Math.random() > 0.5 ? red : warm, 0.3 + Math.random() * 0.5)
    }
    this.smoke(position, 0.55, 1.6, 0.45, 0x6f3c36, 0.22)
    this.flash(position, 0.8, 0xff5a3c)
  }

  spawnFlare(position) {
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowRed,
      color: 0xff3322,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    }))
    flare.position.copy(position)
    flare.scale.set(1.5, 1.5, 1)
    this.scene.add(flare)
    this.smoke(position, 0.7, 1.8, 0.6, 0x552018, 0.3)
    this.flares.push({ mesh: flare, life: 1.2, max: 1.2 })
    for (let i = 0; i < 10; i += 1) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 1.5, (Math.random() - 0.5) * 1.4).normalize()
      this.spawnSpark(position, dir.multiplyScalar(2 + Math.random() * 3), new THREE.Color(0xff4433), 0.4 + Math.random() * 0.4)
    }
  }

  explode(position) {
    this.blastLight.position.copy(position).add(new THREE.Vector3(0, 0.6, 0))
    this.blastLight.intensity = 420
    this.blastLife = 0.42
    const ring = this.rings[this.ringCursor]
    this.ringCursor = (this.ringCursor + 1) % this.rings.length
    ring.mesh.position.copy(position)
    ring.mesh.scale.setScalar(0.6)
    ring.mesh.material.opacity = 0.85
    ring.mesh.visible = true
    ring.life = 0.7
    ring.max = 0.7
    const warm = new THREE.Color(0xffb066)
    const hot = new THREE.Color(0xfff2c8)
    for (let i = 0; i < 70; i += 1) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2).normalize()
      this.spawnSpark(position, dir.multiplyScalar(3 + Math.random() * 11), Math.random() > 0.5 ? warm : hot, 0.4 + Math.random() * 0.9)
    }
    for (let i = 0; i < 6; i += 1) {
      this.smoke(
        position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 1.4, (Math.random() - 0.5) * 2.4)),
        1.3 + Math.random() * 1.2,
        1.8 + Math.random() * 1.4,
        0.5,
        0x3a3532,
        0.28
      )
    }
  }

  update(dt) {
    const positions = this.sparks.geometry.attributes.position
    const colors = this.sparks.geometry.attributes.color
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      if (this.sparkLife[i] <= 0) continue
      const i3 = i * 3
      this.sparkLife[i] -= dt
      if (this.sparkLife[i] <= 0) {
        this.sparkPos[i3 + 1] = -999
        this.sparkColor[i3] = 0
        this.sparkColor[i3 + 1] = 0
        this.sparkColor[i3 + 2] = 0
        continue
      }
      this.sparkVel[i3 + 1] -= 14 * dt
      this.sparkPos[i3] += this.sparkVel[i3] * dt
      this.sparkPos[i3 + 1] += this.sparkVel[i3 + 1] * dt
      this.sparkPos[i3 + 2] += this.sparkVel[i3 + 2] * dt
      if (this.sparkPos[i3 + 1] < 0.02) {
        this.sparkPos[i3 + 1] = 0.02
        this.sparkVel[i3 + 1] *= -0.32
        this.sparkVel[i3] *= 0.62
        this.sparkVel[i3 + 2] *= 0.62
      }
      const fade = Math.max(0, this.sparkLife[i] / this.sparkMax[i])
      this.sparkColor[i3] = this.sparkBase[i3] * fade
      this.sparkColor[i3 + 1] = this.sparkBase[i3 + 1] * fade
      this.sparkColor[i3 + 2] = this.sparkBase[i3 + 2] * fade
    }
    positions.needsUpdate = true
    colors.needsUpdate = true

    for (const item of this.smokes) {
      if (item.life <= 0) continue
      item.life -= dt
      if (item.life <= 0) {
        item.sprite.visible = false
        continue
      }
      const t = 1 - item.life / item.max
      const size = THREE.MathUtils.lerp(item.sprite.scale.x, item.grow, dt * 1.4)
      item.sprite.scale.set(size, size, 1)
      item.sprite.position.addScaledVector(item.velocity, dt)
      item.velocity.y += dt * 0.1
      item.sprite.material.opacity = item.baseOpacity * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - t * 0.35)
      item.sprite.material.rotation += item.spin * dt
    }

    for (const item of this.tracers) {
      if (item.life <= 0) continue
      item.life -= dt
      item.line.material.opacity = Math.max(0, item.life / item.max) * 0.85
      if (item.life <= 0) item.line.visible = false
    }

    for (const item of this.decals) {
      if (item.life <= 0) continue
      item.life -= dt
      if (item.life < 3) item.mesh.material.opacity = Math.max(0, item.life / 3) * 0.95
      if (item.life <= 0) item.mesh.visible = false
    }

    for (const item of this.shells) {
      if (item.life <= 0) continue
      item.life -= dt
      if (item.life <= 0) {
        item.mesh.visible = false
        continue
      }
      item.velocity.y -= 11 * dt
      item.mesh.position.addScaledVector(item.velocity, dt)
      item.mesh.rotation.x += item.spin.x * dt
      item.mesh.rotation.y += item.spin.y * dt
      item.mesh.rotation.z += item.spin.z * dt
      if (item.mesh.position.y < 0.02) {
        item.mesh.position.y = 0.02
        item.velocity.y *= -0.35
        item.velocity.x *= 0.6
        item.velocity.z *= 0.6
        item.spin.multiplyScalar(0.55)
        item.bounced = true
      }
      if (item.life < 1) item.mesh.visible = Math.sin(item.life * 40) > -0.4
    }

    for (const item of this.flashes) {
      if (item.life <= 0) continue
      item.life -= dt
      item.sprite.material.opacity = Math.max(0, item.life / item.max) * 0.9
      if (item.life <= 0) item.sprite.visible = false
    }

    if (this.blastLife > 0) {
      this.blastLife -= dt
      this.blastLight.intensity = Math.max(0, this.blastLife / 0.42) ** 2 * 420
    }

    for (let i = 0; i < this.rings.length; i += 1) {
      const item = this.rings[i]
      if (item.life <= 0) continue
      item.life -= dt
      const t = 1 - item.life / item.max
      item.mesh.scale.setScalar(0.6 + t * 8)
      item.mesh.material.opacity = Math.max(0, 1 - t) * 0.7
      if (item.life <= 0) item.mesh.visible = false
    }

    for (let i = this.flares.length - 1; i >= 0; i -= 1) {
      const item = this.flares[i]
      item.life -= dt
      item.mesh.material.opacity = Math.max(0, item.life / item.max) * 0.8
      item.mesh.scale.setScalar(1.5 + (1 - item.life / item.max) * 0.8)
      if (item.life <= 0) {
        this.scene.remove(item.mesh)
        item.mesh.material.dispose()
        this.flares.splice(i, 1)
      }
    }
  }
}
