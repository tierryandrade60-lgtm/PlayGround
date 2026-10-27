export class Input {
  constructor({ onPause, onReload, onJump, onFireStart, onAdsChange, onAnyInput } = {}) {
    this.onPause = onPause
    this.onReload = onReload
    this.onJump = onJump
    this.onFireStart = onFireStart
    this.onAdsChange = onAdsChange
    this.onAnyInput = onAnyInput

    this.keys = new Set()
    this.move = { x: 0, y: 0 }
    this.look = { x: 0, y: 0 }
    this.firing = false
    this.ads = false
    this.sprint = false
    this.crouch = false
    this.enabled = false
    this.locked = false
    this.isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    this.sensitivity = 1.2
    this.stick = { active: false, id: null, x: 0, y: 0 }
    this.lookTouch = { id: null, x: 0, y: 0 }
    this._sprintTouch = false
    this._adsTouch = false

    if (this.isTouch) document.body.classList.add('touch')
    else document.body.classList.add('notouch')

    this.bindKeyboard()
    this.bindMouse()
    this.bindTouch()
    this.bindVisibility()
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'KeyC'].includes(e.code)) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      this.onAnyInput?.()
      if (!this.enabled) return
      if (e.code === 'KeyR') this.onReload?.()
      if (e.code === 'Space') this.onJump?.()
      if (e.code === 'KeyC') this.crouch = !this.crouch
      if (e.code === 'ShiftLeft') this.sprint = true
      if (e.code === 'Escape') this.onPause?.()
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      if (e.code === 'ShiftLeft') this.sprint = false
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.firing = false
      this.sprint = false
    })
  }

  bindMouse() {
    const canvas = document.getElementById('game-canvas')
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return
      if (this.locked || (!this.isTouch && e.buttons)) {
        this.look.x += e.movementX || 0
        this.look.y += e.movementY || 0
      }
    })
    document.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouch) return
      this.onAnyInput?.()
      if (!this.locked) {
        if (e.target === canvas) this.requestLock()
        return
      }
      if (e.button === 0) { this.firing = true; this.onFireStart?.() }
      if (e.button === 2) { this.ads = true; this.onAdsChange?.(true) }
    })
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false
      if (e.button === 2) { this.ads = false; this.onAdsChange?.(false) }
    })
    document.addEventListener('contextmenu', (e) => e.preventDefault())
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas
      if (!this.locked && this.enabled) this.onPause?.()
    })
  }

  requestLock() {
    const canvas = document.getElementById('game-canvas')
    if (this.isTouch || document.pointerLockElement === canvas) return
    canvas.requestPointerLock?.()
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock?.()
  }

  bindTouch() {
    const stickZone = document.getElementById('stick-zone')
    const base = document.getElementById('stick-base')
    const knob = document.getElementById('stick-knob')
    const lookZone = document.getElementById('look-zone')
    const fire = document.getElementById('btn-fire')
    const ads = document.getElementById('btn-ads')
    const reload = document.getElementById('btn-reload')
    const jump = document.getElementById('btn-jump')
    const sprint = document.getElementById('btn-sprint')
    if (!stickZone) return

    const moveStick = (e) => {
      const r = base.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      let dx = e.clientX - cx, dy = e.clientY - cy
      const max = 48
      const len = Math.hypot(dx, dy)
      if (len > max) { dx = dx / len * max; dy = dy / len * max }
      knob.style.transform = `translate(${dx}px, ${dy}px)`
      this.move.x = dx / max
      this.move.y = dy / max
    }

    stickZone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return
      e.preventDefault()
      this.stick.active = true
      this.stick.id = e.pointerId
      stickZone.setPointerCapture(e.pointerId)
      const r = stickZone.getBoundingClientRect()
      const x = Math.max(r.left + 64, Math.min(r.right - 64, e.clientX))
      const y = Math.max(r.top + 64, Math.min(r.bottom - 64, e.clientY))
      base.style.left = `${x - r.left}px`
      base.style.top = `${y - r.top}px`
      moveStick(e)
      this.onAnyInput?.()
    })
    stickZone.addEventListener('pointermove', (e) => {
      if (!this.stick.active || e.pointerId !== this.stick.id) return
      e.preventDefault()
      moveStick(e)
    })
    const endStick = (e) => {
      if (e.pointerId !== this.stick.id) return
      this.stick.active = false; this.stick.id = null
      this.move.x = 0; this.move.y = 0
      knob.style.transform = 'translate(0px, 0px)'
    }
    stickZone.addEventListener('pointerup', endStick)
    stickZone.addEventListener('pointercancel', endStick)

    lookZone.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return
      if (this.lookTouch.id !== null) return
      e.preventDefault()
      this.lookTouch.id = e.pointerId
      this.lookTouch.x = e.clientX
      this.lookTouch.y = e.clientY
      lookZone.setPointerCapture(e.pointerId)
      this.onAnyInput?.()
    })
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookTouch.id) return
      e.preventDefault()
      const dx = e.clientX - this.lookTouch.x
      const dy = e.clientY - this.lookTouch.y
      this.lookTouch.x = e.clientX
      this.lookTouch.y = e.clientY
      this.look.x += dx
      this.look.y += dy
    })
    const endLook = (e) => {
      if (e.pointerId !== this.lookTouch.id) return
      this.lookTouch.id = null
    }
    lookZone.addEventListener('pointerup', endLook)
    lookZone.addEventListener('pointercancel', endLook)

    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return
        e.preventDefault()
        e.stopPropagation()
        el.classList.add('pressed')
        el.setPointerCapture(e.pointerId)
        on()
        this.onAnyInput?.()
      })
      const end = (e) => {
        e.preventDefault()
        el.classList.remove('pressed')
        off()
      }
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)
      el.addEventListener('lostpointercapture', () => { el.classList.remove('pressed'); off() })
    }

    hold(fire, () => { this.firing = true; this.onFireStart?.() }, () => { this.firing = false })
    hold(ads, () => { this._adsTouch = true; this.ads = true; this.onAdsChange?.(true) }, () => { this._adsTouch = false; this.ads = false; this.onAdsChange?.(false) })
    hold(sprint, () => { this._sprintTouch = true; this.sprint = true }, () => { this._sprintTouch = false; this.sprint = false })
    reload.addEventListener('pointerdown', (e) => { if (!this.enabled) return; e.preventDefault(); e.stopPropagation(); this.onReload?.() })
    jump.addEventListener('pointerdown', (e) => { if (!this.enabled) return; e.preventDefault(); e.stopPropagation(); this.onJump?.() })
  }

  bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.enabled) this.onPause?.()
    })
  }

  updateMovement() {
    let x = 0, y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.stick.active) { x += this.move.x; y += this.move.y }
    const len = Math.hypot(x, y)
    if (len > 1) { x /= len; y /= len }
    this.move.x = x; this.move.y = y
    if (len < 0.08 && !this.stick.active) { this.move.x = 0; this.move.y = 0 }
  }

  consumeLook(scale) {
    const x = this.look.x * scale
    const y = this.look.y * scale
    this.look.x = 0; this.look.y = 0
    return { x, y }
  }

  setEnabled(v) {
    this.enabled = v
    if (!v) {
      this.firing = false
      this.ads = false
      this.sprint = false
      this.move.x = 0; this.move.y = 0
      this.keys.clear()
      this.releaseLock()
    }
  }
}
