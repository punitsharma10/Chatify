import { useEffect, useState } from 'react'

// Device-local display preferences (like WhatsApp Web's Settings > Chats). Stored in localStorage,
// always wrapped in try/catch so the app works when storage is blocked.
const EVENT = 'chatify-display-change'

const read = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
const write = (key, value) => {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT))
}

const useSetting = (key, fallback) => {
  const [value, setValue] = useState(() => read(key, fallback))
  useEffect(() => {
    const update = () => setValue(read(key, fallback))
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update) // other tabs
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', update) }
  }, [key, fallback])
  return value
}

/* ---------- theme: system | light | dark ---------- */
const THEME_KEY = 'chatify-theme'
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export const THEMES = [
  { id : 'system', label : 'System default' },
  { id : 'light', label : 'Light' },
  { id : 'dark', label : 'Dark' },
]

export const applyTheme = () => {
  const choice = read(THEME_KEY, 'light')
  const dark = choice === 'dark' || (choice === 'system' && darkQuery().matches)
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#202c33' : '#00a884')
  return dark
}

export const setTheme = (id) => { write(THEME_KEY, id); applyTheme() }
export const useTheme = () => useSetting(THEME_KEY, 'light')

// follow the OS setting live while "System default" is chosen, and keep tabs in sync
export const watchTheme = () => {
  applyTheme()
  const mq = darkQuery()
  mq.addEventListener?.('change', applyTheme)
  window.addEventListener('storage', (e) => { if (e.key === THEME_KEY) applyTheme() })
}

/* ---------- chat font size ---------- */
const FONT_KEY = 'chatify-font'
export const FONT_SIZES = [
  { id : 'small', label : 'Small', px : '13px' },
  { id : 'medium', label : 'Medium', px : '14.2px' },
  { id : 'large', label : 'Large', px : '16.5px' },
]
export const applyFontSize = () => {
  const size = FONT_SIZES.find((f) => f.id === read(FONT_KEY, 'medium')) || FONT_SIZES[1]
  document.documentElement.style.setProperty('--chat-font', size.px)
}
export const setFontSize = (id) => { write(FONT_KEY, id); applyFontSize() }
export const useFontSize = () => useSetting(FONT_KEY, 'medium')

/* ---------- Enter is send ---------- */
const ENTER_KEY = 'chatify-enter-send'
export const enterSends = () => read(ENTER_KEY, 'on') !== 'off'
export const setEnterSends = (on) => write(ENTER_KEY, on ? 'on' : 'off')
export const useEnterSends = () => useSetting(ENTER_KEY, 'on') !== 'off'

/* ---------- message previews in notifications ---------- */
const PREVIEW_KEY = 'chatify-notify-preview'
export const notificationPreviews = () => read(PREVIEW_KEY, 'on') !== 'off'
export const setNotificationPreviews = (on) => write(PREVIEW_KEY, on ? 'on' : 'off')
export const useNotificationPreviews = () => useSetting(PREVIEW_KEY, 'on') !== 'off'
