<script setup lang="ts">
// Dek's own Open / Save panel — no native file dialog. It operates on the one
// granted "workspace" folder: lists the .dek decks in it, opens one on click,
// and saves a new one from a typed name. The only native prompt is the one-time
// "choose your decks folder" (and a one-click re-grant when the browser drops
// the permission between sessions).
import { computed, onMounted, ref, nextTick } from 'vue'
import {
  workspaceState,
  chooseWorkspace,
  reconnectWorkspace,
  listWorkspace,
  forgetWorkspace,
  type DeckEntry,
  type WorkspaceState,
} from '../api'

const props = defineProps<{ mode: 'open' | 'save' | 'import'; currentName?: string }>()
const emit = defineEmits<{
  'open-deck': [file: string]
  'save-deck': [name: string]
  'import-deck': [file: string]
  close: []
}>()

const state = ref<WorkspaceState>({ status: 'none' })
const decks = ref<DeckEntry[]>([])
const busy = ref(false)
const err = ref('')
const saveName = ref(props.currentName ?? '')
const nameInput = ref<HTMLInputElement | null>(null)

const ready = computed(() => state.value.status === 'ready')
const folderName = computed(() =>
  state.value.status === 'ready' || state.value.status === 'prompt' ? state.value.name : '',
)

async function refresh() {
  state.value = await workspaceState()
  decks.value = state.value.status === 'ready' ? await listWorkspace() : []
  if (props.mode === 'save' && ready.value) {
    await nextTick()
    nameInput.value?.focus()
    nameInput.value?.select()
  }
}
onMounted(refresh)

function isAbort(e: unknown) {
  return (e as { name?: string })?.name === 'AbortError'
}
async function guard(fn: () => Promise<void>) {
  err.value = ''
  busy.value = true
  try {
    await fn()
  } catch (e) {
    if (!isAbort(e)) err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const onChoose = () => guard(async () => { await chooseWorkspace(); await refresh() })
const onReconnect = () => guard(async () => { await reconnectWorkspace(); await refresh() })
const onForget = () => guard(async () => { await forgetWorkspace(); await refresh() })

function onOpen(file: string) {
  if (props.mode === 'import') emit('import-deck', file)
  else emit('open-deck', file)
}
function onSave() {
  const name = saveName.value.trim()
  if (!name) {
    nameInput.value?.focus()
    return
  }
  emit('save-deck', name)
}
</script>

<template>
  <div class="db-backdrop" @click.self="emit('close')">
    <div class="db">
      <header class="db-head">
        <span class="db-title">{{ mode === 'save' ? 'Save deck' : mode === 'import' ? 'Import slides…' : 'Open deck' }}</span>
        <span v-if="ready" class="db-folder" :title="folderName">📁 {{ folderName }}</span>
        <button class="db-x" title="Close (Esc)" @click="emit('close')">✕</button>
      </header>

      <!-- one-time setup states -->
      <div v-if="state.status === 'unsupported'" class="db-note">
        Local decks need the File System Access API — use Chrome, Edge, or Brave.
      </div>
      <div v-else-if="state.status === 'none'" class="db-empty">
        <p>Pick a folder to keep your decks in. You choose it once; after that, opening and saving happen right here — no more file dialogs.</p>
        <button class="db-primary" :disabled="busy" @click="onChoose">Choose decks folder…</button>
      </div>
      <div v-else-if="state.status === 'prompt'" class="db-empty">
        <p>Reconnect “{{ folderName }}” to open and save your decks.</p>
        <button class="db-primary" :disabled="busy" @click="onReconnect">Reconnect</button>
      </div>

      <!-- the deck list -->
      <template v-else>
        <div class="db-list">
          <button
            v-for="d in decks"
            :key="d.file"
            class="db-item"
            @click="onOpen(d.file)"
            @dblclick="onOpen(d.file)"
          >
            <span class="db-item-icon">◈</span>
            <span class="db-item-name">{{ d.name }}</span>
          </button>
          <div v-if="!decks.length" class="db-list-empty">
            {{ mode === 'import' ? 'No other decks here to import from.' : 'No decks here yet — save one below.' }}
          </div>
        </div>

        <div v-if="mode !== 'import'" class="db-save">
          <input
            ref="nameInput"
            v-model="saveName"
            class="db-name"
            type="text"
            placeholder="New deck name"
            spellcheck="false"
            @keydown.enter="onSave"
          />
          <button class="db-primary" :disabled="busy || !saveName.trim()" @click="onSave">
            {{ mode === 'save' ? 'Save' : 'Save as new' }}
          </button>
        </div>

        <footer class="db-foot">
          <button class="db-link" @click="onForget">Change folder…</button>
        </footer>
      </template>

      <div v-if="err" class="db-err">{{ err }}</div>
    </div>
  </div>
</template>

<style scoped>
.db-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 5, 7, 0.6);
  backdrop-filter: blur(3px);
}
.db {
  width: min(520px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: rgba(18, 20, 24, 0.99);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  color: #e6ecf2;
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
}
.db-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.db-title {
  font-size: 14px;
}
.db-folder {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.db-x {
  background: none;
  border: none;
  color: rgba(230, 236, 242, 0.6);
  cursor: pointer;
  font-size: 13px;
}
.db-note,
.db-empty {
  padding: 26px 20px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(230, 236, 242, 0.75);
}
.db-empty {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
}
.db-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 120px;
}
.db-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 9px 11px;
  cursor: pointer;
  color: #e6ecf2;
  font-family: inherit;
  font-size: 13px;
}
.db-item:hover {
  background: rgba(127, 199, 255, 0.12);
  border-color: rgba(127, 199, 255, 0.35);
}
.db-item-icon {
  color: var(--dek-accent, #7fc7ff);
  font-size: 11px;
}
.db-item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.db-list-empty {
  padding: 30px 12px;
  text-align: center;
  font-size: 12px;
  color: rgba(230, 236, 242, 0.4);
}
.db-save {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.db-name {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  color: #e6ecf2;
  font-family: inherit;
  font-size: 13px;
  padding: 8px 11px;
}
.db-name:focus {
  outline: none;
  border-color: rgba(127, 199, 255, 0.7);
}
.db-primary {
  background: rgba(127, 199, 255, 0.16);
  border: 1px solid rgba(127, 199, 255, 0.55);
  color: #cfe6ff;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  white-space: nowrap;
}
.db-primary:hover:not(:disabled) {
  background: rgba(127, 199, 255, 0.28);
}
.db-primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.db-foot {
  padding: 8px 14px 12px;
}
.db-link {
  background: none;
  border: none;
  color: rgba(230, 236, 242, 0.45);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  text-decoration: underline;
}
.db-link:hover {
  color: rgba(230, 236, 242, 0.75);
}
.db-err {
  padding: 10px 16px;
  font-size: 12px;
  color: #fca5a5;
  border-top: 1px solid rgba(248, 113, 113, 0.3);
}
</style>
