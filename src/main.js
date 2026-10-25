import './style.css'
import '@fontsource-variable/nunito'
import '@fontsource/baloo-2/600.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/baloo-2/800.css'
import { GameUI } from './game/ui.js'
import { Sound } from './game/audio.js'
import { Game } from './game/game.js'

const canvas = document.getElementById('scene')
const ui = new GameUI()
const sound = new Sound()

try {
  const game = new Game({ canvas, ui, sound })
  window.__oi = game
} catch (error) {
  console.error(error)
  const loading = document.getElementById('loading')
  const label = loading?.querySelector('p')
  if (label) label.textContent = 'this sky needs webgl'
  const note = document.createElement('p')
  note.style.marginTop = '-6px'
  note.style.letterSpacing = '0.04em'
  note.textContent = 'Try a recent version of Safari, Chrome, or Firefox.'
  loading?.appendChild(note)
}

document.addEventListener('gesturestart', (event) => event.preventDefault())
document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false })
