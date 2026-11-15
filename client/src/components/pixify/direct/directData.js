import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import moment from 'moment'
import { api, enc } from '../../../helpers/social'
import { newClientId } from '../../../helpers/socketCall'

// Pixify Direct (Instagram-style messages) data: thread lists and one open thread, kept live through the
// 'px-dm' socket events the server sends (see server/controllers/dm.controller.js).

const byRecent = (a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)

const useDmEvents = (handler) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!socket) return
    const onDm = (e) => ref.current(e)
    socket.on('px-dm', onDm)
    // reconnecting may have missed events: reload
    const onConnect = () => ref.current({ type : 'reconnect' })
    socket.on('connect', onConnect)
    return () => { socket.off('px-dm', onDm); socket.off('connect', onConnect) }
  }, [socket])
}

// conversations in the inbox ('inbox') or under Requests ('requests')
export const useThreadList = (folder = 'inbox') => {
  const [state, setState] = useState({ threads : [], loading : true, next : null, error : '' })
  const gen = useRef(0)

  const load = useCallback(async (before) => {
    const g = before ? gen.current : ++gen.current
    if (!before) setState((s) => ({ ...s, loading : true, error : '' }))
    try {
      const res = await api.get(`/dm/threads?folder=${folder}${before ? `&before=${enc(before)}` : ''}`)
      if (g !== gen.current) return
      setState((s) => {
        const list = before ? [...s.threads, ...res.threads.filter((t) => !s.threads.some((x) => x._id === t._id))] : res.threads
        return { threads : list, loading : false, next : res.next, error : '' }
      })
    } catch (e) {
      if (g === gen.current) setState((s) => ({ ...s, loading : false, error : e.message }))
    }
  }, [folder])

  useEffect(() => { load() }, [load])

  const wanted = folder === 'requests' ? 'request' : 'inbox'
  useDmEvents((e) => {
    if (e.type === 'reconnect') return load()
    setState((s) => {
      let threads = s.threads
      if (e.type === 'thread-remove') threads = threads.filter((t) => t._id !== e.threadId)
      else if (e.type === 'read' && e.self) threads = threads.map((t) => (t._id === e.threadId ? { ...t, unread : false, lastReadAt : e.at } : t))
      else if (e.type === 'read') threads = threads.map((t) => (t._id === e.threadId ? { ...t, members : t.members.map((m) => (m._id === e.userId ? { ...m, lastReadAt : e.at } : m)) } : t))
      else if (e.thread) {
        const t = e.thread
        const rest = threads.filter((x) => x._id !== t._id)
        threads = t.status === wanted && t.lastMessage ? [t, ...rest].sort(byRecent) : rest
      }
      return threads === s.threads ? s : { ...s, threads }
    })
  })

  return { ...state, reload : () => load(), loadMore : () => state.next && load(state.next), setThreads : (fn) => setState((s) => ({ ...s, threads : fn(s.threads) })) }
}

// one open conversation: its details, messages (oldest first), who's typing, and sending
export const useThread = (threadId, me) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const [thread, setThread] = useState(null)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [next, setNext] = useState(null)
  const [typing, setTyping] = useState({})
  const typingTimers = useRef({})

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [t, m] = await Promise.all([api.get(`/dm/threads/${threadId}`), api.get(`/dm/threads/${threadId}/messages`)])
      setThread(t.thread)
      setMessages(m.messages)
      setNext(m.next)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => { setThread(null); setMessages([]); setTyping({}); loadAll() }, [loadAll])

  const loadOlder = useCallback(async () => {
    if (!next) return
    const res = await api.get(`/dm/threads/${threadId}/messages?before=${enc(next)}`)
    setMessages((list) => [...res.messages.filter((m) => !list.some((x) => x._id === m._id)), ...list])
    setNext(res.next)
  }, [threadId, next])

  // replaces a message (or a pending copy with the same clientId), else adds it at the end
  const upsert = useCallback((msg) => setMessages((list) => {
    const i = list.findIndex((m) => m._id === msg._id || (msg.clientId && m.clientId === msg.clientId))
    if (i === -1) return [...list, msg]
    const copy = list.slice()
    copy[i] = { ...msg }
    return copy
  }), [])

  useDmEvents((e) => {
    if (e.type === 'reconnect') return loadAll()
    if (e.threadId !== threadId) return
    if (e.type === 'thread-remove') return setError('removed')
    if (e.thread) setThread(e.thread)
    if ((e.type === 'message' || e.type === 'message-update') && e.message) {
      upsert(e.message)
      if (e.type === 'message') setTyping((t) => ({ ...t, [e.message.from] : false }))
    }
    if (e.type === 'message-remove') setMessages((list) => list.filter((m) => m._id !== e.messageId))
    if (e.type === 'read' && !e.self) setThread((t) => t && { ...t, members : t.members.map((m) => (m._id === e.userId ? { ...m, lastReadAt : e.at } : m)), peer : t.peer && t.peer._id === e.userId ? { ...t.peer, lastReadAt : e.at } : t.peer })
  })

  useEffect(() => {
    if (!socket) return
    const onTyping = (e) => {
      if (e.threadId !== threadId) return
      clearTimeout(typingTimers.current[e.userId])
      setTyping((t) => ({ ...t, [e.userId] : e.typing }))
      // the other side may close the tab without saying they stopped
      if (e.typing) typingTimers.current[e.userId] = setTimeout(() => setTyping((t) => ({ ...t, [e.userId] : false })), 6000)
    }
    socket.on('px-dm-typing', onTyping)
    return () => socket.off('px-dm-typing', onTyping)
  }, [socket, threadId])

  // send: shows the message at once (sending...), then swaps in the saved one. `prepare` can upload files first.
  const send = useCallback(async (body, { local = {}, prepare } = {}) => {
    const clientId = newClientId()
    const pending = { _id : `pending-${clientId}`, clientId, from : me, thread : threadId, reactions : [], createdAt : new Date().toISOString(), pending : true, ...local, ...body }
    upsert(pending)
    try {
      const ready = prepare ? await prepare((progress) => upsert({ ...pending, progress })) : {}
      const res = await api.post(`/dm/threads/${threadId}/messages`, { ...body, ...ready, clientId })
      upsert(res.message)
      return res.message
    } catch (e) {
      upsert({ ...pending, pending : false, failed : e.message, retry : () => { setMessages((l) => l.filter((m) => m.clientId !== clientId)); send(body, { local, prepare }) } })
      throw e
    }
  }, [threadId, me, upsert])

  const typingTimer = useRef(null)
  const typingOn = useRef(false)
  const setMyTyping = useCallback((on) => {
    if (!socket) return
    clearTimeout(typingTimer.current)
    if (on) typingTimer.current = setTimeout(() => setMyTyping(false), 4000)
    if (on === typingOn.current) return
    typingOn.current = on
    socket.emit('px-dm-typing', { threadId, typing : on })
  }, [socket, threadId])
  useEffect(() => () => { if (typingOn.current && socket) socket.emit('px-dm-typing', { threadId, typing : false }) }, [socket, threadId])

  return { thread, setThread, error, messages, setMessages, upsert, loading, hasOlder : !!next, loadOlder, typing, send, setMyTyping, reload : loadAll }
}

/* ---------- words ---------- */

// "Active now", "Active 5m ago", "Active yesterday"
export const activeLabel = (p) => {
  if (!p) return ''
  if (p.online) return 'Active now'
  if (!p.lastSeen) return ''
  const mins = moment().diff(moment(p.lastSeen), 'minutes')
  if (mins < 60) return `Active ${Math.max(1, mins)}m ago`
  if (mins < 24 * 60) return `Active ${Math.floor(mins / 60)}h ago`
  if (mins < 48 * 60) return 'Active yesterday'
  return ''
}

// the line under a conversation in the list: "You: see you there", "Asha sent a photo"
export const listPreview = (t) => {
  const m = t.lastMessage
  if (!m) return ''
  const isAction = m.kind !== 'text'
  if (m.mine) return isAction ? `You ${m.preview}` : `You: ${m.preview}`
  if (isAction) return `${m.fromName || 'Someone'} ${m.preview}`
  return t.isGroup ? `${m.fromName}: ${m.preview}` : m.preview
}

// "Today 9:14 PM", "Yesterday 8:02 AM", "Mon 7:15 PM", "12 Mar 2026, 4:00 PM"
export const stampLabel = (date) => {
  const m = moment(date)
  if (m.isSame(moment(), 'day')) return m.format('h:mm A')
  if (m.isSame(moment().subtract(1, 'day'), 'day')) return `Yesterday ${m.format('h:mm A')}`
  if (moment().diff(m, 'days') < 7) return m.format('ddd h:mm A')
  return m.format('D MMM YYYY, h:mm A')
}

// "Asha named the group Trip" etc. (names: You / first name)
export const systemText = (s, me) => {
  const who = (p) => (p._id === me ? 'You' : (p.username || p.name || 'Someone'))
  const list = (s.targets || []).map(who)
  const names = list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
  const a = who(s.actor)
  return ({
    created : `${a} created the group`,
    named : `${a} named the group ${s.value}`,
    unnamed : `${a} removed the group name`,
    photo : `${a} changed the group photo`,
    photo_removed : `${a} removed the group photo`,
    added : `${a} added ${names}`,
    removed : `${a} removed ${names}`,
    left : `${a} left the group`,
  })[s.action] || ''
}

// text made only of 1-3 emoji is shown big, without a bubble
export const isJumboEmoji = (text = '') => {
  const t = text.trim()
  if (!t || t.length > 24 || /[\p{L}\p{N}]/u.test(t.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ''))) return false
  const parts = [...new Intl.Segmenter(undefined, { granularity : 'grapheme' }).segment(t)].filter((s) => s.segment.trim())
  return parts.length > 0 && parts.length <= 3 && parts.every((s) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s.segment))
}
