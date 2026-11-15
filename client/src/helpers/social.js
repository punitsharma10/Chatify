import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import moment from 'moment'
import uploadFile, { MAX_UPLOAD_BYTES } from './uploadFile'

// Pixify + Connectify API (server/routes/social.js). Every call resolves to the JSON body or throws an Error
// with the server's message, so screens can just `notifyError(e.message)`.
const BASE = () => `${process.env.REACT_APP_BACKEND_URL}/api/social`

const call = async (method, url, data) => {
  try {
    const res = await axios({ method, url : BASE() + url, data, withCredentials : true })
    return res.data
  } catch (error) {
    throw new Error(error?.response?.data?.message || "Couldn't reach Chatify. Check your connection and try again.")
  }
}

export const api = {
  get : (url) => call('get', url),
  post : (url, data = {}) => call('post', url, data),
  patch : (url, data = {}) => call('patch', url, data),
  del : (url) => call('delete', url),
}

export const enc = encodeURIComponent

// "5m", "3h", "2d", "4w" (Pixify) / "5 minutes ago", "Yesterday at 9:14 PM" (Connectify)
export const shortAgo = (date) => {
  const s = Math.max(1, (Date.now() - new Date(date)) / 1000)
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return `${Math.floor(s / (7 * 86400))}w`
}
export const longAgo = (date) => {
  const m = moment(date)
  const mins = moment().diff(m, 'minutes')
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''}`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h`
  if (m.isSame(moment().subtract(1, 'day'), 'day')) return `Yesterday at ${m.format('h:mm A')}`
  if (m.isSame(moment(), 'year')) return m.format('D MMMM [at] h:mm A')
  return m.format('D MMMM YYYY')
}

// 1234 -> "1,234", 12500 -> "12.5K"
export const compact = (n = 0) => {
  if (n < 10000) return n.toLocaleString()
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
}

// size of a photo / video before uploading (so the feed can reserve the right space)
const dimensionsOf = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file)
  const done = (w, h) => { URL.revokeObjectURL(url); resolve(w && h ? { width : w, height : h } : {}) }
  if (file.type.startsWith('video/')) {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight)
    v.onerror = () => done()
    v.src = url
  } else {
    const img = new Image()
    img.onload = () => done(img.naturalWidth, img.naturalHeight)
    img.onerror = () => done()
    img.src = url
  }
})

export const checkMediaFile = (file) => {
  if (!/^(image|video)\//.test(file.type)) return 'Choose photos or videos'
  if (file.size > MAX_UPLOAD_BYTES) return 'Files must be smaller than 100 MB'
  return ''
}

// uploads photos / videos (not encrypted: posts are shown to many people) -> [{ url, kind, width, height }]
export const uploadMedia = async (files, onProgress) => {
  const out = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const dims = await dimensionsOf(file)
    const up = await uploadFile(file, { onProgress : (p) => onProgress?.(Math.round(((i + p / 100) / files.length) * 100)) })
    if (!up?.url) throw new Error("Couldn't upload. Check your connection and try again.")
    out.push({ url : up.url, kind : file.type.startsWith('video/') ? 'video' : 'image', ...dims })
  }
  onProgress?.(100)
  return out
}

// Paged list (feeds, profile posts): { items, loading, done, error, loadMore, reload, setItems }
export const usePaged = (url, key = 'posts') => {
  const [state, setState] = useState({ items : [], loading : true, done : false, error : '' })
  const next = useRef(null)
  const busy = useRef(false)
  const gen = useRef(0)

  const load = useCallback(async (reset) => {
    if (!url || busy.current) return
    busy.current = true
    const g = reset ? ++gen.current : gen.current
    if (reset) { next.current = null; setState({ items : [], loading : true, done : false, error : '' }) } else setState((s) => ({ ...s, loading : true }))
    try {
      const sep = url.includes('?') ? '&' : '?'
      const res = await api.get(url + (next.current ? `${sep}before=${enc(next.current)}` : ''))
      if (g !== gen.current) return
      next.current = res.next
      setState((s) => {
        const prev = reset ? [] : s.items
        const seen = new Set(prev.map((x) => x._id))
        return { ...res, ...(res.count === undefined && !reset && s.count !== undefined ? { count : s.count } : {}), items : [...prev, ...(res[key] || []).filter((x) => !seen.has(x._id))], loading : false, done : !res.next, error : '' }
      })
    } catch (e) {
      if (g === gen.current) setState((s) => ({ ...s, loading : false, error : e.message }))
    } finally {
      busy.current = false
    }
  }, [url, key])

  useEffect(() => { busy.current = false; load(true) }, [load])

  const setItems = useCallback((fn) => setState((s) => ({ ...s, items : typeof fn === 'function' ? fn(s.items) : fn })), [])
  return { ...state, loadMore : () => !state.done && load(false), reload : () => { busy.current = false; return load(true) }, setItems }
}

// calls `onVisible` when the returned ref's element scrolls into view (infinite scroll)
export const useOnVisible = (onVisible, enabled = true) => {
  const ref = useRef(null)
  const cb = useRef(onVisible)
  cb.current = onVisible
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && cb.current(), { rootMargin : '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [enabled])
  return ref
}

// unread Pixify / Connectify notifications, kept live through the socket
// one shared counter for every screen that shows a badge (app switchers, nav bars): fetched once, kept live
const unreadStore = { counts : { pixify : 0, connectify : 0, friendRequests : 0, dm : 0, dmRequests : 0, cxDm : 0, cxDmRequests : 0 }, listeners : new Set(), socket : null, timer : null }
const refreshUnread = () => {
  clearTimeout(unreadStore.timer)
  // several events in a row (e.g. many likes) = one request
  unreadStore.timer = setTimeout(() => {
    api.get('/notifications/unread').then((c) => {
      unreadStore.counts = { pixify : c.pixify || 0, connectify : c.connectify || 0, friendRequests : c.friendRequests || 0, dm : c.dm || 0, dmRequests : c.dmRequests || 0, cxDm : c.cxDm || 0, cxDmRequests : c.cxDmRequests || 0 }
      unreadStore.listeners.forEach((fn) => fn(unreadStore.counts))
    }).catch(() => {})
  }, 150)
}
const watchUnread = (socket) => {
  if (!socket || unreadStore.socket === socket) return
  if (unreadStore.socket) { unreadStore.socket.off('social-notification', refreshUnread); unreadStore.socket.off('px-dm', refreshUnread); unreadStore.socket.off('connect', refreshUnread) }
  unreadStore.socket = socket
  socket.on('social-notification', refreshUnread)
  // Pixify Direct: new messages, reads, accepted requests
  socket.on('px-dm', refreshUnread)
  socket.on('connect', refreshUnread)
  refreshUnread()
}

export const useSocialUnread = () => {
  const socket = useSelector((s) => s.user.socketConnection)
  const [counts, setCounts] = useState(unreadStore.counts)
  useEffect(() => {
    unreadStore.listeners.add(setCounts)
    watchUnread(socket)
    return () => { unreadStore.listeners.delete(setCounts) }
  }, [socket])
  return { ...counts, refresh : refreshUnread }
}

// a post link that can be sent in Chats; Chats shows it as a post card
export const postLink = (post) => `${window.location.origin}/${post.app}/p/${post._id}`
export const POST_LINK = /^https?:\/\/[^/\s]+\/(pixify|connectify)\/p\/([a-f0-9]{24})\/?$/i

// the text with @mentions and #hashtags highlighted, links kept as text
export const splitMentions = (text = '') => String(text).split(/(@[a-zA-Z0-9._]{3,30}|#[A-Za-z0-9_À-￿]+)/).filter((x) => x !== '')
