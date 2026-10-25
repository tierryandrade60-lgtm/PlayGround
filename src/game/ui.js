import { formatScore } from './score.js'

function byId(id) {
  return document.getElementById(id)
}

export class GameUI {
  constructor() {
    this.menu = byId('menu')
    this.gameover = byId('gameover')
    this.howto = byId('howto')
    this.hud = byId('hud')
    this.loading = byId('loading')
    this.score = byId('score')
    this.bestHud = byId('bestHud')
    this.bestMenu = byId('bestMenu')
    this.finalHops = byId('finalHops')
    this.finalBest = byId('finalBest')
    this.finalCombo = byId('finalCombo')
    this.newBest = byId('newBest')
    this.combo = byId('combo')
    this.comboValue = byId('comboValue')
    this.charge = byId('charge')
    this.chargeFill = byId('chargeFill')
    this.chargePct = byId('chargePct')
    this.hint = byId('hint')
    this.floaters = byId('floaters')
    this.soundButtons = [byId('soundHud'), byId('soundMenu')]
    this.menuTimer = null
    this.hudTimer = null
    this.hintTimer = null
    this.lastFlow = 0
    this.floatCount = 0
  }

  setBest(best) {
    const text = formatScore(best)
    this.bestHud.textContent = text
    this.bestMenu.textContent = text
  }

  showMenu() {
    clearTimeout(this.menuTimer)
    this.menu.hidden = false
    this.menu.classList.remove('is-leaving')
    this.hideHud()
  }

  hideMenu() {
    clearTimeout(this.menuTimer)
    this.menu.classList.add('is-leaving')
    this.menuTimer = setTimeout(() => {
      this.menu.hidden = true
      this.menu.classList.remove('is-leaving')
    }, 440)
  }

  showHud() {
    clearTimeout(this.hudTimer)
    this.hud.hidden = false
    requestAnimationFrame(() => this.hud.classList.add('is-live'))
    this.setScore(0)
    this.setFlow(0)
    this.setCharge(0, false)
    this.showHint(true)
  }

  hideHud() {
    clearTimeout(this.hudTimer)
    this.hud.classList.remove('is-live')
    this.hud.hidden = true
    this.setCharge(0, false)
  }

  setScore(value) {
    this.score.textContent = formatScore(value)
  }

  setFlow(flow) {
    this.lastFlow = flow
    if (flow < 2) {
      this.combo.hidden = true
      return
    }
    this.combo.hidden = false
    this.comboValue.textContent = `x${flow}`
    this.combo.classList.remove('is-bumped')
    void this.combo.offsetWidth
    this.combo.classList.add('is-bumped')
  }

  setCharge(value, visible) {
    this.charge.classList.toggle('is-visible', Boolean(visible))
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
    this.chargeFill.style.width = `${pct}%`
    this.chargePct.textContent = `${pct}%`
  }

  showHint(show) {
    clearTimeout(this.hintTimer)
    this.hint.classList.toggle('is-hidden', !show)
  }

  hintFor(seconds = 5) {
    this.showHint(true)
    clearTimeout(this.hintTimer)
    this.hintTimer = setTimeout(() => this.showHint(false), seconds * 1000)
  }

  float(text, kind, x, y) {
    if (this.floatCount > 9) return
    const node = document.createElement('div')
    node.className = `floater ${kind || ''}`.trim()
    node.textContent = text
    node.style.left = `${x}px`
    node.style.top = `${y}px`
    this.floaters.appendChild(node)
    this.floatCount += 1
    const remove = () => {
      node.remove()
      this.floatCount = Math.max(0, this.floatCount - 1)
    }
    node.addEventListener('animationend', remove, { once: true })
    setTimeout(remove, 1400)
  }

  showGameOver({ score, best, longestFlow, newBest }) {
    this.finalHops.textContent = formatScore(score)
    this.finalBest.textContent = formatScore(best)
    this.finalCombo.textContent = formatScore(longestFlow)
    this.newBest.hidden = !newBest
    this.gameover.hidden = false
    this.gameover.classList.remove('is-leaving')
    this.hideHud()
  }

  hideGameOver() {
    if (this.gameover.hidden) return
    this.gameover.classList.add('is-leaving')
    setTimeout(() => {
      this.gameover.hidden = true
      this.gameover.classList.remove('is-leaving')
    }, 320)
  }

  showHow() {
    this.menu.classList.add('is-dimmed')
    this.howto.hidden = false
  }

  hideHow() {
    this.menu.classList.remove('is-dimmed')
    this.howto.hidden = true
  }

  setSoundMuted(muted) {
    for (const button of this.soundButtons) {
      if (!button) continue
      button.setAttribute('aria-pressed', muted ? 'true' : 'false')
      button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
    }
  }

  hideLoading() {
    this.loading.classList.add('is-done')
    setTimeout(() => {
      this.loading.hidden = true
    }, 800)
  }
}
