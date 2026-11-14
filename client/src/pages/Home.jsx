import axios from 'axios'
import React, { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout, setConnected, setOnlineUser, setSocketConnection, setUser, setContacts } from '../redux/userSlice'
import { resetChat, setConversations, setTyping, upsertConversation, removeConversation } from '../redux/chatSlice'
import Sidebar from '../components/SideBar'
import io from 'socket.io-client'
import { IoChatbubbleEllipses } from "react-icons/io5";
import MadeBy from '../components/MadeBy'
import { showNotification, playNotificationSound, unlockSound, setFaviconBadge, registerNotificationWorker } from '../helpers/preferences'
import { socketCall } from '../helpers/socketCall'
import { plainPreview } from '../helpers/formatText'
import { systemText } from '../helpers/groupText'
import { displayName } from '../helpers/contacts'
import CallProvider from '../components/CallManager'

const Home = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const myId = useSelector((s) => s.user._id)
  const conversations = useSelector((s) => s.chat.conversations)
  const contactList = useSelector((s) => s.user.contacts)

  // latest values for socket handlers registered once
  const live = useRef({})
  live.current = { myId, conversations, path : location.pathname, contacts : Object.fromEntries((contactList || []).map((c) => [c.userId, c])) }

  const handleLogout = () => {
    dispatch(logout())
    dispatch(resetChat())
    try { localStorage.removeItem('token') } catch { /* ignore */ }
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

    socket.on('connect', () => {
      dispatch(setConnected(true))
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
      const authorName = author ? displayName({ ...author, profileName : author.name }, live.current.contacts, live.current.myId) : undefined
      alertForMessage(peerId, message, { authorName, isGroup })
    })

    // WhatsApp-style alerts: sound when the message isn't from the chat you're looking at,
    // plus a desktop notification when Chatify isn't the active tab/window. Muted chats stay silent.
    const alertForMessage = async (peerId, message, { authorName, isGroup } = {}) => {
      const { conversations : convs, path, myId : me, contacts } = live.current
      const conv = convs.find((c) => String(c.userDetails?._id) === String(peerId))
      if (conv?.muted) return
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
      const content = message.system ? systemText(message, me) : message.call ? `📞 Missed ${message.call.type === 'video' ? 'video' : 'voice'} call` : message.text ? plainPreview(message.text) : message.imageUrl ? '📷 Photo' : message.videoUrl ? '🎥 Video' : message.fileName ? `📄 ${message.fileName}` : 'New message'
      const body = isGroup && authorName ? `${authorName}: ${content}` : content
      showNotification({
        title : displayName(sender, contacts, me) || 'Chatify',
        body,
        icon : sender?.profile_pic || undefined,
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

  // unread chats in the tab title, e.g. "(3) Chatify"
  useEffect(() => {
    const unread = conversations.filter((c) => !c.muted && !c.request && (c.unseenMsg > 0 || c.markedUnread)).length
    document.title = unread ? `(${unread}) Chatify` : 'Chatify'
    setFaviconBadge(unread)
    return () => { document.title = 'Chatify'; setFaviconBadge(0) }
  }, [conversations])

  const basePath = location.pathname === '/'

  return (
    <CallProvider>
    <div className='relative h-dvh overflow-hidden bg-white xl:bg-[#dadbd3]'>
      {/* green band behind the app on large screens */}
      <div className='absolute inset-x-0 top-0 hidden h-[127px] bg-wa-green xl:block' />

      {/* phone: one pane at a time | tablet+: chat list + conversation side by side | xl: framed window */}
      <div className='relative mx-auto h-full xl:max-w-[1600px] xl:px-5 xl:py-[19px]'>
        <div className='grid h-full overflow-hidden bg-white md:grid-cols-[300px,1fr] lg:grid-cols-[minmax(340px,30%),1fr] xl:shadow-card'>
          <section className={`h-full min-h-0 md:border-r md:border-wa-border ${!basePath ? "hidden" : ""} md:block`}>
            <Sidebar />
          </section>

          {/**message component**/}
          <section className={`h-full min-h-0 ${basePath ? "hidden" : ""}`}>
            <Outlet />
          </section>

          {/* empty state */}
          <div className={`${basePath ? "hidden md:flex" : "hidden"} relative h-full flex-col items-center justify-center border-b-[6px] border-wa-badge bg-[#f8f9fa] px-6 text-center lg:px-10`}>
            <div className='relative mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-wa-green/10 lg:h-44 lg:w-44'>
              <div className='flex h-20 w-20 items-center justify-center rounded-full bg-wa-green/20 text-wa-green lg:h-28 lg:w-28'>
                <IoChatbubbleEllipses className='h-11 w-11 lg:h-16 lg:w-16' />
              </div>
            </div>
            <h1 className='text-[26px] font-light text-[#41525d] lg:text-[32px]'>Chatify Web</h1>
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
