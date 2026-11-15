import { useEffect, useState } from 'react'

// Unsent text per chat (WhatsApp keeps a "Draft" when you leave a chat). Device-local.
const KEY = 'chatify-drafts'
const EVENT = 'chatify-drafts-change'

const readAll = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}

export const getDraft = (chatId) => readAll()[String(chatId)] || ''

export const setDraft = (chatId, text) => {
  const all = readAll()
  const value = (text || '').slice(0, 4096)
  if ((all[String(chatId)] || '') === value) return
  if (value.trim()) all[String(chatId)] = value
  else delete all[String(chatId)]
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT))
}

export const clearDrafts = () => {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

// { chatId: text } for the chat list
export const useDrafts = () => {
  const [drafts, setDrafts] = useState(readAll)
  useEffect(() => {
    const update = () => setDrafts(readAll())
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener('storage', update) }
  }, [])
  return drafts
}
