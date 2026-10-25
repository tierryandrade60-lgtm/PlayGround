import * as THREE from 'three'
import { PALETTE } from './config.js'

const TAU = Math.PI * 2

function shortestAngle(from, to) {
  let delta = (to - from) % TAU
  if (delta > Math.PI) delta -= TAU
  if (delta < -Math.PI) delta += TAU
  return delta
}

export class Oi {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.visual = new THREE.Group()
    this.group.add(this.visual)
    this.spring = 0
    this.springVel = 0
    this.charge = 0
    this.blinkIn = 2.2
    this.blinkFor = 0
    this.yaw = 0
    this.targetYaw = 0
    this.falling = false
    this.tumble = 0
    this.flash = 0

    this.build()
    scene.add(this.group)
  }

  build() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.oiBody,
      roughness: 0.52,
      metalness: 0.02,
      emissive: PALETTE.oiGlow,
      emissiveIntensity: 0.08,
    })
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), bodyMat)
    body.scale.set(1, 0.96, 1)
    body.castShadow = true
    body.receiveShadow = true
    this.body = body
    this.visual.add(body)

    const bellyMat = new THREE.MeshStandardMaterial({
      color: '#ffe9c9',
      roughness: 0.6,
      emissive: '#ffc98c',
      emissiveIntensity: 0.08,
    })
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), bellyMat)
    belly.position.set(0, -0.16, 0.22)
    belly.scale.set(1.04, 0.78, 0.72)
    this.visual.add(belly)

    const eyeMat = new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.32 })
    const glintMat = new THREE.MeshBasicMaterial({ color: '#fffdf6' })
    this.eyes = new THREE.Group()
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), eyeMat)
      eye.position.set(0.175 * side, 0.105, 0.475)
      eye.scale.set(1, 1.16, 0.65)
      this.eyes.add(eye)

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), glintMat)
      glint.position.set(0.165 * side + 0.018, 0.15, 0.525)
      glint.scale.set(1, 1.1, 0.5)
      this.eyes.add(glint)
    }
    this.eyes.position.y = 0
    this.visual.add(this.eyes)

    const blushMat = new THREE.MeshStandardMaterial({
      color: PALETTE.blush,
      roughness: 0.8,
      transparent: true,
      opacity: 0.62,
      emissive: PALETTE.blush,
      emissiveIntensity: 0.2,
    })
    for (const side of [-1, 1]) {
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), blushMat)
      blush.position.set(0.305 * side, -0.035, 0.4)
      blush.scale.set(0.85, 0.55, 0.3)
      this.visual.add(blush)
    }

    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.072, 0.015, 6, 18, Math.PI),
      new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.5 }),
    )
    smile.position.set(0, -0.062, 0.512)
    smile.rotation.z = Math.PI
    smile.rotation.x = -0.12
    this.visual.add(smile)

    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), bodyMat)
    tuft.position.set(0, 0.6, -0.03)
    tuft.rotation.z = 0.22
    tuft.castShadow = true
    this.tuft = tuft
    this.visual.add(tuft)

    for (const side of [-1, 1]) {
      const nub = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), bodyMat)
      nub.position.set(0.5 * side, -0.12, 0)
      nub.scale.set(0.65, 0.9, 0.7)
      nub.castShadow = true
      this.visual.add(nub)
    }

    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), bellyMat)
      foot.position.set(0.17 * side, -0.47, 0.06)
      foot.scale.set(0.92, 0.55, 1.15)
      this.visual.add(foot)
    }

    const haloMat = new THREE.MeshStandardMaterial({
      color: PALETTE.halo,
      emissive: PALETTE.halo,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.15,
    })
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.022, 8, 40), haloMat)
    this.halo.position.y = 0.78
    this.halo.rotation.x = Math.PI / 2 - 0.22
    this.visual.add(this.halo)

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: '#ffd59a',
        map: this.glowTexture(),
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    glow.scale.set(1.9, 1.9, 1)
    glow.position.z = -0.05
    this.glow = glow
    this.visual.add(glow)

    this.light = new THREE.PointLight('#ffcf94', 3.2, 8, 2)
    this.light.position.set(0, 0.25, 0.4)
    this.group.add(this.light)
  }

  glowTexture() {
    if (Oi.cachedGlow) return Oi.cachedGlow
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.25, 'rgba(255,244,214,0.75)')
    gradient.addColorStop(0.55, 'rgba(255,214,150,0.28)')
    gradient.addColorStop(1, 'rgba(255,200,140,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    Oi.cachedGlow = texture
    return texture
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z)
  }

  setLookAt(target) {
    const dx = target.x - this.group.position.x
    const dz = target.z - this.group.position.z
    if (Math.abs(dx) + Math.abs(dz) < 0.0001) return
    this.targetYaw = Math.atan2(dx, dz)
  }

  faceNow() {
    this.yaw = this.targetYaw
    this.group.rotation.y = this.yaw
  }

  chargeStart() {
    this.charge = 0
  }

  setCharge(value) {
    this.charge = value
  }

  launch(strength = 1) {
    this.charge = 0
    this.springVel += 2.7 * strength
    this.flash = 0.7
  }

  land(hard = 1) {
    this.springVel -= 3.2 * hard
    this.falling = false
    this.tumble = 0
    this.group.rotation.x = 0
    this.group.rotation.z = 0
  }

  startFall() {
    this.falling = true
    this.tumble = 5
  }

  reset() {
    this.falling = false
    this.tumble = 0
    this.charge = 0
    this.spring = 0
    this.springVel = 0
    this.blinkIn = 2.2
    this.blinkFor = 0
    this.group.rotation.set(0, this.yaw, 0)
    this.visual.position.set(0, 0, 0)
    this.visual.scale.set(1, 1, 1)
    this.body.material.emissiveIntensity = 0.14
  }

  update(dt, elapsed, { state = 'ready', verticalVelocity = 0 } = {}) {
    this.blinkIn -= dt
    if (this.blinkFor > 0) {
      this.blinkFor -= dt
      const k = this.blinkFor > 0 ? 0.12 : 1
      this.eyes.scale.y += (k - this.eyes.scale.y) * Math.min(1, dt * 34)
    } else {
      this.eyes.scale.y += (1 - this.eyes.scale.y) * Math.min(1, dt * 24)
      if (this.blinkIn <= 0) {
        this.blinkIn = 2.6 + Math.random() * 3.4
        this.blinkFor = 0.1
      }
    }

    if (state === 'charging') {
      const v = this.charge
      const sy = 1 - v * 0.24
      const sxz = 1 + v * 0.16
      this.visual.scale.x += (sxz - this.visual.scale.x) * Math.min(1, dt * 12)
      this.visual.scale.z += (sxz - this.visual.scale.z) * Math.min(1, dt * 12)
      this.visual.scale.y += (sy - this.visual.scale.y) * Math.min(1, dt * 12)
      this.visual.position.y = (1 - sy) * 0.4
    } else {
      const stiffness = 130
      const damping = 13
      this.springVel += (-this.spring * stiffness - this.springVel * damping) * dt
      this.spring += this.springVel * dt
      this.spring = Math.max(-0.36, Math.min(0.36, this.spring))
      this.visual.scale.y += (1 + this.spring - this.visual.scale.y) * Math.min(1, dt * 16)
      const sxz = 1 - this.spring * 0.55
      this.visual.scale.x += (sxz - this.visual.scale.x) * Math.min(1, dt * 16)
      this.visual.scale.z += (sxz - this.visual.scale.z) * Math.min(1, dt * 16)
      this.visual.position.y += ((state === 'ready' ? Math.sin(elapsed * 2.6) * 0.045 : 0) - this.visual.position.y) * Math.min(1, dt * 8)
    }

    if (state === 'ready') {
      this.group.rotation.y += shortestAngle(this.group.rotation.y, this.targetYaw) * Math.min(1, dt * 5)
      this.group.rotation.z = Math.sin(elapsed * 1.4) * 0.02
      this.group.rotation.x = Math.sin(elapsed * 1.1) * 0.015
      this.halo.position.y = 0.78 + Math.sin(elapsed * 2.1) * 0.03
    } else if (state === 'flying') {
      this.group.rotation.y += shortestAngle(this.group.rotation.y, this.targetYaw) * Math.min(1, dt * 8)
      const tilt = Math.max(-0.32, Math.min(0.32, -verticalVelocity * 0.018))
      this.group.rotation.x += (tilt - this.group.rotation.x) * Math.min(1, dt * 8)
      this.group.rotation.z += (Math.sin(elapsed * 7) * 0.06 - this.group.rotation.z) * Math.min(1, dt * 6)
    } else if (state === 'falling') {
      this.group.rotation.x += this.tumble * dt
      this.group.rotation.z += this.tumble * 0.6 * dt
    } else {
      this.group.rotation.y += shortestAngle(this.group.rotation.y, this.targetYaw) * Math.min(1, dt * 8)
      this.group.rotation.x += (0 - this.group.rotation.x) * Math.min(1, dt * 6)
      this.group.rotation.z += (0 - this.group.rotation.z) * Math.min(1, dt * 6)
    }

    this.halo.rotation.z += dt * 0.8
    this.tuft.rotation.z = 0.22 + Math.sin(elapsed * 2.4) * 0.08

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3)
      this.body.material.emissiveIntensity = 0.08 + this.flash * 0.8
      this.glow.material.opacity = 0.26 + this.flash * 0.3
    } else {
      this.body.material.emissiveIntensity += (0.08 + (state === 'charging' ? this.charge * 0.3 : 0) - this.body.material.emissiveIntensity) * Math.min(1, dt * 5)
      this.glow.material.opacity += (0.26 + (state === 'charging' ? this.charge * 0.25 : 0) - this.glow.material.opacity) * Math.min(1, dt * 5)
    }

    this.light.intensity = 3.2 + (state === 'charging' ? this.charge * 3.5 : 0) + this.flash * 3
    this.light.distance = 9 + this.flash * 3
  }
}
