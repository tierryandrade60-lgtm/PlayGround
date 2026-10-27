const $ = (id) => document.getElementById(id)

export class HUD {
  constructor() {
    this.root = $('hud')
    this.healthBar = $('health-bar')
    this.armorBar = $('armor-bar')
    this.healthNum = $('health-num')
    this.armorNum = $('armor-num')
    this.ammo = $('ammo')
    this.reserve = $('reserve')
    this.reloadTrack = $('reload-track')
    this.reloadFill = $('reload-fill')
    this.score = $('score')
    this.kills = $('kills')
    this.waveNum = $('wave-number')
    this.waveEnemies = $('wave-enemies')
    this.crosshair = $('crosshair')
    this.hitmarkerEl = $('hitmarker')
    this.killfeed = $('killfeed')
    this.banner = $('wave-banner')
    this.bannerKicker = $('banner-kicker')
    this.bannerTitle = $('banner-title')
    this.bannerSub = $('banner-sub')
    this.pickupToast = $('pickup-toast')
    this.damageFx = $('fx-damage')
    this.lowHealth = $('fx-lowhealth')
    this.damageArc = $('dmg-arc')
    this.compass = $('compass-canvas')
    this.compassCtx = this.compass.getContext('2d')
    this.heading = $('heading')
    this.minimap = $('minimap')
    this.minimapCtx = this.minimap.getContext('2d')
    this.objective = $('objective-banner')
    this.scoreValue = 0
    this.bannerTimer = 0
    this.toastTimer = 0
    this.damageTimer = 0
    this.compassTimer = 0
    this.minimapTimer = 0
    this.arcAngle = 0
    this.quality = 'balanced'
  }

  setVisible(v) {
    this.root.classList.toggle('hidden', !v)
    this.root.classList.toggle('visible', v)
  }

  setQuality(q) { this.quality = q }

  update(dt, s) {
    const hp = Math.max(0, Math.ceil(s.health))
    const ar = Math.max(0, Math.ceil(s.armor))
    this.healthBar.style.width = `${Math.max(0, Math.min(1, s.health / s.maxHealth)) * 100}%`
    this.armorBar.style.width = `${Math.max(0, Math.min(1, s.armor / s.maxArmor)) * 100}%`
    this.healthBar.classList.toggle('low', s.health / s.maxHealth < 0.3)
    this.healthNum.textContent = hp
    this.armorNum.textContent = ar
    this.lowHealth.classList.toggle('on', s.health / s.maxHealth < 0.28 && s.alive)

    this.ammo.textContent = String(s.ammo).padStart(2, '0')
    this.reserve.textContent = String(s.reserve)
    this.ammo.classList.toggle('low', s.ammo <= 6 || s.reloading)
    this.reloadTrack.classList.toggle('on', s.reloading)
    this.reloadFill.style.width = `${s.reloadProgress * 100}%`

    if (s.score !== this.scoreValue) {
      const diff = s.score - this.scoreValue
      this.scoreValue = s.score
      this.score.textContent = s.score.toLocaleString('en-US')
    }
    this.kills.textContent = s.kills
    this.waveNum.textContent = String(s.wave).padStart(2, '0')
    this.waveEnemies.textContent = `${s.enemies} HOSTILE${s.enemies === 1 ? '' : 'S'}`

    const spread = 6 + s.spread * 900
    const top = this.crosshair.querySelector('.ch-top')
    const bottom = this.crosshair.querySelector('.ch-bottom')
    const left = this.crosshair.querySelector('.ch-left')
    const right = this.crosshair.querySelector('.ch-right')
    top.style.transform = `translateY(${-spread}px)`
    bottom.style.transform = `translateY(${spread}px)`
    left.style.transform = `translateX(${-spread}px)`
    right.style.transform = `translateX(${spread}px)`
    this.crosshair.classList.toggle('ads', s.adsAmount > 0.65)
    this.crosshair.classList.toggle('hit', s.hitFlash > 0)

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt
      if (this.bannerTimer <= 0) this.banner.classList.add('hidden')
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.pickupToast.classList.remove('on')
    }
    if (this.damageTimer > 0) {
      this.damageTimer -= dt
      if (this.damageTimer <= 0) this.damageArc.classList.remove('on')
    }

    this.compassTimer -= dt
    if (this.compassTimer <= 0) {
      this.compassTimer = 1 / 30
      this.drawCompass(s.yaw)
    }
    this.minimapTimer -= dt
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 1 / 20
      this.drawMinimap(s)
    }
  }

  drawCompass(yaw) {
    const w = 640, h = 44
    const ctx = this.compassCtx
    ctx.clearRect(0, 0, w, h)
    const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360
    this.heading.textContent = String(Math.round(deg) % 360).padStart(3, '0')
    ctx.font = '600 13px "Chakra Petch", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const span = 110
    for (let d = -span; d <= span; d += 5) {
      const val = ((deg + d) % 360 + 360) % 360
      const x = w / 2 + d * (w / (span * 2)) * 0.94
      const major = val % 15 === 0
      const card = val % 90 === 0
      if (!major) continue
      const alpha = Math.max(0, 1 - Math.abs(d) / span)
      ctx.strokeStyle = card ? `rgba(255,143,56,${alpha})` : `rgba(180,210,225,${alpha * 0.6})`
      ctx.lineWidth = card ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(x, card ? 10 : 16)
      ctx.lineTo(x, 26)
      ctx.stroke()
      if (card || val % 30 === 0) {
        const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
        const label = labels[val] ?? String(val).padStart(3, '0')
        ctx.fillStyle = card ? `rgba(255,160,80,${alpha})` : `rgba(190,215,226,${alpha * 0.72})`
        ctx.font = card ? '700 14px "Chakra Petch", sans-serif' : '600 11px "Chakra Petch", sans-serif'
        ctx.fillText(label, x, 33)
      }
    }
    ctx.fillStyle = 'rgba(255,143,56,0.95)'
    ctx.beginPath()
    ctx.moveTo(w / 2, 2)
    ctx.lineTo(w / 2 - 5, 8)
    ctx.lineTo(w / 2 + 5, 8)
    ctx.closePath()
    ctx.fill()
  }

  drawMinimap(s) {
    const ctx = this.minimapCtx
    const W = this.minimap.width, H = this.minimap.height
    const cx = W / 2, cy = H / 2
    ctx.clearRect(0, 0, W, H)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2)
    ctx.clip()
    const bg = ctx.createRadialGradient(cx, cy, 8, cx, cy, W / 2)
    bg.addColorStop(0, 'rgba(10,26,34,0.95)')
    bg.addColorStop(1, 'rgba(3,8,12,0.98)')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const yaw = s.yaw
    const sin = Math.sin(yaw), cos = Math.cos(yaw)
    const scale = W / 78
    const toMap = (x, z) => {
      const dx = x - s.px, dz = z - s.pz
      const r = dx * cos - dz * sin
      const f = -dx * sin - dz * cos
      return [cx + r * scale, cy - f * scale]
    }
    ctx.strokeStyle = 'rgba(120,180,205,0.12)'
    ctx.lineWidth = 1
    for (const r of [12, 24, 36]) {
      ctx.beginPath(); ctx.arc(cx, cy, r * scale, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke()

    for (const c of s.colliders) {
      const [x, y] = toMap(c.x, c.z)
      const size = Math.max(c.hx, c.hz) * scale * 1.1
      const d = Math.hypot(x - cx, y - cy)
      if (d > W / 2 + 20) continue
      ctx.fillStyle = 'rgba(120,160,180,0.2)'
      ctx.fillRect(x - c.hx * scale, y - c.hz * scale, c.hx * 2 * scale, c.hz * 2 * scale)
    }
    for (const sp of s.spawnPoints) {
      const [x, y] = toMap(sp.x, sp.z)
      ctx.fillStyle = 'rgba(255,90,40,0.34)'
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill()
    }
    for (const p of s.pickups || []) {
      const [x, y] = toMap(p.x, p.z)
      ctx.fillStyle = '#74f5b0'
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
    }
    for (const e of s.enemyDots) {
      const [x, y] = toMap(e.x, e.z)
      const d = Math.hypot(x - cx, y - cy)
      if (d > W / 2 - 3) continue
      ctx.fillStyle = e.boss ? '#ff3020' : e.type === 'drone' ? '#4fe8ff' : '#ff8a3a'
      ctx.beginPath(); ctx.arc(x, y, e.boss ? 4.4 : 3.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,120,60,0.15)'
      ctx.beginPath(); ctx.arc(x, y, e.boss ? 9 : 6.4, 0, Math.PI * 2); ctx.fill()
    }
    ctx.translate(cx, cy)
    ctx.fillStyle = '#9fe8ff'
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(0, 3.5)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(127,231,255,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  hitmarker(head = false) {
    const el = this.hitmarkerEl
    el.classList.remove('on')
    el.classList.toggle('head', head)
    void el.offsetWidth
    el.classList.add('on')
    this.crosshair.classList.add('hit')
    setTimeout(() => this.crosshair.classList.remove('hit'), 90)
  }

  damage(amount, source) {
    const opacity = Math.min(0.85, 0.28 + amount / 90)
    this.damageFx.style.opacity = opacity
    clearTimeout(this._dmgTimeout)
    this._dmgTimeout = setTimeout(() => { this.damageFx.style.opacity = 0 }, 140)
    if (source) {
      const dx = source.x - this.lastPlayerX
      const dz = source.z - this.lastPlayerZ
      const yaw = this.lastYaw || 0
      const sin = Math.sin(yaw), cos = Math.cos(yaw)
      const r = dx * cos - dz * sin
      const f = -dx * sin - dz * cos
      this.arcAngle = Math.atan2(r, f) * 180 / Math.PI
      this.damageArc.style.transform = `rotate(${this.arcAngle}deg)`
      this.damageArc.classList.remove('on')
      void this.damageArc.offsetWidth
      this.damageArc.classList.add('on')
      this.damageTimer = 0.72
    }
  }

  addKill(name, headshot, points) {
    const item = document.createElement('div')
    item.className = `kf-item${headshot ? ' head' : ''}`
    item.innerHTML = `<b>REEVES</b> <span class="kf-tag">${headshot ? 'HEADSHOT' : 'ELIMINATED'}</span> ${name} <span style="color:#74f5b0">+${points}</span>`
    this.killfeed.prepend(item)
    while (this.killfeed.children.length > 5) this.killfeed.lastChild.remove()
    setTimeout(() => { item.style.opacity = '0'; item.style.transition = 'opacity 300ms'; setTimeout(() => item.remove(), 320) }, 3800)
  }

  showBanner(kicker, title, sub, duration = 2.4) {
    this.bannerKicker.textContent = kicker
    this.bannerTitle.textContent = title
    this.bannerSub.textContent = sub
    this.banner.classList.remove('hidden')
    this.bannerTimer = duration
  }

  toast(text, duration = 1.6) {
    this.pickupToast.textContent = text
    this.pickupToast.classList.add('on')
    this.toastTimer = duration
  }

  setPlayerContext(x, z, yaw) {
    this.lastPlayerX = x
    this.lastPlayerZ = z
    this.lastYaw = yaw
  }

  updateBest() {
    let best = { score: 0, wave: 0 }
    try { best = JSON.parse(localStorage.getItem('blacksite-best') || '{"score":0,"wave":0}') } catch {}
    const el = document.getElementById('best-stat')
    if (el) el.textContent = `${best.score.toLocaleString('en-US')} PTS · WAVE ${best.wave}`
  }

  saveBest(score, wave) {
    let best = { score: 0, wave: 0 }
    try { best = JSON.parse(localStorage.getItem('blacksite-best') || '{"score":0,"wave":0}') } catch {}
    if (score > best.score || wave > best.wave) {
      best.score = Math.max(best.score, score)
      best.wave = Math.max(best.wave, wave)
      try { localStorage.setItem('blacksite-best', JSON.stringify(best)) } catch {}
    }
    this.updateBest()
  }
}
