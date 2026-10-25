const MOVE_KEYS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right'
}

export class Input {
  constructor(domElement, options = {}) {
    this.dom = domElement
    this.enabled = false
    this.playing = false
    this.keys = new Set()
    this.lookX = 0
    this.lookY = 0
    this.pointerLocked = false
    this.touch = options.touch ?? ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth <= 820)
    this.sensitivity = 1
    this.fireHeld = false
    this.mouseFire = false
    this.aimHeld = false
    this.aimToggle = false
    this.sprintHeld = false
    this.reloadQueued = false
    this.jumpQueued = false
    this.grenadeQueued = false
    this.stick = { x: 0, y: 0, active: false, pointerId: null }
    this.lookPointer = null
    this.lookDragging = false
    this.onPause = null
    this.onAnyInput = null
    this.bound = {}
    this.setup()
  }

  setup() {
    const b = this.bound
    b.keydown = (event) => {
      if (event.repeat) {
        if (MOVE_KEYS[event.code] || event.code === 'ShiftLeft') event.preventDefault()
        return
      }
      if (MOVE_KEYS[event.code]) {
        this.keys.add(event.code)
        event.preventDefault()
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.sprintHeld = true
      if (event.code === 'KeyR' && this.playing) this.reloadQueued = true
      if (event.code === 'Space' && this.playing) {
        this.jumpQueued = true
        event.preventDefault()
      }
      if (event.code === 'KeyG' && this.playing) this.grenadeQueued = true
      if (event.code === 'Escape' && this.playing && this.onPause) this.onPause()
      if (this.onAnyInput) this.onAnyInput()
    }
    b.keyup = (event) => {
      if (MOVE_KEYS[event.code]) this.keys.delete(event.code)
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.sprintHeld = false
    }
    b.blur = () => {
      this.keys.clear()
      this.sprintHeld = false
      this.mouseFire = false
      this.fireHeld = false
    }
    b.mousemove = (event) => {
      if (!this.playing) return
      if (this.pointerLocked) {
        this.lookX += event.movementX || 0
        this.lookY += event.movementY || 0
      } else if (this.lookDragging) {
        this.lookX += event.movementX || 0
        this.lookY += event.movementY || 0
      }
    }
    b.mousedown = (event) => {
      if (!this.playing) return
      if (event.button === 0) {
        this.mouseFire = true
        if (!this.pointerLocked && !this.touch) this.requestLock()
      }
      if (event.button === 2) this.aimHeld = true
      if (this.onAnyInput) this.onAnyInput()
    }
    b.mouseup = (event) => {
      if (event.button === 0) this.mouseFire = false
      if (event.button === 2) this.aimHeld = false
    }
    b.contextmenu = (event) => event.preventDefault()
    b.lockchange = () => {
      this.pointerLocked = document.pointerLockElement === this.dom
      if (this.pointerLocked) this.lookDragging = false
    }
    b.lockerror = () => {
      this.pointerLocked = false
    }
    b.pointerdown = (event) => {
      if (!this.playing || event.pointerType !== 'touch') return
      if (event.target.closest && event.target.closest('.stick-zone, .touch-btn, .btn, .menu, .modal, .pause-screen, .end-screen')) return
      if (this.lookPointer === null) {
        this.lookPointer = event.pointerId
        this.lookDragging = true
        this.lastLook = { x: event.clientX, y: event.clientY }
        if (this.onAnyInput) this.onAnyInput()
      }
    }
    b.pointermove = (event) => {
      if (event.pointerType !== 'touch' || event.pointerId !== this.lookPointer) return
      const dx = event.clientX - this.lastLook.x
      const dy = event.clientY - this.lastLook.y
      this.lastLook = { x: event.clientX, y: event.clientY }
      this.lookX += dx
      this.lookY += dy
    }
    b.pointerup = (event) => {
      if (event.pointerId === this.lookPointer) {
        this.lookPointer = null
        this.lookDragging = false
      }
    }
    b.resize = () => {
      const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth <= 820
      this.touch = coarse
      document.body.classList.toggle('is-touch', coarse)
    }

    window.addEventListener('keydown', b.keydown, { passive: false })
    window.addEventListener('keyup', b.keyup)
    window.addEventListener('blur', b.blur)
    window.addEventListener('mousemove', b.mousemove)
    window.addEventListener('mousedown', b.mousedown)
    window.addEventListener('mouseup', b.mouseup)
    window.addEventListener('contextmenu', b.contextmenu)
    window.addEventListener('pointerdown', b.pointerdown, { passive: true })
    window.addEventListener('pointermove', b.pointermove, { passive: true })
    window.addEventListener('pointerup', b.pointerup, { passive: true })
    window.addEventListener('pointercancel', b.pointerup, { passive: true })
    window.addEventListener('resize', b.resize)
    document.addEventListener('pointerlockchange', b.lockchange)
    document.addEventListener('pointerlockerror', b.lockerror)
    document.body.classList.toggle('is-touch', this.touch)
    this.setupTouchControls()
  }

  requestLock() {
    if (this.touch) return
    const el = this.dom
    if (!el || document.pointerLockElement === el) return
    const request = el.requestPointerLock?.({ unadjustedMovement: true })
    if (request && request.catch) request.catch(() => {})
  }

  releaseLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.()
    this.pointerLocked = false
  }

  setupTouchControls() {
    const stickZone = document.getElementById('stick-zone')
    const knob = document.getElementById('stick-knob')
    const fire = document.getElementById('btn-fire')
    const aim = document.getElementById('btn-aim')
    const reload = document.getElementById('btn-touch-reload')
    const jump = document.getElementById('btn-touch-jump')
    const hint = document.getElementById('look-hint')
    if (!stickZone) return

    let stickPointer = null
    const stickMove = (event) => {
      const rect = stickZone.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = event.clientX - cx
      let dy = event.clientY - cy
      const max = 52
      const len = Math.hypot(dx, dy)
      if (len > max) {
        dx = (dx / len) * max
        dy = (dy / len) * max
      }
      this.stick.x = dx / max
      this.stick.y = -dy / max
      knob.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const stickEnd = (event) => {
      if (event.pointerId !== stickPointer) return
      stickPointer = null
      this.stick.x = 0
      this.stick.y = 0
      this.stick.active = false
      knob.style.transform = 'translate(0px, 0px)'
    }
    stickZone.addEventListener('pointerdown', (event) => {
      if (!this.playing) return
      event.preventDefault()
      stickPointer = event.pointerId
      this.stick.active = true
      stickZone.setPointerCapture?.(event.pointerId)
      stickMove(event)
      if (this.onAnyInput) this.onAnyInput()
    })
    stickZone.addEventListener('pointermove', (event) => {
      if (event.pointerId === stickPointer) {
        event.preventDefault()
        stickMove(event)
      }
    })
    stickZone.addEventListener('pointerup', stickEnd)
    stickZone.addEventListener('pointercancel', stickEnd)

    const hold = (element, onDown, onUp) => {
      if (!element) return
      element.addEventListener('pointerdown', (event) => {
        if (!this.playing) return
        event.preventDefault()
        event.stopPropagation()
        element.setPointerCapture?.(event.pointerId)
        element.classList.add('active')
        onDown?.(event)
        if (this.onAnyInput) this.onAnyInput()
      })
      const up = (event) => {
        element.classList.remove('active')
        onUp?.(event)
      }
      element.addEventListener('pointerup', up)
      element.addEventListener('pointercancel', up)
      element.addEventListener('pointerleave', (event) => {
        if (event.buttons === 0) up(event)
      })
    }

    hold(fire, () => { this.fireHeld = true }, () => { this.fireHeld = false })
    hold(aim, () => { this.aimToggle = !this.aimToggle }, null)
    hold(reload, () => { this.reloadQueued = true }, null)
    hold(jump, () => { this.jumpQueued = true }, null)

    if (hint) {
      setTimeout(() => hint.classList.add('faded'), 9000)
    }
  }

  setPlaying(value) {
    this.playing = value
    if (!value) {
      this.keys.clear()
      this.mouseFire = false
      this.fireHeld = false
      this.aimHeld = false
      this.aimToggle = false
      this.sprintHeld = false
      this.releaseLock()
      this.lookX = 0
      this.lookY = 0
    }
    document.body.classList.toggle('is-playing', value)
  }

  consumeLook() {
    const x = this.lookX
    const y = this.lookY
    this.lookX = 0
    this.lookY = 0
    return { x, y }
  }

  consumeReload() {
    const value = this.reloadQueued
    this.reloadQueued = false
    return value
  }

  consumeJump() {
    const value = this.jumpQueued
    this.jumpQueued = false
    return value
  }

  consumeGrenade() {
    const value = this.grenadeQueued
    this.grenadeQueued = false
    return value
  }

  get firing() {
    return this.enabled && (this.mouseFire || this.fireHeld)
  }

  get ads() {
    return this.enabled && (this.aimHeld || this.aimToggle)
  }

  get move() {
    let x = 0
    let y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.stick.active) {
      x += this.stick.x
      y += this.stick.y
    }
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }

  get sprinting() {
    return this.sprintHeld
  }

  destroy() {
    window.removeEventListener('keydown', this.bound.keydown)
    window.removeEventListener('keyup', this.bound.keyup)
    window.removeEventListener('blur', this.bound.blur)
    window.removeEventListener('mousemove', this.bound.mousemove)
    window.removeEventListener('mousedown', this.bound.mousedown)
    window.removeEventListener('mouseup', this.bound.mouseup)
    window.removeEventListener('contextmenu', this.bound.contextmenu)
    window.removeEventListener('pointerdown', this.bound.pointerdown)
    window.removeEventListener('pointermove', this.bound.pointermove)
    window.removeEventListener('pointerup', this.bound.pointerup)
    window.removeEventListener('pointercancel', this.bound.pointerup)
    window.removeEventListener('resize', this.bound.resize)
    document.removeEventListener('pointerlockchange', this.bound.lockchange)
    document.removeEventListener('pointerlockerror', this.bound.lockerror)
  }
}
