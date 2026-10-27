import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt))

export class Weapon {
  constructor({ camera, scene, textures, effects, audio, quality }) {
    this.camera = camera
    this.scene = scene
    this.tex = textures
    this.effects = effects
    this.audio = audio
    this.quality = quality

    this.magSize = 30
    this.ammo = 30
    this.reserve = 210
    this.damage = 30
    this.rpm = 680
    this.cooldown = 0
    this.reloadTime = 1.85
    this.reloading = false
    this.reloadT = 0
    this.reloadStage = 0
    this.spread = 0.005
    this.bloom = 0
    this.ads = false
    this.adsAmount = 0
    this.time = 0
    this.shots = 0
    this.hits = 0
    this.recoilZ = 0
    this.recoilRot = 0
    this.recoilVelZ = 0
    this.recoilVelRot = 0
    this.swayX = 0
    this.swayY = 0
    this.bobT = 0
    this.muzzleTimer = 0
    this.sprintAmount = 0
    this.crouchAmount = 0

    this.buildModel()
    this.ejectPort = new THREE.Object3D()
    this.ejectPort.position.set(0.09, 0.02, 0.04)
    this.model.add(this.ejectPort)
    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0, 0.045, -0.63)
    this.model.add(this.muzzle)
  }

  buildModel() {
    this.root = new THREE.Group()
    this.root.position.set(0.25, -0.28, -0.59)
    this.root.scale.setScalar(0.84)
    this.camera.add(this.root)
    this.model = new THREE.Group()
    this.root.add(this.model)

    const metalTex = this.tex.metal.map
    this.mats = {
      receiver: new THREE.MeshStandardMaterial({ map: metalTex, color: 0x6b757c, metalness: 0.62, roughness: 0.44, envMapIntensity: 1.7 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x363e43, metalness: 0.6, roughness: 0.46, envMapIntensity: 1.5 }),
      polymer: new THREE.MeshStandardMaterial({ color: 0x3a4144, metalness: 0.2, roughness: 0.66, envMapIntensity: 1.2 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x443d34, metalness: 0.14, roughness: 0.8 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff4a00, emissiveIntensity: 1.8, metalness: 0.4, roughness: 0.4 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0a2733, emissive: 0x0b6d86, emissiveIntensity: 0.45, metalness: 0.85, roughness: 0.06, transparent: true, opacity: 0.72, envMapIntensity: 1.6 }),
      reticle: new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      steel: new THREE.MeshStandardMaterial({ color: 0x6b7378, metalness: 0.95, roughness: 0.25, envMapIntensity: 1.2 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x1c2a30, emissive: 0xff8a30, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.3 })
    }

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.rotation.set(rx, ry, rz)
      m.castShadow = false
      m.receiveShadow = false
      this.model.add(m)
      return m
    }
    const rb = (w, h, d, r = 0.008) => new RoundedBoxGeometry(w, h, d, 3, r)

    add(rb(0.115, 0.135, 0.4, 0.014), this.mats.receiver, 0, 0.01, 0)
    add(rb(0.1, 0.048, 0.36, 0.008), this.mats.dark, 0, 0.116, -0.01)
    add(rb(0.088, 0.09, 0.26, 0.01), this.mats.polymer, 0, 0.03, -0.39)
    add(rb(0.082, 0.082, 0.18, 0.008), this.mats.receiver, 0, 0.01, -0.56)

    for (let i = 0; i < 7; i++) {
      add(new THREE.BoxGeometry(0.085, 0.012, 0.028), this.mats.dark, 0, 0.155, -0.12 - i * 0.045)
    }
    for (let i = 0; i < 4; i++) {
      add(new THREE.BoxGeometry(0.018, 0.012, 0.05), this.mats.dark, 0, 0.147, 0.08 + i * 0.05)
    }

    const barrel = add(new THREE.CylinderGeometry(0.019, 0.021, 0.6, 12), this.mats.steel, 0, 0.045, -0.34, Math.PI / 2)
    barrel.rotation.x = Math.PI / 2
    add(new THREE.CylinderGeometry(0.037, 0.037, 0.17, 14), this.mats.dark, 0, 0.045, -0.615, Math.PI / 2)
    for (let i = 0; i < 3; i++) {
      add(new THREE.BoxGeometry(0.05, 0.012, 0.025), this.mats.receiver, 0, 0.084, -0.61 + i * 0.045)
    }
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 10), this.mats.dark, 0, -0.02, -0.47, Math.PI / 2)

    add(rb(0.055, 0.055, 0.16, 0.008), this.mats.dark, 0.064, 0.03, -0.36)
    add(new THREE.CylinderGeometry(0.023, 0.023, 0.1, 12), this.mats.steel, 0.064, -0.01, -0.46, Math.PI / 2)
    add(new THREE.CircleGeometry(0.019, 16), this.mats.lens, 0.064, -0.01, -0.512)

    add(rb(0.075, 0.105, 0.19, 0.009), this.mats.dark, 0, -0.02, 0.27)
    add(rb(0.09, 0.125, 0.035, 0.006), this.mats.polymer, 0, -0.02, 0.37)
    add(rb(0.07, 0.16, 0.085, 0.015), this.mats.grip, 0, -0.13, 0.14, -0.28)
    add(rb(0.062, 0.17, 0.075, 0.01), this.mats.grip, 0, -0.13, 0.035, 0.18)
    this.magMesh = add(rb(0.062, 0.24, 0.095, 0.01), this.mats.dark, 0, -0.17, -0.045, -0.12)
    add(new THREE.BoxGeometry(0.064, 0.03, 0.096), this.mats.accent, 0, -0.29, -0.06, -0.12)

    add(new THREE.TorusGeometry(0.042, 0.006, 5, 16), this.mats.dark, 0, -0.085, 0.055, 0, 0, Math.PI / 2)
    add(new THREE.BoxGeometry(0.016, 0.035, 0.09), this.mats.dark, 0, -0.075, 0.09)
    add(new THREE.BoxGeometry(0.02, 0.055, 0.02), this.mats.dark, 0, 0.045, 0.19, 0.3)

    add(rb(0.05, 0.055, 0.14, 0.006), this.mats.dark, 0, 0.163, -0.02)
    add(new THREE.CylinderGeometry(0.043, 0.043, 0.16, 20), this.mats.receiver, 0, 0.205, -0.02, Math.PI / 2)
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), this.mats.dark, 0, 0.205, 0.07, Math.PI / 2)
    add(new THREE.CircleGeometry(0.034, 20), this.mats.glass, 0, 0.205, 0.081)
    add(new THREE.CircleGeometry(0.028, 20), this.mats.glass, 0, 0.205, -0.105)
    this.reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.soft, color: 0xff3a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }))
    this.reticle.position.set(0, 0.205, -0.08)
    this.reticle.scale.set(0.017, 0.017, 1)
    this.model.add(this.reticle)
    add(new THREE.BoxGeometry(0.012, 0.035, 0.01), this.mats.dark, 0, 0.255, 0.045)
    add(new THREE.BoxGeometry(0.05, 0.012, 0.012), this.mats.dark, 0, 0.257, 0.045)

    add(new THREE.BoxGeometry(0.012, 0.042, 0.12), this.mats.accent, 0.063, 0.0, 0.06)
    add(new THREE.BoxGeometry(0.012, 0.042, 0.12), this.mats.accent, -0.063, 0.0, 0.06)
    for (const sx of [-0.045, 0.045]) {
      for (const z of [-0.13, 0.13]) {
        add(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 8), this.mats.steel, sx, -0.045, z, 0, 0, Math.PI / 2)
      }
    }
    add(new THREE.BoxGeometry(0.018, 0.018, 0.06), this.mats.steel, 0.052, 0.088, 0.12)
    add(new THREE.BoxGeometry(0.018, 0.018, 0.06), this.mats.steel, 0.052, 0.088, -0.02)

    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex.flash, color: 0xffc070, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }))
    this.flashSprite.position.set(0, 0.045, -0.71)
    this.flashSprite.scale.set(0.5, 0.5, 1)
    this.model.add(this.flashSprite)

    this.flashLight = new THREE.PointLight(0xffaa60, 0, 9, 2)
    this.flashLight.position.set(0, 0.06, -0.66)
    this.model.add(this.flashLight)

    this.cameraLight = new THREE.PointLight(0xd8ecff, 8.5, 6, 2)
    this.cameraLight.position.set(0.35, 0.35, 0.25)
    this.camera.add(this.cameraLight)

    this.basePos = this.root.position.clone()
    this.adsPos = new THREE.Vector3(0, -0.1, -0.44)
    this.sprintPos = new THREE.Vector3(0.34, -0.34, -0.46)
  }

  setAds(v) { this.ads = v }

  tryShoot() {
    if (this.reloading || this.cooldown > 0) return null
    if (this.ammo <= 0) {
      this.audio.empty()
      this.cooldown = 0.25
      return null
    }
    this.ammo--
    this.shots++
    this.cooldown = 60 / this.rpm
    this.bloom = Math.min(0.9, this.bloom + 0.32)
    this.recoilVelZ += 0.75 + Math.random() * 0.35
    this.recoilVelRot += 0.55 + Math.random() * 0.3

    const spread = this.getSpread()
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize()
    const up = new THREE.Vector3().crossVectors(right, dir).normalize()
    const r = Math.sqrt(Math.random()) * spread
    const a = Math.random() * Math.PI * 2
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize()

    const origin = new THREE.Vector3()
    this.camera.getWorldPosition(origin)
    const muzzle = new THREE.Vector3()
    this.muzzle.getWorldPosition(muzzle)

    this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, dir, 0xffc070)
    const shellPos = new THREE.Vector3()
    this.ejectPort.getWorldPosition(shellPos)
    this.effects.ejectShell(shellPos, dir)
    this.muzzleTimer = 0.055
    this.flashSprite.material.rotation = Math.random() * Math.PI
    const s = 0.42 + Math.random() * 0.22
    this.flashSprite.scale.set(s, s, 1)
    this.flashLight.intensity = 22
    this.audio.gunshot()

    return { origin, direction: dir, muzzle, spread }
  }

  getSpread() {
    const move = this.moveAmount || 0
    const base = this.ads ? 0.0016 : 0.0062
    return base + move * (this.ads ? 0.005 : 0.012) + this.bloom * (this.ads ? 0.004 : 0.014)
  }

  reload() {
    if (this.reloading || this.ammo >= this.magSize || this.reserve <= 0) return
    this.reloading = true
    this.reloadT = 0
    this.reloadStage = 0
    this.audio.reloadStart()
  }

  finishReload() {
    const need = this.magSize - this.ammo
    const take = Math.min(need, this.reserve)
    this.ammo += take
    this.reserve -= take
    this.reloading = false
    this.reloadT = 0
    this.reloadStage = 0
  }

  update(dt, { moving = 0, sprinting = false, crouching = false, lookX = 0, lookY = 0, time = 0, grounded = true } = {}) {
    this.time = time
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.bloom = Math.max(0, this.bloom - dt * 1.35)
    this.moveAmount = moving
    this.adsAmount = damp(this.adsAmount, this.ads ? 1 : 0, 13, dt)
    this.sprintAmount = damp(this.sprintAmount, sprinting && moving > 0.3 && !this.ads ? 1 : 0, 9, dt)
    this.crouchAmount = damp(this.crouchAmount, crouching ? 1 : 0, 10, dt)

    this.swayX = damp(this.swayX, clamp(-lookX * 0.0011, -0.035, 0.035), 7, dt)
    this.swayY = damp(this.swayY, clamp(-lookY * 0.0011, -0.03, 0.03), 7, dt)

    const speedBob = moving * (sprinting ? 1.7 : 1) * (grounded ? 1 : 0.2)
    this.bobT += dt * (4.5 + speedBob * 7)
    const bobX = Math.sin(this.bobT) * 0.016 * speedBob
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.014 * speedBob

    if (this.reloading) {
      this.reloadT += dt
      const p = this.reloadT / this.reloadTime
      if (p >= 0.38 && this.reloadStage === 0) { this.reloadStage = 1 }
      if (p >= 0.7 && this.reloadStage === 1) { this.reloadStage = 2; this.audio.reloadEnd() }
      if (p >= 1) this.finishReload()
    }

    this.recoilVelZ += (-this.recoilZ * 90 - this.recoilVelZ * 12) * dt
    this.recoilZ += this.recoilVelZ * dt
    this.recoilVelRot += (-this.recoilRot * 80 - this.recoilVelRot * 11) * dt
    this.recoilRot += this.recoilVelRot * dt

    let reloadRot = 0
    let reloadDrop = 0
    if (this.reloading) {
      const p = this.reloadT / this.reloadTime
      const env = Math.sin(Math.min(1, p) * Math.PI)
      reloadRot = env * 0.55
      reloadDrop = env * 0.075
    }

    const ads = this.adsAmount
    const target = new THREE.Vector3().lerpVectors(this.basePos, this.adsPos, ads)
    target.x = target.x * (1 - this.sprintAmount) + this.sprintPos.x * this.sprintAmount
    target.y = target.y * (1 - this.sprintAmount) + this.sprintPos.y * this.sprintAmount
    target.z = target.z * (1 - this.sprintAmount) + this.sprintPos.z * this.sprintAmount
    target.x += bobX * (1 - ads * 0.7) + this.swayX * (1 - ads * 0.5)
    target.y += bobY * (1 - ads * 0.7) + this.swayY * (1 - ads * 0.5) + reloadDrop
    target.z += this.recoilZ * (this.ads ? 0.4 : 1)
    target.y -= this.crouchAmount * 0.008

    this.root.position.x = damp(this.root.position.x, target.x, 16, dt)
    this.root.position.y = damp(this.root.position.y, target.y, 16, dt)
    this.root.position.z = damp(this.root.position.z, target.z, 16, dt)
    this.root.rotation.x = damp(this.root.rotation.x, this.recoilRot * (this.ads ? 0.35 : 1) + reloadRot - this.sprintAmount * 0.25, 16, dt)
    this.root.rotation.y = damp(this.root.rotation.y, this.swayX * 2.4 + this.sprintAmount * 0.55, 12, dt)
    this.root.rotation.z = damp(this.root.rotation.z, -this.swayX * 1.5 + this.sprintAmount * 0.28, 12, dt)

    this.reticle.material.opacity = ads > 0.18 ? (ads - 0.18) / 0.82 : 0
    this.reticle.scale.setScalar(0.009 + ads * 0.006)
    this.model.visible = true

    if (this.reloadStage >= 1 && this.reloadStage < 2) {
      const p = (this.reloadT / this.reloadTime - 0.38) / 0.32
      this.magMesh.position.y = -0.17 - Math.sin(p * Math.PI) * 0.16
      this.magMesh.rotation.x = -0.12 + Math.sin(p * Math.PI) * 0.6
    } else {
      this.magMesh.position.y = damp(this.magMesh.position.y, -0.17, 14, dt)
      this.magMesh.rotation.x = damp(this.magMesh.rotation.x, -0.12, 14, dt)
    }

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt
      this.flashSprite.material.opacity = Math.max(0, this.muzzleTimer / 0.055)
      this.flashLight.intensity = Math.max(0, this.muzzleTimer / 0.055) * 22
      if (this.muzzleTimer <= 0) {
        this.flashSprite.material.opacity = 0
        this.flashLight.intensity = 0
      }
    }
  }

  getReloadProgress() { return this.reloading ? clamp(this.reloadT / this.reloadTime, 0, 1) : 0 }

  getMuzzleWorld(out = new THREE.Vector3()) { return this.muzzle.getWorldPosition(out) }

  reset() {
    this.ammo = this.magSize
    this.reserve = 210
    this.reloading = false
    this.reloadT = 0
    this.reloadStage = 0
    this.shots = 0
    this.hits = 0
    this.cooldown = 0
    this.bloom = 0
    this.ads = false
    this.adsAmount = 0
  }
}
