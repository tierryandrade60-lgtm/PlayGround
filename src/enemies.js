import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const TYPES = {
  trooper: {
    hp: 110, speed: 3.35, range: 21, damage: 7, score: 100, scale: 1,
    color: 0xff7a20, fireMin: 1.15, fireMax: 1.9, burst: 1, spread: 0.035, radius: 0.42,
    name: 'SENTINEL'
  },
  heavy: {
    hp: 340, speed: 1.85, range: 18, damage: 12, score: 250, scale: 1.36,
    color: 0xff2e20, fireMin: 2.1, fireMax: 3.0, burst: 3, spread: 0.05, radius: 0.58,
    name: 'JUGGERNAUT'
  },
  drone: {
    hp: 70, speed: 5.4, range: 14, damage: 5, score: 150, scale: 0.9,
    color: 0x4fe8ff, fireMin: 1.4, fireMax: 2.2, burst: 2, spread: 0.055, radius: 0.5,
    name: 'WRAITH'
  },
  titan: {
    hp: 1500, speed: 1.55, range: 20, damage: 18, score: 1000, scale: 2.05,
    color: 0xff1a10, fireMin: 1.9, fireMax: 2.6, burst: 5, spread: 0.045, radius: 1.05,
    name: 'TITAN'
  }
}

const rand = (a, b) => a + Math.random() * (b - a)

function material(color, metalness, roughness, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra })
}

class Enemy {
  constructor(type, manager, world, effects, audio, textures) {
    this.type = type
    this.cfg = TYPES[type]
    this.manager = manager
    this.world = world
    this.effects = effects
    this.audio = audio
    this.tex = textures
    this.hp = this.cfg.hp * manager.hpScale
    this.maxHp = this.hp
    this.dead = false
    this.deathT = 0
    this.fireTimer = rand(0.8, 2.2)
    this.burstLeft = 0
    this.burstTimer = 0
    this.losTimer = 0
    this.hasLos = false
    this.walkPhase = Math.random() * 10
    this.strafeDir = Math.random() > 0.5 ? 1 : -1
    this.strafeTimer = rand(1, 3)
    this.flashTimer = 0
    this.aimCharge = 0
    this.lastMove = new THREE.Vector3()
    this.stuckT = 0
    this.eye = new THREE.Vector3()
    this.muzzleFlashT = 0
    this.hitMeshes = []
    this.spawnT = 0
    this.radius = this.cfg.radius

    this.group = new THREE.Group()
    this.group.rotation.order = 'YXZ'
    this.materials = []
    this.build()
    this.root.scale.setScalar(0.01)
    manager.scene.add(this.group)
  }

  build() {
    const cfg = this.cfg
    const scale = cfg.scale
    const bodyMat = material(0x3a454c, 0.72, 0.44)
    const armorMat = material(0x5a6a73, 0.7, 0.4)
    const darkMat = material(0x1c2327, 0.68, 0.52)
    const glowMat = material(0x1a1410, 0.45, 0.45, { emissive: cfg.color, emissiveIntensity: 2.2 })
    this.bodyMat = bodyMat
    this.armorMat = armorMat
    this.glowMat = glowMat
    this.materials.push(bodyMat, armorMat, darkMat, glowMat)
    this.flashables = [bodyMat, armorMat]
    for (const m of this.flashables) m.userData.baseEmissive = m.emissive.clone()

    if (this.type === 'drone') { this.buildDrone(scale); return }

    const rb = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r)
    const add = (geo, mat, x, y, z, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x * scale, y * scale, z * scale)
      m.castShadow = true
      m.receiveShadow = true
      parent.add(m)
      return m
    }

    this.root = new THREE.Group()
    this.root.scale.setScalar(scale)
    this.group.add(this.root)

    const hips = add(rb(0.46, 0.25, 0.3, 0.05), darkMat, 0, 0.96, 0, this.root)
    this.hips = hips
    const torso = add(rb(0.66, 0.62, 0.4, 0.07), bodyMat, 0, 1.36, 0, this.root)
    torso.userData.part = 'body'
    this.hitMeshes.push(torso)
    const chest = add(rb(0.54, 0.34, 0.12, 0.04), armorMat, 0, 1.46, 0.2, this.root)
    chest.userData.part = 'body'
    this.hitMeshes.push(chest)
    for (const sx of [-1, 1]) {
      const strip = add(new THREE.BoxGeometry(0.16, 0.022, 0.012), glowMat, sx * 0.15, 1.38, 0.268, this.root)
      strip.userData.part = 'body'
      this.hitMeshes.push(strip)
      const shoulderLight = add(new THREE.BoxGeometry(0.1, 0.022, 0.02), glowMat, sx * 0.4, 1.66, 0.02, this.root)
      shoulderLight.userData.part = 'body'
      this.hitMeshes.push(shoulderLight)
    }
    const core = add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), glowMat, 0, 1.42, 0.27, this.root)
    core.rotation.x = Math.PI / 2
    const backpack = add(rb(0.4, 0.44, 0.2, 0.04), darkMat, 0, 1.38, -0.26, this.root)
    backpack.userData.part = 'body'
    this.hitMeshes.push(backpack)
    for (const sx of [-1, 1]) {
      add(rb(0.2, 0.16, 0.24, 0.04), armorMat, sx * 0.37, 1.58, 0, this.root).rotation.z = sx * -0.2
      add(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 8), glowMat, sx * 0.24, 1.05, 0.13, this.root)
    }

    const head = add(rb(0.3, 0.28, 0.3, 0.05), armorMat, 0, 1.79, 0.02, this.root)
    head.userData.part = 'head'
    this.hitMeshes.push(head)
    const visor = add(new THREE.BoxGeometry(0.22, 0.055, 0.03), glowMat, 0, 1.8, 0.185, this.root)
    visor.userData.part = 'head'
    this.hitMeshes.push(visor)
    add(new THREE.BoxGeometry(0.03, 0.08, 0.24), darkMat, 0, 1.96, 0.02, this.root)

    this.arms = []
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group()
      shoulder.position.set(sx * 0.42, 1.58, 0)
      this.root.add(shoulder)
      const upper = new THREE.Mesh(rb(0.19, 0.38, 0.2, 0.04), bodyMat)
      upper.position.y = -0.2
      upper.castShadow = true
      shoulder.add(upper)
      const fore = new THREE.Mesh(rb(0.16, 0.32, 0.18, 0.04), armorMat)
      fore.position.y = -0.5
      fore.castShadow = true
      shoulder.add(fore)
      const hand = new THREE.Mesh(rb(0.13, 0.14, 0.16, 0.03), darkMat)
      hand.position.y = -0.7
      shoulder.add(hand)
      shoulder.rotation.x = 0.1
      this.arms.push(shoulder)
    }
    this.gun = new THREE.Group()
    this.gun.position.set(0.1, -0.72, 0.14)
    this.arms[1].add(this.gun)
    const gunBody = new THREE.Mesh(rb(0.08, 0.12, 0.55, 0.02), darkMat)
    gunBody.position.z = 0.2
    this.gun.add(gunBody)
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), armorMat)
    gunBarrel.rotation.x = Math.PI / 2
    gunBarrel.position.z = 0.53
    this.gun.add(gunBarrel)
    const gunGlow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.16), glowMat)
    gunGlow.position.set(0.05, 0.03, 0.18)
    this.gun.add(gunGlow)
    this.gunMuzzle = new THREE.Object3D()
    this.gunMuzzle.position.set(0, 0, 0.7)
    this.gun.add(this.gunMuzzle)
    this.muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flash, color: this.cfg.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.muzzleFlash.scale.set(0.34, 0.34, 1)
    this.muzzleFlash.position.set(0, 0, 0.72)
    this.gun.add(this.muzzleFlash)

    this.legs = []
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group()
      hip.position.set(sx * 0.17, 0.92, 0)
      this.root.add(hip)
      const thigh = new THREE.Mesh(rb(0.2, 0.45, 0.22, 0.04), bodyMat)
      thigh.position.y = -0.22
      thigh.castShadow = true
      hip.add(thigh)
      const shin = new THREE.Mesh(rb(0.17, 0.4, 0.19, 0.04), armorMat)
      shin.position.y = -0.62
      shin.castShadow = true
      hip.add(shin)
      const foot = new THREE.Mesh(rb(0.2, 0.13, 0.32, 0.03), darkMat)
      foot.position.set(0, -0.86, 0.06)
      foot.castShadow = true
      hip.add(foot)
      const shinLight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), glowMat)
      shinLight.position.set(sx * 0.06, -0.62, 0.1)
      hip.add(shinLight)
      this.legs.push(hip)
    }
    if (this.type === 'titan') {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 5), glowMat)
      crown.position.set(0, 2.12, 0.02)
      this.root.add(crown)
      for (const sx of [-1, 1]) {
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.5, 8), darkMat)
        pod.position.set(sx * 0.5, 1.32, -0.28)
        pod.rotation.z = sx * 0.2
        this.root.add(pod)
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glowMat)
        tip.position.set(sx * 0.56, 1.06, -0.28)
        this.root.add(tip)
      }
    }
    if (this.type === 'heavy') {
      const shield = new THREE.Mesh(rb(0.3, 0.5, 0.1, 0.03), armorMat)
      shield.position.set(0.32, -0.5, 0.14)
      this.arms[0].add(shield)
    }
  }

  buildDrone(scale) {
    this.root = new THREE.Group()
    this.root.scale.setScalar(scale)
    this.group.add(this.root)
    const bodyMat = this.bodyMat, armorMat = this.armorMat, glowMat = this.glowMat
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), bodyMat)
    core.position.y = 2.0
    core.castShadow = true
    core.userData.part = 'body'
    this.root.add(core)
    this.hitMeshes.push(core)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 28), armorMat)
    ring.position.y = 2.0
    ring.rotation.x = Math.PI / 2
    this.root.add(ring)
    this.ring = ring
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), glowMat)
    eye.position.set(0, 2.0, 0.33)
    eye.userData.part = 'head'
    this.root.add(eye)
    this.hitMeshes.push(eye)
    this.gunMuzzle = new THREE.Object3D()
    this.gunMuzzle.position.set(0, 2.0, 0.42)
    this.root.add(this.gunMuzzle)
    this.muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flash, color: this.cfg.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.muzzleFlash.scale.set(0.25, 0.25, 1)
    this.muzzleFlash.position.set(0, 2.0, 0.46)
    this.root.add(this.muzzleFlash)
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2
      const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.22, 8), bodyMat)
      thruster.position.set(Math.cos(a) * 0.34, 1.72, Math.sin(a) * 0.34)
      this.root.add(thruster)
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), glowMat)
      flame.position.set(Math.cos(a) * 0.34, 1.55, Math.sin(a) * 0.34)
      flame.rotation.x = Math.PI
      this.root.add(flame)
    }
    this.arms = []
    this.legs = []
    this.hips = null
    this.baseHover = 2.0
  }

  get position() { return this.group.position }

  eyePosition(out = this.eye) {
    out.set(0, this.type === 'drone' ? 2.0 * this.cfg.scale : 1.8, 0)
    return this.group.localToWorld(out)
  }

  chestPosition(out = new THREE.Vector3()) {
    out.set(0, this.type === 'drone' ? 2.0 : 1.32 * this.cfg.scale, 0)
    return this.group.localToWorld(out)
  }

  takeHit(damage, part, point, normal, weapon) {
    if (this.dead) return { killed: false }
    const head = part === 'head'
    const mult = head ? (this.type === 'titan' ? 1.6 : 2.35) : 1
    const dmg = Math.round(damage * mult)
    this.hp -= dmg
    this.flashTimer = 0.1
    for (const m of this.flashables) { m.emissive.setHex(0xfff0e0); m.emissiveIntensity = 2.4 }
    this.effects.enemyHit(point, normal, head)
    this.effects.damageNumber(point.clone().add(new THREE.Vector3(rand(-0.15, 0.15), rand(0.1, 0.3), rand(-0.15, 0.15))), `${dmg}`, head ? '#ff5b45' : '#ffcf8a', head ? 1.25 : 1)
    if (this.hp <= 0) {
      this.die()
      return { killed: true, headshot: head, damage: dmg }
    }
    return { killed: false, headshot: head, damage: dmg }
  }

  die() {
    if (this.dead) return
    this.dead = true
    this.deathT = 0
    this.manager.removeHitMeshes(this)
    this.effects.enemyDeath(this.group.position.clone())
    this.audio.explosion()
    this.deathSpin = (Math.random() > 0.5 ? 1 : -1) * rand(0.8, 1.5)
  }

  update(dt, player, time) {
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.6)
      const s = this.cfg.scale * (this.spawnT < 0.72 ? this.spawnT / 0.72 * 1.12 : 1.12 - (this.spawnT - 0.72) / 0.28 * 0.12)
      this.root.scale.setScalar(Math.max(0.01, s))
      this.group.position.y = (1 - this.spawnT) * -0.45
    }
    if (this.dead) {
      this.deathT += dt
      this.group.rotation.z = Math.min(this.deathSpin, this.deathT * 3.2 * Math.sign(this.deathSpin))
      this.group.position.y = Math.max(-0.8, -this.deathT * 0.35)
      for (const m of this.flashables) { m.emissiveIntensity = Math.max(0, 2.4 - this.deathT * 4) }
      if (this.deathT > 2.8) this.remove = true
      return
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        for (const m of this.flashables) {
          m.emissive.copy(m.userData.baseEmissive)
          m.emissiveIntensity = 1
        }
      }
    }

    const pos = this.group.position
    const toPlayer = new THREE.Vector3(player.position.x - pos.x, 0, player.position.z - pos.z)
    const dist = toPlayer.length()
    if (dist > 0.001) toPlayer.divideScalar(dist)
    const desiredX = player.position.x - pos.x
    const desiredZ = player.position.z - pos.z
    this.group.rotation.y = Math.atan2(desiredX, desiredZ)

    this.strafeTimer -= dt
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(1.2, 3.2)
      this.strafeDir *= -1
    }

    const preferred = this.type === 'drone' ? 9 : this.type === 'heavy' ? 10 : 13
    let moveSpeed = this.cfg.speed
    let forward = 0
    if (dist > preferred + 1.5) forward = 1
    else if (dist < preferred - 2) forward = -0.7
    else forward = 0

    let mx = toPlayer.x * forward + -toPlayer.z * this.strafeDir * 0.55
    let mz = toPlayer.z * forward + toPlayer.x * this.strafeDir * 0.55
    const mlen = Math.hypot(mx, mz)
    if (mlen > 0.001) { mx /= mlen; mz /= mlen } else { mx = 0; mz = 0 }

    const before = new THREE.Vector3(pos.x, pos.z, 0)
    const step = moveSpeed * dt * (this.aimCharge > 0 ? 0.35 : 1)
    pos.x += mx * step
    pos.z += mz * step
    if (this.type === 'drone') {
      pos.y = this.baseHover + Math.sin(time * 2 + this.walkPhase) * 0.22
      if (this.ring) this.ring.rotation.z = time * 1.4
    }
    this.world.resolveCircle(pos, this.radius)
    const moved = Math.hypot(pos.x - before.x, pos.z - before.y)
    if (moved < step * 0.25 && step > 0.001) {
      this.stuckT += dt
      if (this.stuckT > 0.35) {
        this.strafeDir *= -1
        this.strafeTimer = 0.8
        this.stuckT = 0
      }
    } else this.stuckT = 0

    this.walkPhase += dt * (2.4 + moveSpeed * 0.5)
    if (this.legs.length) {
      const swing = Math.sin(this.walkPhase) * 0.55 * Math.min(1, mlen)
      this.legs[0].rotation.x = swing
      this.legs[1].rotation.x = -swing
      this.root.position.y = Math.abs(Math.sin(this.walkPhase * 2)) * 0.02
      this.arms[0].rotation.x = 0.1 - swing * 0.2
      this.arms[1].rotation.x = 0.1 + swing * 0.2 - this.aimCharge * 0.35
    } else if (this.root) {
      this.root.rotation.z = Math.sin(time * 1.5 + this.walkPhase) * 0.06
      this.root.position.y = Math.sin(time * 2 + this.walkPhase) * 0.04
    }

    this.losTimer -= dt
    if (this.losTimer <= 0) {
      this.losTimer = rand(0.18, 0.34)
      this.hasLos = this.manager.hasLineOfSight(this.eyePosition(), player)
    }

    if (this.hasLos && dist < this.cfg.range) {
      this.aimCharge = Math.min(1, this.aimCharge + dt * 2.2)
      if (this.arms[1]) this.arms[1].rotation.x = -0.1 - this.aimCharge * 0.55
    } else {
      this.aimCharge = Math.max(0, this.aimCharge - dt * 1.6)
      if (this.arms[1]) this.arms[1].rotation.x = -0.1
    }

    this.fireTimer -= dt
    if (this.burstLeft > 0) {
      this.burstTimer -= dt
      if (this.burstTimer <= 0) {
        this.fireOne(player, dist)
        this.burstLeft--
        this.burstTimer = 0.14
        if (this.burstLeft === 0) this.fireTimer = rand(this.cfg.fireMin, this.cfg.fireMax) * this.manager.fireRateScale
      }
    } else if (this.fireTimer <= 0 && this.hasLos && dist < this.cfg.range && this.aimCharge > 0.7) {
      this.burstLeft = this.cfg.burst
      this.burstTimer = 0
      this.fireTimer = rand(this.cfg.fireMin, this.cfg.fireMax) * this.manager.fireRateScale
    }

    this.muzzleFlashT -= dt
    this.muzzleFlash.material.opacity = this.muzzleFlashT > 0 ? Math.min(1, this.muzzleFlashT / 0.05) : 0
    const chargeGlow = 1.6 + this.aimCharge * 2.6
    this.glowMat.emissiveIntensity = chargeGlow
  }

  fireOne(player, dist) {
    this.muzzleFlashT = 0.06
    this.muzzleFlash.material.opacity = 1
    const from = new THREE.Vector3()
    this.gunMuzzle.getWorldPosition(from)
    const target = new THREE.Vector3(player.position.x, player.position.y - 0.18, player.position.z)
    const accuracy = Math.max(0.05, Math.min(0.62, (this.type === 'titan' ? 0.72 : 0.5) - dist * 0.012 - (player.speed || 0) * 0.05))
    const hit = Math.random() < accuracy
    if (!hit) {
      target.x += rand(-1.2, 1.2)
      target.y += rand(-0.7, 0.7)
      target.z += rand(-1.2, 1.2)
    }
    this.manager.fireAt(this, from, target, hit, this.cfg.damage)
  }

  removeFromScene() {
    this.manager.scene.remove(this.group)
    this.group.traverse(o => {
      if (o.isMesh) {
        o.geometry?.dispose()
      }
    })
    for (const m of this.materials) m.dispose()
  }
}

export class EnemyManager {
  constructor({ scene, camera, world, effects, audio, textures, quality, callbacks }) {
    this.scene = scene
    this.camera = camera
    this.world = world
    this.effects = effects
    this.audio = audio
    this.textures = textures
    this.quality = quality
    this.callbacks = callbacks
    this.enemies = []
    this.hitMeshes = []
    this.spawnFx = []
    this.raycaster = new THREE.Raycaster()
    this.hpScale = 1
    this.damageScale = 1
    this.fireRateScale = 1
    this.maxActive = quality === 'performance' ? 7 : quality === 'high' ? 14 : 10
    this.losRay = new THREE.Raycaster()
    this.occluders = world.occluders
    this.tmp = new THREE.Vector3()
  }

  spawn(type, position, wave = 1) {
    const e = new Enemy(type, this, this.world, this.effects, this.audio, this.textures)
    e.group.position.copy(position)
    e.group.position.y = type === 'drone' ? 0 : 0
    this.enemies.push(e)
    for (const m of e.hitMeshes) {
      m.userData.enemy = e
      this.hitMeshes.push(m)
    }
    const c = new THREE.Color(TYPES[type].color)
    this.effects.explosion(position.clone().add(new THREE.Vector3(0, type === 'drone' ? 1.8 : 1.0, 0)), c.getHex(), type === 'titan' ? 50 : 18)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.soft, color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    sprite.position.copy(position).add(new THREE.Vector3(0, 1.1, 0))
    sprite.scale.set(0.6, 6, 1)
    this.scene.add(sprite)
    this.spawnFx.push({ sprite, life: 0.6, max: 0.6 })
    return e
  }

  removeHitMeshes(enemy) {
    this.hitMeshes = this.hitMeshes.filter(m => m.userData.enemy !== enemy)
  }

  hasLineOfSight(from, player) {
    const target = new THREE.Vector3(player.position.x, player.position.y - 0.25, player.position.z)
    const dir = this.tmp.copy(target).sub(from)
    const dist = dir.length()
    if (dist < 0.5) return true
    this.losRay.set(from, dir.normalize())
    this.losRay.far = dist
    const hits = this.losRay.intersectObjects(this.occluders, false)
    return !hits.length
  }

  fireAt(enemy, from, target, hit, damage) {
    this.effects.spawnTracer(from, target, enemy.cfg.color, 1.4)
    const pan = this.computePan(from)
    this.audio.enemyShot(pan)
    if (hit) {
      this.callbacks.onPlayerDamage?.(damage * this.damageScale, from)
    }
  }

  computePan(pos) {
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0)
    const to = this.tmp.copy(pos).sub(this.camera.position)
    const d = to.length() || 1
    return Math.max(-0.85, Math.min(0.85, to.dot(right) / d))
  }

  update(dt, player, time) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]
      e.update(dt, player, time)
      if (e.remove) {
        e.removeFromScene()
        this.enemies.splice(i, 1)
      }
    }
    for (let i = this.spawnFx.length - 1; i >= 0; i--) {
      const f = this.spawnFx[i]
      f.life -= dt
      const p = 1 - f.life / f.max
      f.sprite.material.opacity = Math.max(0, (1 - p)) * 0.9
      f.sprite.scale.y = 6 * (1 - p * 0.4)
      if (f.life <= 0) {
        this.scene.remove(f.sprite)
        f.sprite.material.dispose()
        this.spawnFx.splice(i, 1)
      }
    }
  }

  aliveCount() { return this.enemies.filter(e => !e.dead).length }

  clear() {
    for (const e of this.enemies) {
      this.removeHitMeshes(e)
      e.removeFromScene()
    }
    this.enemies.length = 0
    for (const f of this.spawnFx) { this.scene.remove(f.sprite); f.sprite.material.dispose() }
    this.spawnFx.length = 0
  }
}
