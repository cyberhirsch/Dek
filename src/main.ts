import { createApp } from 'vue'
import App from './App.vue'
import PresenterWindow from './components/PresenterWindow.vue'
import './styles/base.css'

// `?view=presenter` loads the standalone presenter popup (a second-monitor view
// synced to the main window) instead of the full editor app.
const isPresenter = new URLSearchParams(location.search).get('view') === 'presenter'
createApp(isPresenter ? PresenterWindow : App).mount('#app')
