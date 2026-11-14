import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import moment from 'moment'
import { notify, notifyError, notifyAction } from '../helpers/toast'
import Avatar from './Avatar'
import MessageBubble, { ReplyQuote, SystemNotice } from './MessageBubble'
import GroupInfo from './GroupInfo'
import { systemText, nameColor } from '../helpers/groupText'
import { usePeopleNames } from '../helpers/contacts'
import { useCalls } from './CallManager'
import { IoCallOutline, IoVideocamOutline } from 'react-icons/io5'
import PopoverMenu from './PopoverMenu'
import EmojiPicker from './EmojiPicker'
import Dialog from './Dialog'
import Lightbox from './Lightbox'
import ForwardDialog from './ForwardDialog'
import ContactInfo, { DISAPPEAR_OPTIONS } from './ContactInfo'
import ChatSearch from './ChatSearch'
import uploadFile, { MAX_UPLOAD_BYTES } from '../helpers/uploadFile'
import { socketCall, newClientId } from '../helpers/socketCall'
import { formatDayLabel, formatLastSeen, formatFullDate } from '../helpers/formatTime'
import { kindOfFile, formatBytes, fileExtension, downloadMedia } from '../helpers/media'
import { plainPreview } from '../helpers/formatText'
import { useWallpaper } from '../helpers/preferences'
import { setBlocked } from '../redux/userSlice'
import { HiDotsVertical } from "react-icons/hi";
import { IoArrowBack, IoClose, IoImages, IoDocumentText, IoCamera, IoSearchOutline, IoChevronDown, IoCopyOutline, IoStarOutline, IoStar, IoTrashOutline, IoInformationCircleOutline, IoDownloadOutline, IoCheckmark, IoTimerOutline, IoAdd, IoNotificationsOutline, IoNotificationsOffOutline, IoExitOutline } from "react-icons/io5";
import { FaPlus } from "react-icons/fa6";
import { IoMdSend } from "react-icons/io";
import { BsReply, BsPinAngle, BsPinAngleFill, BsCheck2All, BsCheck2 } from "react-icons/bs";
import { RiShareForwardLine } from "react-icons/ri";
import { MdOutlineEmojiEmotions, MdEdit, MdOutlineChecklist, MdBlock, MdOutlineCleaningServices } from "react-icons/md";

const EDIT_WINDOW_MS = 15 * 60 * 1000
const DELETE_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt)

// insert or replace a message (matching server id, or the client id of a pending local copy).
// keepNewer: the incoming copy is a creation-time snapshot (send ack / echo of my own message), so it must not
// overwrite a server copy we already have, which may already carry newer delivery/read/edit/delete state.
const upsert = (list, msg, { keepNewer = false } = {}) => {
  const i = list.findIndex((m) => String(m._id) === String(msg._id) || (msg.clientId && m.clientId === msg.clientId))
  if (i === -1) return [...list, msg].sort(byTime)
  if (keepNewer && !list[i].status) return list
  const copy = list.slice()
  copy[i] = { ...msg, localPreview : list[i].localPreview && !msg.imageUrl && !msg.videoUrl ? list[i].localPreview : undefined }
  return copy
}

const isPhone = () => window.matchMedia('(max-width: 767px)').matches
const isWide = () => window.matchMedia('(min-width: 1280px)').matches
const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches

const Message = () => {
  const { userId : peerId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const socket = useSelector((s) => s.user.socketConnection)
  const me = useSelector((s) => s.user._id)
  const myBlocked = useSelector((s) => s.user.blocked)
  const onlineUser = useSelector((s) => s.user.onlineUser)
  const typingValue = useSelector((s) => s.chat.typing[peerId]) // true (1:1) or the typer's name (group)
  const isTyping = !!typingValue
  const listConv = useSelector((s) => s.chat.conversations.find((c) => String(c.userDetails?._id) === String(peerId)))
  const wallpaper = useWallpaper()
  const names = usePeopleNames()
  const { startCall, startGroupCall, joinGroupCall, groupCallStates, refreshGroupCall, inCall } = useCalls()

  const [peer, setPeer] = useState(null)
  const [group, setGroup] = useState(null) // group details when this chat is a group
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [pinned, setPinned] = useState([])
  const [pinIndex, setPinIndex] = useState(0)
  const [unreadMarker, setUnreadMarker] = useState(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState([])
  const [menu, setMenu] = useState(null)
  const [headerMenu, setHeaderMenu] = useState(null)
  const [reactFor, setReactFor] = useState(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [composer, setComposer] = useState(null)
  const [composerIndex, setComposerIndex] = useState(0)
  const [lightbox, setLightbox] = useState(null)
  const [panel, setPanel] = useState(null) // 'info' | 'search'
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightId, setHighlightId] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [forwardIds, setForwardIds] = useState(null)
  const [atBottom, setAtBottom] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [dragOver, setDragOver] = useState(false)

  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const inputRef = useRef(null)
  const pendingScroll = useRef(null)
  const messagesRef = useRef(messages)
  const atBottomRef = useRef(true)
  const loadingOlderRef = useRef(false)
  const hasMoreRef = useRef(false)
  const typingRef = useRef({ sent : false, timer : null })
  const imageInput = useRef(null)
  const docInput = useRef(null)
  const cameraInput = useRef(null)
  const highlightTimer = useRef(null)
  messagesRef.current = messages
  hasMoreRef.current = hasMore

  const isGroupChat = !!group
  const online = !isGroupChat && onlineUser.includes(String(peerId))
  const blocked = !isGroupChat && (myBlocked.includes(String(peerId)) || !!peer?.blockedByMe)
  const isMember = !group || group.isMember
  const adminsOnlySend = !!group && group.settings?.sendMessages === 'admins' && !group.isAdmin
  const canSend = !blocked && isMember && !adminsOnlySend
  const canEditInfo = !group || (group.isMember && (group.settings?.editInfo !== 'admins' || group.isAdmin))
  const muted = listConv ? !!listConv.muted : !!conversation?.muted
  const disappearAfter = conversation?.disappearAfter || 0
  const people = group?.people
  const peerName = peer ? (isGroupChat || peer.isGroup ? peer.name : names.name(peer)) : ''
  const isRequest = !isGroupChat && !!(listConv ? listConv.request : conversation?.request)
  const authorNameOf = useCallback((id) => {
    if (String(id) === String(me)) return 'You'
    if (people) return people[String(id)] ? names.name({ _id : id, ...people[String(id)] }) : 'Former member'
    return peerName
  }, [me, peerName, people, names])
  // group bubbles: "+91 98765 43210 ~Rahul" for people you haven't saved, like WhatsApp
  const authorLabelOf = useCallback((id) => {
    const person = people?.[String(id)]
    const hint = person ? names.hint({ _id : id, ...person }) : ''
    return hint ? `${authorNameOf(id)}  ${hint}` : authorNameOf(id)
  }, [people, names, authorNameOf])

  /* ---------------- scrolling ---------------- */

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top : el.scrollHeight, behavior : smooth ? 'smooth' : 'auto' })
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    const p = pendingScroll.current
    if (!el || !p) return
    if (p === 'bottom') el.scrollTop = el.scrollHeight
    else if (p.preserve !== undefined) el.scrollTop = el.scrollHeight - p.preserve + p.top
    else if (p.toId) document.getElementById(`msg-${p.toId}`)?.scrollIntoView({ block : p.block || 'center' })
    pendingScroll.current = null
  }, [messages, loading])

  // keep pinned to the bottom while images/videos finish loading
  useEffect(() => {
    if (!contentRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (atBottomRef.current) scrollToBottom() })
    ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [loading])

  const flash = (id) => {
    clearTimeout(highlightTimer.current)
    setHighlightId(String(id))
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2200)
  }

  const markSeen = useCallback(() => {
    if (socket && document.visibilityState === 'visible') socket.emit('seen', peerId)
  }, [socket, peerId])

  /* ---------------- loading ---------------- */

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return
    const oldest = messagesRef.current.find((m) => !m.status)
    if (!oldest) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    const res = await socketCall(socket, 'load-older', { peerId, before : oldest.createdAt })
    if (res.ok) {
      const el = scrollRef.current
      pendingScroll.current = { preserve : el.scrollHeight, top : el.scrollTop }
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => String(m._id)))
        return [...res.messages.filter((m) => !ids.has(String(m._id))), ...prev]
      })
      setHasMore(res.hasMore)
    }
    loadingOlderRef.current = false
    setLoadingOlder(false)
  }, [socket, peerId])

  const jumpTo = useCallback(async (target) => {
    if (!target?._id) return
    const id = String(target._id)
    if (isPhone() || !isWide()) setPanel((p) => (p ? null : p))
    if (document.getElementById(`msg-${id}`)) {
      document.getElementById(`msg-${id}`).scrollIntoView({ block : 'center', behavior : 'smooth' })
      flash(id)
      return
    }
    if (!target.createdAt) return notifyError('Message is no longer available')
    const oldest = messagesRef.current.find((m) => !m.status)
    const res = await socketCall(socket, 'load-range', { peerId, from : target.createdAt, before : oldest?.createdAt })
    if (!res.ok) return notifyError(res.error)
    if (!res.messages.some((m) => String(m._id) === id)) return notifyError('Message is no longer available')
    pendingScroll.current = { toId : id }
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => String(m._id)))
      return [...res.messages.filter((m) => !ids.has(String(m._id))), ...prev].sort(byTime)
    })
    flash(id)
  }, [socket, peerId])

  useEffect(() => {
    if (!socket) return
    let alive = true
    let first = true
    setLoading(true)
    setMessages([])
    setPeer(null)
    setGroup(null)
    setConversation(null)
    setPinned([])
    setReplyTo(null)
    setEditing(null)
    setSelectMode(false)
    setSelected([])
    setUnreadMarker(null)
    setNewCount(0)
    setComposer(null)
    setText('')
    setPanel(null)
    atBottomRef.current = true

    const load = async () => {
      const res = await socketCall(socket, 'message-page', peerId)
      if (!alive) return
      if (!res.ok) {
        setLoading(false)
        notifyError(res.error)
        return
      }
      setPeer(res.peer)
      setGroup(res.group || null)
      if (res.group?.isMember) refreshGroupCall(res.group._id)
      setConversation(res.conversation)
      setPinned(res.pinned || [])
      setHasMore(res.hasMore)
      setMessages((prev) => {
        // keep unsent local messages (e.g. after a reconnect)
        const serverIds = new Set(res.messages.map((m) => m.clientId).filter(Boolean))
        const locals = prev.filter((m) => m.status && !serverIds.has(m.clientId))
        return [...res.messages, ...locals].sort(byTime)
      })

      if (first) {
        first = false
        const unread = res.messages.filter((m) => String(m.msgByUserId) !== String(me) && !m.seen && !m.deletedForEveryone)
        const jump = location.state?.jumpTo
        if (unread.length && !jump) {
          setUnreadMarker({ id : String(unread[0]._id), count : unread.length })
          pendingScroll.current = { toId : unread[0]._id, block : 'start' }
        } else {
          pendingScroll.current = 'bottom'
        }
        setLoading(false)
        if (jump) {
          if (location.state?.highlight) setSearchTerm(location.state.highlight)
          setTimeout(() => jumpTo(jump), 50)
          navigate(location.pathname, { replace : true, state : null })
        }
      }
      markSeen()
    }
    load()

    const onConnect = () => {
      load()
      // automatically retry messages that failed while offline
      messagesRef.current.filter((m) => m.status === 'failed').forEach((m) => retryRef.current?.(m))
    }

    const onNew = ({ peerId : pid, message }) => {
      if (String(pid) !== String(peerId)) return
      const mine = String(message.msgByUserId) === String(me)
      setMessages((prev) => upsert(prev, message, { keepNewer : mine }))
      if (mine || atBottomRef.current) pendingScroll.current = 'bottom'
      if (!mine) {
        markSeen()
        if (!atBottomRef.current) setNewCount((c) => c + 1)
      }
    }

    const onUpdated = ({ peerId : pid, messages : updated }) => {
      if (String(pid) !== String(peerId)) return
      setMessages((prev) => {
        let next = prev
        updated.forEach((m) => {
          const exists = next.some((x) => String(x._id) === String(m._id))
          next = exists ? next.map((x) => (String(x._id) === String(m._id) ? m : x)) : [...next, m].sort(byTime)
          if (m.deletedForEveryone) {
            next = next.map((x) => (x.replyTo && String(x.replyTo._id) === String(m._id) ? { ...x, replyTo : { ...x.replyTo, deleted : true, text : '' } } : x))
          }
        })
        return next
      })
      setPinned((prev) => {
        const ids = new Set(updated.map((m) => String(m._id)))
        return [...updated.filter((m) => m.pinned), ...prev.filter((m) => !ids.has(String(m._id)))].slice(0, 3)
      })
    }

    const onRemoved = ({ peerId : pid, ids }) => {
      if (String(pid) !== String(peerId)) return
      const set = new Set(ids.map(String))
      setMessages((prev) => prev.filter((m) => !set.has(String(m._id))))
      setPinned((prev) => prev.filter((m) => !set.has(String(m._id))))
    }

    const onStatus = ({ peerId : pid, ids, deliveredAt, seenAt, seen }) => {
      if (String(pid) !== String(peerId)) return
      const set = new Set(ids.map(String))
      setMessages((prev) => prev.map((m) => (set.has(String(m._id))
        ? { ...m, deliveredAt : m.deliveredAt || deliveredAt, ...(seen ? { seen : true, seenAt } : {}) }
        : m)))
    }

    const onConvUpdated = ({ peerId : pid, disappearAfter : value, by, byName }) => {
      if (String(pid) !== String(peerId)) return
      setConversation((c) => ({ ...(c || {}), disappearAfter : value }))
      if (byName) return // groups show a notice in the chat instead
      const label = DISAPPEAR_OPTIONS.find((o) => o.value === value)?.label
      const who = String(by) === String(me) ? 'You' : 'They'
      notify(value ? `${who} turned on disappearing messages. New messages will disappear after ${label}.` : `${who} turned off disappearing messages.`)
    }

    const onCleared = ({ peerId : pid, deleted }) => {
      if (String(pid) !== String(peerId)) return
      setMessages([])
      setPinned([])
      setHasMore(false)
      if (deleted) navigate('/')
    }

    // group name / icon / members / roles changed (or I was added / removed)
    const onGroupUpdated = ({ groupId, group : g }) => {
      if (String(groupId) !== String(peerId)) return
      setGroup(g)
      setPeer((p) => ({ ...(p || {}), _id : g._id, name : g.name, profile_pic : g.avatar, about : g.description, isGroup : true }))
    }

    const onVisible = () => { if (document.visibilityState === 'visible') markSeen() }

    socket.on('connect', onConnect)
    socket.on('message-new', onNew)
    socket.on('message-updated', onUpdated)
    socket.on('messages-removed', onRemoved)
    socket.on('messages-status', onStatus)
    socket.on('conversation-updated', onConvUpdated)
    socket.on('chat-cleared', onCleared)
    socket.on('group-updated', onGroupUpdated)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      socket.off('connect', onConnect)
      socket.off('message-new', onNew)
      socket.off('message-updated', onUpdated)
      socket.off('messages-removed', onRemoved)
      socket.off('messages-status', onStatus)
      socket.off('conversation-updated', onConvUpdated)
      socket.off('chat-cleared', onCleared)
      socket.off('group-updated', onGroupUpdated)
      document.removeEventListener('visibilitychange', onVisible)
      if (typingRef.current.sent) socket.emit('typing', { to : peerId, isTyping : false })
      typingRef.current = { sent : false, timer : null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, peerId, me])

  // refresh "last seen" when the contact goes offline
  const wasOnline = useRef(online)
  useEffect(() => {
    if (wasOnline.current && !online && socket) {
      socketCall(socket, 'get-peer', peerId).then((res) => res.ok && setPeer(res.peer))
    }
    wasOnline.current = online
  }, [online, socket, peerId])

  const onScroll = () => {
    const el = scrollRef.current
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottomRef.current = bottom
    setAtBottom(bottom)
    if (bottom) setNewCount(0)
    if (el.scrollTop < 150) loadOlder()
  }

  /* ---------------- sending ---------------- */

  const replyPreview = (m) => (m ? {
    _id : m._id, msgByUserId : m.msgByUserId, text : m.text, imageUrl : m.imageUrl, videoUrl : m.videoUrl, fileName : m.fileName, createdAt : m.createdAt
  } : null)

  const patchLocal = (clientId, patch) =>
    setMessages((prev) => prev.map((m) => (m.clientId === clientId && m.status ? { ...m, ...patch } : m)))

  const deliver = useCallback(async (clientId, payload) => {
    patchLocal(clientId, { status : 'sending', payload })
    const res = await socketCall(socket, 'send-message', payload, 20000)
    if (res.ok) {
      setMessages((prev) => upsert(prev, res.message, { keepNewer : true }))
    } else {
      patchLocal(clientId, { status : 'failed', payload })
      if (!res.timeout) notifyError(res.error)
    }
  }, [socket])

  const stopTyping = () => {
    clearTimeout(typingRef.current.timer)
    if (typingRef.current.sent) socket?.emit('typing', { to : peerId, isTyping : false })
    typingRef.current.sent = false
  }

  const onType = (value) => {
    setText(value)
    if (!socket || peer?.self || !canSend) return
    if (!typingRef.current.sent && value) {
      socket.emit('typing', { to : peerId, isTyping : true })
      typingRef.current.sent = true
    }
    clearTimeout(typingRef.current.timer)
    typingRef.current.timer = setTimeout(stopTyping, 2500)
  }

  const sendText = async () => {
    const body = text.trim()
    if (editing) {
      const target = editing
      const hasMedia = target.imageUrl || target.videoUrl || target.fileUrl
      if (!body && !hasMedia) return
      // leave edit mode right away (like WhatsApp) so the next thing typed is a new message;
      // show the new text immediately and put everything back if saving fails
      setEditing(null)
      setText('')
      const previous = { text : target.text, editedAt : target.editedAt }
      setMessages((prev) => prev.map((m) => (String(m._id) === String(target._id) ? { ...m, text : body, editedAt : new Date().toISOString() } : m)))
      const res = await socketCall(socket, 'edit-message', { messageId : target._id, text : body })
      if (!res.ok) {
        setMessages((prev) => prev.map((m) => (String(m._id) === String(target._id) ? { ...m, ...previous } : m)))
        setEditing(target)
        setText(body)
        notifyError(res.error)
      }
      return
    }
    if (!body) return
    const clientId = newClientId()
    const payload = { receiver : peerId, clientId, text : body, replyTo : replyTo?._id }
    setMessages((prev) => [...prev, {
      _id : clientId, clientId, status : 'sending', msgByUserId : me, text : body,
      createdAt : new Date().toISOString(), replyTo : replyPreview(replyTo), reactions : [], payload
    }])
    pendingScroll.current = 'bottom'
    atBottomRef.current = true
    setText('')
    setReplyTo(null)
    stopTyping()
    deliver(clientId, payload)
  }

  const startUpload = useCallback(async (item, reply) => {
    const clientId = item.id
    setMessages((prev) => upsert(prev, {
      _id : clientId, clientId, status : 'uploading', progress : 0, msgByUserId : me, text : item.caption?.trim() || '',
      createdAt : new Date().toISOString(), kind : item.kind, localPreview : item.url, fileName : item.file.name,
      fileSize : item.file.size, file : item.file, replyTo : reply ? replyPreview(reply) : null, reactions : []
    }))
    pendingScroll.current = 'bottom'
    atBottomRef.current = true
    try {
      const up = await uploadFile(item.file, { onProgress : (p) => patchLocal(clientId, { progress : p }) })
      if (!up?.url) throw new Error('upload failed')
      const media = item.kind === 'image' ? { imageUrl : up.url }
        : item.kind === 'video' ? { videoUrl : up.url }
          : { fileUrl : up.url, fileName : item.file.name, fileSize : item.file.size, fileType : item.file.type }
      deliver(clientId, { receiver : peerId, clientId, text : item.caption?.trim() || '', replyTo : reply?._id, ...media })
    } catch (error) {
      patchLocal(clientId, { status : 'failed', payload : null })
      notifyError(`Couldn't upload ${item.file.name}. Tap the message to retry.`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, peerId, deliver])

  const retry = useCallback((msg) => {
    if (msg.payload) return deliver(msg.clientId, msg.payload)
    if (msg.file) return startUpload({ id : msg.clientId, file : msg.file, kind : msg.kind, url : msg.localPreview, caption : msg.text }, msg.replyTo)
  }, [deliver, startUpload])
  const retryRef = useRef(retry)
  retryRef.current = retry

  const pickFiles = (fileList, forceDocument = false) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (files.length > 10) notifyError('You can send up to 10 files at a time')
    const ok = files.slice(0, 10).filter((f) => {
      if (f.size > MAX_UPLOAD_BYTES) { notifyError(`${f.name} is larger than 100 MB`); return false }
      return true
    })
    if (!ok.length) return
    const items = ok.map((file) => {
      const kind = forceDocument ? 'file' : kindOfFile(file)
      return { id : newClientId(), file, kind, url : kind !== 'file' ? URL.createObjectURL(file) : null, caption : '' }
    })
    setComposer((prev) => [...(prev || []), ...items])
    setComposerIndex((i) => (composer ? i : 0))
    setAttachOpen(false)
  }

  const sendComposer = () => {
    const reply = replyTo
    composer.forEach((item, i) => startUpload(item, i === 0 ? reply : null))
    setComposer(null)
    setReplyTo(null)
  }

  const removeComposerItem = (idx) => {
    setComposer((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      if (prev[idx]?.url) URL.revokeObjectURL(prev[idx].url)
      return next.length ? next : null
    })
    setComposerIndex((i) => Math.max(0, Math.min(i, (composer?.length || 1) - 2)))
  }

  /* ---------------- message actions ---------------- */

  const messageById = (id) => messagesRef.current.find((m) => String(m._id) === String(id))

  const copyMessages = async (ids) => {
    const list = ids.map(messageById).filter((m) => m?.text).sort(byTime)
    if (!list.length) return notifyError('Nothing to copy')
    const out = list.length === 1
      ? list[0].text
      : list.map((m) => `[${moment(m.createdAt).format('h:mm a, DD/MM/YYYY')}] ${authorNameOf(m.msgByUserId)}: ${m.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(out)
      notify(list.length === 1 ? 'Message copied' : `${list.length} messages copied`)
    } catch {
      notifyError("Couldn't copy. Your browser blocked clipboard access.")
    }
  }

  const starMessages = async (ids, star) => {
    const res = await socketCall(socket, 'star-messages', { messageIds : ids, star })
    if (!res.ok) notifyError(res.error)
  }

  const deleteForMe = async (ids) => {
    const removed = ids.map(messageById).filter(Boolean)
    const serverIds = removed.filter((m) => !m.status).map((m) => String(m._id))
    setMessages((prev) => prev.filter((m) => !ids.includes(String(m._id))))
    if (!serverIds.length) return
    const res = await socketCall(socket, 'delete-messages', { messageIds : serverIds, scope : 'me' })
    if (!res.ok) {
      setMessages((prev) => [...prev, ...removed].sort(byTime))
      return notifyError(res.error)
    }
    notifyAction(serverIds.length > 1 ? `${serverIds.length} messages deleted` : 'Message deleted', 'Undo', async () => {
      const undo = await socketCall(socket, 'undo-delete-for-me', { messageIds : serverIds })
      if (!undo.ok) notifyError(undo.error)
    })
  }

  const deleteForEveryone = async (ids) => {
    const res = await socketCall(socket, 'delete-messages', { messageIds : ids, scope : 'everyone' })
    if (!res.ok) notifyError(res.error)
  }

  const askDelete = (ids) => {
    const list = ids.map(messageById).filter(Boolean)
    const now = Date.now()
    // group admins can delete anyone's message for everyone (like WhatsApp)
    const canEveryone = list.length > 0 && isMember && list.every((m) =>
      (String(m.msgByUserId) === String(me) || !!group?.isAdmin) && !m.system && !m.status && !m.deletedForEveryone && now - new Date(m.createdAt).getTime() < DELETE_EVERYONE_WINDOW_MS)
    setDialog({
      type : 'delete',
      title : list.length > 1 ? `Delete ${list.length} messages?` : 'Delete message?',
      actions : [
        { label : 'Cancel', onClick : () => setDialog(null) },
        { label : 'Delete for me', danger : true, onClick : () => { setDialog(null); exitSelect(); deleteForMe(ids.map(String)) } },
        ...(canEveryone ? [{ label : 'Delete for everyone', danger : true, onClick : () => { setDialog(null); exitSelect(); deleteForEveryone(ids.map(String)) } }] : [])
      ]
    })
  }

  const showInfo = async (msg) => {
    const res = await socketCall(socket, 'message-info', { messageId : msg._id })
    if (!res.ok) return notifyError(res.error)
    setDialog({ type : 'info', msg, info : res.info })
  }

  const toggleReaction = useCallback(async (msg, emoji) => {
    const res = await socketCall(socket, 'react-message', { messageId : msg._id, emoji })
    if (!res.ok) notifyError(res.error)
  }, [socket])

  const pinMessage = async (msg, pin) => {
    const res = await socketCall(socket, 'pin-message', { messageId : msg._id, pin })
    if (!res.ok) notifyError(res.error)
    else notify(pin ? 'Message pinned' : 'Message unpinned')
  }

  const forward = async (targets) => {
    const res = await socketCall(socket, 'forward-messages', { messageIds : forwardIds, toUserIds : targets })
    if (!res.ok) return notifyError(res.error)
    if (res.failed?.length) notifyError(`Couldn't forward to ${res.failed.join(', ')}`)
    else notify(forwardIds.length > 1 ? 'Messages forwarded' : 'Message forwarded')
    setForwardIds(null)
    exitSelect()
  }

  const openMedia = useCallback((msg, list) => {
    const source = (list || messagesRef.current).filter((m) => !m.deletedForEveryone && !m.status && (m.imageUrl || m.videoUrl))
    const items = source.map((m) => ({
      type : m.videoUrl ? 'video' : 'image', url : m.imageUrl || m.videoUrl, createdAt : m.createdAt,
      caption : m.text, sender : authorNameOf(m.msgByUserId), name : undefined
    }))
    const index = Math.max(0, source.findIndex((m) => String(m._id) === String(msg._id)))
    if (items.length) setLightbox({ items, index })
  }, [authorNameOf])

  const exitSelect = () => { setSelectMode(false); setSelected([]) }

  const toggleSelect = useCallback((msg) => {
    if (msg.status || msg.system) return
    setSelected((prev) => (prev.includes(String(msg._id)) ? prev.filter((x) => x !== String(msg._id)) : [...prev, String(msg._id)]))
  }, [])

  const openMenu = useCallback((msg, anchor) => setMenu({ msg, anchor }), [])
  const openQuickReact = useCallback((msg, anchor) => setReactFor({ msg, anchor, full : false }), [])

  const menuItems = (msg) => {
    const mine = String(msg.msgByUserId) === String(me)
    const local = !!msg.status
    const deleted = msg.deletedForEveryone
    const canEdit = mine && !local && !deleted && !msg.forwarded && Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS
    const mediaUrl = msg.imageUrl || msg.videoUrl || msg.fileUrl
    return [
      { label : 'Reply', icon : <BsReply size={18} />, hidden : local || deleted || !canSend, onClick : () => { setEditing(null); setReplyTo(msg); inputRef.current?.focus() } },
      { label : 'Copy', icon : <IoCopyOutline size={17} />, hidden : !msg.text || deleted, onClick : () => copyMessages([String(msg._id)]) },
      { label : 'Edit', icon : <MdEdit size={17} />, hidden : !canEdit || !isMember || !!msg.call, onClick : () => { setReplyTo(null); setEditing(msg); setText(msg.text || ''); inputRef.current?.focus() } },
      { label : 'Forward', icon : <RiShareForwardLine size={18} />, hidden : local || deleted || !!msg.call, onClick : () => setForwardIds([String(msg._id)]) },
      { label : msg.pinned ? 'Unpin' : 'Pin', icon : <BsPinAngle size={16} />, hidden : local || deleted || !canEditInfo, onClick : () => pinMessage(msg, !msg.pinned) },
      { label : msg.starred ? 'Unstar' : 'Star', icon : msg.starred ? <IoStar size={17} /> : <IoStarOutline size={17} />, hidden : local || deleted, onClick : () => starMessages([String(msg._id)], !msg.starred) },
      { label : 'Download', icon : <IoDownloadOutline size={18} />, hidden : !mediaUrl || deleted || local, onClick : () => downloadMedia(mediaUrl, msg.fileName || undefined) },
      { label : 'Message info', icon : <IoInformationCircleOutline size={19} />, hidden : !mine || local || deleted || !!msg.call, onClick : () => showInfo(msg) },
      { label : 'Select', icon : <MdOutlineChecklist size={18} />, hidden : local, onClick : () => { setSelectMode(true); setSelected([String(msg._id)]) } },
      { label : 'Delete', icon : <IoTrashOutline size={18} />, danger : true, onClick : () => askDelete([String(msg._id)]) },
    ]
  }

  /* ---------------- chat-level actions ---------------- */

  const chatAction = async (action) => {
    const res = await socketCall(socket, 'chat-action', { peerId, action })
    if (!res.ok) return notifyError(res.error)
    if (action === 'mute') notify('Chat muted')
    if (action === 'unmute') notify('Chat unmuted')
    if (action === 'clear') notify('Chat cleared')
  }

  const exitGroup = () => setDialog({
    type : 'confirm', title : `Exit "${peerName}"?`,
    body : 'You will no longer receive messages from this group. Group members will see that you left.',
    actions : [{ label : 'Cancel', onClick : () => setDialog(null) }, {
      label : 'Exit group', danger : true, onClick : async () => {
        setDialog(null)
        const res = await socketCall(socket, 'group-leave', { groupId : peerId })
        if (!res.ok) notifyError(res.error)
      }
    }]
  })

  const confirmChatAction = (action) => {
    const name = peerName
    if (isGroupChat) {
      const copy = action === 'clear'
        ? { title : 'Clear this chat?', body : 'Messages in this group will be removed for you only.', label : 'Clear chat' }
        : { title : `Delete "${name}"?`, body : 'The group and its messages will be removed from your chat list.', label : 'Delete group' }
      setDialog({
        type : 'confirm', title : copy.title, body : copy.body,
        actions : [{ label : 'Cancel', onClick : () => setDialog(null) }, { label : copy.label, danger : true, onClick : () => { setDialog(null); chatAction(action) } }]
      })
      return
    }
    const copy = action === 'clear'
      ? { title : 'Clear this chat?', body : `Messages will be removed for you only. ${name} keeps their copy.`, label : 'Clear chat' }
      : { title : `Delete chat with ${name}?`, body : `The chat will be removed from your list. ${name} keeps their copy.`, label : 'Delete chat' }
    setDialog({
      type : 'confirm', title : copy.title, body : copy.body,
      actions : [{ label : 'Cancel', onClick : () => setDialog(null) }, { label : copy.label, danger : true, onClick : () => { setDialog(null); chatAction(action) } }]
    })
  }

  const acceptRequest = async () => {
    const res = await socketCall(socket, 'chat-action', { peerId, action : 'accept' })
    if (!res.ok) return notifyError(res.error)
    setConversation((c) => ({ ...(c || {}), request : false }))
    notify('Request accepted')
  }

  const setDisappearing = async (seconds) => {
    const res = await socketCall(socket, 'set-disappearing', { peerId, seconds })
    if (!res.ok) notifyError(res.error)
  }

  const toggleBlock = () => {
    const block = !blocked
    const run = async () => {
      setDialog(null)
      const res = await socketCall(socket, 'block-user', { userId : peerId, block })
      if (!res.ok) return notifyError(res.error)
      dispatch(setBlocked(res.blocked))
      setPeer((p) => ({ ...p, blockedByMe : block }))
      notify(block ? `${peerName} blocked` : `${peerName} unblocked`)
    }
    if (!block) return run()
    setDialog({
      type : 'confirm', title : `Block ${peerName}?`,
      body : "Blocked contacts can't see your online status or last seen, and their messages won't be delivered to you. They won't be notified.",
      actions : [{ label : 'Cancel', onClick : () => setDialog(null) }, { label : 'Block', danger : true, onClick : run }]
    })
  }

  const headerItems = isGroupChat ? [
    { label : 'Group info', icon : <IoInformationCircleOutline size={19} />, onClick : () => setPanel('info') },
    { label : 'Search', icon : <IoSearchOutline size={18} />, onClick : () => setPanel('search') },
    { label : 'Select messages', icon : <MdOutlineChecklist size={18} />, hidden : !messages.length, onClick : () => setSelectMode(true) },
    { label : muted ? 'Unmute notifications' : 'Mute notifications', icon : muted ? <IoNotificationsOutline size={18} /> : <IoNotificationsOffOutline size={18} />, hidden : !listConv, onClick : () => chatAction(muted ? 'unmute' : 'mute') },
    { label : 'Disappearing messages', icon : <IoTimerOutline size={18} />, hidden : !canEditInfo, onClick : () => setPanel('info') },
    { label : 'Clear chat', icon : <MdOutlineCleaningServices size={18} />, hidden : !messages.length, onClick : () => confirmChatAction('clear') },
    { label : 'Exit group', icon : <IoExitOutline size={18} />, danger : true, hidden : !isMember, onClick : exitGroup },
    { label : 'Delete group', icon : <IoTrashOutline size={18} />, danger : true, hidden : isMember, onClick : () => confirmChatAction('delete') },
  ] : [
    { label : 'Contact info', icon : <IoInformationCircleOutline size={19} />, onClick : () => setPanel('info') },
    { label : 'Search', icon : <IoSearchOutline size={18} />, onClick : () => setPanel('search') },
    { label : 'Select messages', icon : <MdOutlineChecklist size={18} />, hidden : !messages.length, onClick : () => setSelectMode(true) },
    { label : muted ? 'Unmute notifications' : 'Mute notifications', icon : muted ? <IoNotificationsOutline size={18} /> : <IoNotificationsOffOutline size={18} />, hidden : !listConv, onClick : () => chatAction(muted ? 'unmute' : 'mute') },
    { label : 'Disappearing messages', icon : <IoTimerOutline size={18} />, hidden : peer?.self, onClick : () => setPanel('info') },
    { label : 'Clear chat', icon : <MdOutlineCleaningServices size={18} />, hidden : !messages.length, onClick : () => confirmChatAction('clear') },
    { label : 'Delete chat', icon : <IoTrashOutline size={18} />, danger : true, hidden : !listConv, onClick : () => confirmChatAction('delete') },
    { label : blocked ? 'Unblock' : 'Block', icon : <MdBlock size={18} />, danger : !blocked, hidden : peer?.self, onClick : toggleBlock },
  ]

  /* ---------------- render helpers ---------------- */

  // group header: "Alice, Bob, You" like WhatsApp
  const memberLine = group ? [
    ...(group.members || []).filter((m) => String(m._id) !== String(me)).map((m) => m.name),
    ...(group.isMember ? ['You'] : [])
  ].join(', ') : ''

  const status = isTyping ? (typeof typingValue === 'string' ? `${typingValue} is typing…` : 'typing…')
    : isGroupChat ? (memberLine || 'click here for group info')
    : peer?.self ? 'Message yourself'
      : online ? 'online'
        : peer?.lastSeen ? formatLastSeen(peer.lastSeen)
          : 'click here for contact info'

  const selectedMsgs = selected.map(messageById).filter(Boolean)
  const canEveryoneSelected = selectedMsgs.length > 0
  const allStarred = selectedMsgs.length > 0 && selectedMsgs.every((m) => m.starred)
  const pinnedNow = pinned[pinIndex % Math.max(pinned.length, 1)]
  const reactingMsg = reactFor && messageById(reactFor.msg._id)
  const wallpaperProps = wallpaper.className ? { className : wallpaper.className } : { style : wallpaper.style }

  const rendered = useMemo(() => messages.map((msg, index) => {
    const prev = messages[index - 1]
    const mine = String(msg.msgByUserId) === String(me)
    const newDay = !prev || !moment(prev.createdAt).isSame(msg.createdAt, 'day')
    const firstOfGroup = newDay || !prev || !!prev.system || String(prev.msgByUserId) !== String(msg.msgByUserId)
    return { msg, mine : mine && !msg.system, newDay, firstOfGroup }
  }), [messages, me])

  return (
    <div className='relative flex h-full'>
      <div
        className='relative flex min-w-0 flex-1 flex-col'
        onDragEnter={(e) => { if (canSend && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
        onDragOver={(e) => { if (dragOver) e.preventDefault() }}
      >
        {/* header / selection bar */}
        {selectMode ? (
          <header className='z-10 flex h-[59px] shrink-0 items-center justify-between gap-2 bg-wa-panel px-2 sm:px-4'>
            <div className='flex items-center gap-3'>
              <button onClick={exitSelect} className='wa-icon-btn' title='Cancel'><IoClose size={22} /></button>
              <span className='text-[15px] text-wa-text'>{selected.length} selected</span>
            </div>
            <div className='flex items-center gap-1'>
              <button disabled={!selected.length} onClick={() => starMessages(selected, !allStarred).then(exitSelect)} className='wa-icon-btn disabled:opacity-40' title={allStarred ? 'Unstar' : 'Star'}>{allStarred ? <IoStar size={19} /> : <IoStarOutline size={19} />}</button>
              <button disabled={!selected.length} onClick={() => copyMessages(selected).then(exitSelect)} className='wa-icon-btn disabled:opacity-40' title='Copy'><IoCopyOutline size={19} /></button>
              <button disabled={!selected.length || selectedMsgs.some((m) => m.deletedForEveryone)} onClick={() => setForwardIds(selected)} className='wa-icon-btn disabled:opacity-40' title='Forward'><RiShareForwardLine size={20} /></button>
              <button disabled={!canEveryoneSelected} onClick={() => askDelete(selected)} className='wa-icon-btn disabled:opacity-40' title='Delete'><IoTrashOutline size={19} /></button>
            </div>
          </header>
        ) : (
          <header className='z-10 flex h-[59px] shrink-0 items-center justify-between bg-wa-panel px-2 sm:px-4'>
            <div className='flex min-w-0 flex-1 items-center gap-2 sm:gap-3'>
              <Link to={"/"} className='wa-icon-btn md:hidden' title='Back'>
                <IoArrowBack size={22} />
              </Link>
              <button onClick={() => setPanel('info')} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
                {peer ? (
                  <Avatar width={40} height={40} imageUrl={peer.profile_pic} name={peerName} userId={isGroupChat || peer.isGroup ? undefined : peer._id} group={isGroupChat || !!peer.isGroup} />
                ) : <span className='h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#dfe5e7]' />}
                <span className='min-w-0'>
                  <span className='block truncate text-base leading-5 text-wa-text'>{peer ? `${peerName}${peer.self ? ' (You)' : ''}` : ' '}</span>
                  <span className={`block truncate text-[13px] leading-5 ${isTyping ? 'text-wa-green' : 'text-wa-muted'}`}>{peer ? status : ' '}</span>
                </span>
              </button>
            </div>
            <div className='flex items-center gap-1'>
              {disappearAfter > 0 && <IoTimerOutline size={18} className='mr-1 text-[#54656f]' title='Disappearing messages on' />}
              {isGroupChat && isMember && (() => {
                const running = groupCallStates[String(peerId)]
                const groupInfo = { _id : group._id, name : group.name, avatar : group.avatar }
                if (running && !inCall) {
                  return (
                    <button onClick={() => joinGroupCall(groupInfo, running)} className='mr-1 flex h-9 items-center gap-1.5 rounded-full bg-wa-green px-4 text-sm font-medium text-white hover:bg-wa-greenDark' title='Join call'>
                      {running.type === 'video' ? <IoVideocamOutline size={18} /> : <IoCallOutline size={16} />} Join · {running.participants.length}
                    </button>
                  )
                }
                return (
                  <>
                    <button className='wa-icon-btn' title='Group video call' onClick={() => startGroupCall(groupInfo, 'video')}><IoVideocamOutline size={22} /></button>
                    <button className='wa-icon-btn' title='Group voice call' onClick={() => startGroupCall(groupInfo, 'audio')}><IoCallOutline size={20} /></button>
                  </>
                )
              })()}
              {peer && !isGroupChat && !peer.isGroup && !peer.self && !blocked && (
                <>
                  <button className='wa-icon-btn' title='Video call' onClick={() => startCall({ ...peer, name : peerName }, 'video')}><IoVideocamOutline size={22} /></button>
                  <button className='wa-icon-btn' title='Voice call' onClick={() => startCall({ ...peer, name : peerName }, 'audio')}><IoCallOutline size={20} /></button>
                </>
              )}
              <button className='wa-icon-btn hidden sm:flex' title='Search' onClick={() => setPanel('search')}><IoSearchOutline size={20} /></button>
              <button className='wa-icon-btn' title='Menu' onClick={(e) => setHeaderMenu(e.currentTarget.getBoundingClientRect())}>
                <HiDotsVertical size={20} />
              </button>
            </div>
          </header>
        )}

        {/* pinned messages bar */}
        {pinned.length > 0 && pinnedNow && !selectMode && (
          <button
            onClick={() => { jumpTo(pinnedNow); setPinIndex((i) => i + 1) }}
            className='z-[5] flex h-12 shrink-0 items-center gap-3 border-b border-wa-border bg-white px-4 text-left shadow-sm'
          >
            <span className='flex h-full flex-col justify-center gap-0.5'>
              {pinned.map((p, i) => <span key={p._id} className={`w-[3px] flex-1 rounded ${i === pinIndex % pinned.length ? 'bg-wa-green' : 'bg-[#d1d7db]'}`} />)}
            </span>
            <BsPinAngleFill size={14} className='shrink-0 text-[#8696a0]' />
            <span className='min-w-0 flex-1 truncate text-sm text-wa-text'>
              {pinnedNow.text ? plainPreview(pinnedNow.text) : pinnedNow.imageUrl ? '📷 Photo' : pinnedNow.videoUrl ? '🎥 Video' : pinnedNow.fileName ? `📄 ${pinnedNow.fileName}` : 'Message'}
            </span>
          </button>
        )}

        {/* messages */}
        <section ref={scrollRef} onScroll={onScroll} className={`relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar ${wallpaperProps.className || ''}`} style={wallpaperProps.style}>
          <div ref={contentRef} className='flex flex-col px-3 py-3 sm:px-[5%] xl:px-[7%]'>
            {loadingOlder && <div className='mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' />}

            {disappearAfter > 0 && (
              <div className='mx-auto mb-2 flex max-w-sm items-center gap-2 rounded-lg bg-[#ffeecd] px-3 py-1.5 text-center text-[12.5px] text-[#54656f] shadow-bubble'>
                <IoTimerOutline size={15} className='shrink-0' /> New messages will disappear from this chat after {DISAPPEAR_OPTIONS.find((o) => o.value === disappearAfter)?.label}.
              </div>
            )}

            {loading && <MessagesSkeleton />}

            {!loading && messages.length === 0 && (
              <div className='mx-auto mt-4 max-w-sm rounded-lg bg-[#ffeecd] px-4 py-2 text-center text-[12.5px] text-[#54656f] shadow-bubble'>
                No messages yet. Say hi to {peerName || 'your friend'}! 👋
              </div>
            )}

            {!loading && rendered.map(({ msg, mine, newDay, firstOfGroup }) => (
              <React.Fragment key={msg.clientId && msg.status ? msg.clientId : msg._id}>
                {newDay && (
                  <div className='sticky top-1 z-[6] my-3 flex justify-center'>
                    <span className='rounded-lg bg-white px-3 py-1.5 text-[12.5px] uppercase text-[#54656f] shadow-bubble'>{formatDayLabel(msg.createdAt)}</span>
                  </div>
                )}
                {unreadMarker?.id === String(msg._id) && (
                  <div className='-mx-3 my-3 bg-white/60 py-1.5 text-center sm:-mx-[5%] xl:-mx-[7%]'>
                    <span className='rounded-full bg-white px-4 py-1 text-[12.5px] uppercase text-[#54656f] shadow-bubble'>
                      {unreadMarker.count} unread message{unreadMarker.count > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {msg.system ? <div className='mt-2'><SystemNotice text={systemText(msg, me)} /></div> : (
                <div className={firstOfGroup ? 'mt-3' : 'mt-0.5'}>
                  <MessageBubble
                    msg={msg}
                    mine={mine}
                    firstOfGroup={firstOfGroup}
                    authorNameOf={authorNameOf}
                    selectMode={selectMode}
                    selected={selected.includes(String(msg._id))}
                    highlighted={highlightId === String(msg._id)}
                    searchTerm={searchTerm}
                    onToggleSelect={toggleSelect}
                    onOpenMenu={openMenu}
                    onOpenMedia={openMedia}
                    onJumpTo={jumpTo}
                    onRetry={retry}
                    onToggleReaction={toggleReaction}
                    onQuickReact={openQuickReact}
                    onCallBack={isGroupChat
                      ? (isMember ? (type) => startGroupCall({ _id : group._id, name : group.name, avatar : group.avatar }, type) : undefined)
                      : !blocked && peer && !peer.self ? (type) => startCall({ ...peer, name : peerName }, type) : undefined}
                    authorLabel={isGroupChat && !mine && firstOfGroup ? authorLabelOf(msg.msgByUserId) : undefined}
                    authorColor={nameColor(msg.msgByUserId)}
                  />
                </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* jump to latest */}
        {!atBottom && !loading && (
          <button
            onClick={() => { scrollToBottom(true); setNewCount(0) }}
            className='absolute bottom-[78px] right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#54656f] shadow-menu hover:bg-wa-hover'
            title='Scroll to latest'
          >
            <IoChevronDown size={22} />
            {newCount > 0 && (
              <span className='absolute -top-1.5 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-wa-badge px-1 text-[11px] font-medium text-white'>{newCount}</span>
            )}
          </button>
        )}

        {/* reply / edit bar */}
        {(replyTo || editing) && canSend && (
          <div className='flex shrink-0 items-center gap-2 bg-wa-panel px-3 pt-2 sm:px-4'>
            <div className='min-w-0 flex-1 rounded-lg bg-white/60 p-1'>
              {replyTo ? (
                <ReplyQuote reply={replyPreview(replyTo)} mine={false} authorName={authorNameOf(replyTo.msgByUserId)} onClick={() => jumpTo(replyTo)} compact />
              ) : (
                <div className='flex overflow-hidden rounded-md bg-[#f0f2f5]'>
                  <span className='w-1 shrink-0 bg-wa-green' />
                  <div className='min-w-0 px-2 py-1.5'>
                    <p className='flex items-center gap-1 text-[13px] font-medium text-wa-green'><MdEdit size={14} /> Edit message</p>
                    <p className='truncate text-[13px] text-wa-muted'>{plainPreview(editing.text) || 'Caption'}</p>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText('') } }} className='wa-icon-btn' title='Cancel'><IoClose size={20} /></button>
          </div>
        )}

        {/* composer */}
        {isRequest && !blocked ? (
          <footer className='shrink-0 bg-wa-panel px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-center'>
            <p className='text-sm text-wa-text'><b className='font-medium'>{peerName}</b> is not in your contacts.</p>
            <p className='mt-0.5 text-xs text-wa-muted'>They won't see that you read their messages until you accept.</p>
            <div className='mt-3 flex flex-wrap justify-center gap-2'>
              <button onClick={toggleBlock} className='h-9 rounded-full border border-[#d1d7db] bg-white px-5 text-sm font-medium text-red-600 hover:bg-wa-hover'>Block</button>
              <button onClick={() => setPanel('info')} className='h-9 rounded-full border border-[#d1d7db] bg-white px-5 text-sm font-medium text-wa-teal hover:bg-wa-hover'>Add to contacts</button>
              <button onClick={acceptRequest} className='h-9 rounded-full bg-wa-teal px-6 text-sm font-medium text-white hover:bg-[#017561]'>Accept</button>
            </div>
          </footer>
        ) : !canSend ? (
          <footer className='flex min-h-[62px] shrink-0 items-center justify-center gap-2 bg-wa-panel px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm text-wa-muted'>
            {blocked ? (
              <>
                You blocked this contact.
                <button onClick={toggleBlock} className='font-medium text-wa-green hover:underline'>Unblock</button>
              </>
            ) : !isMember ? "You can't send messages to this group because you're no longer a member."
              : <span>Only <button onClick={() => setPanel('info')} className='font-medium text-wa-green hover:underline'>admins</button> can send messages.</span>}
          </footer>
        ) : (
          <footer className='relative flex min-h-[62px] shrink-0 items-end gap-1 bg-wa-panel px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:gap-2 sm:px-4'>
            <div className='relative mb-[1px] flex items-center'>
              <button onClick={() => { setEmojiOpen((o) => !o); setAttachOpen(false) }} className={`wa-icon-btn ${emojiOpen ? 'text-wa-green' : ''}`} title='Emoji'>
                <MdOutlineEmojiEmotions size={24} />
              </button>
              {emojiOpen && (
                <EmojiPicker
                  className='absolute bottom-12 left-0'
                  onClose={() => setEmojiOpen(false)}
                  onSelect={(e) => {
                    const el = inputRef.current
                    const start = el?.selectionStart ?? text.length
                    const end = el?.selectionEnd ?? text.length
                    const next = text.slice(0, start) + e + text.slice(end)
                    onType(next)
                    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + e.length, start + e.length) })
                  }}
                />
              )}
              {!editing && (
                <button onClick={() => { setAttachOpen((o) => !o); setEmojiOpen(false) }} className={`wa-icon-btn ${attachOpen ? 'bg-black/10' : ''}`} title='Attach'>
                  <FaPlus size={20} className={`transition-transform duration-200 ${attachOpen ? 'rotate-45' : ''}`} />
                </button>
              )}
              {attachOpen && (
                <>
                  <div className='fixed inset-0 z-20' onClick={() => setAttachOpen(false)} />
                  <div className='absolute bottom-12 left-8 z-30 w-56 origin-bottom-left animate-pop rounded-2xl bg-white py-2 shadow-menu'>
                    <AttachItem color='#7f66ff' icon={<IoDocumentText size={16} />} label='Document' onClick={() => docInput.current?.click()} />
                    <AttachItem color='#007bfc' icon={<IoImages size={16} />} label='Photos & videos' onClick={() => imageInput.current?.click()} />
                    <AttachItem color='#ff2e74' icon={<IoCamera size={16} />} label='Camera' onClick={() => cameraInput.current?.click()} />
                  </div>
                </>
              )}
              <input ref={imageInput} type='file' accept='image/*,video/*' multiple className='hidden' onChange={(e) => { pickFiles(e.target.files); e.target.value = '' }} />
              <input ref={docInput} type='file' multiple className='hidden' onChange={(e) => { pickFiles(e.target.files, true); e.target.value = '' }} />
              <input ref={cameraInput} type='file' accept='image/*,video/*' capture='environment' className='hidden' onChange={(e) => { pickFiles(e.target.files); e.target.value = '' }} />
            </div>

            <AutoTextarea
              inputRef={inputRef}
              value={text}
              placeholder={editing ? 'Edit message' : 'Type a message'}
              onChange={onType}
              onPaste={(e) => { if (e.clipboardData?.files?.length) { e.preventDefault(); pickFiles(e.clipboardData.files) } }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !coarsePointer()) { e.preventDefault(); sendText() }
                if (e.key === 'Escape') { setReplyTo(null); if (editing) { setEditing(null); setText('') } }
              }}
            />

            <button
              onClick={sendText}
              disabled={!text.trim() && !editing}
              className={`mb-[1px] flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${text.trim() ? 'bg-wa-green text-white hover:bg-wa-greenDark' : 'bg-wa-green/60 text-white sm:bg-transparent sm:text-[#8696a0]'}`}
              title={editing ? 'Save' : 'Send'}
            >
              {editing ? <IoCheckmark size={22} /> : <IoMdSend size={20} />}
            </button>
          </footer>
        )}

        {/* drop zone */}
        {dragOver && (
          <div
            className='absolute inset-0 z-40 flex items-center justify-center bg-wa-panel/90 p-6'
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFiles(e.dataTransfer.files) }}
          >
            <div className='pointer-events-none flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-wa-green text-wa-teal'>
              <IoAdd size={48} />
              <p className='mt-2 text-lg'>Drop files to send</p>
            </div>
          </div>
        )}

        {/* media / document preview before sending */}
        {composer && (
          <MediaComposer
            items={composer}
            index={Math.min(composerIndex, composer.length - 1)}
            setIndex={setComposerIndex}
            onCaption={(i, caption) => setComposer((prev) => prev.map((it, j) => (j === i ? { ...it, caption } : it)))}
            onRemove={removeComposerItem}
            onAddMore={() => imageInput.current?.click()}
            onClose={() => { composer.forEach((c) => c.url && URL.revokeObjectURL(c.url)); setComposer(null) }}
            onSend={sendComposer}
            peerName={peerName}
          />
        )}
      </div>

      {/* side panel: contact info / search */}
      {panel && peer && (
        <aside className='absolute inset-0 z-30 border-l border-wa-border xl:static xl:z-auto xl:w-[380px] xl:shrink-0 2xl:w-[420px]'>
          {panel === 'info' && group ? (
            <GroupInfo
              socket={socket}
              group={group}
              conversation={listConv ? { ...conversation, muted, disappearAfter } : conversation}
              onClose={() => setPanel(null)}
              onOpenMedia={(m, list) => openMedia(m, list)}
              onJump={jumpTo}
              onToggleMute={(v) => chatAction(v ? 'mute' : 'unmute')}
              onSetDisappearing={setDisappearing}
              onClear={() => confirmChatAction('clear')}
              onExit={exitGroup}
              onDelete={() => confirmChatAction('delete')}
              onMessageMember={(id) => navigate('/' + id)}
            />
          ) : panel === 'info' ? (
            <ContactInfo
              socket={socket}
              peer={peer}
              online={online}
              conversation={listConv ? { ...conversation, muted, disappearAfter } : conversation}
              onClose={() => setPanel(null)}
              onOpenMedia={(m, list) => openMedia(m, list)}
              onJump={jumpTo}
              onToggleMute={(v) => chatAction(v ? 'mute' : 'unmute')}
              onSetDisappearing={setDisappearing}
              onToggleBlock={toggleBlock}
              onClear={() => confirmChatAction('clear')}
              onDelete={() => confirmChatAction('delete')}
            />
          ) : (
            <ChatSearch
              socket={socket}
              peerId={peerId}
              peerName={peerName}
              myId={me}
              onClose={() => { setPanel(null); setSearchTerm('') }}
              onTermChange={setSearchTerm}
              onSelect={(m) => jumpTo(m)}
            />
          )}
        </aside>
      )}

      {/* overlays */}
      {menu && (
        <PopoverMenu
          anchor={menu.anchor}
          align={String(menu.msg.msgByUserId) === String(me) ? 'right' : 'left'}
          items={menuItems(menu.msg)}
          onClose={() => setMenu(null)}
          header={!menu.msg.status && !menu.msg.deletedForEveryone && !blocked && isMember ? (
            <div className='mb-1 flex items-center justify-around border-b border-wa-border px-3 pb-2'>
              {QUICK_REACTIONS.map((e) => (
                <button key={e} onClick={() => { toggleReaction(menu.msg, e); setMenu(null) }} className='flex h-9 w-9 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-125 hover:bg-wa-panel'>{e}</button>
              ))}
              <button onClick={() => { setReactFor({ msg : menu.msg, anchor : menu.anchor, full : true }); setMenu(null) }} className='flex h-9 w-9 items-center justify-center rounded-full bg-wa-panel text-[#54656f]' title='More reactions'><IoAdd size={20} /></button>
            </div>
          ) : null}
        />
      )}

      {reactFor && reactingMsg && (
        <ReactionPopover
          anchor={reactFor.anchor}
          full={reactFor.full}
          current={(reactingMsg.reactions || []).find((r) => String(r.userId) === String(me))?.emoji}
          onPick={(e) => { toggleReaction(reactingMsg, e); setReactFor(null) }}
          onMore={() => setReactFor((r) => ({ ...r, full : true }))}
          onClose={() => setReactFor(null)}
        />
      )}

      {headerMenu && <PopoverMenu anchor={headerMenu} items={headerItems} onClose={() => setHeaderMenu(null)} />}

      {lightbox && <Lightbox items={lightbox.items} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}

      {forwardIds && <ForwardDialog count={forwardIds.length} onClose={() => setForwardIds(null)} onForward={forward} />}

      {dialog?.type === 'delete' && <Dialog title={dialog.title} onClose={() => setDialog(null)} actions={dialog.actions} />}
      {dialog?.type === 'confirm' && <Dialog title={dialog.title} onClose={() => setDialog(null)} actions={dialog.actions}>{dialog.body}</Dialog>}
      {dialog?.type === 'info' && dialog.info.group && (
        <Dialog title='Message info' onClose={() => setDialog(null)} actions={[{ label : 'Close', onClick : () => setDialog(null) }]}>
          <div className='mb-4 rounded-lg bg-wa-chat p-3'>
            <p className='line-clamp-3 text-sm text-wa-text'>{dialog.msg.text || (dialog.msg.imageUrl ? '📷 Photo' : dialog.msg.videoUrl ? '🎥 Video' : `📄 ${dialog.msg.fileName}`)}</p>
          </div>
          <div className='max-h-[50dvh] overflow-y-auto scrollbar'>
            <ReceiptList icon={<BsCheck2All size={18} className='text-wa-tick' />} title='Read by' people={dialog.info.readBy} nameOf={names.name} />
            <ReceiptList icon={<BsCheck2All size={18} className='text-[#8696a0]' />} title='Delivered to' people={dialog.info.deliveredTo} nameOf={names.name} />
            {dialog.info.remaining > 0 && <p className='py-2 text-sm text-wa-muted'>{dialog.info.remaining} remaining</p>}
            <InfoRow icon={<BsCheck2 size={18} className='text-[#8696a0]' />} label='Sent' value={formatFullDate(dialog.info.sentAt)} />
          </div>
        </Dialog>
      )}
      {dialog?.type === 'info' && !dialog.info.group && (
        <Dialog title='Message info' onClose={() => setDialog(null)} actions={[{ label : 'Close', onClick : () => setDialog(null) }]}>
          <div className='mb-4 rounded-lg bg-wa-chat p-3'>
            <p className='line-clamp-3 text-sm text-wa-text'>{dialog.msg.text || (dialog.msg.imageUrl ? '📷 Photo' : dialog.msg.videoUrl ? '🎥 Video' : `📄 ${dialog.msg.fileName}`)}</p>
          </div>
          <InfoRow icon={<BsCheck2All size={18} className='text-wa-tick' />} label='Read' value={dialog.info.receiptsHidden ? 'Hidden (read receipts are off)' : dialog.info.seenAt ? formatFullDate(dialog.info.seenAt) : '—'} />
          <InfoRow icon={<BsCheck2All size={18} className='text-[#8696a0]' />} label='Delivered' value={dialog.info.deliveredAt ? formatFullDate(dialog.info.deliveredAt) : '—'} />
          <InfoRow icon={<BsCheck2 size={18} className='text-[#8696a0]' />} label='Sent' value={formatFullDate(dialog.info.sentAt)} />
        </Dialog>
      )}
    </div>
  )
}

/* ---------------- small pieces ---------------- */

const AttachItem = ({ color, icon, label, onClick }) => (
  <button onClick={onClick} className='flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14.5px] text-[#3b4a54] hover:bg-wa-panel'>
    <span className='flex h-8 w-8 items-center justify-center rounded-full text-white' style={{ backgroundColor : color }}>{icon}</span>
    {label}
  </button>
)

const AutoTextarea = ({ inputRef, value, onChange, onKeyDown, onPaste, placeholder }) => {
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [value, inputRef])
  return (
    <textarea
      ref={inputRef}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      placeholder={placeholder}
      maxLength={4096}
      className='mb-[1px] min-h-[42px] w-full min-w-0 resize-none rounded-3xl bg-white px-4 py-[10px] text-base leading-[22px] text-wa-text outline-none scrollbar placeholder:text-[#8696a0] sm:rounded-lg sm:text-[15px]'
    />
  )
}

// "Read by" / "Delivered to" in a group's message info
const ReceiptList = ({ icon, title, people, nameOf }) => (
  <div className='border-b border-wa-border py-3'>
    <p className='mb-1 flex items-center gap-2 text-[15px] text-wa-text'>{icon} {title}</p>
    {people.length === 0 && <p className='pl-7 text-sm text-wa-muted'>—</p>}
    {people.map((p) => (
      <div key={p._id} className='flex items-center gap-3 py-1.5 pl-7'>
        <Avatar width={32} height={32} name={nameOf(p)} imageUrl={p.profile_pic} />
        <span className='min-w-0 flex-1 truncate text-sm text-wa-text'>{nameOf(p)}</span>
        <span className='shrink-0 text-xs text-wa-muted'>{formatFullDate(p.at)}</span>
      </div>
    ))}
  </div>
)

const InfoRow = ({ icon, label, value }) => (
  <div className='flex items-start gap-3 border-b border-wa-border py-3 last:border-0'>
    <span className='mt-0.5'>{icon}</span>
    <div>
      <p className='text-[15px] text-wa-text'>{label}</p>
      <p className='text-sm text-wa-muted'>{value}</p>
    </div>
  </div>
)

const ReactionPopover = ({ anchor, full, current, onPick, onMore, onClose }) => {
  const phone = window.matchMedia('(max-width: 639px)').matches
  const style = phone || !anchor ? {} : {
    left : Math.min(Math.max(8, anchor.left - 140), window.innerWidth - 350),
    top : anchor.top > 380 ? undefined : anchor.bottom + 6,
    bottom : anchor.top > 380 ? window.innerHeight - anchor.top + 6 : undefined
  }
  return (
    <div className='fixed inset-0 z-50' onClick={onClose}>
      <div className={phone ? 'absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))]' : 'absolute'} style={style} onClick={(e) => e.stopPropagation()}>
        {full ? (
          <EmojiPicker onSelect={onPick} onClose={onClose} />
        ) : (
          <div className='flex animate-pop items-center gap-1 rounded-full bg-white px-2 py-1.5 shadow-menu'>
            {QUICK_REACTIONS.map((e) => (
              <button key={e} onClick={() => onPick(e)} className={`flex h-9 w-9 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-125 ${current === e ? 'bg-wa-panel' : ''}`}>{e}</button>
            ))}
            <button onClick={onMore} className='flex h-9 w-9 items-center justify-center rounded-full bg-wa-panel text-[#54656f]' title='More'><IoAdd size={20} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

const MediaComposer = ({ items, index, setIndex, onCaption, onRemove, onAddMore, onClose, onSend, peerName }) => {
  const item = items[index]
  if (!item) return null
  return (
    <div className='absolute inset-0 z-40 flex flex-col bg-[#e9edef]'>
      <header className='flex h-[59px] shrink-0 items-center justify-between px-3 sm:px-4'>
        <button onClick={onClose} className='wa-icon-btn' title='Cancel'><IoClose size={24} /></button>
        <p className='truncate px-2 text-sm text-wa-muted'>{item.file.name}</p>
        <button onClick={() => onRemove(index)} className='wa-icon-btn' title='Remove'><IoTrashOutline size={20} /></button>
      </header>
      <div className='flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6'>
        {item.kind === 'image' && <img src={item.url} alt='' className='max-h-full max-w-full rounded-lg object-contain shadow-bubble' />}
        {item.kind === 'video' && <video src={item.url} controls playsInline className='max-h-full max-w-full rounded-lg bg-black shadow-bubble' />}
        {item.kind === 'file' && (
          <div className='flex flex-col items-center gap-3 rounded-xl bg-white px-10 py-8 text-center shadow-bubble'>
            <span className='flex h-16 w-14 items-center justify-center rounded-md bg-[#e2564b] text-sm font-bold text-white'>{fileExtension(item.file.name).slice(0, 4)}</span>
            <p className='max-w-[240px] break-words text-sm text-wa-text'>{item.file.name}</p>
            <p className='text-xs text-wa-muted'>{formatBytes(item.file.size)}</p>
          </div>
        )}
      </div>
      <div className='shrink-0 px-3 sm:px-6'>
        <input
          value={item.caption}
          onChange={(e) => onCaption(index, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder='Add a caption'
          maxLength={1024}
          className='mx-auto block h-11 w-full max-w-xl rounded-lg bg-white px-4 text-base text-wa-text outline-none sm:text-[15px]'
          autoFocus={!coarsePointer()}
        />
      </div>
      <div className='flex shrink-0 items-center gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6'>
        <div className='flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1'>
          {items.map((it, i) => (
            <button key={it.id} onClick={() => setIndex(i)} className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-white ${i === index ? 'border-wa-green' : 'border-transparent'}`}>
              {it.kind === 'image' && <img src={it.url} alt='' className='h-full w-full object-cover' />}
              {it.kind === 'video' && <video src={it.url} muted preload='metadata' className='h-full w-full object-cover' />}
              {it.kind === 'file' && <span className='flex h-full w-full items-center justify-center text-[10px] font-bold text-[#e2564b]'>{fileExtension(it.file.name)}</span>}
            </button>
          ))}
          <button onClick={onAddMore} className='flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-[#8696a0] text-[#54656f]' title='Add more'>
            <IoAdd size={24} />
          </button>
        </div>
        <button onClick={onSend} className='relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-wa-green text-white shadow-menu hover:bg-wa-greenDark' title={`Send to ${peerName}`}>
          <IoMdSend size={24} />
          {items.length > 1 && <span className='absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-semibold text-wa-green'>{items.length}</span>}
        </button>
      </div>
    </div>
  )
}

const MessagesSkeleton = () => (
  <div className='animate-pulse space-y-3 pt-2'>
    {[['w-2/5', false], ['w-1/3', true], ['w-1/2', true], ['w-1/4', false], ['w-3/5', false], ['w-1/3', true]].map(([w, mine], i) => (
      <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className={`h-9 ${w} rounded-lg ${mine ? 'bg-wa-light/80' : 'bg-white/80'}`} />
      </div>
    ))}
  </div>
)

export default Message;
