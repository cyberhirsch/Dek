// Narrate mode inside a standalone HTML export ("HTML with Narration").
//
// Embedded as a <script> after the presentation runtime, which exposes a tiny
// API (window.__dek: current slide, go, slide count, change listeners). The
// deck's spoken passages arrive as window.__DEK_NARRATION: per slide, a list of
// { src?: MP3 data URL, text } — `src` when the passage was voiced with the
// local voice, otherwise the viewer's browser voice reads `text`.
//
// Enter or the ▷ button starts and stops it; it speaks each slide's passages,
// moves on, and stops after the last slide. Turning pages by hand while it runs
// continues from there. A small note says the voice is AI-generated.
// Plain browser JavaScript — this runs in the exported file, not in Dek.

export const EXPORT_NARRATE_CSS = `
.dek-narr{position:fixed;left:14px;bottom:10px;z-index:30;display:flex;align-items:center;gap:10px;font:11px 'JetBrains Mono',monospace;}
.dek-narr-btn{background:rgba(18,20,24,.8);border:1px solid rgba(255,255,255,.14);color:#e6ecf2;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;}
.dek-narr-btn.on{border-color:#7fc7ff;color:#7fc7ff;}
.dek-narr-note{color:rgba(230,236,242,.45);pointer-events:none;}
@media print{.dek-narr{display:none!important;}}
`

export const EXPORT_NARRATE_JS = `
(function(){
  var N=window.__DEK_NARRATION, api=window.__dek;
  if(!N||!api) return;
  var on=false, run=0, audio=null;
  var box=document.createElement('div'); box.className='dek-narr';
  var btn=document.createElement('button'); btn.className='dek-narr-btn';
  var note=document.createElement('span'); note.className='dek-narr-note'; note.textContent='Narration voice is AI-generated';
  box.appendChild(btn); box.appendChild(note); document.body.appendChild(box);
  btn.addEventListener('click',function(e){ e.stopPropagation(); setOn(!on); });
  function label(){ btn.textContent=on?'\\u25A0 Stop narration (Enter)':'\\u25B7 Play narration (Enter)'; btn.classList.toggle('on',on); }
  function wait(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  function hush(){ if(audio){ audio.pause(); audio=null; } try{ window.speechSynthesis&&speechSynthesis.cancel(); }catch(e){} }
  function say(b,token){ return new Promise(function(done){
    if(token!==run) return done();
    if(b.src){ audio=new Audio(b.src); audio.onended=audio.onerror=function(){ done(); }; audio.play().catch(function(){ done(); }); return; }
    if(b.text&&window.speechSynthesis){ var u=new SpeechSynthesisUtterance(b.text); u.onend=u.onerror=function(){ done(); }; speechSynthesis.speak(u); return; }
    setTimeout(done,1200);
  }); }
  async function narrate(){
    var token=++run; hush();
    await wait(400); if(token!==run) return;
    var i=api.cur(), beats=N[i]||[];
    for(var k=0;k<beats.length;k++){ if(token!==run) return; await say(beats[k],token); }
    if(token!==run) return;
    await wait(beats.length?800:4000);
    if(token!==run) return;
    if(i>=api.count-1){ setOn(false); return; }
    api.go(1);
  }
  function setOn(v){ on=v; label(); if(on) narrate(); else { run++; hush(); } }
  api.onChange(function(){ if(on) narrate(); });
  window.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); setOn(!on); } });
  label();
})();
`
