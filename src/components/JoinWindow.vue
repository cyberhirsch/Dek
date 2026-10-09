<script setup lang="ts">
// The phone page students reach from a poll slide's QR code
// (`…/Dek/?join=<session>`). No login, no app: it shows the presentation's
// currently open question and sends one anonymous answer per question. It
// checks for the next question every two seconds.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getSession, openPoll, vote, votedKey, type LivePoll, type PublicSession } from '../live/client'

const sessionId = new URLSearchParams(location.search).get('join') ?? ''
const session = ref<PublicSession | null>(null)
const poll = ref<LivePoll | null>(null)
const voted = ref('') // what this phone answered to the current poll
const words = ref('')
const sending = ref(false)
const problem = ref('')
const notFound = ref(false)

function recall(p: LivePoll | null) {
  try {
    voted.value = p ? (localStorage.getItem(votedKey(p.id)) ?? '') : ''
  } catch {
    voted.value = ''
  }
}

async function refresh() {
  try {
    if (!session.value) session.value = await getSession(sessionId)
    const p = await openPoll(sessionId)
    if (p?.id !== poll.value?.id) {
      poll.value = p
      words.value = ''
      problem.value = ''
      recall(p)
    }
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound.value = true
  }
}

async function send(answer: string, shown: string) {
  const p = poll.value
  if (!p || sending.value) return
  sending.value = true
  problem.value = ''
  try {
    const r = await vote(p.id, answer)
    if (r === 'ok' || r === 'already') remember(p.id, shown)
    else if (r === 'closed') problem.value = 'This question has just closed.'
    else problem.value = r.problem
  } catch {
    problem.value = 'No connection — try again.'
  } finally {
    sending.value = false
  }
}
function remember(id: string, shown: string) {
  voted.value = shown
  try {
    localStorage.setItem(votedKey(id), shown)
  } catch {
    /* fine: just not remembered across reloads */
  }
}

const canSendWords = computed(() => words.value.trim().length > 0 && words.value.trim().length <= 40)

let timer: ReturnType<typeof setInterval>
onMounted(() => {
  document.title = 'Vote · Dek'
  void refresh()
  timer = setInterval(() => void refresh(), 2000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <main class="join">
    <header class="deck">{{ session?.deck || ' ' }}</header>

    <section v-if="notFound || !sessionId" class="card">
      <p class="quiet">This voting link isn't valid (any more).</p>
    </section>

    <section v-else-if="!poll" class="card">
      <p class="quiet">Waiting for the next question…</p>
    </section>

    <section v-else class="card">
      <h1>{{ poll.question }}</h1>

      <div v-if="voted" class="done">
        <div class="tick">✓</div>
        <p>Thanks — your answer: <strong>{{ voted }}</strong></p>
        <p class="quiet">Watch the screen for the result.</p>
      </div>

      <div v-else-if="poll.kind === 'choice'" class="choices">
        <button v-for="(o, k) in poll.options" :key="k" :disabled="sending" @click="send(String(k), o)">{{ o }}</button>
      </div>

      <div v-else-if="poll.kind === 'scale'" class="scale">
        <button v-for="n in 5" :key="n" :disabled="sending" @click="send(String(n), String(n))">{{ n }}</button>
      </div>

      <form v-else class="words" @submit.prevent="canSendWords && send(words.trim(), words.trim())">
        <input v-model="words" maxlength="40" placeholder="One word or a short phrase" autocomplete="off" enterkeyhint="send" />
        <button :disabled="!canSendWords || sending">Send</button>
      </form>

      <p v-if="problem" class="problem">{{ problem }}</p>
    </section>

    <footer>Answers are anonymous: no name and no address is stored, only the answer.</footer>
  </main>
</template>

<style scoped>
.join {
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 20px;
  background: #070809;
  color: #e6ecf2;
  font-family: 'JetBrains Mono', monospace;
}
.deck {
  font-size: 12px;
  color: rgba(230, 236, 242, 0.55);
  min-height: 1em;
}
.card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
h1 {
  margin: 0;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 300;
  font-size: 34px;
  line-height: 1.15;
}
.choices,
.scale {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.scale {
  flex-direction: row;
}
button,
input {
  font: inherit;
  font-size: 18px;
  border-radius: 12px;
}
.choices button,
.scale button,
.words button {
  padding: 16px;
  background: rgba(127, 199, 255, 0.12);
  border: 1px solid rgba(127, 199, 255, 0.45);
  color: #e6ecf2;
  text-align: left;
}
.scale button {
  flex: 1;
  text-align: center;
}
button:active {
  background: rgba(127, 199, 255, 0.3);
}
button:disabled {
  opacity: 0.5;
}
.words {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
input {
  padding: 14px;
  background: #101216;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #e6ecf2;
}
.done {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tick {
  font-size: 40px;
  color: #7fc7ff;
}
.quiet {
  color: rgba(230, 236, 242, 0.55);
}
.problem {
  color: #fca5a5;
}
footer {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(230, 236, 242, 0.4);
}
</style>
