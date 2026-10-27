import * as THREE from 'three'

const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export class Player {
  constructor({ camera, world, audio }) {
    this.camera = camera
    this.world = world
    this.audio = audio
    this.position = new THREE.Vector3(0, 1.68, 10.5)
    this.velocity = new THREE.Vector3()
    this.yaw = 0
    this.pitch = 0
    this.maxHealth = 100
    this.maxArmor = 100
    this.health = 100
    this.armor = 100
    this.alive = true
    this.grounded = true
    this.jumpY = 0
    this.vy = 0
    this.crouchAmount = 0
    this.crouching = false
    this.speed = 0
    this.timeSinceDamage = 99
    this.stepAccum = 0
    this.shake = 0
    this.shakeT = 0
    this.bobT = 0
    this.lean = 0
    this.spawn = new THREE.Vector3(0, 1.68, 10.5)
    this.eyeHeight = 1.68
  }

  reset() {
    this.position.copy(this.spawn)
    this.velocity.set(0, 0, 0)
    this.yaw = 0
    this.pitch = -0.02
    this.health = this.maxHealth
    this.armor = this.maxArmor
    this.alive = true
    this.grounded = true
    this.jumpY = 0
    this.vy = 0
    this.crouchAmount = 0
    this.crouching = false
    this.speed = 0
    this.timeSinceDamage = 99
    this.stepAccum = 0
    this.shake = 0
    this.shakeT = 0
    this.bobT = 0
    this.lean = 0
  }

  applyLook(dx, dy, sensitivity) {
    const s = sensitivity * 0.0021
    this.yaw -= dx * s
    this.pitch -= dy * s
    this.pitch = clamp(this.pitch, -1.35, 1.28)
  }

  recoil(pitch, yaw) {
    this.pitch = clamp(this.pitch + pitch, -1.35, 1.28)
    this.yaw += yaw
    this.shake = Math.min(0.8, this.shake + 0.08)
  }

  jump() {
    if (this.alive && this.grounded) {
      this.vy = 5.1
      this.grounded = false
      this.jumpY = 0.001
    }
  }

  update(dt, input, { ads = false, time = 0 } = {}) {
    this.timeSinceDamage += dt
    if (this.health < 70 && this.timeSinceDamage > 5.5 && this.alive) {
      this.health = Math.min(70, this.health + dt * 7)
    }
    this.crouching = input.crouch
    this.crouchAmount = damp(this.crouchAmount, this.crouching ? 1 : 0, 12, dt)

    const f = input.move.y
    const r = input.move.x
    const forwardAmt = -f
    const wantsSprint = input.sprint && forwardAmt > 0.4 && !ads && !this.crouching
    let targetSpeed = 5.5
    if (ads) targetSpeed = 3.3
    if (this.crouching) targetSpeed = 2.6
    if (wantsSprint) targetSpeed = 8.4

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw)
    const dx = (-sin * forwardAmt) + (cos * r)
    const dz = (-cos * forwardAmt) + (-sin * r)
    const len = Math.hypot(dx, dz)
    let tx = 0, tz = 0
    if (len > 0.001) { tx = dx / len; tz = dz / len }

    const accel = this.grounded ? 11 : 2.2
    this.velocity.x = damp(this.velocity.x, tx * targetSpeed, accel, dt)
    this.velocity.z = damp(this.velocity.z, tz * targetSpeed, accel, dt)
    if (len < 0.01 && this.grounded) {
      this.velocity.x = damp(this.velocity.x, 0, 14, dt)
      this.velocity.z = damp(this.velocity.z, 0, 14, dt)
    }

    this.position.x += this.velocity.x * dt
    this.position.z += this.velocity.z * dt
    this.world.resolveCircle(this.position, 0.38)

    if (!this.grounded) {
      this.vy -= 17.5 * dt
      this.jumpY += this.vy * dt
      if (this.jumpY <= 0) {
        this.jumpY = 0
        this.vy = 0
        this.grounded = true
      }
    }

    const eye = 1.68 - this.crouchAmount * 0.5
    this.position.y = eye + this.jumpY
    this.speed = Math.hypot(this.velocity.x, this.velocity.z)

    const moving = this.speed / 5.5
    this.bobT += dt * (5.5 + this.speed * 1.15)
    this.lean = damp(this.lean, r * 0.018, 6, dt)

    if (this.grounded && this.speed > 0.7) {
      this.stepAccum += dt * this.speed
      if (this.stepAccum > (wantsSprint ? 4.1 : 3.2)) {
        this.stepAccum = 0
        this.audio.footstep(wantsSprint)
        this.shake = Math.min(0.4, this.shake + 0.025)
      }
    }

    this.shakeT += dt
    this.shake = Math.max(0, this.shake - dt * 2.2)

    const bobX = Math.sin(this.bobT) * 0.022 * moving * (this.grounded ? 1 : 0.2)
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.026 * moving * (this.grounded ? 1 : 0.2)
    const shakeX = Math.sin(this.shakeT * 53) * this.shake * 0.022
    const shakeY = Math.cos(this.shakeT * 47) * this.shake * 0.018

    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.pitch + shakeY, this.yaw + shakeX, this.lean, 'YXZ')
    this.camera.position.set(this.position.x + bobX, this.position.y + bobY, this.position.z)

    return { moving, sprinting: wantsSprint, movingSpeed: this.speed }
  }

  damage(amount, source) {
    if (!this.alive) return false
    const absorbed = Math.min(this.armor, amount * 0.55)
    this.armor -= absorbed
    const hpLoss = Math.max(0, amount - absorbed)
    this.health -= hpLoss
    this.timeSinceDamage = 0
    this.shake = Math.min(1.2, this.shake + 0.35 + amount * 0.012)
    this.audio.damage()
    if (this.health <= 0) {
      this.health = 0
      this.alive = false
      return true
    }
    return false
  }

  heal(v) { this.health = Math.min(this.maxHealth, this.health + v) }
  addArmor(v) { this.armor = Math.min(this.maxArmor, this.armor + v) }
  getEyePosition(out = new THREE.Vector3()) { return out.copy(this.position) }
}
