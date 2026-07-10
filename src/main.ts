import { createApp } from 'vue'
import App from './App.vue'
import PresenterWindow from './components/PresenterWindow.vue'
import './styles/base.css'

// Each deploy emits freshly hashed chunks and deletes the previous ones. A tab
// still running the old `index-*.js` — from cache, or simply left open — then
// requests a lazy chunk (mermaid, JSZip, pdf.js) that no longer exists, and the
// dynamic import rejects with "Failed to fetch dynamically imported module".
// Nothing is wrong except that the page is stale, so reload into the current build.
//
// Rate-limit rather than reload unconditionally: if the chunk is missing for some
// other reason, an unguarded reload loops forever. One attempt per 10 s, then the
// error is allowed to surface where it can be seen.
const STALE_RELOAD = 'dek:stale-reload'
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem(STALE_RELOAD) ?? 0)
  if (Date.now() - last < 10_000) return // we just reloaded and it's still broken
  event.preventDefault()
  sessionStorage.setItem(STALE_RELOAD, String(Date.now()))
  location.reload()
})

// `?view=presenter` loads the standalone presenter popup (a second-monitor view
// synced to the main window) instead of the full editor app.
const isPresenter = new URLSearchParams(location.search).get('view') === 'presenter'
createApp(isPresenter ? PresenterWindow : App).mount('#app')
