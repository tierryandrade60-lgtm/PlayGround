import './style.css'
import { Game } from './game/Game.js'

const errorBox = document.getElementById('boot-error')
const showError = (message) => {
  if (!errorBox) return
  errorBox.textContent = message
  errorBox.classList.add('on')
}

window.addEventListener('error', (event) => {
  if (event.message && /ResizeObserver/.test(event.message)) return
  showError(`${event.message}${event.filename ? `\n${event.filename}:${event.lineno}` : ''}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  showError(reason?.stack || reason?.message || String(reason))
})

try {
  const game = new Game(document.getElementById('stage'))
  game.init()
  game.startLoop()
  window.nightfall = game
} catch (error) {
  console.error(error)
  showError(error?.stack || String(error))
}
