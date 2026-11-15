// Chatify end-to-end encryption manager (runs only on the user's device).
//
//   startE2EE()      — creates / loads this browser's device keys and publishes the PUBLIC keys
//   prepareOutgoing  — encrypts messages, edits, scheduled messages, reminder previews and statuses before they leave
//   decryptDeep      — verifies + decrypts every encrypted envelope found in data coming from the server
//   installDecryptor — runs decryptDeep on socket events before the app's handlers see them (order preserved)
//   media helpers    — encrypt files before upload; download, verify and decrypt them for display
//   security codes, "code changed" warnings, local search index, device-to-device history sync
import { useEffect, useMemo, useState } from 'react'
import { rawCall } from '../rawCall'
import * as C from './crypto'
import * as store from './store'

const st = { me : null, device : null, socket : null, ready : null, prefs : { linkPreviews : true } }
const dir = new Map()        // userId -> { devices, at }  (public keys)
const chats = new Map()      // receiver -> { info, at }   (who a message to this chat is encrypted for)
const bodies = new Map()     // envelope signature -> decrypted body
const mediaKeys = new Map()  // uploaded ciphertext url -> { key, iv, sha, mime, size, name }
const mediaUrls = new Map()  // ciphertext url -> object URL of the decrypted file
const inflight = new Map()
const DIR_TTL = 30 * 1000
const CHAT_TTL = 20 * 1000

export const e2eeSupported = () => !!(window.crypto?.subtle && typeof indexedDB !== 'undefined')
export const e2eeReady = () => !!st.device
export const myDeviceId = () => st.device?.id || null
export const setE2EEPrefs = (prefs) => { st.prefs = { ...st.prefs, ...prefs } }

const deviceName = () => {
  const ua = navigator.userAgent || ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

const newDeviceRecord = async (me) => {
  const k = await C.generateDeviceKeys()
  const rec = { userId : String(me), id : C.randomId(), ecdh : k.ecdh, sign : k.sign, ecdhPub : k.ecdhPub, signPub : k.signPub, createdAt : Date.now() }
  await store.putDevice(rec)
  return rec
}

/* ---------- device ---------- */

// call on every (re)connect: the server needs to know which socket is which device
export const startE2EE = async (socket, me) => {
  st.socket = socket
  if (!me) return null
  if (st.me !== String(me)) {
    st.me = String(me)
    st.device = null
    dir.clear(); chats.clear(); bodies.clear()
  }
  if (!e2eeSupported()) return null
  st.ready = (async () => {
    let rec = await store.getDevice(me)
    if (!rec) rec = await newDeviceRecord(me)
    let res = await rawCall(socket, 'e2ee-register', { id : rec.id, ecdh : rec.ecdhPub, sign : rec.signPub, name : deviceName() })
    if (!res.ok && res.error === 'Device keys mismatch') {
      rec = await newDeviceRecord(me)
      res = await rawCall(socket, 'e2ee-register', { id : rec.id, ecdh : rec.ecdhPub, sign : rec.signPub, name : deviceName() })
    }
    if (!res.ok) throw new Error(res.error)
    st.device = rec
    dir.set(st.me, { devices : res.devices, at : Date.now() })
    return { isNew : res.isNew, devices : res.devices }
  })()
  try {
    return await st.ready
  } catch (e) {
    console.warn('[e2ee] encryption unavailable on this device:', e?.message)
    st.device = null
    return null
  } finally {
    firstStarted()
  }
}

// the first start can still be on its way when a chat opens: wait for it (briefly) instead of reporting "no encryption"
let firstStarted
const firstStart = new Promise((resolve) => { firstStarted = resolve })
const waitReady = async () => {
  if (!st.ready && e2eeSupported()) await Promise.race([firstStart, new Promise((resolve) => setTimeout(resolve, 8000))])
  try { if (st.ready) await st.ready } catch { /* handled in startE2EE */ }
}

/* ---------- public key directory ---------- */

const active = (devices) => (devices || []).filter((d) => !d.removedAt)

const fetchDevices = async (ids, { fresh = false } = {}) => {
  const need = [...new Set(ids.map(String))].filter((id) => fresh || !dir.has(id) || Date.now() - dir.get(id).at > DIR_TTL)
  if (!need.length || !st.socket) return
  const res = await rawCall(st.socket, 'e2ee-devices', { userIds : need })
  if (!res.ok) return
  const now = Date.now()
  for (const id of need) dir.set(id, { devices : res.users[id] || [], at : now })
}

const signKeyFor = async (userId, deviceId) => {
  const find = () => (dir.get(String(userId))?.devices || []).find((d) => d.id === deviceId)
  let d = find()
  if (!d) { await fetchDevices([userId], { fresh : true }); d = find() }
  if (!d) throw new C.E2EEError('unknown-device', 'Sent from a device Chatify doesn’t know')
  return d.sign
}

const chatInfo = async (receiver, { fresh = false } = {}) => {
  const key = String(receiver)
  const hit = chats.get(key)
  if (!fresh && hit && Date.now() - hit.at < CHAT_TTL) return hit.info
  const res = await rawCall(st.socket, 'e2ee-chat-devices', { receiver : key })
  if (!res.ok) throw new Error(res.error)
  const now = Date.now()
  for (const [id, devices] of Object.entries(res.users)) dir.set(id, { devices, at : now })
  const info = { users : res.users, withoutKeys : res.withoutKeys || [], isGroup : res.isGroup }
  chats.set(key, { info, at : now })
  return info
}
export const forgetChat = (receiver) => { if (receiver) chats.delete(String(receiver)) }

const recipientsOf = (users) => Object.entries(users).flatMap(([u, devices]) => active(devices).map((d) => ({ u, d : d.id, ecdh : d.ecdh })))

// can messages to this chat be end-to-end encrypted right now? (everyone has opened an encryption-capable Chatify)
export const canEncrypt = async (receiver) => {
  await waitReady()
  if (!st.device || !receiver) return false
  try { return !(await chatInfo(receiver)).withoutKeys.length } catch { return false }
}

// can my next status be encrypted? (everyone it's shared with has keys)
export const canEncryptStatus = async () => {
  await waitReady()
  if (!st.device) return false
  const aud = await rawCall(st.socket, 'status-audience')
  return !!aud.ok && !Object.entries(aud.users).some(([id, devices]) => id !== st.me && !active(devices).length)
}

/* ---------- outgoing ---------- */

const ENCRYPTED_EVENTS = new Set(['send-message', 'edit-message', 'schedule-message', 'reminder-set', 'status-post'])
export const handlesEvent = (event) => ENCRYPTED_EVENTS.has(event)

const LINK = /https?:\/\/[^\s<>"']+/i
const clientOnly = (p) => { if (!p || typeof p !== 'object') return p; const { original, preview, ...rest } = p; return rest }

const linkPreviewFor = async (text) => {
  if (!st.prefs.linkPreviews || !LINK.test(text || '')) return null
  try {
    let token = null
    try { token = localStorage.getItem('token') } catch { /* ignore */ }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/link-preview`, {
      method : 'POST', credentials : 'include', signal : ctrl.signal,
      headers : { 'Content-Type' : 'application/json', ...(token ? { Authorization : `Bearer ${token}` } : {}) },
      body : JSON.stringify({ url : LINK.exec(text)[0] })
    })
    clearTimeout(timer)
    const data = await res.json()
    return data?.data?.title ? data.data : null
  } catch { return null }
}

const mediaDesc = (url, kind, extra = {}) => {
  const k = mediaKeys.get(url)
  return k ? { kind, url, ...k, ...extra } : { kind, url, ...extra }
}

const cleanPoll = (poll) => {
  const question = typeof poll?.question === 'string' ? poll.question.replace(/\s+/g, ' ').trim() : ''
  const options = (Array.isArray(poll?.options) ? poll.options : []).map((o) => (typeof o === 'string' ? o.replace(/\s+/g, ' ').trim() : '')).filter(Boolean)
  if (!question) return { error : 'Ask a question' }
  if (question.length > 255) return { error : 'Question is too long (max 255 characters)' }
  if (options.length < 2) return { error : 'Add at least 2 options' }
  if (options.length > 12) return { error : 'A poll can have up to 12 options' }
  if (options.some((o) => o.length > 100)) return { error : 'Options can be up to 100 characters' }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error : 'Options must be different' }
  return { question, options, multiple : poll.multiple !== false }
}

// the encrypted body + coarse kind for a send-message payload
const bodyFromPayload = async (p) => {
  const text = typeof p.text === 'string' ? p.text.replace(/\r\n/g, '\n').trim() : ''
  if (text.length > 4096) return { error : 'Message is too long (max 4096 characters)' }
  if (p.poll) {
    const poll = cleanPoll(p.poll)
    if (poll.error) return poll
    return { body : { poll : { question : poll.question, options : poll.options } }, kind : 'poll', extra : { pollMeta : { count : poll.options.length, multiple : poll.multiple } } }
  }
  if (p.contact) return { body : { contact : { userId : String(p.contact.userId || ''), name : p.contact.name || '', phone : p.contact.phone || '', email : p.contact.email || '' } }, kind : 'contact' }
  if (p.location) return { body : { location : { lat : Number(p.location.lat), lng : Number(p.location.lng), name : p.location.name || '' } }, kind : 'location' }
  if (p.stickerUrl) return { body : { media : mediaDesc(p.stickerUrl, 'sticker') }, kind : 'sticker' }
  if (p.audioUrl) return { body : { media : mediaDesc(p.audioUrl, 'audio', { dur : Number(p.audioDuration) || 0, wave : p.audioWaveform || [] }) }, kind : 'audio' }
  if (p.imageUrl) return { body : { text, media : mediaDesc(p.imageUrl, 'image') }, kind : 'image' }
  if (p.videoUrl) return { body : { text, media : mediaDesc(p.videoUrl, 'video') }, kind : 'video' }
  if (p.fileUrl) return { body : { text, media : mediaDesc(p.fileUrl, 'file', { name : p.fileName || 'Document', size : p.fileSize || 0, mime : p.fileType || '' }) }, kind : 'file' }
  if (!text) return { error : 'Message is empty' }
  const body = { text }
  const preview = p.forwarded ? p.linkPreview : await linkPreviewFor(text)
  if (preview) body.linkPreview = preview
  return { body, kind : LINK.test(text) ? 'link' : 'text' }
}

const sealFor = (body, to, recipients, cid) => C.seal(body, { from : st.me, to, cid : cid || C.randomId(), device : st.device }, recipients)

export const prepareOutgoing = async (event, payload, { fresh = false } = {}) => {
  await waitReady()
  if (!st.device || !payload || typeof payload !== 'object') return { payload : clientOnly(payload) }
  try {
    if (event === 'send-message') {
      if (payload.e2ee) return { payload }
      let info
      try { info = await chatInfo(payload.receiver, { fresh }) } catch { return { payload : clientOnly(payload) } }
      if (info.withoutKeys.length) {
        // someone hasn't got encryption keys yet: files already encrypted for this chat can't be sent unencrypted
        const urls = [payload.imageUrl, payload.videoUrl, payload.fileUrl, payload.audioUrl, payload.stickerUrl].filter(Boolean)
        if (urls.some((u) => mediaKeys.has(u))) return { error : "This chat isn't end-to-end encrypted yet, so this encrypted file can't be sent here." }
        return { payload : clientOnly(payload) }
      }
      const { body, kind, extra, error } = await bodyFromPayload(payload)
      if (error) return { error }
      const env = await sealFor(body, payload.receiver, recipientsOf(info.users), payload.clientId)
      const out = { receiver : payload.receiver, clientId : payload.clientId, replyTo : payload.replyTo, e2ee : env, e2eeKind : kind, ...(extra || {}) }
      for (const k of ['viewOnce', 'mentions', 'silent', 'statusId', 'forwarded']) if (payload[k] !== undefined) out[k] = payload[k]
      return { payload : out }
    }

    if (event === 'edit-message') {
      const m = payload.original
      if (!m?.e2ee) return { payload : clientOnly(payload) }
      const info = await chatInfo(payload.receiver, { fresh })
      if (info.withoutKeys.length) return { error : "This message can't be edited until everyone in the chat has the latest Chatify." }
      const text = String(payload.text || '').trim()
      const body = { ...bodyFromMessage(m), text }
      delete body.linkPreview
      if (!m.e2eeMedia) {
        const preview = await linkPreviewFor(text)
        if (preview) body.linkPreview = preview
      }
      const kind = ['text', 'link'].includes(m.e2eeKind) ? (LINK.test(text) ? 'link' : 'text') : m.e2eeKind
      const env = await sealFor(body, payload.receiver, recipientsOf(info.users))
      return { payload : { messageId : payload.messageId, e2ee : env, e2eeKind : kind } }
    }

    if (event === 'schedule-message') {
      let info
      try { info = await chatInfo(payload.receiver, { fresh }) } catch { return { payload : clientOnly(payload) } }
      if (info.withoutKeys.length) return { payload : clientOnly(payload) }
      const text = String(payload.text || '').replace(/\r\n/g, '\n').trim()
      if (!text) return { error : 'Type a message to schedule' }
      const body = { text }
      const preview = await linkPreviewFor(text)
      if (preview) body.linkPreview = preview
      const env = await sealFor(body, payload.receiver, recipientsOf(info.users))
      return { payload : { receiver : payload.receiver, sendAt : payload.sendAt, silent : payload.silent, mentions : payload.mentions, e2ee : env, e2eeKind : LINK.test(text) ? 'link' : 'text' } }
    }

    if (event === 'reminder-set') {
      if (!payload.preview) return { payload : clientOnly(payload) }
      await fetchDevices([st.me], { fresh : true })
      const mine = active(dir.get(st.me)?.devices).map((d) => ({ u : st.me, d : d.id, ecdh : d.ecdh }))
      if (!mine.length) return { payload : clientOnly(payload) }
      const env = await sealFor({ preview : String(payload.preview).slice(0, 300) }, st.me, mine)
      return { payload : { messageId : payload.messageId, remindAt : payload.remindAt, e2ee : env } }
    }

    if (event === 'status-post') {
      const aud = await rawCall(st.socket, 'status-audience')
      if (!aud.ok) return { payload : clientOnly(payload) }
      const lacking = Object.entries(aud.users).some(([id, devices]) => id !== st.me && !active(devices).length)
      if (lacking) {
        if (payload.mediaUrl && mediaKeys.has(payload.mediaUrl)) return { error : "Some of your contacts don't have encryption yet, so this encrypted status can't be posted." }
        return { payload : clientOnly(payload) }
      }
      const body = payload.kind === 'text' ? { text : String(payload.text || '').trim() } : { media : mediaDesc(payload.mediaUrl, payload.kind), caption : String(payload.caption || '').trim() }
      if (payload.kind === 'text' && !body.text) return { error : 'Type a status' }
      if ((body.text || body.caption || '').length > 700) return { error : 'Status is too long (max 700 characters)' }
      const env = await sealFor(body, st.me, recipientsOf(aud.users))
      return { payload : { kind : payload.kind, background : payload.background, font : payload.font, e2ee : env } }
    }
  } catch (e) {
    console.warn('[e2ee] could not encrypt', e)
    return { error : "Couldn't encrypt this message. Please try again." }
  }
  return { payload : clientOnly(payload) }
}

// the body of a message I already have (edit / forward)
const bodyFromMessage = (m) => {
  const body = {}
  if (m.text) body.text = m.text
  if (m.e2eeMedia) { const { field, ...media } = m.e2eeMedia; body.media = media }
  else if (m.stickerUrl) body.media = { kind : 'sticker', url : m.stickerUrl }
  if (m.poll) body.poll = { question : m.poll.question, options : m.poll.options }
  if (m.contact) body.contact = m.contact
  if (m.location) body.location = m.location
  if (m.linkPreview) body.linkPreview = m.linkPreview
  return body
}

// a send-message payload that forwards message `m` (decrypted on this device) to `receiver`
export const forwardPayload = (m, receiver, clientId) => {
  if (m.e2eeMedia) mediaKeys.set(m.e2eeMedia.url, { key : m.e2eeMedia.key, iv : m.e2eeMedia.iv, sha : m.e2eeMedia.sha, mime : m.e2eeMedia.mime, size : m.e2eeMedia.size, name : m.e2eeMedia.name })
  const media = m.e2eeMedia ? { [m.e2eeMedia.field] : m.e2eeMedia.url } : {}
  if (m.e2eeMedia?.kind === 'file') Object.assign(media, { fileName : m.e2eeMedia.name, fileSize : m.e2eeMedia.size, fileType : m.e2eeMedia.mime })
  if (m.e2eeMedia?.kind === 'audio') Object.assign(media, { audioDuration : m.e2eeMedia.dur, audioWaveform : m.e2eeMedia.wave })
  if (!m.e2eeMedia && m.stickerUrl) media.stickerUrl = m.stickerUrl
  return {
    receiver, clientId, forwarded : true, text : m.text || '', ...media,
    ...(m.poll ? { poll : { question : m.poll.question, options : m.poll.options, multiple : m.poll.multiple } } : {}),
    ...(m.contact ? { contact : m.contact } : {}),
    ...(m.location ? { location : m.location } : {}),
    ...(m.linkPreview ? { linkPreview : m.linkPreview } : {})
  }
}

/* ---------- media ---------- */

// encrypt a file before it's uploaded; call registerUpload() with the resulting URL
export const encryptFile = async (file) => {
  const data = await file.arrayBuffer()
  const enc = await C.encryptBytes(data)
  const blob = new File([enc.ct], 'encrypted.bin', { type : 'application/octet-stream' })
  return { blob, meta : { key : enc.key, iv : enc.iv, sha : enc.sha, mime : file.type || 'application/octet-stream', size : file.size, name : file.name } }
}
export const registerUpload = (url, meta, file) => {
  mediaKeys.set(url, meta)
  // I already have the file: show it without downloading it again
  if (file) mediaUrls.set(url, URL.createObjectURL(file))
}

export const fetchMedia = (d) => {
  if (mediaUrls.has(d.url)) return Promise.resolve(mediaUrls.get(d.url))
  if (!inflight.has(d.url)) {
    inflight.set(d.url, (async () => {
      const res = await fetch(d.url)
      if (!res.ok) throw new C.E2EEError('media-download', 'Couldn’t download this file')
      const plain = await C.decryptBytes(await res.arrayBuffer(), d)
      const url = URL.createObjectURL(new Blob([plain], { type : d.mime || 'application/octet-stream' }))
      mediaUrls.set(d.url, url)
      return url
    })().finally(() => inflight.delete(d.url)))
  }
  return inflight.get(d.url)
}

export const E2EE_PENDING = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="100%" height="100%" fill="#c9d1d6"/></svg>')
const FIELD = { image : 'imageUrl', video : 'videoUrl', file : 'fileUrl', audio : 'audioUrl', sticker : 'stickerUrl' }

const patchMedia = (n, d, url) => {
  const field = d.field
  n[field] = url || E2EE_PENDING
  if (url && d.kind === 'video' && field === 'videoUrl') { n.localPreview = url; n.kind = 'video' }
  return n
}

// message with its encrypted media resolved from the cache (no download)
export const withMedia = (m) => (m?.e2eeMedia && mediaUrls.has(m.e2eeMedia.url) ? patchMedia({ ...m }, m.e2eeMedia, mediaUrls.get(m.e2eeMedia.url)) : m)

// React: download + decrypt a message's media when it's shown; re-renders when ready
export const useE2EEMedia = (msg) => {
  const d = msg?.e2eeMedia
  const [url, setUrl] = useState(() => (d ? mediaUrls.get(d.url) || null : null))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!d) return undefined
    const cached = mediaUrls.get(d.url)
    if (cached) { setUrl(cached); return undefined }
    let live = true
    setUrl(null)
    fetchMedia(d).then((u) => live && setUrl(u)).catch(() => live && setFailed(true))
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.url])
  return useMemo(() => {
    if (!d) return msg
    const out = patchMedia({ ...msg }, d, url)
    if (!url) out.e2eeLoading = !failed
    if (failed) out.e2eeMediaError = true
    return out
  }, [msg, d, url, failed])
}

/* ---------- incoming ---------- */

const openEnvelope = async (env) => {
  const cached = bodies.get(env.sig)
  if (cached) return cached
  if (!st.device) throw new C.E2EEError('no-device', 'Encryption is not available in this browser')
  await C.verify(env, await signKeyFor(env.from, env.dev))
  const body = await C.open(env, st.me, st.device)
  bodies.set(env.sig, body)
  return body
}

const isStatus = (n) => n && 'mediaUrl' in n && 'expiresAt' in n && 'background' in n

const setMedia = (n, m, key) => {
  const field = key === 'statusReply' || isStatus(n) ? 'mediaUrl' : FIELD[m.kind] || 'fileUrl'
  if (m.kind === 'file') Object.assign(n, { fileName : m.name || 'Document', fileSize : m.size || 0, fileType : m.mime || '' })
  if (m.kind === 'audio') Object.assign(n, { audioDuration : m.dur || 0, audioWaveform : m.wave || [] })
  if (!m.key) { n[field] = m.url; return null }
  const d = { ...m, field }
  n.e2eeMedia = d
  patchMedia(n, d, mediaUrls.get(m.url))
  return d
}

const applyBody = (n, body, key) => {
  if (key === 'replyTo') {
    n.text = (body.text || '').slice(0, 300)
    if (body.media) setMedia(n, body.media, key)
    if (body.poll) n.pollQuestion = body.poll.question
    if (body.contact) n.contactName = body.contact.name
    if (body.location) n.isLocation = true
    return null
  }
  if (key === 'statusReply') {
    n.text = (body.text || body.caption || '').slice(0, 200)
    return body.media ? setMedia(n, body.media, key) : null
  }
  if ('preview' in body) n.preview = body.preview
  if ('text' in body) n.text = body.text
  if ('caption' in body) n.caption = body.caption
  if (body.poll) n.poll = { multiple : true, votes : [], ...(n.poll || {}), question : body.poll.question, options : body.poll.options }
  if (body.contact) n.contact = body.contact
  if (body.location) n.location = body.location
  if (body.linkPreview) n.linkPreview = body.linkPreview
  return body.media ? setMedia(n, body.media, key) : null
}

const NOTICE = {
  'no-key' : 'Waiting for this message. This may take a while.',
  'no-device' : 'This message is end-to-end encrypted. Open it in a browser that supports encryption.',
  'bad-signature' : "This message couldn't be verified, so it was hidden.",
  'wrong-sender' : "This message couldn't be verified, so it was hidden.",
  'wrong-chat' : "This message couldn't be verified, so it was hidden.",
  'bad-ciphertext' : 'This message was altered or is corrupted.',
  'unknown-device' : "This message couldn't be verified, so it was hidden."
}

const decryptNode = async (n, key, ctx) => {
  const env = n.e2ee
  try {
    const sender = key === 'statusReply' ? n.ownerId : (n.msgByUserId ?? n.userId)
    if (sender !== undefined && sender !== null && String(sender) !== String(env.from)) throw new C.E2EEError('wrong-sender')
    // a message must belong to the chat it was shown in (the server can't move it to another chat)
    if (ctx.chat && key !== 'statusReply' && n.msgByUserId !== undefined) {
      const chat = String(ctx.chat)
      const ok = env.to === chat || (env.to === st.me && env.from === chat) || (env.from === st.me && env.to === chat)
      if (!ok) throw new C.E2EEError('wrong-chat')
    }
    const body = await openEnvelope(env)
    const media = applyBody(n, body, key)
    n.e2eeOk = true
    delete n.e2eeError
    if (media && ctx.media === 'eager' && !mediaUrls.has(media.url)) {
      try { patchMedia(n, media, await Promise.race([fetchMedia(media), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))])) } catch { /* shown as loading in the bubble */ }
    }
  } catch (e) {
    n.e2eeError = e?.code || 'failed'
    n.e2eeNotice = NOTICE[n.e2eeError] || "This message couldn't be decrypted."
    if (key !== 'statusReply' && key !== 'replyTo') n.text = ''
  }
}

const findEnvelopes = (root) => {
  const out = []
  const walk = (v, key, depth) => {
    if (!v || typeof v !== 'object' || depth > 8) return
    if (Array.isArray(v)) { for (const x of v) walk(x, key, depth + 1); return }
    if (v.e2ee && typeof v.e2ee === 'object' && v.e2ee.v === 1 && v.e2ee.ct && !v.e2eeOk) out.push([v, key])
    for (const k of Object.keys(v)) if (k !== 'e2ee' && k !== 'e2eeMedia') walk(v[k], k, depth + 1)
  }
  walk(root, '', 0)
  return out
}

export const decryptDeep = async (root, ctx = {}) => {
  const nodes = findEnvelopes(root)
  if (!nodes.length) return root
  await waitReady()
  await Promise.all(nodes.map(([n, key]) => decryptNode(n, key, ctx)))
  if (ctx.index && ctx.chat && st.me) {
    const rows = nodes
      .filter(([n, key]) => key !== 'replyTo' && key !== 'statusReply' && n.e2eeOk && n._id && n.msgByUserId && (n.text || n.e2eeMedia?.name))
      .map(([n]) => ({ id : String(n._id), chat : String(ctx.chat), text : n.text || n.e2eeMedia?.name || '', at : n.createdAt, from : String(n.msgByUserId) }))
    if (rows.length) store.putPlain(st.me, rows).catch(() => {})
  }
  return root
}

const MESSAGE_EVENTS = new Set(['message-new', 'message-updated'])
export const contextForEvent = (event, data) => (MESSAGE_EVENTS.has(event) ? { media : 'lazy', chat : data?.peerId, index : true } : { media : 'none' })

export const contextForAck = (event, payload) => {
  switch (event) {
    case 'message-page' : return { media : 'lazy', chat : payload, index : true }
    case 'load-older' :
    case 'load-range' : return { media : 'lazy', chat : payload?.peerId, index : true }
    case 'send-message' : return { media : 'lazy', chat : payload?.receiver, index : true }
    case 'message-info' : return { media : 'lazy' }
    case 'get-starred' :
    case 'get-shared' :
    case 'view-once-open' :
    case 'status-list' : return { media : 'eager' }
    default : return { media : 'none' }
  }
}

// decrypt socket events before the app's handlers run, keeping their order
export const installDecryptor = (socket) => {
  if (socket.__e2ee) return
  socket.__e2ee = true
  const original = socket.emitEvent.bind(socket)
  let chain = Promise.resolve()
  socket.emitEvent = (args) => {
    const [event, data] = args
    const work = findEnvelopes(data).length
      ? () => Promise.race([decryptDeep(data, contextForEvent(event, data)), new Promise((resolve) => setTimeout(resolve, 15000))])
      : () => undefined
    chain = chain.then(work).catch(() => {}).then(() => original(args)).catch((e) => console.error(e))
  }
}

/* ---------- search + export on this device ---------- */

export const searchLocal = async (q, chat) => {
  if (!st.me) return []
  const needle = String(q || '').toLowerCase()
  if (!needle) return []
  const rows = await store.allPlain(st.me).catch(() => [])
  return rows
    .filter((r) => (!chat || r.chat === String(chat)) && r.text.toLowerCase().includes(needle))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 50)
}

export const clearLocalData = (me) => store.clearPlain(me || st.me).catch(() => {})

/* ---------- security code ---------- */

export const securityCodeWith = async (peerId) => {
  await waitReady()
  await fetchDevices([st.me, peerId], { fresh : true })
  const a = active(dir.get(st.me)?.devices), b = active(dir.get(String(peerId))?.devices)
  if (!a.length || !b.length) return null
  return C.securityCode(st.me, a, String(peerId), b)
}

const fingerprint = async (userId) => {
  const devices = active(dir.get(String(userId))?.devices)
  if (!devices.length) return ''
  return C.b64(await C.sha256(devices.map((d) => `${d.ecdh}.${d.sign}`).sort().join(',')))
}

// is this chat encrypted, and did the contact's keys change since I last looked?
export const chatSecurity = async (receiver, { isGroup = false } = {}) => {
  await waitReady()
  if (!st.device) return { supported : e2eeSupported(), encrypted : false, withoutKeys : [] }
  let info
  try { info = await chatInfo(receiver, { fresh : true }) } catch { return { encrypted : false, withoutKeys : [] } }
  const out = { supported : true, encrypted : !info.withoutKeys.length, withoutKeys : info.withoutKeys, isGroup : info.isGroup }
  if (!isGroup && !info.isGroup && String(receiver) !== st.me) {
    const fp = await fingerprint(receiver)
    if (fp) {
      const pin = await store.getPin(st.me, receiver).catch(() => null)
      if (!pin) await store.putPin(st.me, receiver, { fp, verified : false, changedAt : null }).catch(() => {})
      else if (pin.fp !== fp) {
        await store.putPin(st.me, receiver, { fp, verified : false, changedAt : Date.now(), notice : true }).catch(() => {})
        out.codeChanged = true
      } else if (pin.notice) out.codeChanged = true
      out.verified = !!pin?.verified && pin.fp === fp
    }
  }
  return out
}

export const dismissCodeNotice = async (peerId) => {
  const pin = await store.getPin(st.me, peerId).catch(() => null)
  if (pin) await store.putPin(st.me, peerId, { ...pin, notice : false }).catch(() => {})
}
export const markVerified = async (peerId, verified) => {
  await fetchDevices([peerId], { fresh : true })
  const fp = await fingerprint(peerId)
  await store.putPin(st.me, peerId, { fp, verified : !!verified, changedAt : null, notice : false })
}

/* ---------- history sync to my new device ---------- */

export const shareHistoryWith = async (device, onProgress) => {
  await waitReady()
  if (!st.device) throw new Error('Encryption is not available in this browser')
  let before
  let total = 0
  for (let round = 0; round < 50; round++) {
    const res = await rawCall(st.socket, 'e2ee-sync-batch', { device : device.id, before })
    if (!res.ok) throw new Error(res.error)
    if (!res.items.length) break
    const entries = []
    for (const it of res.items) {
      try { entries.push({ id : it._id, ...(await C.rewrap(it.key, st.device, st.me, device.id, device.ecdh)) }) } catch { /* skip */ }
    }
    for (let i = 0; i < entries.length; i += 200) {
      const r = await rawCall(st.socket, 'e2ee-add-keys', { device : device.id, entries : entries.slice(i, i + 200) })
      if (r.ok) total += r.added || 0
    }
    before = res.items[res.items.length - 1].createdAt
    onProgress?.(total)
  }
  await rawCall(st.socket, 'e2ee-sync-done', { device : device.id, count : total })
  return total
}

export const requestHistory = () => rawCall(st.socket, 'e2ee-request-history')
