import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { muzzleFlashTexture } from '../textures.js'

const HIP_POS = new THREE.Vector3(0.235, -0.23, -0.46)
const ADS_POS = new THREE.Vector3(0, -0.108, -0.335)
const HIP_ROT = new THREE.Euler(0.015, -0.055, 0.01)
const ADS_ROT = new THREE.Euler(0, 0, 0)
const RECOIL_CONE = Math.cos(THREE.MathUtils.degToRad(7))

export class Weapon {
  constructor({ camera, world, effects, audio, player, enemies, hud, input, quality = 'high' }) {
    this.camera = camera
    this.world = world
    this.effects = effects
    this.audio = audio
    this.player = player
    this.enemies = enemies
    this.hud = hud
    this.input = input
    this.quality = quality
    this.magSize = 30
    this.ammo = 30
    this.reserve = 180
    this.reloading = false
    this.reloadTimer = 0
    this.reloadDuration = 1.85
    this.fireTimer = 0
    this.interval = 0.091
    this.spread = 0
    this.adsProgress = 0
    this.sprintBlend = 0
    this.kick = 0
    this.kickSide = 0
    this.flashTimer = 0
    this.time = 0
    this.shotsFired = 0
    this.shotsHit = 0
    this.headshots = 0
    this.enemyCheckTimer = 0
    this.lastAmmo = -1
    this.lastReserve = -1
    this.magDrop = 0
    this.raycaster = new THREE.Raycaster()
    this.raycaster.far = 150
    this.raycaster.near = 0.08
    this.build()
  }

  build() {
    const group = new THREE.Group()
    this.group = group
    this.camera.add(group)

    const gunmetal = new THREE.MeshStandardMaterial({
      color: 0x30343a,
      metalness: 0.92,
      roughness: 0.34,
      envMapIntensity: 1.1
    })
    const blackPoly = new THREE.MeshStandardMaterial({
      color: 0x15171a,
      metalness: 0.35,
      roughness: 0.62,
      envMapIntensity: 0.7
    })
    const polymer = new THREE.MeshStandardMaterial({
      color: 0x1b1d1f,
      metalness: 0.18,
      roughness: 0.72,
      envMapIntensity: 0.55
    })
    const tanMat = new THREE.MeshStandardMaterial({
      color: 0x8a7350,
      metalness: 0.2,
      roughness: 0.66,
      envMapIntensity: 0.55
    })
    const steel = new THREE.MeshStandardMaterial({
      color: 0x6c7178,
      metalness: 0.98,
      roughness: 0.24,
      envMapIntensity: 1.2
    })
    const glove = new THREE.MeshStandardMaterial({
      color: 0x24272a,
      metalness: 0.12,
      roughness: 0.85,
      envMapIntensity: 0.4
    })
    const sleeve = new THREE.MeshStandardMaterial({
      color: 0x3b4139,
      metalness: 0.05,
      roughness: 0.94,
      envMapIntensity: 0.3
    })
    const red = new THREE.MeshStandardMaterial({
      color: 0x4a0805,
      emissive: 0xff2312,
      emissiveIntensity: 3.4,
      metalness: 0.2,
      roughness: 0.4,
      toneMapped: false
    })
    const lens = new THREE.MeshStandardMaterial({
      color: 0x101820,
      metalness: 0.9,
      roughness: 0.06,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 1.8
    })

    const box = (w, h, d, material, x, y, z, radius = 0.006) => {
      const geometry = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      mesh.castShadow = false
      mesh.receiveShadow = false
      group.add(mesh)
      return mesh
    }

    box(0.086, 0.105, 0.44, gunmetal, 0, 0, -0.06, 0.012)
    box(0.07, 0.05, 0.36, blackPoly, 0, 0.072, -0.08, 0.008)
    box(0.078, 0.087, 0.31, gunmetal, 0, 0.006, -0.38, 0.01)
    box(0.074, 0.026, 0.3, tanMat, 0, 0.055, -0.38, 0.006)
    for (let i = 0; i < 7; i += 1) {
      box(0.078, 0.008, 0.016, blackPoly, 0, 0.069, -0.27 - i * 0.038, 0.002)
    }
    for (let i = 0; i < 4; i += 1) {
      box(0.086, 0.01, 0.012, blackPoly, 0, -0.048, -0.32 - i * 0.05, 0.001)
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.016, 0.34, 12), steel)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.012, -0.69)
    group.add(barrel)
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.085, 12), gunmetal)
    brake.rotation.x = Math.PI / 2
    brake.position.set(0, 0.012, -0.865)
    group.add(brake)
    for (let i = 0; i < 3; i += 1) {
      box(0.054, 0.008, 0.012, blackPoly, 0, 0.012, -0.845 - i * 0.022, 0.001)
    }
    const stock = box(0.062, 0.09, 0.24, blackPoly, 0, 0.012, 0.27, 0.012)
    stock.rotation.x = -0.06
    box(0.075, 0.108, 0.03, polymer, 0, 0.008, 0.4, 0.008)
    const grip = box(0.05, 0.14, 0.08, polymer, 0, -0.102, 0.12, 0.012)
    grip.rotation.x = -0.24
    const mag = box(0.054, 0.18, 0.092, polymer, 0, -0.128, -0.035, 0.008)
    mag.rotation.x = 0.15
    this.mag = mag
    box(0.055, 0.02, 0.09, tanMat, 0, -0.218, -0.012, 0.004)
    box(0.03, 0.028, 0.05, steel, -0.01, -0.06, 0.06, 0.003)
    box(0.04, 0.016, 0.03, steel, 0.052, -0.02, -0.18, 0.003)

    const mount = box(0.05, 0.03, 0.1, gunmetal, 0, 0.1, -0.04, 0.004)
    mount.rotation.x = 0
    const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.15, 16), gunmetal)
    optic.rotation.x = Math.PI / 2
    optic.position.set(0, 0.132, -0.045)
    group.add(optic)
    for (const z of [-0.115, 0.03]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 20), steel)
      ring.position.set(0, 0.132, z)
      group.add(ring)
    }
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.024, 20), lens)
    glass.position.set(0, 0.132, 0.031)
    group.add(glass)
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 8, 8), red)
    dot.position.set(0, 0.132, 0.028)
    group.add(dot)
    this.dot = dot
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: muzzleFlashTexture(),
      color: 0xff2a1a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    }))
    glow.scale.set(0.028, 0.028, 1)
    glow.position.set(0, 0.132, 0.036)
    group.add(glow)
    this.dotGlow = glow

    box(0.042, 0.042, 0.08, blackPoly, 0.055, 0.045, -0.5, 0.006)
    const laserLens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 14), new THREE.MeshStandardMaterial({
      color: 0x0a1a12,
      emissive: 0x35ff88,
      emissiveIntensity: 1.4,
      toneMapped: false
    }))
    laserLens.position.set(0.055, 0.045, -0.541)
    laserLens.rotation.y = Math.PI
    group.add(laserLens)

    const rightHand = box(0.075, 0.09, 0.12, glove, 0.005, -0.105, 0.155, 0.02)
    rightHand.rotation.x = -0.2
    const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.32, 4, 8), sleeve)
    rightArm.position.set(0.1, -0.25, 0.35)
    rightArm.rotation.set(-0.55, 0.25, 1.05)
    group.add(rightArm)
    const rightCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.062, 0.09, 10), glove)
    rightCuff.position.set(0.075, -0.18, 0.235)
    rightCuff.rotation.set(-0.35, 0.1, 1.0)
    group.add(rightCuff)

    const leftHand = box(0.085, 0.075, 0.14, glove, -0.03, -0.055, -0.36, 0.02)
    leftHand.rotation.z = 0.15
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.32, 4, 8), sleeve)
    leftArm.position.set(-0.15, -0.23, -0.13)
    leftArm.rotation.set(-0.18, -0.35, -1.02)
    group.add(leftArm)
    const leftCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.06, 0.09, 10), glove)
    leftCuff.position.set(-0.09, -0.13, -0.25)
    leftCuff.rotation.set(-0.1, -0.2, -1.0)
    group.add(leftCuff)

    this.muzzle = new THREE.Object3D()
    this.muzzle.position.set(0, 0.012, -0.915)
    group.add(this.muzzle)

    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: muzzleFlashTexture(),
      color: 0xffcf92,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    }))
    flash.position.copy(this.muzzle.position)
    flash.scale.set(0.48, 0.48, 1)
    flash.visible = false
    group.add(flash)
    this.flash = flash

    this.muzzleLight = new THREE.PointLight(0xffb066, 0, 7, 2)
    this.muzzleLight.position.copy(this.muzzle.position)
    group.add(this.muzzleLight)

    this.viewLight = new THREE.PointLight(0xa8c6e8, 1.1, 3.5, 2)
    this.viewLight.position.set(0.1, 0.25, 0.15)
    group.add(this.viewLight)

    group.position.copy(HIP_POS)
    group.rotation.copy(HIP_ROT)
    this.currentPos = HIP_POS.clone()
    this.currentRot = HIP_ROT.clone()
  }

  startReload() {
    if (this.reloading || this.ammo >= this.magSize || this.reserve <= 0) return
    this.reloading = true
    this.reloadTimer = 0
    this.reloadDuration = this.ammo === 0 ? 2.35 : 1.9
    this.audio.reload()
    this.hud.setReloading(true)
  }

  fire() {
    if (this.reloading) return
    if (this.ammo <= 0) {
      this.audio.dryFire()
      this.startReload()
      this.fireTimer = 0.3
      return
    }
    this.ammo -= 1
    this.shotsFired += 1
    this.fireTimer += this.interval
    this.spread = Math.min(0.06, this.spread + 0.0085)
    this.kick = Math.min(1.4, this.kick + 0.62)
    this.kickSide = (Math.random() - 0.5) * 0.5
    this.flashTimer = 0.045
    this.flash.visible = true
    this.flash.material.opacity = 1
    this.flash.material.rotation = Math.random() * Math.PI * 2
    this.flash.scale.setScalar(0.4 + Math.random() * 0.22)
    this.flash.position.set(this.muzzle.position.x, this.muzzle.position.y, this.muzzle.position.z + 0.01)

    const { origin, direction } = this.player.getAimRay()
    const spreadRad = (this.adsProgress > 0.5 ? 0.0014 : 0.0075) + this.spread * (this.adsProgress > 0.5 ? 0.4 : 1)
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, direction).normalize()
    const aim = direction.clone()
    aim.addScaledVector(right, (Math.random() - 0.5) * spreadRad * 2)
    aim.addScaledVector(up, (Math.random() - 0.5) * spreadRad * 2)
    aim.normalize()

    if (this.input.touch) {
      const assist = this.aimAssist(aim)
      if (assist) aim.lerp(assist, this.adsProgress > 0.5 ? 0.24 : 0.12).normalize()
    }

    this.raycaster.set(origin, aim)
    this.raycaster.far = 150
    const enemyHits = this.enemies.hitMeshes.length ? this.raycaster.intersectObjects(this.enemies.hitMeshes, false) : []
    const worldHits = this.world.raycast(this.raycaster)
    const enemyHit = enemyHits[0]
    const worldHit = worldHits[0]
    const hitPoint = new THREE.Vector3().copy(origin).addScaledVector(aim, 90)
    let didHit = false
    let headshot = false

    if (enemyHit && (!worldHit || enemyHit.distance < worldHit.distance)) {
      hitPoint.copy(enemyHit.point)
      const data = enemyHit.object.userData
      const enemy = data.enemy
      const part = data.part || 'body'
      const falloff = THREE.MathUtils.clamp(1 - Math.max(0, enemyHit.distance - 18) / 90, 0.55, 1)
      const base = part === 'head' ? 94 : part === 'limb' ? 23 : 34
      const damage = base * falloff
      didHit = true
      headshot = part === 'head'
      this.shotsHit += 1
      if (headshot) this.headshots += 1
      const killed = this.enemies.hit(enemy, damage, part, hitPoint, aim)
      this.hud.hitmarker(headshot, killed)
      if (killed) {
        this.audio.kill()
        this.effects.killBurst(enemyHit.point.clone().addScaledVector(aim, -0.1))
      } else {
        this.audio.hitmarker(headshot)
        this.effects.impact(enemyHit.point, aim.clone().negate(), 'flesh')
        this.effects.flash(enemyHit.point, 0.22, headshot ? 0xff5533 : 0xff9a66)
      }
    } else if (worldHit) {
      hitPoint.copy(worldHit.point)
      const normal = worldHit.face ? worldHit.face.normal.clone().transformDirection(worldHit.object.matrixWorld) : new THREE.Vector3(0, 1, 0)
      const surface = worldHit.object.userData.surface || 'concrete'
      this.effects.impact(worldHit.point, normal, surface)
    }

    const muzzleWorld = this.muzzle.getWorldPosition(new THREE.Vector3())
    this.effects.tracer(muzzleWorld, hitPoint, 0xffcf8a)
    this.effects.flash(muzzleWorld, 0.38 + Math.random() * 0.16, 0xffc477)
    this.effects.muzzleSmoke(muzzleWorld, aim)
    this.effects.shell(this.getEjectionPoint(), new THREE.Vector3(right.x, 0.5, right.z))
    this.audio.gunshot('rifle')
    this.player.addRecoil(0.0072 + Math.random() * 0.0038, (Math.random() - 0.5) * 0.0042 + (this.adsProgress > 0.5 ? 0 : 0.0015))
    this.player.addTrauma(0.05)
    if (this.ammo === 7) this.hud.setReloadHint(true)
    if (this.ammo === 0) this.startReload()
  }

  aimAssist(aim) {
    let best = null
    let bestDot = RECOIL_CONE
    const origin = this.player.getEyePosition()
    for (const enemy of this.enemies.enemies) {
      if (!enemy.alive) continue
      const target = enemy.getChestPosition()
      const to = target.clone().sub(origin)
      const distance = to.length()
      if (distance > 50) continue
      to.normalize()
      const dot = aim.dot(to)
      if (dot > bestDot) {
        bestDot = dot
        best = to
      }
    }
    return best
  }

  getEjectionPoint() {
    return this.group.localToWorld(new THREE.Vector3(0.06, 0.0, 0.02))
  }

  update(dt, time) {
    this.time = time
    if (this.fireTimer > 0) this.fireTimer -= dt
    this.spread = Math.max(0, this.spread - dt * 0.085)
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      this.muzzleLight.intensity = Math.max(0, this.flashTimer / 0.045) * 9
      this.flash.material.opacity = Math.max(0, this.flashTimer / 0.045)
      if (this.flashTimer <= 0) {
        this.flash.visible = false
        this.flash.material.opacity = 0
      }
    } else {
      this.muzzleLight.intensity = 0
    }

    const canAds = !this.reloading
    const wantAds = this.input.ads && canAds && this.player.alive
    this.adsProgress = THREE.MathUtils.damp(this.adsProgress, wantAds ? 1 : 0, 11, dt)
    this.sprintBlend = THREE.MathUtils.damp(this.sprintBlend, this.player.sprinting ? 1 : 0, 8, dt)

    if (this.reloading) {
      this.reloadTimer += dt
      const t = Math.min(1, this.reloadTimer / this.reloadDuration)
      this.magDrop = Math.sin(Math.min(1, t * 1.5) * Math.PI) * 0.16
      if (this.reloadTimer >= this.reloadDuration) {
        const need = this.magSize - this.ammo
        const take = Math.min(need, this.reserve)
        this.ammo += take
        this.reserve -= take
        this.reloading = false
        this.reloadTimer = 0
        this.magDrop = 0
        this.hud.setReloading(false)
        this.hud.setReloadHint(this.ammo <= 7)
        this.audio.uiClick()
      }
    }

    if (this.player.alive) {
      if (this.input.consumeReload()) this.startReload()
      if (this.input.firing && !this.reloading && this.fireTimer <= 0) {
        this.fire()
        if (this.ammo === 0) this.startReload()
      } else if (this.input.firing && this.ammo <= 0 && !this.reloading && this.fireTimer <= 0) {
        this.audio.dryFire()
        this.fireTimer = 0.35
      }
    }

    if (this.ammo !== this.lastAmmo || this.reserve !== this.lastReserve) {
      this.lastAmmo = this.ammo
      this.lastReserve = this.reserve
      this.hud.setAmmo(this.ammo, this.reserve)
      this.hud.setReloadHint(this.ammo <= 7 && !this.reloading)
    }

    this.updatePose(dt, time)

    this.enemyCheckTimer -= dt
    if (this.enemyCheckTimer <= 0 && this.player.alive) {
      this.enemyCheckTimer = 0.08
      const { origin, direction } = this.player.getAimRay()
      this.raycaster.set(origin, direction)
      this.raycaster.far = 120
      const hits = this.enemies.hitMeshes.length ? this.raycaster.intersectObjects(this.enemies.hitMeshes, false) : []
      const blocked = hits.length ? this.world.lineBlocked(origin, hits[0].point) : false
      this.hud.setCrosshairTarget(hits.length > 0 && !blocked)
    }
  }

  updatePose(dt, time) {
    const aspect = this.camera.aspect
    const narrow = aspect < 0.78
    const baseScale = narrow ? 0.86 : 1
    this.group.scale.setScalar(THREE.MathUtils.lerp(this.group.scale.x, baseScale, Math.min(1, dt * 8)))

    const ads = this.adsProgress
    const sprint = this.sprintBlend
    const targetPos = HIP_POS.clone().lerp(ADS_POS, ads)
    const targetRot = new THREE.Euler(
      THREE.MathUtils.lerp(HIP_ROT.x, ADS_ROT.x, ads),
      THREE.MathUtils.lerp(HIP_ROT.y, ADS_ROT.y, ads),
      THREE.MathUtils.lerp(HIP_ROT.z, ADS_ROT.z, ads)
    )
    if (narrow) {
      targetPos.x = THREE.MathUtils.lerp(0.205, 0, ads)
      targetPos.z += 0.02
    }

    targetPos.x += sprint * 0.04
    targetPos.y -= sprint * 0.09
    targetPos.z += sprint * 0.06
    targetRot.x += sprint * 0.34
    targetRot.y += sprint * 0.24
    targetRot.z -= sprint * 0.28

    const speedNorm = Math.min(1, this.player.speed / 6)
    const bobAmount = (1 - ads * 0.82) * (1 - sprint * 0.5)
    const bobX = Math.cos(this.player.bobTime) * 0.011 * speedNorm * bobAmount
    const bobY = Math.sin(this.player.bobTime * 2) * 0.009 * speedNorm * bobAmount
    targetPos.x += bobX
    targetPos.y += bobY

    targetPos.x += this.player.swayX * 0.55
    targetPos.y += this.player.swayY * 0.5
    targetRot.y += this.player.swayX * 1.1
    targetRot.x += this.player.swayY * 0.9

    targetPos.z += this.kick * 0.028
    targetPos.y += this.kick * 0.018
    targetRot.x -= this.kick * 0.075
    targetRot.z += this.kickSide * 0.05
    targetRot.y += this.kickSide * 0.025

    if (this.reloading) {
      const t = Math.min(1, this.reloadTimer / this.reloadDuration)
      const curve = Math.sin(Math.min(1, t * 1.25) * Math.PI) * (1 - Math.max(0, (t - 0.82) / 0.18))
      targetPos.y -= curve * 0.12
      targetPos.x -= curve * 0.03
      targetRot.z += curve * 0.55
      targetRot.x += curve * 0.18
      this.mag.position.y = -0.128 - this.magDrop
      this.mag.rotation.z = this.magDrop * 1.4
      this.mag.visible = !(t > 0.3 && t < 0.52)
    } else {
      this.mag.position.y = -0.128
      this.mag.rotation.z = 0
      this.mag.visible = true
    }

    const damp = Math.min(1, dt * 18)
    this.currentPos.lerp(targetPos, damp)
    this.currentRot.x += (targetRot.x - this.currentRot.x) * damp
    this.currentRot.y += (targetRot.y - this.currentRot.y) * damp
    this.currentRot.z += (targetRot.z - this.currentRot.z) * damp
    this.group.position.copy(this.currentPos)
    this.group.rotation.copy(this.currentRot)

    this.kick = THREE.MathUtils.damp(this.kick, 0, 13, dt)
    this.kickSide = THREE.MathUtils.damp(this.kickSide, 0, 10, dt)

    const pulse = 1.2 + Math.sin(time * 3) * 0.15
    this.dotGlow.material.opacity = 0.22 * ads + 0.04
    this.dot.scale.setScalar(pulse)
    this.viewLight.intensity = 0.9 + ads * 0.5
  }

  get accuracy() {
    return this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0
  }

  reset() {
    this.ammo = this.magSize
    this.reserve = 180
    this.reloading = false
    this.reloadTimer = 0
    this.fireTimer = 0
    this.spread = 0
    this.adsProgress = 0
    this.kick = 0
    this.shotsFired = 0
    this.shotsHit = 0
    this.headshots = 0
    this.hud.setAmmo(this.ammo, this.reserve)
    this.hud.setReloading(false)
    this.hud.setReloadHint(false)
    this.hud.setWeapon('VK-9 CARBINE')
  }

  setVisible(visible) {
    this.group.visible = visible
  }
}
