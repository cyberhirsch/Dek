<script setup lang="ts">
// Timer widget: a countdown on the slide. While presenting, a click starts and
// pauses it (or it starts by itself with `autostart`); at zero it says so, and
// the next click resets it. In the editor it shows the time it will start from.
// Re-entering the slide starts fresh. Digits scale with the box.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { WidgetElement } from '../../core/types'
import { formatTimer, timerDuration, timerPhase } from '../../core/timer'

const props = defineProps<{ el: WidgetElement; editable?: boolean }>()

const duration = computed(() => timerDuration(props.el.duration))
const remaining = ref(duration.value)
const running = ref(false)
let endAt = 0
let tick: ReturnType<typeof setInterval> | undefined

watch(duration, (d) => {
  if (!running.value) remaining.value = d
})

function update() {
  remaining.value = Math.max(0, (endAt - Date.now()) / 1000)
  if (remaining.value <= 0) stop()
}
function start() {
  if (remaining.value <= 0) return
  endAt = Date.now() + remaining.value * 1000
  running.value = true
  clearInterval(tick)
  tick = setInterval(update, 200)
}
function stop() {
  running.value = false
  clearInterval(tick)
}
function reset() {
  stop()
  remaining.value = duration.value
}
function onClick() {
  if (props.editable) return
  if (phase.value === 'done') reset()
  else if (running.value) {
    update()
    stop()
  } else start()
}

const phase = computed(() => timerPhase(remaining.value, duration.value))
const progress = computed(() => remaining.value / duration.value)

onMounted(() => {
  if (!props.editable && props.el.autostart) start()
})
onUnmounted(() => clearInterval(tick))
</script>

<template>
  <div class="timer" :class="[phase, { live: !editable, running }]" @click.stop="onClick" @pointerdown="!editable && $event.stopPropagation()">
    <div class="digits">{{ formatTimer(remaining) }}</div>
    <div class="bar"><span :style="{ width: progress * 100 + '%' }" /></div>
    <div v-if="phase === 'done'" class="label">Time's up</div>
    <div v-else-if="!editable && !running" class="label hint">{{ remaining < duration ? 'paused · click to go on' : 'click to start' }}</div>
    <button v-if="!editable && remaining < duration" class="reset" title="Reset" @click.stop="reset">↺</button>
  </div>
</template>

<style scoped>
.timer {
  position: relative;
  width: 100%;
  height: 100%;
  container-type: size;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4cqh;
  font-family: var(--dek-font-body);
  color: var(--dek-text);
  user-select: none;
}
.timer.live {
  pointer-events: auto;
  cursor: pointer;
}
.digits {
  font-size: min(52cqh, 30cqw);
  font-weight: 300;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  transition: color 0.4s ease;
}
.bar {
  width: 80%;
  height: max(3px, 3cqh);
  border-radius: 999px;
  background: var(--dek-line);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--dek-accent);
  transition: width 0.2s linear, background 0.4s ease;
}
.label {
  font-size: min(10cqh, 6cqw);
  color: var(--dek-accent2);
}
.label.hint {
  color: var(--dek-faint);
  opacity: 0;
  transition: opacity 0.2s;
}
.timer.live:hover .label.hint {
  opacity: 1;
}
.late .digits,
.done .digits {
  color: var(--dek-accent2);
}
.late .bar span {
  background: var(--dek-accent2);
}
.done .digits {
  animation: timer-pulse 1s ease-in-out infinite;
}
@keyframes timer-pulse {
  50% {
    opacity: 0.35;
  }
}
.reset {
  position: absolute;
  top: 4%;
  right: 3%;
  width: max(24px, 12cqh);
  height: max(24px, 12cqh);
  border-radius: 50%;
  border: 1px solid var(--dek-line);
  background: transparent;
  color: var(--dek-faint);
  font-size: max(13px, 7cqh);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}
.timer.live:hover .reset {
  opacity: 1;
}
</style>
