<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AssetRef, DeckAnalysis, DeckIssue, IssueSeverity } from '../core/analyze'

const props = defineProps<{
  analysis: DeckAnalysis
  current: number
}>()
const emit = defineEmits<{
  close: []
  jump: [index: number]
  'delete-asset': [filename: string]
}>()

const mode = ref<'issues' | 'assets'>('issues')
const severityOrder: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 }

const issues = computed(() =>
  [...props.analysis.issues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.slide - b.slide || a.message.localeCompare(b.message),
  ),
)
const assetCounts = computed(() => {
  const out = { data: 0, remote: 0, local: 0, blob: 0, unknown: 0, orphan: 0 }
  for (const a of props.analysis.assets) out[a.kind] += 1
  return out
})
const orphans = computed(() => props.analysis.assets.filter((a) => a.kind === 'orphan'))

function jump(slide: number) {
  emit('jump', Math.max(0, slide - 1))
}
function deleteOne(a: AssetRef) {
  if (!a.filename) return
  if (window.confirm(`Delete "${a.filename}" from the assets folder? This cannot be undone.`)) {
    emit('delete-asset', a.filename)
  }
}
function deleteAllOrphans() {
  const list = orphans.value
  if (!list.length) return
  if (window.confirm(`Delete all ${list.length} unused asset(s) from the folder? This cannot be undone.`)) {
    for (const a of list) if (a.filename) emit('delete-asset', a.filename)
  }
}

function issueLabel(i: DeckIssue): string {
  return `${i.kind}${i.field ? ` / ${i.field}` : ''}`
}

function shortRef(a: AssetRef): string {
  if (a.kind === 'data') return `data URL (${formatBytes(a.approxBytes)})`
  if (a.kind === 'blob') return 'browser object URL'
  if (a.ref.length <= 78) return a.ref
  return `${a.ref.slice(0, 34)}...${a.ref.slice(-34)}`
}

function formatBytes(bytes?: number): string {
  if (!bytes) return 'unknown size'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <aside class="review">
    <header class="review-head">
      <div>
        <div class="eyebrow">Review</div>
        <div class="summary">
          <span class="sev error" title="Errors">E {{ analysis.counts.error }}</span>
          <span class="sev warning" title="Warnings">W {{ analysis.counts.warning }}</span>
          <span class="sev info" title="Info">I {{ analysis.counts.info }}</span>
        </div>
      </div>
      <button title="Close review" @click="emit('close')">Close</button>
    </header>

    <div class="switch">
      <button :class="{ on: mode === 'issues' }" @click="mode = 'issues'">Issues</button>
      <button :class="{ on: mode === 'assets' }" @click="mode = 'assets'">Assets</button>
    </div>

    <section v-if="mode === 'issues'" class="pane">
      <button
        v-for="issue in issues"
        :key="`${issue.slide}-${issue.kind}-${issue.field}-${issue.message}`"
        class="issue"
        :class="[issue.severity, { active: issue.slide === current + 1 }]"
        @click="jump(issue.slide)"
      >
        <span class="slide">#{{ issue.slide }}</span>
        <span class="body">
          <span class="meta">{{ issueLabel(issue) }}</span>
          <span class="msg">{{ issue.message }}</span>
        </span>
      </button>
      <div v-if="!issues.length" class="empty">No validation or review issues.</div>
    </section>

    <section v-else class="pane assets">
      <div class="asset-summary">
        <span>{{ analysis.assets.length }} refs</span>
        <span>{{ assetCounts.local }} local</span>
        <span>{{ assetCounts.data }} embedded</span>
        <span>{{ assetCounts.remote }} remote</span>
        <span v-if="assetCounts.orphan" class="orphan-badge">{{ assetCounts.orphan }} orphaned</span>
      </div>
      <button v-if="orphans.length >= 2" class="del-all" @click="deleteAllOrphans">
        Delete all {{ orphans.length }} orphaned
      </button>
      <div
        v-for="asset in analysis.assets"
        :key="asset.ref"
        class="asset"
        :class="[asset.kind, { active: asset.uses.some((u) => u.slide === current + 1) }]"
      >
        <button
          v-if="asset.kind !== 'orphan'"
          class="asset-main"
          @click="jump(asset.uses[0]?.slide ?? 1)"
        >
          <span class="kind">{{ asset.kind }}</span>
          <span class="body">
            <span class="ref">{{ shortRef(asset) }}</span>
            <span class="meta">slide #{{ asset.uses[0]?.slide }} / {{ asset.uses.length }} use{{ asset.uses.length === 1 ? '' : 's' }}</span>
          </span>
        </button>
        <div v-else class="asset-main orphan-row">
          <span class="kind">orphan</span>
          <span class="body">
            <span class="ref">{{ asset.filename }}</span>
            <span class="meta">not referenced by any slide</span>
          </span>
          <button class="del-btn" title="Delete this file" @click="deleteOne(asset)">Delete</button>
        </div>
      </div>
      <div v-if="!analysis.assets.length" class="empty">No referenced assets.</div>
    </section>
  </aside>
</template>

<style scoped>
.review {
  position: fixed;
  top: 50px;
  right: 0;
  bottom: 92px;
  z-index: 65;
  width: min(390px, 40vw);
  min-width: 330px;
  display: flex;
  flex-direction: column;
  background: rgba(13, 15, 19, 0.97);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -24px 0 60px rgba(0, 0, 0, 0.35);
  color: #e6ecf2;
  font-family: 'JetBrains Mono', monospace;
}
.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.eyebrow,
.meta {
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-size: 10px;
  color: rgba(230, 236, 242, 0.45);
}
.summary {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.sev {
  min-width: 26px;
  padding: 2px 6px;
  border-radius: 999px;
  text-align: center;
  font-size: 11px;
}
.sev.error { background: rgba(248, 113, 113, 0.16); color: #fca5a5; }
.sev.warning { background: rgba(250, 204, 21, 0.14); color: #fde68a; }
.sev.info { background: rgba(127, 199, 255, 0.14); color: #bfdbfe; }
.review-head button,
.switch button {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e6ecf2;
  border-radius: 7px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 11px;
}
.switch {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
}
.switch button {
  flex: 1;
}
.switch button.on {
  border-color: rgba(127, 199, 255, 0.7);
  color: #bfdbfe;
  background: rgba(127, 199, 255, 0.12);
}
.pane {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 14px;
}
.issue {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 6px;
  padding: 9px 10px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.issue:hover,
.issue.active {
  border-color: rgba(127, 199, 255, 0.6);
  background: rgba(127, 199, 255, 0.08);
}
.issue.error { border-left: 3px solid #f87171; }
.issue.warning { border-left: 3px solid #facc15; }
.issue.info { border-left: 3px solid #7fc7ff; }

.asset {
  margin: 0 0 6px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
  overflow: hidden;
}
.asset.active { border-color: rgba(127, 199, 255, 0.6); }
.asset-main {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  font: inherit;
}
button.asset-main { cursor: pointer; }
button.asset-main:hover { background: rgba(127, 199, 255, 0.08); }
.orphan-row { align-items: center; }
.del-btn {
  flex: none;
  align-self: center;
  background: rgba(248, 113, 113, 0.14);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: #fca5a5;
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 10px;
  cursor: pointer;
}
.del-btn:hover { background: rgba(248, 113, 113, 0.26); }
.del-all {
  width: 100%;
  margin: 0 0 8px;
  padding: 7px;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fca5a5;
  border-radius: 7px;
  font-size: 11px;
  cursor: pointer;
}
.del-all:hover { background: rgba(248, 113, 113, 0.2); }
.orphan-badge {
  color: #fca5a5 !important;
  background: rgba(248, 113, 113, 0.16) !important;
}
.slide,
.kind {
  flex: none;
  min-width: 48px;
  color: rgba(230, 236, 242, 0.55);
  font-size: 11px;
}
.kind {
  text-transform: uppercase;
}
.body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.msg,
.ref {
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.asset-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 10px;
}
.asset-summary span {
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(230, 236, 242, 0.65);
  font-size: 10px;
}
.asset.data { border-left: 3px solid #facc15; }
.asset.remote { border-left: 3px solid #a78bfa; }
.asset.local { border-left: 3px solid #4ade80; }
.asset.orphan { border-left: 3px solid #f87171; }
.empty {
  padding: 30px 10px;
  color: rgba(230, 236, 242, 0.45);
  font-size: 12px;
  text-align: center;
}
</style>
