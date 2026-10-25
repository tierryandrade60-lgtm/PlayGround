import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { PALETTE, WORLD, GAME } from './config.js'
import { difficultyFor, hopScore, landingQuality, triangleWave } from './score.js'
import { SkyWorld, makeRng } from './world.js'
import { Oi } from './oi.js'

const BEST_KEY = 'oi.best'
const TAU = Math.PI * 2

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

function readBest() {
  try {
    const raw = Number(localStorage.getItem(BEST_KEY))
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
  } catch {
    return 0
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    /* storage is optional */
  }
}

function isCoarsePointer() {
  return window.matchMedia('(pointer: coarse)').matches
}

export class Game {
  constructor({ canvas, ui, sound }) {
    this.canvas = canvas
    this.ui = ui
    this.sound = sound
    this.mobile = isCoarsePointer() || window.innerWidth < 760
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(PALETTE.fog, WORLD.fogNear, WORLD.fogFar)
    this.camera = new THREE.PerspectiveCamera(this.baseFov(), 1, 0.1, WORLD.cameraFar)
    this.camera.position.set(0, 5, -11)
    this.lookTarget = new THREE.Vector3(0, 1, 4)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    })
    this.renderer.setClearColor(PALETTE.skyHorizon, 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.94
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.75 : 2)
    this.renderer.setPixelRatio(this.pixelRatio)

    const size = this.viewportSize()
    this.renderer.setSize(size.width, size.height, false)

    this.world = new SkyWorld(this.scene, { mobile: this.mobile })
    this.oi = new Oi(this.scene)

    this.composer = new EffectComposer(this.renderer)
    this.composer.setPixelRatio(this.pixelRatio)
    this.composer.setSize(size.width, size.height)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const gl = this.renderer.getContext()
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const gpuName = String(
      (debugInfo && gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '',
    )
    this.softwareRenderer = /swiftshader|llvmpipe|software/i.test(gpuName)
    if (this.softwareRenderer) this.pixelRatio = Math.min(this.pixelRatio, 1)

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      this.mobile ? 0.14 : 0.19,
      0.5,
      1.0,
    )
    this.bloom.enabled = !this.softwareRenderer
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.best = readBest()
    this.score = 0
    this.flow = 0
    this.longestFlow = 0
    this.bestAtStart = this.best
    this.runCount = 0
    this.shake = 0
    this.perfFrames = 0
    this.perfTime = 0
    this.qualityStep = 0
    this.paused = false
    this.lastHintIndex = -1

    this.islands = []
    this.fireflies = []
    this.previewPoints = Array.from({ length: 30 }, () => new THREE.Vector3())
    this.tmpVec = new THREE.Vector3()
    this.tmpVec2 = new THREE.Vector3()
    this.aim = null
    this.flightVelocity = new THREE.Vector3()
    this.trailClock = 0
    this.dustClock = 0
    this.elapsed = 0

    this.ui.setBest(this.best)
    this.ui.setSoundMuted(this.sound.muted)

    this.prepareRun()
    this.enterMenu(true)
    this.bindUI()
    this.bindInput()
    this.onResize()
    window.addEventListener('resize', () => this.onResize())
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.onResize(), 180)
    })

    this.clock = new THREE.Clock()
    this.frames = 0
    this.loop = this.loop.bind(this)
    requestAnimationFrame(this.loop)
  }

  baseFov() {
    return window.innerHeight > window.innerWidth ? 70 : 56
  }

  viewportSize() {
    return { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) }
  }

  bindUI() {
    document.getElementById('play').addEventListener('click', () => this.startRun())
    document.getElementById('again').addEventListener('click', () => this.startRun({ fromGameOver: true }))
    document.getElementById('toMenu').addEventListener('click', () => this.enterMenu())
    document.getElementById('how').addEventListener('click', () => {
      this.sound.unlock()
      this.sound.play('ui')
      this.ui.showHow()
    })
    document.getElementById('closeHow').addEventListener('click', () => {
      this.sound.play('ui')
      this.ui.hideHow()
    })
    for (const id of ['soundHud', 'soundMenu']) {
      const button = document.getElementById(id)
      button.addEventListener('click', () => {
        this.sound.unlock()
        const muted = this.sound.toggle()
        this.ui.setSoundMuted(muted)
        if (!muted) this.sound.play('ui')
      })
    }
  }

  bindInput() {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      this.sound.unlock()
      if (this.state === 'menu') {
        this.startRun()
        return
      }
      this.pressStart()
    })
    window.addEventListener('pointerup', () => this.pressEnd())
    window.addEventListener('pointercancel', () => this.cancelCharge())
    window.addEventListener('blur', () => this.cancelCharge())

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault()
        if (event.repeat) return
        if (this.state === 'menu') this.startRun()
        else if (this.state === 'gameover') this.startRun({ fromGameOver: true })
        else this.pressStart()
      } else if (event.code === 'Enter') {
        if (this.state === 'menu') this.startRun()
        else if (this.state === 'gameover') this.startRun({ fromGameOver: true })
      } else if (event.code === 'KeyM') {
        const muted = this.sound.toggle()
        this.ui.setSoundMuted(muted)
      }
    })
    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        event.preventDefault()
        this.pressEnd()
      }
    })
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault())

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.paused = true
        if (this.state === 'charging') this.cancelCharge()
        this.sound.stopCharge()
      } else {
        this.paused = false
        this.clock.getDelta()
      }
    })
  }

  prepareRun() {
    for (const island of this.islands) this.world.removeIsland(island)
    this.islands = []
    this.fireflies = []
    this.world.clearFirefliesAndEffects()
    this.world.hidePreview()

    this.runCount += 1
    this.rng = makeRng((Date.now() ^ (this.runCount * 2654435761)) >>> 0)
    this.heading = (this.rng() - 0.5) * 0.5
    this.currentIndex = 0
    this.score = 0
    this.flow = 0
    this.longestFlow = 0
    this.bestAtStart = this.best
    this.aim = null
    this.chargePower = 0
    this.chargeTime = 0
    this.shake = 0
    this.lastHintIndex = -1

    const first = this.addIsland({
      index: 0,
      position: new THREE.Vector3(0, WORLD.startTop, 0),
      radius: WORLD.startRadius,
      depth: 11,
      seed: 1201,
    })
    this.currentIsland = first
    for (let i = 1; i <= 4; i += 1) this.generateNext()

    this.nextIsland = this.islandAt(1)
    this.currentIndex = 0
    this.placeOiOn(first, true)
    this.oi.targetYaw = Math.PI
    this.oi.faceNow()
    this.world.setTarget(this.nextIsland)
    this.spawnGapFireflies(first, this.nextIsland)
    this.ui.setScore(0)
    this.ui.setFlow(0)
    this.ui.setCharge(0, false)
  }

  enterMenu(snap = true) {
    this.prepareRun()
    this.state = 'menu'
    this.mode = 'menu'
    this.ui.showMenu()
    this.ui.hideGameOver()
    this.ui.hideHow()
    this.ui.setBest(this.best)
    this.ui.setScore(0)
    this.ui.setFlow(0)
    this.ui.setCharge(0, false)
    if (snap) this.updateCamera(1, 0, true)
  }

  startRun({ fromGameOver = false } = {}) {
    this.prepareRun()
    this.ui.hideMenu()
    this.ui.hideGameOver()
    this.ui.showHud()
    this.ui.hintFor(6)
    this.ui.setBest(this.best)
    this.state = 'intro'
    this.mode = 'play'
    this.introTimer = 0.8
    this.sound.startGame()
    this.flashIntro = true
    if (fromGameOver) {
      this.updateCamera(1, 0, true)
    }
  }

  leaveToMenu() {
    this.enterMenu(true)
  }

  islandAt(index) {
    return this.islands.find((island) => island.index === index) || null
  }

  addIsland({ index, position, radius, depth, seed }) {
    const island = this.world.makeIsland({ radius, depth, seed })
    island.group.position.copy(position)
    island.index = index
    island.top = position.y
    island.pos = position.clone()
    island.depth = depth
    this.scene.add(island.group)
    this.islands.push(island)
    this.islands.sort((a, b) => a.index - b.index)
    return island
  }

  generateNext() {
    const prev = this.islands[this.islands.length - 1]
    if (!prev) return null
    const index = prev.index + 1
    const diff = difficultyFor(index)
    const gap = lerp(diff.gapMin, diff.gapMax, this.rng())
    this.heading += (this.rng() - 0.5) * 0.6
    this.heading = clamp(this.heading, -0.78, 0.78)
    const dirX = Math.sin(this.heading)
    const dirZ = Math.cos(this.heading)
    const position = new THREE.Vector3(
      prev.pos.x + dirX * gap,
      clamp(prev.pos.y + (this.rng() - 0.5) * 2 * diff.heightRange * 0.7, -4.5, 10.5),
      prev.pos.z + dirZ * gap,
    )
    const radius = lerp(diff.radiusMin, diff.radiusMax, this.rng())
    const depth = radius * 1.8 + 0.8 + this.rng() * 1.2
    return this.addIsland({
      index,
      position,
      radius,
      depth,
      seed: (index * 7919 + Math.floor(this.rng() * 100000)) >>> 0,
    })
  }

  ensureAhead() {
    while (this.islands.length && this.islands[this.islands.length - 1].index < this.currentIndex + 4) {
      this.generateNext()
    }
  }

  pruneIslands() {
    const keepFrom = this.currentIndex - 1
    const removed = this.islands.filter((island) => island.index < keepFrom)
    if (!removed.length) return
    for (const island of removed) this.world.removeIsland(island)
    this.islands = this.islands.filter((island) => island.index >= keepFrom)
  }

  placeOiOn(island, instant = false) {
    const x = island.pos.x
    const z = island.pos.z
    this.oi.reset()
    this.oi.setPosition(x, island.top + 0.55, z)
    const next = this.islandAt(island.index + 1)
    if (next) this.oi.setLookAt(next.pos)
    this.oi.faceNow()
    if (instant) this.oi.update(0.016, this.elapsed, { state: 'ready' })
  }

  spawnGapFireflies(from, to) {
    this.world.clearFireflies()
    this.fireflies = []
    if (!from || !to) return
    const ideal = this.solveJump(
      new THREE.Vector3(from.pos.x, from.top + 0.55, from.pos.z),
      new THREE.Vector3(to.pos.x, to.top + 0.55, to.pos.z),
      this.idealPower(),
    )
    for (const fraction of [0.3, 0.5, 0.7]) {
      const t = ideal.T * fraction
      const position = new THREE.Vector3(
        ideal.start.x + ideal.vx * t,
        ideal.start.y + ideal.vy * t - 0.5 * WORLD.gravity * t * t + 0.18,
        ideal.start.z + ideal.vz * t,
      )
      const firefly = this.world.createFirefly(position)
      this.fireflies.push(firefly)
    }
  }

  idealPower() {
    return (1 - GAME.rangeFactorMin) / (GAME.rangeFactorMax - GAME.rangeFactorMin)
  }

  solveJump(start, target, power) {
    const dx = target.x - start.x
    const dz = target.z - start.z
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    const factor = lerp(GAME.rangeFactorMin, GAME.rangeFactorMax, clamp(power, 0, 1))
    const range = distance * factor
    const nx = dx / distance
    const nz = dz / distance
    const end = new THREE.Vector3(start.x + nx * range, target.y, start.z + nz * range)
    const dy = end.y - start.y
    const T = clamp(0.52 + range * 0.048, 0.62, 1.45)
    const vh = range / T
    const vy = (dy + 0.5 * WORLD.gravity * T * T) / T
    return {
      start: start.clone(),
      end,
      nx,
      nz,
      vx: nx * vh,
      vz: nz * vh,
      vy,
      vh,
      T,
      range,
      distance,
    }
  }

  pressStart() {
    if (this.state !== 'ready') return
    if (this.nextIsland) {
      const dx = this.nextIsland.pos.x - this.oi.group.position.x
      const dz = this.nextIsland.pos.z - this.oi.group.position.z
      this.oi.targetYaw = Math.atan2(dx, dz)
    }
    this.state = 'charging'
    this.chargeTime = 0
    this.chargePower = 0
    this.oi.chargeStart()
    this.ui.showHint(false)
    this.ui.setCharge(0, true)
    this.sound.startCharge()
    this.sound.unlock()
  }

  cancelCharge() {
    if (this.state !== 'charging') return
    this.sound.stopCharge()
    this.state = 'ready'
    this.chargePower = 0
    this.chargeTime = 0
    this.ui.setCharge(0, false)
    this.oi.setCharge(0)
    this.world.hidePreview()
    if (this.currentIndex <= 1) this.ui.hintFor(3)
  }

  pressEnd() {
    if (this.state !== 'charging') return
    const power = this.chargePower
    this.sound.stopCharge()
    if (power < 0.045) {
      this.cancelCharge()
      return
    }
    this.launch(power)
  }

  launch(power) {
    if (!this.aim) this.computeAim(power)
    const aim = this.aim
    if (!aim) {
      this.cancelCharge()
      return
    }
    this.state = 'flying'
    this.flightVelocity.set(aim.vx, aim.vy, aim.vz)
    this.flightTime = 0
    this.trailClock = 0
    this.oi.launch(power)
    this.oi.setLookAt(aim.end)
    this.oi.targetYaw = Math.atan2(aim.nx, aim.nz)
    this.ui.setCharge(0, false)
    this.world.hidePreview()
    this.sound.play('jump', power)
    this.ui.showHint(false)
  }

  computeAim(power) {
    const current = this.currentIsland
    const next = this.nextIsland
    if (!current || !next) {
      this.aim = null
      return null
    }
    const start = this.tmpVec.set(this.oi.group.position.x, current.top + 0.55, this.oi.group.position.z)
    const target = this.tmpVec2.set(next.pos.x, next.top + 0.55, next.pos.z)
    this.aim = this.solveJump(start, target, power)
    return this.aim
  }

  updatePreview(power) {
    const aim = this.computeAim(power)
    if (!aim) {
      this.world.hidePreview()
      return
    }
    const count = this.previewPoints.length
    for (let i = 0; i < count; i += 1) {
      const t = (aim.T * i) / (count - 1)
      this.previewPoints[i].set(
        aim.start.x + aim.vx * t,
        aim.start.y + aim.vy * t - 0.5 * WORLD.gravity * t * t,
        aim.start.z + aim.vz * t,
      )
    }
    const landingDistance = Math.hypot(aim.end.x - this.nextIsland.pos.x, aim.end.z - this.nextIsland.pos.z)
    const onTarget = landingDistance <= this.nextIsland.radius * 0.94
    this.tmpLanding = this.tmpLanding || new THREE.Vector3()
    this.tmpLanding.set(aim.end.x, this.nextIsland.top + 0.04, aim.end.z)
    this.world.showPreview(this.previewPoints, this.tmpLanding, onTarget)
  }

  landOnNext(island) {
    const offset = Math.hypot(this.oi.group.position.x - island.pos.x, this.oi.group.position.z - island.pos.z)
    const quality = landingQuality(offset, island.radius)
    this.flow += 1
    this.longestFlow = Math.max(this.longestFlow, this.flow)
    const gained = hopScore(this.flow, quality)
    this.score += gained
    this.best = Math.max(this.best, this.score)

    this.currentIndex = island.index
    this.currentIsland = island
    this.oi.group.position.set(this.oi.group.position.x, island.top + 0.55, this.oi.group.position.z)
    this.oi.land(quality === 'perfect' ? 1.3 : 1)
    this.oi.setLookAt(this.islandAt(island.index + 1)?.pos || island.pos)
    this.oi.faceNow()
    this.ensureAhead()
    this.pruneIslands()
    this.nextIsland = this.islandAt(island.index + 1)
    this.spawnGapFireflies(island, this.nextIsland)
    this.world.setTarget(this.nextIsland)
    this.state = 'landing'
    this.landTimer = quality === 'perfect' ? 0.55 : 0.45
    this.ui.setScore(this.score)
    this.ui.setBest(this.best)
    this.ui.setFlow(this.flow)
    this.updateBestStorage()

    const pos = this.oi.group.position
    this.world.burst(new THREE.Vector3(pos.x, island.top + 0.18, pos.z), {
      color: '#ffedc4',
      count: quality === 'perfect' ? 22 : 12,
      speed: quality === 'perfect' ? 4 : 2.4,
      gravity: 7,
      size: 0.26,
      life: 0.7,
    })
    this.world.shockwave(new THREE.Vector3(pos.x, island.top + 0.06, pos.z), quality === 'perfect' ? '#ffe6a4' : '#fff1d2', quality === 'perfect' ? 5.4 : 3.3)
    this.sound.play('land')
    this.bump(0.22)

    const projected = this.project(new THREE.Vector3(pos.x, island.top + 1.6, pos.z))
    if (projected) {
      this.ui.float(quality === 'perfect' ? `perfect +${gained}` : `+${gained}`, quality === 'perfect' ? 'perfect' : '', projected.x, projected.y)
    }

    if (quality === 'perfect') {
      this.world.burst(new THREE.Vector3(pos.x, island.top + 0.7, pos.z), {
        color: PALETTE.perfect,
        count: 30,
        speed: 4.6,
        gravity: 4,
        size: 0.34,
        life: 1.05,
      })
      this.sound.play('perfect')
      if (navigator.vibrate) navigator.vibrate([0, 24, 40, 18])
    } else if (navigator.vibrate) {
      navigator.vibrate(14)
    }
  }

  landOnCurrent() {
    const island = this.currentIsland
    this.oi.group.position.set(this.oi.group.position.x, island.top + 0.55, this.oi.group.position.z)
    this.oi.land(0.8)
    this.flow = 0
    this.state = 'landing'
    this.landTimer = 0.5
    this.ui.setFlow(0)
    this.world.shockwave(new THREE.Vector3(this.oi.group.position.x, island.top + 0.06, this.oi.group.position.z), '#ffd7bd', 2.6)
    this.sound.play('land', 0.5)
    const projected = this.project(new THREE.Vector3(this.oi.group.position.x, island.top + 1.4, this.oi.group.position.z))
    if (projected) this.ui.float('try again', 'subtle', projected.x, projected.y)
    this.bump(0.14)
  }

  beginFall() {
    if (this.state === 'falling' || this.state === 'gameover') return
    this.state = 'falling'
    this.fallTimer = 0
    this.oi.startFall()
    this.sound.play('fail')
    this.sound.stopCharge()
    this.ui.setCharge(0, false)
    if (navigator.vibrate) navigator.vibrate(80)
  }

  finishRun() {
    this.state = 'gameover'
    this.updateBestStorage()
    this.ui.setBest(this.best)
    this.ui.showGameOver({
      score: this.score,
      best: this.best,
      longestFlow: this.longestFlow,
      newBest: this.score > this.bestAtStart && this.score > 0,
    })
  }

  updateBestStorage() {
    if (this.score > 0 && this.score >= this.best) {
      this.best = this.score
      saveBest(this.best)
    }
  }

  collectFirefly(firefly) {
    const index = this.fireflies.indexOf(firefly)
    if (index === -1 || !firefly.alive) return
    this.fireflies.splice(index, 1)
    this.world.removeFirefly(firefly)
    const pos = firefly.group.position.clone()
    this.score += GAME.fireflyValue
    this.ui.setScore(this.score)
    this.world.burst(pos, { color: PALETTE.collect, count: 12, speed: 2.2, gravity: 2.5, size: 0.24, life: 0.6 })
    this.sound.play('collect', this.fireflies.length % 3)
    const projected = this.project(pos.clone().add(new THREE.Vector3(0, 0.45, 0)))
    if (projected) this.ui.float(`+${GAME.fireflyValue}`, 'collect', projected.x, projected.y)
  }

  project(position) {
    const vector = position.clone().project(this.camera)
    if (vector.z > 1 || vector.z < -1) return null
    return {
      x: ((vector.x + 1) / 2) * window.innerWidth,
      y: ((1 - vector.y) / 2) * window.innerHeight,
    }
  }

  bump(amount) {
    this.shake = Math.max(this.shake, amount)
  }

  onResize() {
    const size = this.viewportSize()
    this.camera.aspect = size.width / size.height
    this.camera.fov = this.baseFov()
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(size.width, size.height, false)
    this.composer.setSize(size.width, size.height)
    this.bloom.resolution.set(size.width, size.height)
  }

  updateCamera(dt, elapsed, snap = false) {
    const k = snap ? 1 : 1
    if (this.mode === 'menu') {
      const island = this.currentIsland
      const angle = Math.PI + Math.sin(elapsed * 0.14) * 0.6
      const radius = 7.2
      const desired = this.tmpVec.set(
        island.pos.x + Math.sin(angle) * radius,
        island.top + 2.9 + Math.sin(elapsed * 0.42) * 0.18,
        island.pos.z + Math.cos(angle) * radius,
      )
      const look = this.tmpVec2.set(island.pos.x, island.top + 0.85, island.pos.z + 1.9)
      if (snap) {
        this.camera.position.copy(desired)
        this.lookTarget.copy(look)
      } else {
        this.camera.position.lerp(desired, 1 - Math.exp(-1.8 * dt * k))
        this.lookTarget.lerp(look, 1 - Math.exp(-3.2 * dt * k))
      }
      this.camera.lookAt(this.lookTarget)
      const fov = this.baseFov() + 2
      this.camera.fov = snap ? fov : damp(this.camera.fov, fov, 3.5, dt)
      this.camera.updateProjectionMatrix()
      return
    }

    const oiPos = this.oi.group.position
    const current = this.currentIsland
    const next = this.nextIsland
    const flying = this.state === 'flying' || this.state === 'falling' || this.state === 'gameover'
    const nextTop = next ? next.top : current.top
    const anchorTop = Math.max(current.top, nextTop)

    const portrait = window.innerHeight > window.innerWidth
    const node = flying ? 0.22 : portrait ? 0.38 : 0.28
    let desiredX = lerp(oiPos.x, next ? next.pos.x : oiPos.x, node)
    let desiredY = anchorTop + (portrait ? 5.0 : 4.7) + clamp(oiPos.y - anchorTop, 0, 6) * 0.4
    let desiredZ = oiPos.z - (portrait ? 10.8 : 9.2)
    if (this.state === 'falling') {
      desiredY = Math.min(desiredY, oiPos.y + 6.2)
      desiredZ = oiPos.z - 9.6
    }

    if (this.state === 'menu') {
      desiredY = current.top + 4
    }

    const desired = this.tmpVec.set(desiredX, desiredY, desiredZ)
    const look =
      flying
        ? this.tmpVec2.set(oiPos.x, oiPos.y + 0.55, oiPos.z)
        : this.tmpVec2.set(
            lerp(oiPos.x, next ? next.pos.x : oiPos.x, portrait ? 0.52 : 0.42),
            Math.max(oiPos.y, nextTop) + 1.25,
            lerp(oiPos.z, next ? next.pos.z : oiPos.z, portrait ? 0.5 : 0.42),
          )

    if (snap) {
      this.camera.position.copy(desired)
      this.lookTarget.copy(look)
    } else {
      const posLambda = this.state === 'intro' ? 3.2 : 4.4
      this.camera.position.lerp(desired, 1 - Math.exp(-posLambda * dt))
      this.lookTarget.lerp(look, 1 - Math.exp(-5.2 * dt))
    }

    const targetFov = this.baseFov() + (this.state === 'flying' ? 2.8 : 0) + (this.state === 'charging' ? this.chargePower * 1.6 : 0)
    this.camera.fov = snap ? targetFov : damp(this.camera.fov, targetFov, 4.5, dt)
    this.camera.updateProjectionMatrix()

    if (this.shake > 0.001) {
      const amount = this.shake
      this.camera.position.x += (Math.random() - 0.5) * amount
      this.camera.position.y += (Math.random() - 0.5) * amount * 0.7
      this.camera.position.z += (Math.random() - 0.5) * amount * 0.5
      this.shake = Math.max(0, this.shake - dt * 2.4)
    }
    this.camera.lookAt(this.lookTarget)
  }

  updatePlaying(dt) {
    if (this.state === 'intro') {
      this.introTimer -= dt
      if (this.introTimer <= 0) this.state = 'ready'
    }

    if (this.state === 'charging') {
      this.chargeTime += dt
      this.chargePower = triangleWave(this.chargeTime, GAME.chargePeriod)
      this.oi.setCharge(this.chargePower)
      this.ui.setCharge(this.chargePower, true)
      this.sound.updateCharge(this.chargePower)
      this.updatePreview(this.chargePower)
    }

    if (this.state === 'flying') {
      const next = this.nextIsland
      const current = this.currentIsland
      const nextPlane = next ? next.top + 0.55 : -Infinity
      const currentPlane = current ? current.top + 0.55 : -Infinity
      const floor = Math.min(current?.top ?? 0, next?.top ?? 0) - 6
      const pos = this.oi.group.position
      const step = 1 / 120
      let remaining = dt

      while (remaining > 0 && this.state === 'flying') {
        const h = Math.min(step, remaining)
        remaining -= h
        this.flightTime += h
        this.flightVelocity.y -= WORLD.gravity * h
        const prev = this.tmpVec.copy(pos)
        pos.addScaledVector(this.flightVelocity, h)
        const descending = this.flightVelocity.y < 0

        if (descending && next) {
          const crossed = prev.y >= nextPlane && pos.y <= nextPlane
          if (crossed) {
            const t = clamp((prev.y - nextPlane) / Math.max(0.0001, prev.y - pos.y), 0, 1)
            const x = lerp(prev.x, pos.x, t)
            const z = lerp(prev.z, pos.z, t)
            const distance = Math.hypot(x - next.pos.x, z - next.pos.z)
            if (distance <= next.radius + 0.12) {
              pos.set(x, nextPlane, z)
              this.flightVelocity.set(0, 0, 0)
              this.landOnNext(next)
              break
            }
          }
        }

        if (descending && current) {
          const crossed = prev.y >= currentPlane && pos.y <= currentPlane
          if (crossed) {
            const t = clamp((prev.y - currentPlane) / Math.max(0.0001, prev.y - pos.y), 0, 1)
            const x = lerp(prev.x, pos.x, t)
            const z = lerp(prev.z, pos.z, t)
            const distance = Math.hypot(x - current.pos.x, z - current.pos.z)
            if (distance <= current.radius + 0.12) {
              pos.set(x, currentPlane, z)
              this.flightVelocity.set(0, 0, 0)
              this.landOnCurrent()
              break
            }
          }
        }

        this.trailClock += h
        while (this.trailClock > 0.03) {
          this.trailClock -= 0.03
          this.world.spliceTrail(pos, '#ffd695', 1)
        }
        for (const firefly of [...this.fireflies]) {
          if (firefly.alive && firefly.group.position.distanceTo(pos) < 0.95) {
            this.collectFirefly(firefly)
          }
        }
        if (pos.y < floor || this.flightTime > 4.2) {
          this.beginFall()
          break
        }
      }
    }

    if (this.state === 'falling') {
      this.flightVelocity.y -= WORLD.gravity * dt
      this.oi.group.position.addScaledVector(this.flightVelocity, dt)
      this.fallTimer += dt
      if (this.fallTimer > 1.15) this.finishRun()
    }

    if (this.state === 'landing') {
      this.landTimer -= dt
      if (this.landTimer <= 0) {
        this.state = 'ready'
        if (this.currentIndex <= 1 && this.lastHintIndex !== this.currentIndex) {
          this.lastHintIndex = this.currentIndex
          this.ui.hintFor(3.5)
        }
      }
    }

    if (this.state === 'ready' || this.state === 'intro') {
      this.oi.targetYaw = Math.atan2(
        this.camera.position.x - this.oi.group.position.x,
        this.camera.position.z - this.oi.group.position.z,
      )
    }
  }

  updateQuality(dt) {
    this.perfFrames += 1
    this.perfTime += dt
    if (this.perfTime < 2.5) return
    const fps = this.perfFrames / this.perfTime
    this.perfFrames = 0
    this.perfTime = 0
    if (fps < 42 && this.qualityStep < 2) {
      this.qualityStep += 1
      if (this.qualityStep === 1) {
        this.pixelRatio = Math.min(this.pixelRatio, 1.5)
        this.renderer.setPixelRatio(this.pixelRatio)
        this.composer.setPixelRatio(this.pixelRatio)
      } else if (this.qualityStep === 2) {
        this.bloom.enabled = false
      }
      const size = this.viewportSize()
      this.composer.setSize(size.width, size.height)
    }
  }

  loop() {
    requestAnimationFrame(this.loop)
    const dt = Math.min(0.1, this.clock.getDelta())
    if (this.paused) return
    this.elapsed += dt

    if (this.state !== 'menu' && this.state !== 'gameover') this.updatePlaying(dt)
    else if (this.state === 'gameover') {
      if (this.oi.group.position.y > -30) {
        this.flightVelocity.y -= WORLD.gravity * dt
        this.oi.group.position.addScaledVector(this.flightVelocity, dt)
      }
    }

    this.updateCamera(dt, this.elapsed)
    if (this.state === 'menu') {
      this.oi.targetYaw = Math.atan2(
        this.camera.position.x - this.oi.group.position.x,
        this.camera.position.z - this.oi.group.position.z,
      )
    }
    this.oi.update(dt, this.elapsed, {
      state: this.state === 'menu' ? 'ready' : this.state === 'gameover' ? 'falling' : this.state,
      verticalVelocity: this.flightVelocity.y,
    })
    this.world.update(dt, this.elapsed, this.camera)
    this.updateQuality(dt)

    this.composer.render()
    this.frames += 1
    if (this.frames === 2) this.ui.hideLoading()
  }
}
