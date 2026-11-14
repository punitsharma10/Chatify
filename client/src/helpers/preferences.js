import { useEffect, useState } from 'react'

// Per-device conveniences kept in localStorage (wallpaper choice). Always wrapped in try/catch.
const KEY = 'chatify-wallpaper'
const EVENT = 'chatify-wallpaper-change'

export const WALLPAPERS = [
  { id : 'doodle', label : 'Default', className : 'wa-chat-bg' },
  { id : 'plain', label : 'Plain', style : { backgroundColor : '#efeae2' } },
  { id : 'mint', label : 'Mint', style : { backgroundColor : '#d9f2e6' } },
  { id : 'sky', label : 'Sky', style : { backgroundColor : '#dbeafe' } },
  { id : 'blush', label : 'Blush', style : { backgroundColor : '#fbe4e4' } },
  { id : 'sand', label : 'Sand', style : { backgroundColor : '#f3e7c9' } },
  { id : 'slate', label : 'Slate', style : { backgroundColor : '#d6dde3' } },
]

const read = () => {
  try { return localStorage.getItem(KEY) || 'doodle' } catch { return 'doodle' }
}

export const setWallpaper = (id) => {
  try { localStorage.setItem(KEY, id) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT))
}

export const useWallpaper = () => {
  const [id, setId] = useState(read)
  useEffect(() => {
    const update = () => setId(read())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  return WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0]
}

/* ---------- desktop notifications ---------- */
export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window

export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported')

export const requestNotifications = async () => {
  if (!notificationsSupported()) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

// The service worker (public/notification-sw.js) lets notifications work on Android Chrome too,
// where `new Notification()` is not allowed, and handles clicks even if the tab was closed.
let swRegistration = null
export const registerNotificationWorker = async () => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null
  try {
    swRegistration = await navigator.serviceWorker.register('/notification-sw.js')
    return swRegistration
  } catch {
    return null
  }
}

// one notification per chat (a newer message replaces the older one, like WhatsApp), and it re-alerts
export const showNotification = async ({ title, body, icon, chatId, onClick }) => {
  if (notificationPermission() !== 'granted') return
  const options = { body, icon : icon || '/logo192.png', badge : '/logo192.png', tag : `chat-${chatId}`, renotify : true, data : { url : `/${chatId}` } }
  try {
    const reg = swRegistration || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration())
    if (reg?.showNotification) return await reg.showNotification(title, options)
  } catch { /* fall back to a page notification */ }
  try {
    const n = new Notification(title, options)
    n.onclick = () => { window.focus(); onClick && onClick(); n.close() }
  } catch { /* notifications not available in this browser */ }
}

/* ---------- notification sound ---------- */
const SOUND_KEY = 'chatify-sounds'
const SOUND_EVENT = 'chatify-sounds-change'

export const soundsEnabled = () => {
  try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
}

export const setSoundsEnabled = (on) => {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off') } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(SOUND_EVENT))
}

export const useSoundsEnabled = () => {
  const [on, setOn] = useState(soundsEnabled)
  useEffect(() => {
    const update = () => setOn(soundsEnabled())
    window.addEventListener(SOUND_EVENT, update)
    return () => window.removeEventListener(SOUND_EVENT, update)
  }, [])
  return on
}

let audioCtx = null
const getAudio = () => {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  return audioCtx
}

export const getAudioContext = getAudio

// browsers only allow sound after the user has interacted with the page once
export const unlockSound = () => {
  const ctx = getAudio()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

// short two-note "ding" generated in the browser (no audio file needed)
export const playNotificationSound = () => {
  if (!soundsEnabled()) return
  const ctx = getAudio()
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime
    ;[[880, 0], [1320, 0.12]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + delay)
      gain.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + delay)
      osc.stop(now + delay + 0.3)
    })
  } catch { /* audio not available */ }
}

/* ---------- unread badge on the tab icon (favicon) ---------- */
let originalFavicon = null
let faviconImage = null

export const setFaviconBadge = (count) => {
  const link = document.querySelector('link[rel~="icon"]')
  if (!link) return
  if (originalFavicon === null) originalFavicon = link.href
  if (!count) { link.href = originalFavicon; return }

  const draw = () => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const g = canvas.getContext('2d')
    if (faviconImage?.complete && faviconImage.naturalWidth) g.drawImage(faviconImage, 0, 0, size, size)
    // green badge with the number of unread chats
    g.fillStyle = '#25d366'
    g.beginPath(); g.arc(size - 20, 20, 20, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffffff'
    g.font = 'bold 26px Segoe UI, Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(count > 9 ? '9+' : String(count), size - 20, 22)
    link.href = canvas.toDataURL('image/png')
  }

  if (!faviconImage) {
    faviconImage = new Image()
    faviconImage.onload = draw
    faviconImage.onerror = draw
    faviconImage.src = originalFavicon
  }
  draw()
}
