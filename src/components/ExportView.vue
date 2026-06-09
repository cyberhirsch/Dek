<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck } from '../core/types'
import { themeVars } from '../render/theme'
import SlideView from './SlideView.vue'

const props = defineProps<{ deck: Deck }>()
const emit = defineEmits<{ close: [] }>()

const vars = computed(() => themeVars(props.deck.config))

// ── standalone-HTML presentation runtime ──────────────────────────────────────
// Embedded in the downloaded file so it behaves like the live present mode (one
// slide at a time, keyboard/wheel/click nav, fullscreen, overview, presenter view
// with notes + timer) — but with no editing and no dependencies.
const EXPORT_PRES_CSS = `
html,body{margin:0;height:100%;background:#050506;overflow:hidden;}
.dek-show{position:fixed;inset:0;}
.dek-show>.print-page{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);box-shadow:0 30px 80px rgba(0,0,0,.6);display:none;}
.dek-show>.print-page.active{display:block;}
.dek-clone{position:relative;overflow:hidden;}
.dek-hud{position:fixed;bottom:10px;right:14px;z-index:20;pointer-events:none;font:11px 'JetBrains Mono',monospace;color:rgba(230,236,242,.45);}
.dek-ov{position:fixed;inset:0;z-index:50;display:none;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:24px;overflow:auto;background:rgba(5,6,8,.97);}
.dek-ov-cell{position:relative;cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;background:#0a0b0e;}
.dek-ov-cell.cur{border-color:#7fc7ff;}
.dek-ov-num{position:absolute;left:6px;top:4px;z-index:2;font:11px 'JetBrains Mono',monospace;color:rgba(230,236,242,.65);}
.dek-pres{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;background:#050506;color:#e6ecf2;font-family:'JetBrains Mono',monospace;}
.dek-pres-head{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px;}
.dek-pres-clock{font-size:22px;color:#7fc7ff;}
.dek-pres-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e6ecf2;border-radius:7px;padding:4px 10px;cursor:pointer;font:inherit;font-size:11px;}
.dek-pres-body{flex:1;display:flex;gap:24px;padding:24px;min-height:0;}
.dek-pres-main{flex:2;display:flex;flex-direction:column;gap:10px;min-width:0;}
.dek-pres-side{flex:1;display:flex;flex-direction:column;gap:16px;min-width:0;}
.dek-pres-stage{position:relative;width:100%;overflow:hidden;border-radius:8px;}
.dek-lbl{text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:rgba(230,236,242,.45);}
.dek-pres-notes-wrap{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;}
.dek-pres-notes{flex:1;overflow:auto;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;white-space:pre-wrap;font-size:16px;line-height:1.5;}
.dek-end{color:rgba(230,236,242,.4);padding:16px 0;}
@media print{
  html,body{overflow:visible;background:#fff;}
  .dek-show{position:static;}
  .dek-show>.print-page{display:block!important;position:relative!important;top:auto;left:auto;transform:none!important;box-shadow:none;page-break-after:always;break-after:page;}
  .dek-hud,.dek-ov,.dek-pres{display:none!important;}
  @page{size:1280px 720px;margin:0;}
}
`

const EXPORT_PRES_JS = `
(function(){
  var show=document.querySelector('.dek-show'); if(!show) return;
  var pages=[].slice.call(show.children).filter(function(n){return n.classList.contains('print-page');});
  var notes=window.__DEK_NOTES||[];
  var cur=0, ovEl=null, ovOpen=false, presEl=null, presOpen=false, t0=null, tick=null;
  function clampi(i){ return Math.max(0,Math.min(pages.length-1,i)); }
  function fit(){ var s=Math.min(window.innerWidth/1280, window.innerHeight/720); pages.forEach(function(p){ p.style.transform='translate(-50%,-50%) scale('+s+')'; }); }
  function render(){ pages.forEach(function(p,i){ p.classList.toggle('active', i===cur); }); if(ovOpen) markOv(); if(presOpen) fillPres(); }
  function go(d){ cur=clampi(cur+d); render(); }
  function jump(i){ cur=clampi(i); render(); }
  function fs(){ try{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }catch(e){} }
  function scaledClone(i,w){ var wrap=document.createElement('div'); wrap.className='dek-clone'; wrap.style.width=w+'px'; wrap.style.height=(w*720/1280)+'px'; var c=pages[i].cloneNode(true); c.classList.add('active'); c.style.position='absolute'; c.style.top='0'; c.style.left='0'; c.style.margin='0'; c.style.boxShadow='none'; c.style.transform='scale('+(w/1280)+')'; c.style.transformOrigin='top left'; wrap.appendChild(c); return wrap; }
  function buildOv(){ ovEl=document.createElement('div'); ovEl.className='dek-ov'; pages.forEach(function(p,i){ var cell=document.createElement('div'); cell.className='dek-ov-cell'; cell.appendChild(scaledClone(i,248)); var n=document.createElement('span'); n.className='dek-ov-num'; n.textContent=String(i+1); cell.appendChild(n); cell.addEventListener('click',function(){ jump(i); toggleOv(false); }); ovEl.appendChild(cell); }); document.body.appendChild(ovEl); }
  function markOv(){ if(!ovEl)return; [].forEach.call(ovEl.children,function(c,i){ c.classList.toggle('cur',i===cur); }); }
  function toggleOv(v){ ovOpen=(v==null?!ovOpen:v); if(ovOpen&&!ovEl)buildOv(); if(ovEl)ovEl.style.display=ovOpen?'grid':'none'; if(ovOpen)markOv(); }
  function buildPres(){ presEl=document.createElement('div'); presEl.className='dek-pres'; presEl.innerHTML='<div class="dek-pres-head"><span>Presenter</span><span class="dek-pres-clock">00:00</span><span><button class="dek-pres-btn" data-act="reset">reset</button> <button class="dek-pres-btn" data-act="exit">exit (P)</button></span></div><div class="dek-pres-body"><div class="dek-pres-main"><div class="dek-lbl dek-cur-lbl"></div><div class="dek-pres-stage dek-cur"></div></div><div class="dek-pres-side"><div><div class="dek-lbl">Next</div><div class="dek-pres-stage dek-next"></div></div><div class="dek-pres-notes-wrap"><div class="dek-lbl">Speaker notes</div><div class="dek-pres-notes"></div></div></div></div>'; document.body.appendChild(presEl); presEl.addEventListener('click',function(e){ var a=e.target&&e.target.getAttribute&&e.target.getAttribute('data-act'); if(a==='exit')togglePres(false); if(a==='reset')t0=Date.now(); }); }
  function fillPres(){ if(!presEl)return; var main=presEl.querySelector('.dek-cur'); main.innerHTML=''; main.appendChild(scaledClone(cur, main.clientWidth||640)); var nx=presEl.querySelector('.dek-next'); nx.innerHTML=''; if(cur+1<pages.length) nx.appendChild(scaledClone(cur+1, nx.clientWidth||300)); else nx.innerHTML='<div class="dek-end">- end -</div>'; presEl.querySelector('.dek-cur-lbl').textContent='Current  '+(cur+1)+' / '+pages.length; presEl.querySelector('.dek-pres-notes').textContent=notes[cur]||'No notes for this slide.'; }
  function togglePres(v){ presOpen=(v==null?!presOpen:v); if(presOpen&&!presEl)buildPres(); if(presEl)presEl.style.display=presOpen?'flex':'none'; if(presOpen){ if(t0===null)t0=Date.now(); if(!tick)tick=setInterval(updClock,1000); fillPres(); updClock(); } else if(tick){ clearInterval(tick); tick=null; } }
  function updClock(){ if(!presEl||t0===null)return; var s=Math.floor((Date.now()-t0)/1000), m=Math.floor(s/60); s=s%60; presEl.querySelector('.dek-pres-clock').textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s; }
  window.addEventListener('keydown',function(e){ var k=(e.key||'').toLowerCase(); if(e.key==='Escape'){ if(ovOpen){toggleOv(false);return;} if(presOpen){togglePres(false);return;} return; } if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'||e.key==='ArrowDown'){e.preventDefault();go(1);} else if(e.key==='ArrowLeft'||e.key==='PageUp'||e.key==='ArrowUp'){e.preventDefault();go(-1);} else if(e.key==='Home'){e.preventDefault();jump(0);} else if(e.key==='End'){e.preventDefault();jump(pages.length-1);} else if(k==='f'){e.preventDefault();fs();} else if(k==='o'){e.preventDefault();toggleOv();} else if(k==='p'||k==='s'){e.preventDefault();togglePres();} });
  window.addEventListener('resize',function(){ fit(); if(presOpen)fillPres(); });
  window.addEventListener('wheel',function(e){ if(ovOpen||presOpen)return; go(e.deltaY>0?1:-1); },{passive:true});
  show.addEventListener('click',function(){ if(!ovOpen&&!presOpen)go(1); });
  fit(); render();
})();
`
const stack = ref<HTMLElement | null>(null)
const rendered = ref(0)
const visibleSlides = computed(() => props.deck.slides.slice(0, rendered.value))
const progress = computed(() => {
  if (!props.deck.slides.length) return 100
  return Math.round((rendered.value / props.deck.slides.length) * 100)
})

let cancelled = false
let timer: number | null = null
const FIRST_CHUNK = 12
const CHUNK = 24

function queueRender() {
  if (cancelled || rendered.value >= props.deck.slides.length) return
  timer = window.setTimeout(() => {
    rendered.value = Math.min(props.deck.slides.length, rendered.value + CHUNK)
    queueRender()
  }, 16)
}

function startRender() {
  cancelled = false
  rendered.value = Math.min(props.deck.slides.length, FIRST_CHUNK)
  queueRender()
}

async function renderAll() {
  rendered.value = props.deck.slides.length
  await nextTick()
}

async function printPdf() {
  await renderAll()
  window.print()
}

/** Collect every CSS rule the page has loaded into one string. */
function collectCss(): string {
  let out = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) out += rule.cssText + '\n'
    } catch {
      /* cross-origin sheet (e.g. Google Fonts) — skip; we re-link it below */
    }
  }
  return out
}

/** Inline every image as a data URL so the downloaded file is self-contained:
 *  server paths (/Assets/…) and blob: URLs only resolve inside the app, so a
 *  standalone .html would otherwise show no media. */
async function inlineMedia(root: HTMLElement): Promise<string> {
  const clone = root.cloneNode(true) as HTMLElement
  const cache = new Map<string, string>()
  async function toData(url: string): Promise<string | null> {
    if (!url || url.startsWith('data:')) return url || null
    if (cache.has(url)) return cache.get(url)!
    try {
      const blob = await (await fetch(url)).blob()
      const data = await new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result as string)
        fr.onerror = rej
        fr.readAsDataURL(blob)
      })
      cache.set(url, data)
      return data
    } catch {
      return null
    }
  }
  await Promise.all(
    Array.from(clone.querySelectorAll('img')).map(async (img) => {
      const u = img.getAttribute('src')
      if (!u) return
      const d = await toData(u)
      if (d) img.setAttribute('src', d)
    }),
  )
  // inline-style background images (e.g. any url(...) a layout sets)
  await Promise.all(
    Array.from(clone.querySelectorAll<HTMLElement>('[style*="url("]')).map(async (el) => {
      const s = el.getAttribute('style') ?? ''
      const m = s.match(/url\(["']?([^"')]+)["']?\)/)
      if (!m) return
      const d = await toData(m[1])
      if (d) el.setAttribute('style', s.replace(m[1], d))
    }),
  )
  return clone.innerHTML
}

async function downloadHtml() {
  await renderAll()
  await nextTick()
  const css = collectCss()
  const slidesHtml = stack.value ? await inlineMedia(stack.value) : ''
  const fontLink =
    '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">'
  const styleVars = Object.entries(vars.value)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  const notesJson = JSON.stringify(props.deck.slides.map((s) => s.notes ?? '')).replace(/</g, '\\u003c')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(props.deck.config.deck ?? 'Deck')}</title>
${fontLink}
<style>
${css}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.print-page{position:relative;width:1280px;height:720px;flex:none;}
${EXPORT_PRES_CSS}
</style></head>
<body>
<div class="dek-show" style="${styleVars}">${slidesHtml}</div>
<div class="dek-hud">← → navigate · F fullscreen · O overview · P presenter</div>
<script>window.__DEK_NOTES=${notesJson};<\/script>
<script>${EXPORT_PRES_JS}<\/script>
</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(props.deck.config.deck ?? 'deck').replace(/[^a-z0-9]+/gi, '_')}.html`
  a.click()
  URL.revokeObjectURL(a.href)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

onMounted(startRender)
watch(() => props.deck.slides.length, startRender)
onUnmounted(() => {
  cancelled = true
  if (timer) window.clearTimeout(timer)
})
</script>

<template>
  <div class="export-root" :style="vars">
    <div class="export-bar no-print">
      <div class="export-status">
        <span>Export — {{ rendered }} / {{ deck.slides.length }} slides</span>
        <span class="meter"><span :style="{ width: progress + '%' }" /></span>
      </div>
      <div class="actions">
        <button @click="printPdf">⎙ Print / Save as PDF</button>
        <button @click="downloadHtml">⤓ Download HTML</button>
        <button class="close" @click="emit('close')">Close</button>
      </div>
    </div>

    <div ref="stack" class="dek-export">
      <div v-for="(s, i) in visibleSlides" :key="i" class="print-page">
        <SlideView :slide="s" :config="deck.config" :index="i" :total="deck.slides.length" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-root {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: #050506;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
}
.export-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: rgba(16, 18, 22, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #e6ecf2;
  font-size: 13px;
}
.export-status {
  display: flex;
  align-items: center;
  gap: 12px;
}
.meter {
  width: 150px;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}
.meter span {
  display: block;
  height: 100%;
  background: #7fc7ff;
}
.actions {
  display: flex;
  gap: 8px;
}
.actions button {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.actions button:hover { background: rgba(255, 255, 255, 0.12); }
.dek-export {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 24px;
}
.print-page {
  position: relative;
  width: 1280px;
  height: 720px;
  flex: none;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
</style>

<style>
/* Global print rules (un-scoped) so only the slide pages print. */
@media print {
  body {
    background: #fff !important;
  }
  /* Force backgrounds/gradients (the dark theme + glow) to actually print,
     otherwise the browser drops them and every slide comes out white. */
  .export-root,
  .export-root * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .no-print {
    display: none !important;
  }
  /* hide all app chrome — print only the export stack */
  .app-root > :not(.export-root) {
    display: none !important;
  }
  .export-root {
    position: static !important;
    overflow: visible !important;
  }
  .dek-export {
    gap: 0 !important;
    padding: 0 !important;
  }
  .print-page {
    box-shadow: none !important;
    page-break-after: always;
    break-after: page;
  }
  @page {
    size: 1280px 720px;
    margin: 0;
  }
}
</style>
