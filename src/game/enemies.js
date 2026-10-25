import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const CALLSIGNS = ['VIPER', 'GHOST', 'REAPER', 'HAVOC', 'ONYX', 'RIPTIDE', 'SABLE', 'WRAITH', 'TALON', 'ZERO', 'MAMBA', 'CINDER']
const HELMET_COLORS = [0x3b4234, 0x454b3e, 0x333a30, 0x4b4b40, 0x3a4048]
const UP = new THREE.Vector3(0, 1, 0)

function makeRifle(materials) {
  const group = new THREE.Group()
  const add = (w, h, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, 0.008), material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }
  add(0.05, 0.07, 0.34, materials.rifleMetal, 0, 0, 0)
  add(0.045, 0.045, 0.2, materials.riflePoly, 0, 0.005, -0.26)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.3, 8), materials.rifleMetal)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.01, -0.48)
  group.add(barrel)
  const mag = add(0.032, 0.11, 0.06, materials.riflePoly, 0, -0.08, -0.04)
  mag.rotation.x = 0.18
  add(0.04, 0.06, 0.16, materials.riflePoly, 0, 0.005, 0.23)
  add(0.035, 0.05, 0.07, materials.rifleMetal, 0, 0.06, -0.03)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.01, -0.63)
  group.add(muzzle)
  group.userData.muzzle = muzzle
  return group
}

export class Enemy {
  constructor(manager, position, options = {}) {
    this.manager = manager
    this.scene = manager.scene
    this.world = manager.world
    this.effects = manager.effects
    this.audio = manager.audio
    this.player = manager.player
    this.wave = options.wave || 1
    this.name = options.name || 'HOSTILE'
    this.health = options.health ?? 100
    this.maxHealth = this.health
    this.damage = options.damage ?? 6
    this.speed = options.speed ?? 2.6
    this.alive = true
    this.deadTime = 0
    this.removed = false
    this.aware = 0
    this.reaction = 0
    this.burst = 0
    this.burstTimer = 0
    this.burstCooldown = 1.2 + Math.random() * 1.1
    this.los = false
    this.losTimer = Math.random() * 0.2
    this.walkPhase = Math.random() * Math.PI * 2
    this.moveAmount = 0
    this.flashTimer = 0
    this.strafePhase = Math.random() * Math.PI * 2
    this.avoidTimer = 0
    this.avoidSign = Math.random() > 0.5 ? 1 : -1
    this.stuck = 0
    this.hitMeshes = []
    this.materials = []
    this.build(options)
    this.position = this.group.position
    this.group.position.copy(position)
    this.group.position.y = 0.02
    this.baseY = this.group.position.y
    this.faceToward(this.player.position, true)
    this.group.updateMatrixWorld(true)
  }

  build(options = {}) {
    const group = new THREE.Group()
    this.group = group
    const armorColor = options.armorColor ?? 0x3d4436
    const helmetColor = HELMET_COLORS[Math.floor(Math.random() * HELMET_COLORS.length)]
    const armor = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.74, metalness: 0.16, envMapIntensity: 0.5 })
    const cloth = new THREE.MeshStandardMaterial({ color: 0x242925, roughness: 0.94, metalness: 0.04, envMapIntensity: 0.3 })
    const helmet = new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.62, metalness: 0.28, envMapIntensity: 0.6 })
    const mask = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.85, metalness: 0.1 })
    const rig = new THREE.MeshStandardMaterial({ color: 0x2c3128, roughness: 0.82, metalness: 0.12 })
    const boot = new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.78, metalness: 0.2 })
    const visor = new THREE.MeshStandardMaterial({
      color: 0x350403,
      emissive: 0xff2a14,
      emissiveIntensity: 3.6,
      roughness: 0.32,
      metalness: 0.5,
      toneMapped: false
    })
    const led = new THREE.MeshStandardMaterial({ color: 0x210303, emissive: 0xff1c0c, emissiveIntensity: 2.4, toneMapped: false })
    const rifleMetal = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.4, metalness: 0.88 })
    const riflePoly = new THREE.MeshStandardMaterial({ color: 0x26281f, roughness: 0.74, metalness: 0.18 })
    this.materials = [armor, cloth, helmet, mask, rig, boot]

    const mesh = (geometry, material, part, x, y, z, parent = group) => {
      const m = new THREE.Mesh(geometry, material)
      m.position.set(x, y, z)
      m.castShadow = false
      m.receiveShadow = false
      parent.add(m)
      if (part) {
        m.userData.enemy = this
        m.userData.part = part
        this.hitMeshes.push(m)
      }
      return m
    }

    const legGroup = (side) => {
      const pivot = new THREE.Group()
      pivot.position.set(0.135 * side, 0.92, 0)
      group.add(pivot)
      mesh(new RoundedBoxGeometry(0.165, 0.46, 0.19, 2, 0.03), cloth, 'limb', 0, -0.23, 0, pivot)
      const knee = new THREE.Group()
      knee.position.set(0, -0.46, 0)
      pivot.add(knee)
      mesh(new RoundedBoxGeometry(0.15, 0.42, 0.17, 2, 0.028), cloth, 'limb', 0, -0.21, 0, knee)
      mesh(new RoundedBoxGeometry(0.12, 0.14, 0.2, 2, 0.02), armor, 'limb', 0, -0.34, -0.05, knee)
      mesh(new RoundedBoxGeometry(0.175, 0.12, 0.31, 2, 0.03), boot, 'limb', 0, -0.44, -0.06, knee)
      return { pivot, knee }
    }
    const leftLeg = legGroup(1)
    const rightLeg = legGroup(-1)
    this.leftLeg = leftLeg
    this.rightLeg = rightLeg

    mesh(new RoundedBoxGeometry(0.44, 0.53, 0.28, 3, 0.055), armor, 'body', 0, 1.21, 0)
    mesh(new RoundedBoxGeometry(0.4, 0.26, 0.31, 3, 0.04), rig, 'body', 0, 1.24, -0.015)
    mesh(new RoundedBoxGeometry(0.3, 0.15, 0.08, 2, 0.02), rig, 'body', 0, 1.12, -0.19)
    for (const x of [-0.14, 0, 0.14]) {
      mesh(new RoundedBoxGeometry(0.09, 0.12, 0.07, 2, 0.014), rig, 'body', x, 1.11, -0.23)
    }
    mesh(new RoundedBoxGeometry(0.28, 0.38, 0.15, 3, 0.04), cloth, 'body', 0, 1.26, 0.18)
    mesh(new RoundedBoxGeometry(0.1, 0.14, 0.12, 2, 0.02), rig, 'body', 0.18, 1.04, -0.16)
    mesh(new RoundedBoxGeometry(0.1, 0.12, 0.12, 2, 0.02), rig, 'body', -0.18, 1.04, -0.16)
    mesh(new RoundedBoxGeometry(0.34, 0.09, 0.3, 2, 0.02), boot, 'body', 0, 1.47, 0)

    for (const side of [-1, 1]) {
      const pad = mesh(new RoundedBoxGeometry(0.17, 0.14, 0.24, 2, 0.03), armor, 'body', 0.29 * side, 1.43, 0)
      pad.rotation.z = 0.22 * side
      mesh(new RoundedBoxGeometry(0.035, 0.045, 0.02, 1, 0.006), led, null, 0.3 * side, 1.49, -0.11)
    }

    const neck = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.11, 8), mask, 'body', 0, 1.51, 0)
    neck.rotation.y = 0.1

    const head = new THREE.Group()
    head.position.set(0, 1.54, 0)
    group.add(head)
    this.head = head
    mesh(new THREE.SphereGeometry(0.142, 16, 12), mask, 'head', 0, 0.12, 0, head)
    const helmetMesh = mesh(new THREE.SphereGeometry(0.168, 18, 12), helmet, 'head', 0, 0.15, 0.01, head)
    helmetMesh.scale.set(1, 0.88, 1.06)
    mesh(new RoundedBoxGeometry(0.2, 0.038, 0.045, 2, 0.008), visor, 'head', 0, 0.125, -0.135, head)
    mesh(new RoundedBoxGeometry(0.17, 0.09, 0.1, 2, 0.02), mask, 'head', 0, 0.05, -0.11, head)
    mesh(new RoundedBoxGeometry(0.09, 0.05, 0.06, 2, 0.012), helmet, 'head', 0, 0.22, 0.13, head)
    const antenna = mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.28, 5), mask, null, 0.12, 0.26, 0.11, head)
    antenna.rotation.z = -0.12

    const arm = (side, rear) => {
      const pivot = new THREE.Group()
      pivot.position.set(0.27 * side, 1.4, 0)
      pivot.rotation.set(-1.02, 0, 0.46 * side)
      group.add(pivot)
      mesh(new RoundedBoxGeometry(0.125, 0.38, 0.14, 2, 0.028), cloth, 'limb', 0, -0.19, 0, pivot)
      const elbow = new THREE.Group()
      elbow.position.set(0, -0.38, 0)
      elbow.rotation.x = 1.22
      pivot.add(elbow)
      mesh(new RoundedBoxGeometry(0.115, 0.34, 0.125, 2, 0.024), cloth, 'limb', 0, -0.17, 0, elbow)
      const glove = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.86, metalness: 0.08 })
      mesh(new RoundedBoxGeometry(0.1, 0.11, 0.13, 2, 0.025), glove, 'limb', 0, -0.37, 0, elbow)
      if (!rear) this.rightArm = pivot
      else this.leftArm = pivot
      return pivot
    }
    arm(-1, false)
    arm(1, true)

    const rifle = makeRifle({ rifleMetal, riflePoly })
    rifle.position.set(0.02, 1.19, -0.27)
    rifle.rotation.set(-0.05, 0.1, 0.02)
    group.add(rifle)
    this.rifle = rifle
    this.muzzle = rifle.userData.muzzle

    this.visorMaterial = visor
    this.ledMaterial = led

    const scale = 0.94 + Math.random() * 0.12
    group.scale.setScalar(scale)

    const blobMaterial = new THREE.MeshBasicMaterial({
      map: this.manager.blobTexture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0x000000
    })
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), blobMaterial)
    this.blob.rotation.x = -Math.PI / 2
    this.blob.position.set(0, 0.035, 0)
    this.blob.renderOrder = 2
    this.scene.add(this.blob)

    this.scene.add(group)
  }

  faceToward(target, instant = false) {
    const dx = target.x - this.group.position.x
    const dz = target.z - this.group.position.z
    this.targetYaw = Math.atan2(-dx, -dz)
    if (instant) this.group.rotation.y = this.targetYaw
  }

  getChestPosition() {
    return new THREE.Vector3(this.group.position.x, this.group.position.y + 1.25 * this.group.scale.x, this.group.position.z)
  }

  getHeadPosition() {
    return new THREE.Vector3(this.group.position.x, this.group.position.y + 1.66 * this.group.scale.x, this.group.position.z)
  }

  getMuzzlePosition() {
    return this.muzzle.getWorldPosition(new THREE.Vector3())
  }

  takeDamage(amount) {
    if (!this.alive) return false
    this.health -= amount
    this.flashTimer = 0.12
    this.stuck = 0
    if (this.health <= 0) {
      this.die()
      return true
    }
    if (this.aware < 0.1) this.aware = 0.1
    this.reaction = Math.min(this.reaction, 0.12)
    return false
  }

  die() {
    if (!this.alive) return
    this.alive = false
    this.deadTime = 0
    this.reaction = 0
    this.burst = 0
    this.manager.removeHits(this)
    this.manager.onEnemyKilled(this)
    this.effects.killBurst(this.getChestPosition())
    this.audio.kill()
    this.blob.material.opacity = 0.45
  }

  hasLineOfSight(playerEye) {
    const from = this.getChestPosition()
    return !this.world.lineBlocked(from, playerEye)
  }

  update(dt, time, active) {
    if (this.removed) return
    if (!this.alive) {
      this.updateDeath(dt)
      return
    }

    const player = this.player
    const dx = player.position.x - this.group.position.x
    const dz = player.position.z - this.group.position.z
    const distance = Math.hypot(dx, dz)
    const dirX = distance > 0.001 ? dx / distance : 0
    const dirZ = distance > 0.001 ? dz / distance : 0

    this.losTimer -= dt
    if (this.losTimer <= 0) {
      this.losTimer = 0.18 + Math.random() * 0.16
      this.los = player.alive && distance < 62 && this.hasLineOfSight(player.getEyePosition())
      if (this.los) {
        if (this.aware < 0.2) this.reaction = 0.55 + Math.random() * 0.35
        this.aware = Math.min(1, this.aware + 0.34)
      }
    }
    if (!this.los) this.aware = Math.max(0, this.aware - dt * 0.22)

    const canFight = active && player.alive
    const wantRange = 13 + (this.name.length % 3) * 2
    let moveX = 0
    let moveZ = 0
    let moving = false

    if (canFight) {
      if (this.reaction > 0) this.reaction -= dt
      this.faceToward(player.position)
      if (!this.los) {
        moveX = dirX
        moveZ = dirZ
        moving = true
      } else if (distance > wantRange + 3) {
        moveX = dirX
        moveZ = dirZ
        moving = true
      } else if (distance < wantRange - 5) {
        moveX = -dirX
        moveZ = -dirZ
        moving = true
      } else {
        const strafe = Math.sin(time * 0.85 + this.strafePhase) * 0.75
        moveX = -dirZ * strafe + dirX * 0.12
        moveZ = dirX * strafe + dirZ * 0.12
        moving = Math.abs(strafe) > 0.12
      }

      if (this.burst > 0) {
        this.burstTimer -= dt
        if (this.burstTimer <= 0) {
          this.burstTimer = 0.13
          this.burst -= 1
          this.shoot(distance)
        }
      } else {
        this.burstCooldown -= dt
        if (this.los && this.reaction <= 0 && this.burstCooldown <= 0 && distance < 52) {
          this.burst = 3 + Math.floor(Math.random() * 2)
          this.burstTimer = 0.08
          this.burstCooldown = 1.35 + Math.random() * 1.25
        }
      }
    } else {
      this.faceToward(this.player.position, false)
    }

    this.avoidTimer -= dt
    if (this.avoidTimer <= 0 && moving) {
      this.avoidTimer = 0.35
      const probeFrom = new THREE.Vector3(this.group.position.x, 0.7, this.group.position.z)
      const probeTo = probeFrom.clone().add(new THREE.Vector3(moveX, 0, moveZ).multiplyScalar(2.4))
      if (this.world.lineBlocked(probeFrom, probeTo)) {
        this.avoidSign *= -1
      }
    }
    if (this.avoidTimer > 0 && this.avoidSign !== 0) {
      const steer = new THREE.Vector3(moveX, 0, moveZ)
      if (steer.lengthSq() > 0.0001) {
        steer.applyAxisAngle(UP, 0.85 * this.avoidSign)
        moveX = steer.x
        moveZ = steer.z
      }
    }

    if (moving) {
      const len = Math.hypot(moveX, moveZ)
      if (len > 0.001) {
        moveX /= len
        moveZ /= len
      }
      const speed = this.speed * (this.burst > 0 || this.reaction > 0 ? 0.72 : 1)
      const beforeX = this.group.position.x
      const beforeZ = this.group.position.z
      this.group.position.x += moveX * speed * dt
      this.group.position.z += moveZ * speed * dt
      this.world.collide(this.group.position, 0.34, 1.7)
      const moved = Math.hypot(this.group.position.x - beforeX, this.group.position.z - beforeZ)
      if (moved < speed * dt * 0.25) {
        this.stuck += dt
        if (this.stuck > 0.2) {
          this.avoidSign = Math.random() > 0.5 ? 1 : -1
          this.avoidTimer = 0.6
          this.stuck = 0
        }
      }
      this.moveAmount = THREE.MathUtils.damp(this.moveAmount, 1, 8, dt)
    } else {
      this.moveAmount = THREE.MathUtils.damp(this.moveAmount, 0, 8, dt)
    }

    for (const other of this.manager.enemies) {
      if (other === this || !other.alive) continue
      const ox = this.group.position.x - other.group.position.x
      const oz = this.group.position.z - other.group.position.z
      const d2 = ox * ox + oz * oz
      if (d2 > 0.0001 && d2 < 1.2) {
        const d = Math.sqrt(d2)
        this.group.position.x += (ox / d) * (0.6 - d) * dt * 2.2
        this.group.position.z += (oz / d) * (0.6 - d) * dt * 2.2
      }
    }

    const yaw = this.group.rotation.y
    let deltaYaw = this.targetYaw - yaw
    deltaYaw = Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw))
    this.group.rotation.y = yaw + deltaYaw * Math.min(1, dt * 7)

    this.animate(dt, time, distance)
    this.group.position.y = this.baseY
    this.group.updateMatrixWorld(true)
    this.updateBlob()
  }

  animate(dt, time, distance) {
    this.walkPhase += dt * (2.1 + this.moveAmount * 6.2)
    const swing = Math.sin(this.walkPhase) * 0.5 * this.moveAmount
    this.leftLeg.pivot.rotation.x = swing
    this.rightLeg.pivot.rotation.x = -swing
    this.leftLeg.knee.rotation.x = Math.max(0, -swing) * 0.85 + 0.04
    this.rightLeg.knee.rotation.x = Math.max(0, swing) * 0.85 + 0.04

    const breathe = Math.sin(time * 1.7 + this.strafePhase) * 0.012
    this.group.position.y = this.baseY + Math.abs(Math.sin(this.walkPhase)) * 0.035 * this.moveAmount
    this.head.rotation.x = Math.sin(time * 1.4 + this.strafePhase) * 0.035 + (this.los ? -0.04 : 0)
    this.head.rotation.y = Math.sin(time * 0.7 + this.strafePhase) * 0.12 + (this.los ? 0 : 0.25)
    this.rightArm.rotation.x = -1.02 + swing * 0.18 + breathe
    this.leftArm.rotation.x = -0.86 - swing * 0.12 + breathe * 0.6
    this.rifle.rotation.x = -0.05 + Math.sin(time * 1.2 + this.strafePhase) * 0.012

    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      const glow = Math.max(0, this.flashTimer / 0.12)
      for (const material of this.materials) {
        if (!material.emissive) continue
        material.emissive.setRGB(0.5 * glow, 0.045 * glow, 0.02 * glow)
        material.emissiveIntensity = 1.4
      }
      this.visorMaterial.emissiveIntensity = 3.6 + glow * 4
    } else {
      for (const material of this.materials) {
        if (material.emissive) {
          material.emissive.setRGB(0, 0, 0)
          material.emissiveIntensity = 1
        }
      }
      this.visorMaterial.emissiveIntensity = 3.6
    }
  }

  shoot(distance) {
    if (!this.player.alive) return
    const origin = this.getMuzzlePosition()
    const eye = this.player.getEyePosition()
    const toPlayer = eye.clone().sub(origin)
    const dist = toPlayer.length()
    if (dist > 60) return
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.player.camera.quaternion)
    const pan = THREE.MathUtils.clamp(toPlayer.clone().normalize().dot(right), -1, 1)

    const hitChance = THREE.MathUtils.clamp(
      0.66 - dist * 0.0068 - Math.min(1, this.player.speed / 7) * 0.16 - this.wave * 0.012,
      0.14,
      0.62
    )
    const hit = Math.random() < hitChance
    let target = eye.clone()
    if (!hit) {
      target.add(new THREE.Vector3((Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.8))
    }
    this.effects.tracer(origin, target, 0xff7a52)
    this.effects.flash(origin, 0.3 + Math.random() * 0.12, 0xffa060)
    this.audio.enemyShot(distance, pan)
    if (hit) {
      this.player.takeDamage(this.damage, this)
    } else if (distance < 16) {
      this.audio.bulletWhiz(pan)
    }
    this.rifle.position.z = -0.245 + Math.random() * 0.012
    this.visorMaterial.emissiveIntensity = 6
    setTimeout(() => { this.visorMaterial.emissiveIntensity = 3.6 }, 60)
  }

  updateDeath(dt) {
    this.deadTime += dt
    const t = Math.min(1, this.deadTime / 0.55)
    const eased = 1 - (1 - t) ** 2
    this.group.rotation.x = -eased * 1.35
    this.group.position.y = this.baseY - eased * 0.12
    this.group.updateMatrixWorld(true)
    this.blob.material.opacity = 0.45 * Math.max(0, 1 - this.deadTime / 5)
    if (this.deadTime > 5.2) {
      this.removed = true
      this.scene.remove(this.group)
      this.scene.remove(this.blob)
      this.blob.material.dispose()
    }
  }

  updateBlob() {
    this.blob.position.set(this.group.position.x, 0.035, this.group.position.z)
    this.blob.material.opacity = 0.5
  }

  dispose() {
    this.scene.remove(this.group)
    this.scene.remove(this.blob)
    this.blob.material.dispose()
  }
}

export class EnemyManager {
  constructor({ scene, world, effects, audio, player, hud, callbacks = {}, blobTexture }) {
    this.scene = scene
    this.world = world
    this.effects = effects
    this.audio = audio
    this.player = player
    this.hud = hud
    this.callbacks = callbacks
    this.blobTexture = blobTexture
    this.enemies = []
    this.hitMeshes = []
    this.active = false
    this.wave = 0
    this.remaining = 0
    this.maxAlive = 5
    this.spawnTimer = 0
    this.betweenWaves = 0
    this.totalKilled = 0
    this.waveKilled = 0
    this.finished = false
    this.spawnCursor = 0
  }

  preview() {
    this.reset()
    this.wave = 1
    this.remaining = 0
    const positions = [
      new THREE.Vector3(-0.8, 0.02, -7.2),
      new THREE.Vector3(5.6, 0.02, -14.2),
      new THREE.Vector3(-6.6, 0.02, -18.6)
    ]
    positions.forEach((position, index) => {
      this.spawnEnemy(position, { name: CALLSIGNS[index], wave: 1, idle: true })
    })
    this.remaining = 2
    this.maxAlive = 5
    this.active = false
  }

  reset() {
    for (const enemy of this.enemies) enemy.dispose()
    this.enemies = []
    this.hitMeshes = []
    this.active = false
    this.wave = 0
    this.remaining = 0
    this.betweenWaves = 0
    this.totalKilled = 0
    this.waveKilled = 0
    this.finished = false
    this.spawnTimer = 0
  }

  start() {
    this.active = true
    this.finished = false
    if (this.enemies.length === 0) {
      this.startWave(1)
    } else {
      this.wave = 1
      this.remaining = Math.max(0, this.waveTotal(1) - this.enemies.filter((enemy) => enemy.alive).length)
      this.maxAlive = this.maxAliveForWave(1)
      this.waveKilled = 0
      this.betweenWaves = 0
      this.spawnTimer = 1.2
      this.callbacks.onWaveStart?.(1)
    }
  }

  waveTotal(wave) {
    return 4 + wave
  }

  maxAliveForWave(wave) {
    return Math.min(6, 2 + Math.ceil(wave * 0.7))
  }

  startWave(wave) {
    this.wave = wave
    this.waveKilled = 0
    this.remaining = this.waveTotal(wave)
    this.maxAlive = this.maxAliveForWave(wave)
    this.spawnTimer = 0
    this.betweenWaves = 0
    this.callbacks.onWaveStart?.(wave)
    this.audio.waveStart()
    const initial = Math.min(2, this.remaining)
    for (let i = 0; i < initial; i += 1) this.spawnAtRandom()
  }

  spawnAtRandom() {
    if (this.remaining <= 0) return
    if (this.aliveCount >= this.maxAlive) return
    const candidates = this.world.spawnPoints
      .map((point) => point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.02, (Math.random() - 0.5) * 3)))
      .sort((a, b) => b.distanceToSquared(this.player.position) - a.distanceToSquared(this.player.position))
    const point = candidates[this.spawnCursor % Math.max(1, candidates.length)]
    this.spawnCursor += 1
    if (point.distanceTo(this.player.position) < 12) return
    this.spawnEnemy(point)
    this.remaining -= 1
    this.effects.spawnFlare(point.clone().setY(0.12))
  }

  spawnEnemy(position, options = {}) {
    const wave = options.wave ?? Math.max(1, this.wave)
    const index = this.enemies.length + this.totalKilled
    const enemy = new Enemy(this, position, {
      wave,
      name: options.name ?? CALLSIGNS[index % CALLSIGNS.length],
      health: 100 + (wave - 1) * 8 + Math.floor(Math.random() * 12),
      damage: 5.2 + wave * 0.55,
      speed: Math.min(3.6, 2.45 + wave * 0.075) * (0.92 + Math.random() * 0.16)
    })
    this.enemies.push(enemy)
    this.hitMeshes.push(...enemy.hitMeshes)
    if (options.idle) enemy.faceToward(this.player.position, true)
    return enemy
  }

  removeHits(enemy) {
    const set = new Set(enemy.hitMeshes)
    this.hitMeshes = this.hitMeshes.filter((mesh) => !set.has(mesh))
  }

  hit(enemy, damage, part, point, direction) {
    if (!enemy || !enemy.alive) return false
    const killed = enemy.takeDamage(damage)
    if (killed) {
      this.waveKilled += 1
      this.totalKilled += 1
      this.callbacks.onKill?.(enemy, part, point)
    }
    return killed
  }

  onEnemyKilled() {
    this.spawnTimer = Math.min(this.spawnTimer, 0.4)
  }

  get aliveCount() {
    let count = 0
    for (const enemy of this.enemies) if (enemy.alive) count += 1
    return count
  }

  get hostilesRemaining() {
    return this.remaining + this.aliveCount
  }

  update(dt, time, running = true) {
    for (const enemy of this.enemies) enemy.update(dt, time, running && this.active)
    this.enemies = this.enemies.filter((enemy) => !enemy.removed)
    if (!this.active) {
      this.hud?.setHostiles(this.aliveCount)
      return
    }
    if (this.finished) return

    if (this.remaining > 0) {
      this.spawnTimer -= dt
      if (this.spawnTimer <= 0 && this.aliveCount < this.maxAlive) {
        this.spawnAtRandom()
        this.spawnTimer = 0.85 + Math.random() * 0.9
      }
    }

    if (this.betweenWaves > 0) {
      this.betweenWaves -= dt
      if (this.betweenWaves <= 0) {
        if (this.wave >= 6) {
          this.finished = true
          this.callbacks.onVictory?.()
        } else {
          this.startWave(this.wave + 1)
        }
      }
    } else if (this.remaining === 0 && this.aliveCount === 0) {
      this.betweenWaves = 3.6
      this.callbacks.onWaveClear?.(this.wave, this.waveKilled)
    }
    this.hud?.setHostiles(this.hostilesRemaining)
  }
}
