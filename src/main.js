import { Game } from './game.js'

const fill = document.getElementById('load-fill')
const status = document.getElementById('load-status')
const loading = document.getElementById('loading')

const setProgress = (p, text) => {
  fill.style.width = `${Math.round(p * 100)}%`
  if (text) status.textContent = text
}

window.addEventListener('error', (e) => {
  console.error('BLACKSITE error:', e.error || e.message)
  status.textContent = 'SYSTEM FAULT // RELOAD REQUIRED'
  status.style.color = '#ff5b45'
})

const game = new Game()
window.__BLACKSITE__ = game

game.init(setProgress).catch((error) => {
  console.error(error)
  status.textContent = 'INITIALIZATION FAILED // CHECK CONSOLE'
  status.style.color = '#ff5b45'
  loading.classList.remove('done')
})
