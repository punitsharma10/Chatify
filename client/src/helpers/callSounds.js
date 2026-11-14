import { getAudioContext } from './preferences'

// Call tones generated in the browser (no audio files):
//  - ringtone: incoming call (repeating double ring)
//  - ringback: what the caller hears while the other phone rings
//  - endTone: short beeps when a call ends
let loop = null

const beep = (ctx, freq, start, length, volume = 0.15) => {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.03)
  gain.gain.setValueAtTime(volume, start + length - 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length + 0.02)
}

const startLoop = (pattern, everyMs) => {
  stopTones()
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const play = () => {
    try { pattern(ctx, ctx.currentTime + 0.02) } catch { /* audio not available */ }
  }
  play()
  loop = setInterval(play, everyMs)
}

export const playRingtone = () => startLoop((ctx, t) => {
  ;[0, 0.45].forEach((d) => { beep(ctx, 880, t + d, 0.35, 0.18); beep(ctx, 660, t + d, 0.35, 0.1) })
}, 2600)

export const playRingback = () => startLoop((ctx, t) => {
  beep(ctx, 440, t, 1.2, 0.08); beep(ctx, 480, t, 1.2, 0.06)
}, 3500)

export const stopTones = () => {
  if (loop) clearInterval(loop)
  loop = null
}

export const playEndTone = () => {
  stopTones()
  const ctx = getAudioContext()
  if (!ctx) return
  try { [0, 0.25, 0.5].forEach((d) => beep(ctx, 480, ctx.currentTime + d, 0.15, 0.1)) } catch { /* ignore */ }
}
