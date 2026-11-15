import axios from 'axios'
import React, { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout, setConnected, setOnlineUser, setSocketConnection, setUser, setContacts, setHasChatLock } from '../redux/userSlice'
import { resetChat, setConversations, setTyping, upsertConversation, removeConversation } from '../redux/chatSlice'
import Sidebar from '../components/SideBar'
import io from 'socket.io-client'
import { IoChatbubbleEllipses } from "react-icons/io5";
import MadeBy from '../components/MadeBy'
import { showNotification, playNotificationSound, unlockSound, setFaviconBadge, registerNotificationWorker } from '../helpers/preferences'
import { socketCall } from '../helpers/socketCall'
import { messagePreview } from '../helpers/formatText'
import { systemText } from '../helpers/groupText'
import { displayName } from '../helpers/contacts'
import CallProvider from '../components/CallManager'
import { notificationPreviews } from '../helpers/theme'
import { matchShortcut } from '../helpers/shortcuts'
import { clearDrafts } from '../helpers/drafts'
import { notify, notifyError, notifyAction } from '../helpers/toast'
import { installDecryptor, startE2EE, shareHistoryWith, requestHistory, setE2EEPrefs, clearLocalData } from '../helpers/e2ee'
import AppSwitcher from '../components/apps/AppSwitcher'
import { appFromPath, appName } from '../helpers/apps'

// the user id inside the login token (available before the profile has loaded)
const tokenUserId = (token) => {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || null } catch { return null }
}

const Home = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const myId = useSelector((s) => s.user._id)
  const conversations = useSelector((s) => s.chat.conversations)
  const contactList = useSelector((s) => s.user.contacts)
  const linkPreviews = useSelector((s) => s.user.privacy?.linkPreviews)
  useEffect(() => { setE2EEPrefs({ linkPreviews : linkPreviews !== false }) }, [linkPreviews])

  // latest values for socket handlers registered once
  const live = useRef({})
  live.current = { myId, conversations, path : location.pathname, contacts : Object.fromEntries((contactList || []).map((c) => [c.userId, c])) }

  const handleLogout = () => {
    // readable copies of encrypted messages kept for search are removed from this device
    clearLocalData(live.current.myId)
    dispatch(logout())
    dispatch(resetChat())
    try { localStorage.removeItem('token') } catch { /* ignore */ }
    clearDrafts()
    navigate("/email")
  }

  const fetchUserDetails = async () => {
    try {
      const URL = `${process.env.REACT_APP_BACKEND_URL}/api/userdetails`
      const response = await axios({ url : URL, withCredentials : true })

      if (response.data.data?.logout) {
        handleLogout()
        return
      }
      dispatch(setUser(response.data.data))
    } catch (error) {
      console.log("error", error)
    }
  }

  // notifications: service worker (Android + click-to-open), sound unlock after the first interaction
  useEffect(() => {
    registerNotificationWorker()
    const onSwMessage = (e) => { if (e.data?.type === 'open-chat' && e.data.url) navigate(e.data.url) }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    const unlock = () => unlockSound()
    window.addEventListener('pointerdown', unlock, { once : true })
    window.addEventListener('keydown', unlock, { once : true })
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // WhatsApp Web-style keyboard shortcuts (see helpers/shortcuts.js)
  useEffect(() => {
    const onKey = (e) => {
      const action = matchShortcut(e)
      if (!action) return
      e.preventDefault()
      const [name, kind] = action.split(':')
      if (kind === 'drawer') return window.dispatchEvent(new CustomEvent('chatify-open', { detail : name }))
      if (kind === 'focus') {
        if (window.matchMedia('(max-width: 767px)').matches) navigate('/')
        return window.dispatchEvent(new CustomEvent('chatify-open', { detail : 'search' }))
      }
      if (kind === 'next' || kind === 'prev') {
        const list = live.current.conversations.filter((c) => !c.archived && !c.locked && !c.request)
        if (!list.length) return
        const at = list.findIndex((c) => live.current.path === `/${c.userDetails?._id}`)
        const target = at === -1 ? 0 : (at + (kind === 'next' ? 1 : -1) + list.length) % list.length
        return navigate('/' + list[target].userDetails._id)
      }
      window.dispatchEvent(new CustomEvent('chatify-chat', { detail : kind }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchUserDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*** socket connection (one per tab; reconnects automatically) */
  useEffect(() => {
    let token = null
    try { token = localStorage.getItem('token') } catch { /* ignore */ }
    if (!token) { handleLogout(); return }

    const socket = io(process.env.REACT_APP_BACKEND_URL, {
      transports : ["websocket"],
      withCredentials : true,
      auth : { token, client : 'v2' },
    })
    const typingTimers = {}
    // end-to-end encryption: decrypt incoming events before any handler sees them
    installDecryptor(socket)

    socket.on('connect', () => {
      dispatch(setConnected(true))
      // publish this device's public keys (first time: create them), then load the chat list
      startE2EE(socket, live.current.myId || tokenUserId(token)).then((res) => {
        const others = (res?.devices || []).filter((d) => !d.removedAt && d.id !== res?.self)
        if (res?.isNew && others.length > 1) {
          notify('To see your earlier encrypted messages here, open Chatify on one of your other devices and tap "Share".')
          requestHistory()
        }
      })
      socket.emit('sidebar')
      // everything sent to me while I was away has now reached this device
      socket.emit('delivered-all')
    })
    socket.on('disconnect', () => dispatch(setConnected(false)))
    socket.on('connect_error', (err) => {
      dispatch(setConnected(false))
      if (err?.message === 'unauthorized') handleLogout()
    })

    socket.on('onlineUser', (data) => dispatch(setOnlineUser(data)))

    // this device was logged out from Linked devices on another device
    socket.on('session-revoked', () => {
      notifyError('You were logged out from another device')
      handleLogout()
    })
    socket.on('chat-lock-changed', ({ hasCode }) => dispatch(setHasChatLock(hasCode)))

    // I opened Chatify on another browser/device: offer to hand it my message history (keys only, re-encrypted for it)
    socket.on('e2ee-new-device', ({ device }) => {
      notifyAction(`Chatify was opened on a new device (${device.name || 'browser'}). Share your message history with it?`, 'Share', async () => {
        notify('Sharing your message history…')
        try {
          const n = await shareHistoryWith(device)
          notify(n ? `Message history shared with ${device.name || 'your new device'}` : 'Your new device already has your message history')
        } catch (e) {
          notifyError(e?.message || "Couldn't share your message history")
        }
      }, 20000)
    })
    socket.on('e2ee-history-synced', ({ count }) => {
      if (count) notify('Your earlier messages are now available on this device')
      window.dispatchEvent(new Event('chatify-e2ee-resync'))
      socket.emit('sidebar')
    })

    // Planner: a message reminder is due
    socket.on('reminder-due', ({ reminder }) => {
      playNotificationSound()
      notifyAction(`⏰ Reminder: ${reminder.preview}`, 'View', () => navigate('/' + reminder.chatId, { state : { jumpTo : { _id : reminder.messageId, createdAt : reminder.messageAt } } }), 10000)
      showNotification({ title : 'Chatify reminder', body : reminder.preview, chatId : reminder.chatId, onClick : () => navigate('/' + reminder.chatId) })
    })

    // contacts changed (maybe in another tab)
    socket.on('contacts-updated', ({ contacts }) => dispatch(setContacts(contacts)))

    socket.on('conversation', (data) => {
      const me = live.current.myId
      const list = (data || []).map((c) => ({
        ...c,
        userDetails : c.userDetails || (String(c?.sender?._id) === String(me) ? c.receiver : c.sender)
      }))
      dispatch(setConversations(list))
    })

    // a single chat-list row changed (group chats)
    socket.on('conversation-item', ({ item, removeId }) => {
      if (item) dispatch(upsertConversation(item))
      else if (removeId) dispatch(removeConversation(removeId))
    })

    // 1:1: { from, isTyping }   group: { from, chat, name, isTyping }
    socket.on('typing', ({ from, chat, name, phone, isTyping }) => {
      const key = chat || from
      clearTimeout(typingTimers[key])
      const shown = chat ? displayName({ _id : from, name, profileName : name, phone }, live.current.contacts, live.current.myId) : undefined
      dispatch(setTyping({ userId : key, isTyping, name : shown }))
      // safety net in case the "stopped typing" event is lost
      if (isTyping) typingTimers[key] = setTimeout(() => dispatch(setTyping({ userId : key, isTyping : false })), 6000)
    })

    socket.on('message-new', ({ peerId, message, author, isGroup, request }) => {
      const { myId : me } = live.current
      if (String(message.msgByUserId) === String(me) && !message.system) return
      if (message.system) {
        // group notices are silent, except being added to / removed from a group
        const aboutMe = ['add', 'remove'].includes(message.system.action) && (message.system.targets || []).some((t) => String(t.id) === String(me))
        if (aboutMe) alertForMessage(peerId, message, { isGroup : true })
        return
      }
      // acknowledge delivery to the sender (double grey tick)
      socket.emit('mark-delivered', { ids : [message._id] })
      clearTimeout(typingTimers[peerId])
      dispatch(setTyping({ userId : peerId, isTyping : false }))

      // call history entries: only a missed call alerts (the ringing itself is handled by the call screen)
      if (message.call && (message.call.status !== 'missed' || message.call.group)) return
      // message requests from people you haven't saved stay silent until you accept
      if (request || live.current.conversations.find((c) => String(c.userDetails?._id) === String(peerId))?.request) return
      // "Send without sound": the message arrives quietly
      if (message.silent) return
      const authorName = author ? displayName({ ...author, profileName : author.name }, live.current.contacts, live.current.myId) : undefined
      alertForMessage(peerId, message, { authorName, isGroup })
    })

    // WhatsApp-style alerts: sound when the message isn't from the chat you're looking at,
    // plus a desktop notification when Chatify isn't the active tab/window. Muted chats stay silent.
    const alertForMessage = async (peerId, message, { authorName, isGroup } = {}) => {
      const { conversations : convs, path, myId : me, contacts } = live.current
      const conv = convs.find((c) => String(c.userDetails?._id) === String(peerId))
      const muted = conv?.muted && (!conv.mutedUntil || new Date(conv.mutedUntil) > new Date())
      // like WhatsApp: being @mentioned notifies you even in a muted group
      const mentioned = (message.mentions || []).includes(String(me))
      if (muted && !mentioned) return
      const active = document.visibilityState === 'visible' && document.hasFocus()
      if (active && path === `/${peerId}`) return

      playNotificationSound()
      if (active) return

      let sender = conv?.userDetails
      if (!sender) {
        // first message from someone new: their chat isn't in the list yet
        const res = await socketCall(socket, 'get-peer', peerId)
        sender = res.ok ? res.peer : null
      }
      const content = message.system ? systemText(message, me) : message.call ? `📞 Missed ${message.call.type === 'video' ? 'video' : 'voice'} call` : messagePreview(message)
      // locked chats never reveal who wrote or what
      const hidden = !!conv?.locked
      const body = hidden || !notificationPreviews() ? 'New message' : isGroup && authorName ? `${mentioned ? '@ ' : ''}${authorName}: ${content}` : content
      showNotification({
        title : hidden ? 'Chatify' : displayName(sender, contacts, me) || 'Chatify',
        body,
        icon : hidden ? undefined : sender?.profile_pic || undefined,
        chatId : peerId,
        onClick : () => navigate('/' + peerId)
      })
    }

    dispatch(setSocketConnection(socket))

    return () => {
      Object.values(typingTimers).forEach(clearTimeout)
      socket.removeAllListeners()
      socket.disconnect()
      dispatch(setSocketConnection(null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // which of the three apps is open: Chats, Pixify or Connectify (same login and connection)
  const app = appFromPath(location.pathname)

  // unread chats in the tab title, e.g. "(3) Chatify" / "(3) Pixify"
  useEffect(() => {
    const unread = conversations.filter((c) => !(c.muted && (!c.mutedUntil || new Date(c.mutedUntil) > new Date())) && !c.request && !c.locked && (c.unseenMsg > 0 || c.markedUnread)).length
    const title = app === 'chats' ? 'Chatify' : appName(app)
    document.title = unread ? `(${unread}) ${title}` : title
    setFaviconBadge(unread)
    return () => { document.title = 'Chatify'; setFaviconBadge(0) }
  }, [conversations, app])

  const basePath = location.pathname === '/'

  // Pixify and Connectify take the whole screen; calls still ring there
  if (app !== 'chats') {
    return (
      <CallProvider>
        <Outlet />
      </CallProvider>
    )
  }

  return (
    <CallProvider>
    <div className='relative h-dvh overflow-hidden bg-wa-surface xl:bg-[rgb(var(--wa-backdrop))]'>
      {/* green band behind the app on large screens */}
      <div className='absolute inset-x-0 top-0 hidden h-[127px] bg-wa-green dark:bg-[rgb(var(--wa-backdrop))] xl:block' />

      {/* phone: one pane at a time | tablet+: chat list + conversation side by side | xl: framed window */}
      <div className='relative mx-auto h-full xl:px-3 xl:py-3'>
        <div className='grid h-full grid-cols-1 overflow-hidden bg-wa-surface md:grid-cols-[350px,minmax(0,1fr)] lg:grid-cols-[minmax(400px,32%),minmax(0,1fr)] xl:shadow-card'>
          <section className={`h-full min-h-0 min-w-0 flex-col md:border-r md:border-wa-border ${!basePath ? "hidden" : "flex"} md:flex`}>
            <div className='min-h-0 flex-1'>
              <Sidebar />
            </div>
            {/* phone: switch to Pixify / Connectify (tablet and desktop use the left rail) */}
            <AppSwitcher variant='bar' className='md:hidden' />
          </section>

          {/**message component**/}
          <section className={`h-full min-h-0 ${basePath ? "hidden" : ""}`}>
            <Outlet />
          </section>

          {/* empty state */}
          <div className={`${basePath ? "hidden md:flex" : "hidden"} relative h-full flex-col items-center justify-center border-b-[6px] border-wa-badge bg-wa-hover px-6 text-center lg:px-10`}>
            <div className='relative mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-wa-green/10 lg:h-44 lg:w-44'>
              <div className='flex h-20 w-20 items-center justify-center rounded-full bg-wa-green/20 text-wa-green lg:h-28 lg:w-28'>
                <IoChatbubbleEllipses className='h-11 w-11 lg:h-16 lg:w-16' />
              </div>
            </div>
            <h1 className='text-[26px] font-light text-wa-strong lg:text-[32px]'>Chatify Web</h1>
            <p className='mt-4 max-w-md text-sm leading-6 text-wa-muted'>
              Send and receive messages in real time.<br />
              Pick a chat from the list, or start a new one to say hello!
            </p>
            <MadeBy className='absolute bottom-6 left-0 right-0' />
          </div>
        </div>
      </div>
    </div>
    </CallProvider>
  )
}

export default Home;
