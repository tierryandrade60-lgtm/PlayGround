import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { buildAllTextures, setTextureAnisotropy } from './textures.js'
import { World } from './world.js'
import { Effects } from './effects.js'
import { Weapon } from './weapon.js'
import { Player } from './player.js'
import { EnemyManager } from './enemies.js'
import { AudioEngine } from './audio.js'
import { Input } from './input.js'
import { HUD } from './hud.js'
import { PostFX } from './post.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt))
const tick = () => new Promise(r => setTimeout(r, 16))

const QUALITY_DPR = { high: 2, balanced: 1.6, performance: 1.15 }
const QUALITY_SHADOW = { high: 2048, balanced: 1024, performance: 512 }
const QUALITY_ACTIVE = { high: 14, balanced: 10, performance: 7 }

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas')
    this.state = 'loading'
    this.quality = localStorage.getItem('blacksite-quality') || 'balanced'
    if (!QUALITY_DPR[this.quality]) this.quality = 'balanced'
    this.sensitivity = parseFloat(localStorage.getItem('blacksite-sens') || '1.2')
    this.score = 0
    this.kills = 0
    this.wave = 0
    this.combo = 0
    this.comboTimer = 0
    this.menuT = 0
    this.lastPauseToggle = 0
    this.fovKick = 0
    this.waveQueue = []
    this.waveSpawnTimer = 0
    this.waveSpawnInterval = 1
    this.waveClearTimer = 0
    this.intermission = false
    this.spawnCount = 0
    this.pickups = []
    this.adaptive = { time: 0, frames: 0, checked: 0 }
    this.lastTime = performance.now()
    this.running = false

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.3
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_DPR[this.quality]))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setClearColor(0x04070b, 1)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.03, 260)
    this.camera.rotation.order = 'YXZ'
    this.scene.add(this.camera)

    this.hud = new HUD()
    this.audio = new AudioEngine()
    this.hud.updateBest()
  }

  async init(progress = () => {}) {
    progress(0.08, 'GENERATING TERRAIN DATA')
    await tick()
    setTextureAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()))
    this.textures = buildAllTextures(this.quality)
    progress(0.3, 'ASSEMBLING OUTPOST GEOMETRY')
    await tick()
    this.world = new World(this.scene, this.renderer, this.textures, this.quality)
    progress(0.56, 'CALIBRATING BALLISTICS')
    await tick()
    this.effects = new Effects(this.scene, this.textures)
    this.weapon = new Weapon({
      camera: this.camera, scene: this.scene, textures: this.textures,
      effects: this.effects, audio: this.audio, quality: this.quality
    })
    this.player = new Player({ camera: this.camera, world: this.world, audio: this.audio })
    progress(0.72, 'SPINNING UP SENTINEL NETWORK')
    await tick()
    this.enemies = new EnemyManager({
      scene: this.scene, camera: this.camera, world: this.world, effects: this.effects,
      audio: this.audio, textures: this.textures, quality: this.quality,
      callbacks: {
        onPlayerDamage: (amount, source) => this.playerDamage(amount, source)
      }
    })
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality)
    this.post.setSize(window.innerWidth, window.innerHeight)
    progress(0.9, 'SYNCING TACTICAL UPLINK')
    await tick()

    this.bindUI()
    this.bindInput()
    this.buildPickupAssets()
    this.setQuality(this.quality, true)
    this.weapon.root.visible = false
    this.setMenuCamera(0)

    window.addEventListener('resize', () => this.onResize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause()
    })

    progress(0.99, 'READY')
    await tick()
    this.state = 'menu'
    this.hud.setVisible(false)
    document.getElementById('loading').classList.add('done')
    this.running = true
    this.loop()
  }

  bindInput() {
    this.input = new Input({
      onPause: () => this.togglePause(),
      onReload: () => { if (this.state === 'playing') this.weapon.reload() },
      onJump: () => { if (this.state === 'playing') this.player.jump() },
      onFireStart: () => this.audio.unlock(),
      onAnyInput: () => this.audio.unlock(),
      onAdsChange: () => {}
    })
    this.input.sensitivity = this.sensitivity
    if (this.input.isTouch) document.body.classList.add('touch')
  }

  bindUI() {
    const deploy = document.getElementById('deploy-btn')
    deploy.addEventListener('click', () => this.startRun())
    document.getElementById('resume-btn').addEventListener('click', () => this.resume())
    document.getElementById('quit-btn').addEventListener('click', () => this.quitToMenu())
    document.getElementById('restart-btn').addEventListener('click', () => this.restart())
    document.getElementById('menu-btn').addEventListener('click', () => this.quitToMenu())

    const seg = document.getElementById('quality-seg')
    for (const b of seg.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.quality === this.quality)
      b.addEventListener('click', () => {
        for (const x of seg.querySelectorAll('button')) x.classList.toggle('active', x === b)
        this.setQuality(b.dataset.quality)
        try { localStorage.setItem('blacksite-quality', b.dataset.quality) } catch {}
      })
    }
    const sens = document.getElementById('sens')
    const out = document.getElementById('sens-out')
    sens.value = String(this.sensitivity)
    out.textContent = this.sensitivity.toFixed(1)
    sens.addEventListener('input', () => {
      this.sensitivity = parseFloat(sens.value)
      this.input.sensitivity = this.sensitivity
      out.textContent = this.sensitivity.toFixed(1)
      try { localStorage.setItem('blacksite-sens', String(this.sensitivity)) } catch {}
    })

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.state === 'menu') this.startRun()
    })
  }

  setQuality(quality, initial = false) {
    this.quality = quality
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_DPR[quality])
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    if (this.post) {
      this.post.setQuality(quality)
      this.post.setSize(window.innerWidth, window.innerHeight)
    }
    if (this.world?.dirLight) {
      const size = QUALITY_SHADOW[quality]
      if (this.world.dirLight.shadow.mapSize.x !== size) {
        this.world.dirLight.shadow.mapSize.set(size, size)
        this.world.dirLight.shadow.map?.dispose()
        this.world.dirLight.shadow.map = null
      }
    }
    if (this.enemies) this.enemies.maxActive = QUALITY_ACTIVE[quality]
    this.hud.setQuality(quality)
    if (!initial) this.onResize()
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.post?.setSize(w, h)
  }

  setMenuCamera(t) {
    const angle = -0.6 + t * 0.055
    const r = 21
    this.camera.position.set(Math.sin(angle) * r, 6.8 + Math.sin(t * 0.25) * 0.6, Math.cos(angle) * r)
    this.camera.lookAt(0, 1.9, -1)
    this.camera.fov = 63
    this.camera.updateProjectionMatrix()
  }

  async startRun() {
    if (this.state !== 'menu') return
    this.audio.unlock()
    await this.audio.unlock()
    this.resetRun()
    document.getElementById('menu').classList.add('hidden')
    this.state = 'playing'
    this.hud.setVisible(true)
    this.hud.root.classList.add('visible')
    this.weapon.root.visible = true
    this.input.setEnabled(true)
    if (this.input.isTouch) document.getElementById('mobile-controls').classList.remove('hidden')
    this.audio.startAmbient()
    this.input.requestLock()
    this.hud.showBanner('OPERATION BLACKSITE', 'HOLD THE OUTPOST', 'SENTINEL ASSAULT INBOUND', 3)
    this.showFxFlash(0.1)
    setTimeout(() => {
      if (this.state === 'playing' && this.wave === 0) this.startWave(1)
    }, 1500)
  }

  resetRun() {
    this.player.reset()
    this.weapon.reset()
    this.enemies.clear()
    this.clearPickups()
    this.score = 0
    this.kills = 0
    this.wave = 0
    this.combo = 0
    this.comboTimer = 0
    this.waveQueue = []
    this.waveSpawnTimer = 0
    this.waveClearTimer = 0
    this.intermission = false
    this.spawnCount = 0
    this.post?.setDamage(0)
    this.hud.scoreValue = 0
    this.hud.lastPlayerX = this.player.position.x
    this.hud.lastPlayerZ = this.player.position.z
    this.hud.lastYaw = this.player.yaw
    this.camera.fov = 74
    this.camera.updateProjectionMatrix()
    this.fovKick = 0
  }

  startWave(n) {
    if (this.state !== 'playing') return
    this.wave = n
    this.intermission = false
    this.waveQueue = []
    this.waveSpawnTimer = 0.7
    this.waveSpawnInterval = Math.max(0.42, 1.15 - n * 0.035)
    this.spawnCount = 0
    const base = Math.min(22, 3 + n * 2 + (this.input.isTouch ? 0 : 2))
    for (let i = 0; i < base; i++) {
      const roll = Math.random()
      if (n >= 3 && roll < 0.14) this.waveQueue.push('heavy')
      else if (n >= 2 && roll < 0.4) this.waveQueue.push('drone')
      else this.waveQueue.push('trooper')
    }
    const boss = n % 5 === 0
    if (boss) {
      this.waveQueue.push('titan')
      this.hud.showBanner('WARNING // HEAVY SIGNATURE', 'TITAN DEPLOYED', 'ENGAGE WITH EXTREME CAUTION', 3.4)
      this.audio.waveHorn(true)
    } else {
      this.hud.showBanner('HOSTILE WAVE', `WAVE ${String(n).padStart(2, '0')}`, 'INBOUND // WEAPONS FREE', 2.6)
      this.audio.waveHorn(false)
    }
    this.waveQueue.sort(() => Math.random() - 0.5)
  }

  updateWaves(dt) {
    if (this.state !== 'playing') return
    if (this.intermission) {
      this.waveClearTimer -= dt
      if (this.waveClearTimer <= 0) this.startWave(this.wave + 1)
      return
    }
    if (this.wave === 0) return
    if (this.waveQueue.length > 0) {
      this.waveSpawnTimer -= dt
      if (this.waveSpawnTimer <= 0 && this.enemies.aliveCount() < this.enemies.maxActive) {
        const type = this.waveQueue.shift()
        const pos = this.chooseSpawn()
        this.enemies.spawn(type, pos, this.wave)
        this.spawnCount++
        this.waveSpawnTimer = type === 'titan' ? 1.6 : this.waveSpawnInterval * (0.85 + Math.random() * 0.3)
      }
    } else if (this.enemies.aliveCount() === 0) {
      this.completeWave()
    }
  }

  completeWave() {
    this.intermission = true
    this.waveClearTimer = 4.5
    const bonus = 250 + this.wave * 150
    this.score += bonus
    this.player.heal(22)
    this.player.addArmor(20)
    this.weapon.reserve = Math.min(300, this.weapon.reserve + 90)
    this.hud.showBanner('SECTOR CLEAR', `WAVE ${String(this.wave).padStart(2, '0')} COMPLETE`, `+${bonus} BONUS // REARMING`, 3.8)
    this.hud.toast('RESUPPLY RECEIVED // HEALTH +22 · ARMOR +20 · AMMO +90', 3.2)
    this.audio.pickup()
    this.spawnPickup(this.player.position.clone().add(new THREE.Vector3(1.2, 0, 0.6)), 'health')
    this.spawnPickup(this.player.position.clone().add(new THREE.Vector3(-1.2, 0, 0.6)), 'ammo')
  }

  chooseSpawn() {
    if (this.wave === 1 && this.spawnCount < 2) {
      const spots = [[0, -2.5], [-6, -3.5], [6, -3.5]]
      const s = spots[this.spawnCount % spots.length]
      return new THREE.Vector3(s[0] + (Math.random() - 0.5) * 1.2, 0, s[1] + (Math.random() - 0.5) * 1.2)
    }
    const p = this.player.position
    const candidates = this.world.spawnPoints.filter(s => Math.hypot(s.x - p.x, s.z - p.z) > 13)
    const pool = candidates.length ? candidates : this.world.spawnPoints
    const base = pool[Math.floor(Math.random() * pool.length)]
    return new THREE.Vector3(base.x + (Math.random() - 0.5) * 2.4, 0, base.z + (Math.random() - 0.5) * 2.4)
  }

  playerDamage(amount, source) {
    if (this.state !== 'playing') return
    this.hud.setPlayerContext(this.player.position.x, this.player.position.z, this.player.yaw)
    const died = this.player.damage(amount, source)
    this.hud.damage(amount, source)
    this.post.setDamage(Math.min(1, 0.5 + amount / 45))
    this.showFxFlash(0.16, 140)
    if (died) this.die()
  }

  die() {
    if (this.state === 'dead') return
    this.state = 'dead'
    this.input.setEnabled(false)
    document.getElementById('mobile-controls').classList.add('hidden')
    this.audio.death()
    this.audio.stopAmbient()
    this.hud.setVisible(false)
    this.hud.saveBest(this.score, this.wave)
    const accuracy = this.weapon.shots ? Math.round(this.weapon.hits / this.weapon.shots * 100) : 0
    document.getElementById('over-wave').textContent = this.wave
    document.getElementById('over-score').textContent = this.score.toLocaleString('en-US')
    document.getElementById('over-kills').textContent = this.kills
    document.getElementById('over-acc').textContent = `${accuracy}%`
    setTimeout(() => {
      if (this.state === 'dead') document.getElementById('gameover').classList.remove('hidden')
    }, 900)
  }

  restart() {
    document.getElementById('gameover').classList.add('hidden')
    this.resetRun()
    this.state = 'playing'
    this.hud.setVisible(true)
    this.weapon.root.visible = true
    this.input.setEnabled(true)
    if (this.input.isTouch) document.getElementById('mobile-controls').classList.remove('hidden')
    this.audio.startAmbient()
    this.audio.waveHorn(false)
    this.hud.showBanner('REDEPLOYED', 'HOLD THE OUTPOST', 'SENTINEL ASSAULT INBOUND', 2.6)
    this.startWave(1)
    setTimeout(() => this.input.requestLock(), 60)
  }

  togglePause() {
    const now = performance.now()
    if (now - this.lastPauseToggle < 260) return
    this.lastPauseToggle = now
    if (this.state === 'playing') this.pause()
    else if (this.state === 'paused') this.resume()
  }

  pause() {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.input.setEnabled(false)
    document.getElementById('mobile-controls').classList.add('hidden')
    document.getElementById('pause-wave').textContent = this.wave
    document.getElementById('pause-score').textContent = this.score.toLocaleString('en-US')
    document.getElementById('pause-kills').textContent = this.kills
    document.getElementById('pause').classList.remove('hidden')
  }

  resume() {
    if (this.state !== 'paused') return
    document.getElementById('pause').classList.add('hidden')
    this.state = 'playing'
    this.input.setEnabled(true)
    if (this.input.isTouch) document.getElementById('mobile-controls').classList.remove('hidden')
    this.input.requestLock()
  }

  quitToMenu() {
    this.state = 'menu'
    this.input.setEnabled(false)
    this.enemies.clear()
    this.clearPickups()
    document.getElementById('pause').classList.add('hidden')
    document.getElementById('gameover').classList.add('hidden')
    document.getElementById('mobile-controls').classList.add('hidden')
    document.getElementById('menu').classList.remove('hidden')
    this.hud.setVisible(false)
    this.hud.updateBest()
    this.weapon.root.visible = false
    this.audio.stopAmbient()
    this.menuT = 0
    this.setMenuCamera(0)
  }

  showFxFlash(opacity, ms = 70) {
    const el = document.getElementById('fx-flash')
    el.style.transition = 'none'
    el.style.opacity = String(opacity)
    clearTimeout(this._flashTimeout)
    this._flashTimeout = setTimeout(() => {
      el.style.transition = 'opacity 160ms linear'
      el.style.opacity = '0'
    }, ms)
  }

  updateShooting(dt) {
    if (!this.player.alive) return
    this.weapon.setAds(this.input.ads)
    if (this.input.firing) {
      const shot = this.weapon.tryShoot()
      if (shot) this.performShot(shot)
      if (this.weapon.ammo === 0 && !this.weapon.reloading && this.weapon.reserve > 0) {
        this.weapon.reload()
      }
    }
  }

  performShot(shot) {
    const ray = new THREE.Raycaster(shot.origin, shot.direction, 0, 180)
    const targets = this.enemies.hitMeshes.concat(this.world.occluders)
    const hits = ray.intersectObjects(targets, false)
    let end = shot.origin.clone().addScaledVector(shot.direction, 80)
    let enemyHit = null, point = null, normal = null

    for (const h of hits) {
      if (h.object.userData.enemy) {
        const e = h.object.userData.enemy
        if (e.dead) continue
        enemyHit = h
        point = h.point
        normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : shot.direction.clone().negate()
        end = h.point
        break
      }
      point = h.point
      normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : shot.direction.clone().negate()
      end = h.point
      break
    }

    if (enemyHit) {
      const e = enemyHit.object.userData.enemy
      const part = enemyHit.object.userData.part || 'body'
      this.weapon.hits++
      const res = e.takeHit(this.weapon.damage, part, point, normal, this.weapon)
      this.effects.spawnTracer(shot.muzzle, point, 0xffd08a, 1)
      this.hud.hitmarker(res.headshot)
      this.audio.hitmarker(res.headshot)
      this.showFxFlash(res.headshot ? 0.07 : 0.04, 45)
      if (res.killed) this.onEnemyKilled(e, res.headshot)
    } else if (point) {
      this.effects.spawnTracer(shot.muzzle, point, 0xffd08a, 1)
      this.effects.impact(point, normal, { color: 0xffb060, sparks: 8, decal: true })
    } else {
      this.effects.spawnTracer(shot.muzzle, end, 0xffc070, 0.8)
    }

    const recoilP = (this.weapon.adsAmount > 0.6 ? 0.0042 : 0.0086) + Math.random() * 0.0035
    const recoilY = (Math.random() - 0.5) * 0.006
    this.player.recoil(recoilP, recoilY)
    this.fovKick = Math.min(2.2, this.fovKick + (this.weapon.adsAmount > 0.6 ? 0.28 : 0.7))
    this.showFxFlash(0.055, 40)
  }

  onEnemyKilled(enemy, headshot) {
    this.combo++
    this.comboTimer = 3.2
    const mult = 1 + Math.min(1, (this.combo - 1) * 0.18)
    const points = Math.round(enemy.cfg.score * mult * (headshot ? 1.5 : 1))
    this.score += points
    this.kills++
    this.hud.addKill(enemy.cfg.name, headshot, points)
    this.audio.kill()
    if (headshot) this.hud.toast(`HEADSHOT // ${enemy.cfg.name}`, 1.1)
    if (this.combo >= 3) this.hud.toast(`KILL CHAIN ×${this.combo}`, 1.2)
    if (enemy.type === 'titan') {
      this.hud.showBanner('HEAVY UNIT DOWN', 'TITAN NEUTRALIZED', `+${points} PTS`, 2.6)
      this.showFxFlash(0.18, 120)
    }
    const roll = Math.random()
    if (enemy.type === 'titan') {
      this.spawnPickup(enemy.position.clone(), 'ammo')
      this.spawnPickup(enemy.position.clone().add(new THREE.Vector3(1, 0, 0)), 'health')
    } else if (roll < 0.18) {
      this.spawnPickup(enemy.position.clone(), roll < 0.06 ? 'health' : roll < 0.12 ? 'armor' : 'ammo')
    }
  }

  buildPickupAssets() {
    this.pickupGeo = new RoundedBoxGeometry(0.34, 0.34, 0.34, 2, 0.06)
    this.pickupRingGeo = new THREE.TorusGeometry(0.31, 0.018, 6, 24)
    this.pickupColors = {
      health: new THREE.Color(0x5bffa8),
      armor: new THREE.Color(0x5fd4ff),
      ammo: new THREE.Color(0xff9a3c)
    }
  }

  spawnPickup(pos, type) {
    const color = this.pickupColors[type] || this.pickupColors.ammo
    const group = new THREE.Group()
    group.position.set(pos.x, 0.62, pos.z)
    const mat = new THREE.MeshStandardMaterial({ color: 0x111c22, emissive: color, emissiveIntensity: 1.5, metalness: 0.4, roughness: 0.4 })
    const box = new THREE.Mesh(this.pickupGeo, mat)
    box.castShadow = true
    group.add(box)
    const ring = new THREE.Mesh(this.pickupRingGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.soft, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
    glow.scale.set(1.3, 1.3, 1)
    group.add(glow)
    this.scene.add(group)
    this.pickups.push({ group, type, box, ring, time: Math.random() * 6, life: 45 })
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]
      p.life -= dt
      p.time += dt
      p.box.rotation.y += dt * 1.6
      p.box.rotation.x += dt * 0.7
      p.ring.rotation.z += dt * 1.2
      p.group.position.y = 0.62 + Math.sin(p.time * 2.2) * 0.09
      const d = Math.hypot(p.group.position.x - this.player.position.x, p.group.position.z - this.player.position.z)
      if (d < 1.5 && this.player.alive) {
        this.collectPickup(p)
        this.scene.remove(p.group)
        p.box.geometry = null
        this.pickups.splice(i, 1)
        continue
      }
      if (p.life <= 0) {
        this.scene.remove(p.group)
        this.pickups.splice(i, 1)
      }
    }
  }

  collectPickup(p) {
    if (p.type === 'health') {
      this.player.heal(35)
      this.hud.toast('FIELD REPAIR // HEALTH +35', 1.5)
    } else if (p.type === 'armor') {
      this.player.addArmor(40)
      this.hud.toast('ARMOR PLATING // ARMOR +40', 1.5)
    } else {
      this.weapon.reserve = Math.min(300, this.weapon.reserve + 75)
      this.hud.toast('AMMO CRATE // +75 ROUNDS', 1.5)
    }
    this.audio.pickup()
  }

  clearPickups() {
    for (const p of this.pickups) this.scene.remove(p.group)
    this.pickups.length = 0
  }

  updateCameraFov(dt) {
    const ads = this.weapon.adsAmount
    const target = 74 - ads * 20 + this.fovKick
    this.camera.fov = damp(this.camera.fov, target, 14, dt)
    this.camera.updateProjectionMatrix()
    this.fovKick = damp(this.fovKick, 0, 9, dt)
  }

  updatePlaying(dt, time) {
    this.input.updateMovement()
    const sens = this.input.sensitivity
    const look = this.input.consumeLook(sens)
    this.player.applyLook(look.x, look.y, 1)
    const pstate = this.player.update(dt, this.input, { ads: this.weapon.adsAmount > 0.45, time })

    this.weapon.update(dt, {
      moving: clamp(pstate.movingSpeed / 5.5, 0, 1.4),
      sprinting: pstate.sprinting,
      crouching: this.player.crouching,
      lookX: look.x,
      lookY: look.y,
      time,
      grounded: this.player.grounded
    })

    this.updateShooting(dt)
    this.updateCameraFov(dt)
    this.enemies.update(dt, this.player, time)
    this.updateWaves(dt)
    this.updatePickups(dt)

    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.combo = 0
    }

    this.world.update(dt, time, this.player.position)
    this.effects.update(dt, this.camera)
    this.audio.update(dt, clamp(this.enemies.aliveCount() / 8, 0, 1))

    this.hud.setPlayerContext(this.player.position.x, this.player.position.z, this.player.yaw)
    this.hud.update(dt, {
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      armor: this.player.armor,
      maxArmor: this.player.maxArmor,
      alive: this.player.alive,
      ammo: this.weapon.ammo,
      reserve: this.weapon.reserve,
      reloading: this.weapon.reloading,
      reloadProgress: this.weapon.getReloadProgress(),
      score: this.score,
      kills: this.kills,
      wave: this.wave || 1,
      enemies: this.waveQueue.length + this.enemies.aliveCount(),
      spread: this.weapon.getSpread(),
      adsAmount: this.weapon.adsAmount,
      hitFlash: 0,
      yaw: this.player.yaw,
      px: this.player.position.x,
      pz: this.player.position.z,
      colliders: this.world.colliders,
      spawnPoints: this.world.spawnPoints,
      pickups: this.pickups.map(p => ({ x: p.group.position.x, z: p.group.position.z })),
      enemyDots: this.enemies.enemies.filter(e => !e.dead).map(e => ({ x: e.position.x, z: e.position.z, type: e.type, boss: e.type === 'titan' }))
    })
  }

  updateAttract(dt, time) {
    this.menuT += dt
    this.setMenuCamera(this.menuT)
    this.weapon.root.visible = false
    this.world.update(dt, time, this.camera.position)
    this.effects.update(dt, this.camera)
  }

  loop = () => {
    if (!this.running) return
    requestAnimationFrame(this.loop)
    const now = performance.now()
    let dt = (now - this.lastTime) / 1000
    this.lastTime = now
    dt = clamp(dt, 0.0001, 0.05)
    const time = now / 1000

    if (this.state === 'playing') this.updatePlaying(dt, time)
    else if (this.state === 'menu') this.updateAttract(dt, time)
    else if (this.state === 'dead' || this.state === 'paused') {
      this.world.update(dt * 0.35, time, this.camera.position)
      this.effects.update(dt * 0.35, this.camera)
    }

    this.post.render(dt)
    this.trackPerformance(dt)
  }

  trackPerformance(dt) {
    if (this.state !== 'playing') return
    this.adaptive.time += dt
    this.adaptive.frames++
    if (this.adaptive.time > 4) {
      const fps = this.adaptive.frames / this.adaptive.time
      this.adaptive.time = 0
      this.adaptive.frames = 0
      if (fps < 42 && this.adaptive.checked < 2 && this.quality !== 'performance') {
        this.adaptive.checked++
        const dpr = Math.max(0.85, this.renderer.getPixelRatio() * 0.85)
        this.renderer.setPixelRatio(dpr)
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.post.setSize(window.innerWidth, window.innerHeight)
      }
    }
  }
}
