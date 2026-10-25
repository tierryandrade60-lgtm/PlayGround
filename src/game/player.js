import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)

export class Player {
  constructor(camera, world, audio, input, options = {}) {
    this.camera = camera
    this.world = world
    this.audio = audio
    this.input = input
    this.spawn = new THREE.Vector3(options.spawn?.x ?? 0, 0, options.spawn?.z ?? 26)
    this.position = this.spawn.clone()
    this.velocity = new THREE.Vector3()
    this.radius = 0.4
    this.eyeHeight = 1.68
    this.maxHealth = 100
    this.health = 100
    this.alive = true
    this.grounded = true
    this.yaw = 0
    this.pitch = -0.015
    this.speed = 0
    this.sprinting = false
    this.aiming = false
    this.moving = false
    this.bobTime = 0
    this.bobY = 0
    this.bobX = 0
    this.bobRoll = 0
    this.dip = 0
    this.dipVelocity = 0
    this.trauma = 0
    this.lastDamage = -100
    this.stepAccumulator = 0
    this.footstepIndex = 0
    this.recoilPitch = 0
    this.recoilYaw = 0
    this.baseFov = options.fov ?? 72
    this.onDeath = options.onDeath || null
    this.onDamage = options.onDamage || null
    this.deathTime = 0
    this.swayX = 0
    this.swayY = 0
    this.time = 0
  }

  reset() {
    this.position.copy(this.spawn)
    this.velocity.set(0, 0, 0)
    this.health = this.maxHealth
    this.alive = true
    this.grounded = true
    this.yaw = 0
    this.pitch = -0.015
    this.speed = 0
    this.sprinting = false
    this.aiming = false
    this.trauma = 0
    this.dip = 0
    this.dipVelocity = 0
    this.bobTime = 0
    this.stepAccumulator = 0
    this.lastDamage = -100
    this.recoilPitch = 0
    this.recoilYaw = 0
    this.camera.fov = this.baseFov
    this.camera.updateProjectionMatrix()
    this.applyCamera(0)
  }

  addRecoil(pitch, yaw) {
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -1.42, 1.42)
    this.yaw += yaw
    this.trauma = Math.min(1, this.trauma + Math.abs(pitch) * 1.6 + Math.abs(yaw) * 1.1)
  }

  addTrauma(value) {
    this.trauma = Math.min(1, this.trauma + value)
  }

  takeDamage(amount, source = null) {
    if (!this.alive || amount <= 0) return
    this.health = Math.max(0, this.health - amount)
    this.lastDamage = this.time
    this.trauma = Math.min(1, this.trauma + 0.32 + amount * 0.007)
    if (this.onDamage) this.onDamage(amount, source)
    if (this.health <= 0) {
      this.alive = false
      this.deathTime = this.time
      if (this.onDeath) this.onDeath()
    }
  }

  update(dt, time) {
    this.time = time
    if (!this.alive) {
      this.updateDeathCamera(dt)
      return
    }

    const input = this.input
    this.aiming = input.ads
    const look = input.consumeLook()
    const sensitivity = (input.touch ? 0.0042 : 0.0021) * (this.aiming ? 0.62 : 1)
    this.yaw -= look.x * sensitivity
    this.pitch -= look.y * sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.42, 1.42)
    this.swayX = THREE.MathUtils.lerp(this.swayX, THREE.MathUtils.clamp(-look.x * 0.0009, -0.03, 0.03), Math.min(1, dt * 10))
    this.swayY = THREE.MathUtils.lerp(this.swayY, THREE.MathUtils.clamp(-look.y * 0.0009, -0.03, 0.03), Math.min(1, dt * 10))

    const move = input.move
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const wish = new THREE.Vector3()
    wish.addScaledVector(forward, move.y)
    wish.addScaledVector(right, move.x)
    const wishLength = Math.min(1, wish.length())
    if (wishLength > 0) wish.normalize()

    this.sprinting = !this.aiming && input.sprinting && move.y > 0.35 && this.grounded
    let targetSpeed = this.aiming ? 2.9 : this.sprinting ? 8.2 : 5.5
    if (this.health < 30) targetSpeed *= 0.9
    targetSpeed *= wishLength

    const desired = wish.multiplyScalar(targetSpeed)
    const accel = this.grounded ? (wishLength > 0 ? 13 : 10) : 2.4
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desired.x, accel, dt)
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desired.z, accel, dt)

    if (input.consumeJump() && this.grounded) {
      this.velocity.y = 5.9
      this.grounded = false
      this.audio.jump()
      this.addTrauma(0.12)
    }

    this.velocity.y -= 18 * dt
    this.position.x += this.velocity.x * dt
    this.position.z += this.velocity.z * dt
    this.position.y += this.velocity.y * dt

    this.world.collide(this.position, this.radius, this.eyeHeight)

    if (this.position.y <= 0) {
      if (!this.grounded) {
        const impact = Math.min(1, -this.velocity.y / 9)
        this.dipVelocity -= 2.4 * impact
        if (impact > 0.28) {
          this.audio.land()
          this.addTrauma(0.18 * impact)
        }
      }
      this.position.y = 0
      this.velocity.y = 0
      this.grounded = true
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    this.speed = horizontalSpeed
    this.moving = horizontalSpeed > 0.7

    if (this.grounded && this.moving) {
      this.bobTime += dt * horizontalSpeed * 1.55
      const amount = (this.aiming ? 0.35 : 1) * Math.min(1, horizontalSpeed / 5.5)
      this.bobY = Math.sin(this.bobTime * 2) * 0.038 * amount
      this.bobX = Math.cos(this.bobTime) * 0.026 * amount
      this.bobRoll = Math.sin(this.bobTime) * 0.006 * amount
      this.stepAccumulator += horizontalSpeed * dt
      const stride = this.sprinting ? 2.6 : 1.85
      if (this.stepAccumulator > stride) {
        this.stepAccumulator = 0
        this.footstepIndex += 1
        this.audio.footstep('asphalt', this.sprinting ? 1.25 : 0.9)
      }
    } else {
      this.bobY = THREE.MathUtils.damp(this.bobY, 0, 7, dt)
      this.bobX = THREE.MathUtils.damp(this.bobX, 0, 7, dt)
      this.bobRoll = THREE.MathUtils.damp(this.bobRoll, 0, 7, dt)
    }

    this.dipVelocity += -this.dip * 60 * dt
    this.dipVelocity *= Math.exp(-9 * dt)
    this.dip += this.dipVelocity * dt

    this.trauma = Math.max(0, this.trauma - dt * 1.5)

    if (this.health < this.maxHealth && this.time - this.lastDamage > 4.4) {
      this.health = Math.min(this.maxHealth, this.health + 30 * dt)
    }

    const targetFov = this.aiming ? 51 : this.sprinting ? 77 : this.baseFov
    const fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 9, dt)
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }

    this.applyCamera(dt)
  }

  updateDeathCamera(dt) {
    const target = 0.42
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 0.55, 3, dt)
    this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, target, 2.4, dt)
    this.camera.rotation.x = THREE.MathUtils.damp(this.camera.rotation.x, this.pitch + 0.2, 2, dt)
    this.camera.rotation.y = THREE.MathUtils.damp(this.camera.rotation.y, this.yaw + 0.25, 2, dt)
  }

  applyCamera(dt) {
    const shake = this.trauma * this.trauma
    const t = this.time * 27
    const shakeX = (Math.sin(t * 1.7) + Math.sin(t * 3.3) * 0.5) * 0.012 * shake
    const shakeY = (Math.cos(t * 2.1) + Math.sin(t * 4.1) * 0.5) * 0.012 * shake
    const shakeZ = Math.sin(t * 2.7) * 0.018 * shake

    const eye = this.eyeHeight + this.bobY + this.dip
    this.camera.position.set(
      this.position.x + this.bobX + shakeZ * 0.35,
      this.position.y + eye + shakeY * 0.4,
      this.position.z
    )
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.x = this.pitch + shakeX
    this.camera.rotation.y = this.yaw + shakeZ * 0.4 + this.swayX * 0.12
    this.camera.rotation.z = this.bobRoll + shakeZ * 0.7 + this.swayX * 0.3
  }

  getForward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
  }

  getEyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z)
  }

  getAimRay() {
    const origin = this.camera.getWorldPosition(new THREE.Vector3())
    const direction = this.camera.getWorldDirection(new THREE.Vector3())
    return { origin, direction }
  }
}

export { UP }
