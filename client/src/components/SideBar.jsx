import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom';
import Avatar from './Avatar'
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { notify, notifyError, notifyAction } from '../helpers/toast';
import EditUserDetails from './EditUserDetails';
import SearchUser from './SearchUser';
import StarredMessages from './StarredMessages';
import SettingsDrawer from './SettingsDrawer';
import NewGroup from './NewGroup';
import { systemText } from '../helpers/groupText';
import { usePeopleNames } from '../helpers/contacts';
import { IoMailUnreadOutline, IoCall, IoMic, IoHappyOutline } from "react-icons/io5";
import { MdOutlineGroupAdd, MdOutlinePersonAddAlt } from "react-icons/md";
import { IoExitOutline } from "react-icons/io5";
import PopoverMenu from './PopoverMenu';
import Dialog from './Dialog';
import { StatusIcon, statusOf } from './MessageBubble';
import { logout } from '../redux/userSlice';
import { resetChat } from '../redux/chatSlice';
import { notificationPermission, requestNotifications, playNotificationSound } from '../helpers/preferences';
import { IoNotificationsOffSharp } from "react-icons/io5";
import { formatListTime } from '../helpers/formatTime';
import { socketCall } from '../helpers/socketCall';
import { plainPreview, renderFormatted, messagePreview } from '../helpers/formatText';
import { MdChat, MdAddComment, MdOutlineChat, MdOutlineArchive, MdOutlineUnarchive, MdOutlineMarkChatUnread, MdOutlineMarkChatRead, MdOutlineCleaningServices } from "react-icons/md";
import { HiDotsVertical } from "react-icons/hi";
import { IoSearchOutline, IoClose, IoCamera, IoVideocam, IoChevronDown, IoNotificationsOffOutline, IoNotificationsOutline, IoTrashOutline, IoStarOutline, IoSettingsOutline, IoDocumentOutline, IoBan } from "react-icons/io5";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import { BiLogOut } from "react-icons/bi";
import { FaRegUser } from "react-icons/fa";
import { IoHeartOutline, IoHeartDislikeOutline, IoLockClosedOutline, IoLockOpenOutline, IoCallOutline, IoKeypadOutline, IoCheckmarkDoneOutline } from 'react-icons/io5'
import { TbCircleDashed } from 'react-icons/tb'
import { MdOutlinePoll } from 'react-icons/md'
import { IoLocationOutline } from 'react-icons/io5'
import StatusPanel from './StatusPanel'
import CallsPanel from './CallsPanel'
import AppSwitcher from './apps/AppSwitcher'
import { MuteDialog } from './ChatDialogs'
import ShortcutsDialog from './ShortcutsDialog'
import Planner from './Planner'
import { IoAlarmOutline } from 'react-icons/io5'
import { useDrafts } from '../helpers/drafts'
import { searchLocal, clearLocalData } from '../helpers/e2ee'

const voiceLength = (sec = 0) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

const SideBar = () => {
  const user = useSelector(state => state?.user)
  const { conversations, loaded, typing } = useSelector(state => state.chat)
  const socketConnection = user.socketConnection
  const [drawer, setDrawer] = useState(null) // profile | search | newgroup | starred | settings | status | calls
  const [muteFor, setMuteFor] = useState(null) // chat being muted (duration dialog)
  const [lockPrompt, setLockPrompt] = useState(false) // secret code dialog for Locked chats
  const [lockCode, setLockCode] = useState('')
  const [lockError, setLockError] = useState('')
  const [lockedOpen, setLockedOpen] = useState(false) // locked chats are visible until the app is closed or you leave the folder
  const [statusUnseen, setStatusUnseen] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [plannerTab, setPlannerTab] = useState('reminders')
  const drafts = useDrafts()

  // menus / keyboard shortcuts elsewhere can open a drawer here
  useEffect(() => {
    const open = (e) => {
      if (e.detail === 'shortcuts') return setShortcuts(true)
      if (e.detail === 'search') return document.getElementById('chat-search')?.focus()
      if (e.detail === 'planner-scheduled') { setPlannerTab('scheduled'); return setDrawer('planner') }
      if (e.detail === 'planner') setPlannerTab('reminders')
      setDrawer(e.detail)
    }
    window.addEventListener('chatify-open', open)
    return () => window.removeEventListener('chatify-open', open)
  }, [])

  // green dot on the Status icon when contacts posted something I haven't seen
  useEffect(() => {
    if (!socketConnection) return
    const check = async () => {
      const res = await socketCall(socketConnection, 'status-list')
      if (res.ok) setStatusUnseen(res.updates.some((u) => !u.allViewed && !u.muted))
    }
    check()
    socketConnection.on('status-changed', check)
    return () => socketConnection.off('status-changed', check)
  }, [socketConnection])

  const openLocked = async () => {
    const res = await socketCall(socketConnection, 'chat-lock-verify', { code : lockCode })
    if (!res.ok) return setLockError(res.error)
    setLockPrompt(false); setLockCode(''); setLockError('')
    setLockedOpen(true)
    setFilter('locked')
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterText, setFilterText] = useState("")
  const [filter, setFilter] = useState("all")
  const [chatMenu, setChatMenu] = useState(null) // { conv, anchor }
  const [confirm, setConfirm] = useState(null)
  const [messageResults, setMessageResults] = useState([])
  const [searching, setSearching] = useState(false)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const pressTimer = useRef(null)
  const people = usePeopleNames()

  // WhatsApp-style "turn on desktop notifications" banner
  const [notifyPerm, setNotifyPerm] = useState(notificationPermission())
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return localStorage.getItem('chatify-notify-banner') === 'dismissed' } catch { return false }
  })
  const showNotifyBanner = notifyPerm === 'default' && !bannerDismissed
  const enableNotifications = async () => {
    const result = await requestNotifications()
    setNotifyPerm(result)
    if (result === 'granted') { playNotificationSound(); notify('Desktop notifications turned on') }
    else if (result === 'denied') notifyError('Notifications are blocked. Allow them in your browser settings.')
  }
  const dismissBanner = () => {
    setBannerDismissed(true)
    try { localStorage.setItem('chatify-notify-banner', 'dismissed') } catch { /* ignore */ }
  }

  const handleLogout = async () => {
    try { await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/logout`, { withCredentials : true }) } catch { /* ignore */ }
    await clearLocalData(user._id)
    dispatch(logout())
    dispatch(resetChat())
    try { localStorage.clear() } catch { /* ignore */ }
    navigate("/email")
  }

  // message search across all chats
  useEffect(() => {
    const q = filterText.trim()
    if (q.length < 2) { setMessageResults([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const [res, local] = await Promise.all([socketCall(socketConnection, 'search-messages', { q }), searchLocal(q)])
      const seen = new Set((res.ok ? res.results : []).map((r) => String(r.message._id)))
      const peerOf = (chat) => conversationsRef.current.find((c) => String(c.userDetails?._id) === String(chat))?.userDetails
      const mine = local.filter((r) => !seen.has(r.id) && peerOf(r.chat)).map((r) => ({
        message : { _id : r.id, text : r.text, createdAt : r.at, msgByUserId : r.from },
        peer : peerOf(r.chat),
        author : peerOf(r.chat)?.isGroup && r.from !== String(user._id) ? { _id : r.from } : null
      }))
      setMessageResults([...(res.ok ? res.results : []), ...mine].sort((a, b) => new Date(b.message.createdAt) - new Date(a.message.createdAt)).slice(0, 60))
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [filterText, socketConnection, user._id])

  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations

  // messages from locked chats never show up in search (like WhatsApp)
  const lockedIds = useMemo(() => new Set(conversations.filter((c) => c.locked).map((c) => String(c.userDetails?._id))), [conversations])
  const shownResults = useMemo(() => messageResults.filter((r) => !lockedIds.has(String(r.peer?._id))), [messageResults, lockedIds])

  const requestCount = conversations.filter(c => c.request).length
  const archivedCount = conversations.filter(c => c.archived && !c.request && !c.locked).length
  const lockedCount = conversations.filter(c => c.locked).length
  const isMuted = (c) => !!c.muted && (!c.mutedUntil || new Date(c.mutedUntil) > new Date())
  const unreadCount = conversations.filter(c => !c.archived && !c.request && (c.unseenMsg || c.markedUnread)).length

  const visibleChats = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    return conversations.filter(conv => {
      // message requests only appear in their own list
      if (filter === "requests") return !!conv.request && (!q || people.name(conv.userDetails).toLowerCase().includes(q))
      if (conv.request) return false
      // locked chats only show inside "Locked chats" (and never in search)
      if (filter === "locked") return !!conv.locked && lockedOpen
      if (conv.locked) return false
      if (filter === "favorites" && !conv.favorite) return false
      if (filter === "groups" && !conv.isGroup) return false
      if (filter === "archived") { if (!conv.archived) return false }
      else if (conv.archived && !q) return false
      if (filter === "unread" && !(conv?.unseenMsg || conv?.markedUnread)) return false
      if (q && !people.name(conv?.userDetails).toLowerCase().includes(q) && !conv?.userDetails?.name?.toLowerCase().includes(q)) return false
      return true
    })
  }, [conversations, filterText, filter, people, lockedOpen])

  const chatAction = useCallback(async (conv, action, extra = {}) => {
    const res = await socketCall(socketConnection, 'chat-action', { peerId : conv.userDetails._id, action, ...extra })
    if (!res.ok) return notifyError(res.error)
    const undoOf = { archive : 'unarchive', unarchive : 'archive', unmute : 'mute', pin : 'unpin', unpin : 'pin', favorite : 'unfavorite', unfavorite : 'favorite' }
    const messages = {
      archive : 'Chat archived', unarchive : 'Chat unarchived', mute : 'Chat muted', unmute : 'Chat unmuted',
      pin : 'Chat pinned', unpin : 'Chat unpinned', clear : 'Chat cleared', delete : 'Chat deleted',
      favorite : 'Added to favourites', unfavorite : 'Removed from favourites', lock : 'Chat locked', unlock : 'Chat unlocked',
      'mark-read' : null
    }
    if (undoOf[action]) {
      notifyAction(messages[action], 'Undo', () => socketCall(socketConnection, 'chat-action', { peerId : conv.userDetails._id, action : undoOf[action] }))
    } else if (messages[action]) notify(messages[action])
    if (action === 'delete' && window.location.pathname === `/${conv.userDetails._id}`) navigate('/')
  }, [socketConnection, navigate])

  const exitGroup = useCallback(async (conv) => {
    const res = await socketCall(socketConnection, 'group-leave', { groupId : conv._id })
    if (!res.ok) return notifyError(res.error)
    notify(`You left "${conv.userDetails.name}"`)
  }, [socketConnection])

  const askConfirm = (conv, action) => {
    const name = people.name(conv.userDetails)
    if (conv.isGroup) {
      setConfirm(action === 'exit'
        ? { title : `Exit "${name}"?`, body : 'You will no longer receive messages from this group. Group members will see that you left.', action, conv, label : 'Exit group' }
        : action === 'clear'
          ? { title : 'Clear this chat?', body : 'Messages in this group will be removed for you only.', action, conv, label : 'Clear chat' }
          : { title : `Delete "${name}"?`, body : 'The group and its messages will be removed from your chat list.', action, conv, label : 'Delete group' })
      return
    }
    setConfirm(action === 'clear'
      ? { title : `Clear this chat?`, body : `Messages with ${name} will be removed from this device. ${name} will still have them.`, action, conv, label : 'Clear chat' }
      : { title : `Delete chat with ${name}?`, body : `The chat and its messages will be removed for you only. ${name} keeps their copy.`, action, conv, label : 'Delete chat' })
  }

  const chatMenuItems = (conv) => [
    { label : conv.archived ? 'Unarchive chat' : 'Archive chat', icon : conv.archived ? <MdOutlineUnarchive size={18} /> : <MdOutlineArchive size={18} />, onClick : () => chatAction(conv, conv.archived ? 'unarchive' : 'archive') },
    { label : isMuted(conv) ? 'Unmute notifications' : 'Mute notifications', icon : isMuted(conv) ? <IoNotificationsOutline size={18} /> : <IoNotificationsOffOutline size={18} />, onClick : () => (isMuted(conv) ? chatAction(conv, 'unmute') : setMuteFor(conv)) },
    { label : conv.favorite ? 'Remove from favourites' : 'Add to favourites', icon : conv.favorite ? <IoHeartDislikeOutline size={18} /> : <IoHeartOutline size={18} />, onClick : () => chatAction(conv, conv.favorite ? 'unfavorite' : 'favorite') },
    { label : conv.locked ? 'Unlock chat' : 'Lock chat', icon : conv.locked ? <IoLockOpenOutline size={18} /> : <IoLockClosedOutline size={18} />, hidden : !conv.locked && !user.hasChatLock, onClick : () => chatAction(conv, conv.locked ? 'unlock' : 'lock') },
    { label : conv.pinned ? 'Unpin chat' : 'Pin chat', icon : <BsPinAngle size={17} />, onClick : () => chatAction(conv, conv.pinned ? 'unpin' : 'pin'), hidden : conv.archived || conv.locked },
    { label : (conv.unseenMsg || conv.markedUnread) ? 'Mark as read' : 'Mark as unread', icon : (conv.unseenMsg || conv.markedUnread) ? <MdOutlineMarkChatRead size={18} /> : <MdOutlineMarkChatUnread size={18} />, onClick : () => chatAction(conv, (conv.unseenMsg || conv.markedUnread) ? 'mark-read' : 'mark-unread') },
    { label : 'Clear chat', icon : <MdOutlineCleaningServices size={18} />, onClick : () => askConfirm(conv, 'clear') },
    { label : 'Exit group', icon : <IoExitOutline size={18} />, danger : true, hidden : !(conv.isGroup && conv.isMember), onClick : () => askConfirm(conv, 'exit') },
    { label : conv.isGroup ? 'Delete group' : 'Delete chat', icon : <IoTrashOutline size={18} />, danger : true, hidden : conv.isGroup && conv.isMember, onClick : () => askConfirm(conv, 'delete') },
  ]

  const openChatMenu = (conv, anchor) => setChatMenu({ conv, anchor })

  const lastMessagePreview = (conv) => {
    const last = conv?.lastMsg
    const typer = typing[conv.userDetails?._id]
    if (typer) return <span className='truncate font-medium text-wa-green'>{typeof typer === 'string' ? `${typer} is typing…` : 'typing…'}</span>
    const draft = drafts[String(conv.userDetails?._id)]
    if (draft && !window.location.pathname.endsWith(String(conv.userDetails?._id))) return <span className='truncate'><span className='text-wa-green'>Draft: </span>{plainPreview(draft)}</span>
    if (!last) return null
    if (last.system) return <span className='truncate'>{systemText(last, user._id)}</span>
    if (last.e2eeError && !last.deletedForEveryone) return <span className='truncate italic'>{last.e2eeError === 'no-key' ? '🕓 Waiting for this message' : "⚠️ This message couldn't be verified"}</span>
    if (last.call) {
      const mineCall = String(last.msgByUserId) === String(user._id)
      const missed = last.call.status !== 'answered' && !mineCall && !last.call.group
      const kind = last.call.type === 'video' ? 'video' : 'voice'
      return (
        <span className={`flex min-w-0 items-center gap-1 ${missed ? 'text-red-500' : ''}`}>
          {last.call.type === 'video' ? <IoVideocam size={16} className='shrink-0' /> : <IoCall size={15} className='shrink-0' />}
          <span className='truncate'>{last.call.group ? `Group ${kind} call` : missed ? `Missed ${kind} call` : `${kind === 'video' ? 'Video' : 'Voice'} call`}</span>
        </span>
      )
    }
    const sentByMe = String(last.msgByUserId) === String(user._id)
    const author = conv.isGroup && !sentByMe && (last.author || last.authorName) ? <span className='shrink-0'>{last.author ? people.name(last.author) : last.authorName}:</span> : null
    if (last.deletedForEveryone) {
      return <span className='flex items-center gap-1 italic'><IoBan size={14} /> {sentByMe ? 'You deleted this message' : 'This message was deleted'}</span>
    }
    return (
      <>
        {sentByMe && <StatusIcon status={statusOf(last)} size={17} />}
        {author}
        {last.poll && <span className='flex min-w-0 items-center gap-1'><MdOutlinePoll size={16} className='shrink-0' /><span className='truncate'>{last.poll.question}</span></span>}
        {last.contact && <span className='flex min-w-0 items-center gap-1'><FaRegUser size={13} className='shrink-0' /><span className='truncate'>{last.contact.name}</span></span>}
        {last.location && <span className='flex shrink-0 items-center gap-1'><IoLocationOutline size={16} /> Location</span>}
        {last.viewOnce && <span className='flex shrink-0 items-center gap-1'><span className='flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-current text-[9px] font-bold'>1</span> {last.viewOnce === 'video' ? 'Video' : 'Photo'}</span>}
        {last.imageUrl && <span className='flex shrink-0 items-center gap-1'><IoCamera size={16} />{!last.text && <span>Photo</span>}</span>}
        {last.videoUrl && <span className='flex shrink-0 items-center gap-1'><IoVideocam size={16} />{!last.text && <span>Video</span>}</span>}
        {last.stickerUrl && <span className='flex shrink-0 items-center gap-1'><IoHappyOutline size={16} /> Sticker</span>}
        {last.audioUrl && <span className='flex shrink-0 items-center gap-1'><IoMic size={15} className={sentByMe ? '' : 'text-wa-green'} /> {voiceLength(last.audioDuration)}</span>}
        {last.fileUrl && <span className='flex min-w-0 items-center gap-1'><IoDocumentOutline size={15} className='shrink-0' />{!last.text && <span className='truncate'>{last.fileName}</span>}</span>}
        {last.text && <span className='truncate'>{messagePreview({ text : last.text })}</span>}
      </>
    )
  }

  // WhatsApp Web's left navigation rail (tablet and desktop)
  const railActive = ['calls', 'status', 'planner', 'starred', 'settings', 'profile'].includes(drawer) ? drawer : 'chats'
  const RailButton = ({ id, title, icon, badge, dot, onClick }) => (
    <button
      onClick={onClick || (() => setDrawer(id === 'chats' ? null : id))}
      title={title}
      aria-label={title}
      aria-current={railActive === id ? 'page' : undefined}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${railActive === id ? 'bg-wa-rail-active text-wa-strong' : 'text-wa-icon hover:bg-wa-rail-active/70'}`}
    >
      {icon}
      {badge > 0 && <span className='absolute -right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-wa-badge px-1 text-[11px] font-semibold text-white'>{badge > 99 ? '99+' : badge}</span>}
      {dot && <span className='absolute right-1 top-1.5 h-2 w-2 rounded-full bg-wa-badge' />}
    </button>
  )

  return (
    <div className='flex h-full bg-wa-surface'>
      <nav aria-label='Main' className='hidden w-16 shrink-0 flex-col items-center justify-between border-r border-wa-border bg-wa-rail py-3 md:flex'>
        <div className='flex flex-col items-center gap-2'>
          <RailButton id='chats' title='Chats' icon={railActive === 'chats' ? <MdChat size={22} /> : <MdOutlineChat size={22} />} badge={unreadCount} />
          <RailButton id='calls' title='Calls' icon={<IoCallOutline size={21} />} />
          <RailButton id='status' title='Status' icon={<TbCircleDashed size={23} />} dot={statusUnseen} />
          <span className='my-1 h-px w-8 bg-wa-border' />
          <RailButton id='planner' title='Planner' icon={<IoAlarmOutline size={22} />} onClick={() => { setPlannerTab('reminders'); setDrawer('planner') }} />
          <span className='my-1 h-px w-8 bg-wa-border' />
          {/* the other Chatify apps: same account, no second login */}
          <AppSwitcher only={['pixify', 'connectify']} />
        </div>
        <div className='flex flex-col items-center gap-2'>
          <RailButton id='starred' title='Starred messages' icon={<IoStarOutline size={21} />} />
          <RailButton id='settings' title='Settings' icon={<IoSettingsOutline size={22} />} />
          <button onClick={() => setDrawer('profile')} title='Profile' aria-label='Profile' className={`rounded-full p-0.5 ${railActive === 'profile' ? 'ring-2 ring-wa-green' : ''}`}>
            <Avatar width={30} height={30} name={user?.name} imageUrl={user?.profile_pic} />
          </button>
        </div>
      </nav>

    <div className='relative flex h-full min-w-0 flex-1 flex-col bg-wa-surface'>
      {/* header: phone keeps avatar + icons; tablet/desktop shows the app name like WhatsApp Web */}
      <header className='flex h-[59px] shrink-0 items-center justify-between bg-wa-panel px-3 sm:px-4 md:h-16 md:bg-wa-surface md:px-5'>
        <button onClick={() => setDrawer('profile')} title='Profile' className='md:hidden'>
          <Avatar width={40} height={40} name={user?.name} imageUrl={user?.profile_pic} />
        </button>
        <h1 className='hidden text-[22px] font-bold text-wa-strong md:block'>Chatify</h1>

        <div className='relative flex items-center gap-1'>
          <button className='wa-icon-btn relative md:hidden' title='Status' onClick={() => setDrawer('status')}>
            <TbCircleDashed size={22} />
            {statusUnseen && <span className='absolute right-2 top-2 h-2 w-2 rounded-full bg-wa-badge' />}
          </button>
          <button className='wa-icon-btn md:hidden' title='Calls' onClick={() => setDrawer('calls')}>
            <IoCallOutline size={20} />
          </button>
          <button className='wa-icon-btn md:hidden' title='New chat' onClick={() => setDrawer('search')}>
            <MdOutlinePersonAddAlt size={22} />
          </button>
          <button className={`wa-icon-btn ${menuOpen ? "bg-black/10" : ""}`} title='Menu' onClick={() => setMenuOpen(o => !o)}>
            <HiDotsVertical size={20} />
          </button>
          <button className='ml-2 hidden h-10 w-10 items-center justify-center rounded-full bg-wa-green text-white shadow-sm transition-colors hover:bg-wa-greenDark md:flex' title='New chat' aria-label='New chat' onClick={() => setDrawer('search')}>
            <MdAddComment size={20} />
          </button>

          {menuOpen && (
            <>
              <div className='fixed inset-0 z-20' onClick={() => setMenuOpen(false)} />
              <div className='absolute right-0 top-11 z-30 w-56 origin-top-right animate-pop rounded-md bg-wa-surface py-2 shadow-menu'>
                {[
                  ['New group', <MdOutlineGroupAdd size={17} />, () => setDrawer('newgroup')],
                  ['New chat', <MdOutlineChat size={16} />, () => setDrawer('search')],
                  ['Starred messages', <IoStarOutline size={16} />, () => setDrawer('starred')],
                  ['Planner', <IoAlarmOutline size={17} />, () => { setPlannerTab('reminders'); setDrawer('planner') }],
                  ['Archived chats', <MdOutlineArchive size={17} />, () => setFilter('archived')],
                  ['Profile', <FaRegUser size={15} />, () => setDrawer('profile')],
                  ['Settings', <IoSettingsOutline size={17} />, () => setDrawer('settings')],
                  ['Mark all as read', <IoCheckmarkDoneOutline size={17} />, () => conversations.filter((c) => c.unseenMsg || c.markedUnread).forEach((c) => socketCall(socketConnection, 'chat-action', { peerId : c.userDetails._id, action : 'mark-read' }))],
                  ['Keyboard shortcuts', <IoKeypadOutline size={17} />, () => setShortcuts(true)],
                  ['Log out', <BiLogOut size={17} />, handleLogout],
                ].map(([label, icon, fn]) => (
                  <button key={label} onClick={() => { setMenuOpen(false); fn() }} className='flex w-full items-center gap-3 px-6 py-3 text-left text-[14.5px] text-wa-strong hover:bg-wa-panel'>
                    <span className='w-5 text-wa-icon'>{icon}</span> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {showNotifyBanner && (
        <div className='flex shrink-0 items-center gap-4 bg-[#53bdeb] px-4 py-3.5'>
          <span className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-surface text-[#53bdeb]'>
            <IoNotificationsOffSharp size={24} />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='text-[15px] text-wa-text'>Get notified of new messages</p>
            <button onClick={enableNotifications} className='mt-0.5 text-left text-sm text-wa-text/80 underline-offset-2 hover:underline'>
              Turn on desktop notifications ›
            </button>
          </div>
          <button onClick={dismissBanner} className='shrink-0 rounded-full p-1 text-wa-text/60 hover:bg-black/10 hover:text-wa-text' title='Dismiss'>
            <IoClose size={18} />
          </button>
        </div>
      )}

      {/* connection status */}
      {!user.connected && user.socketConnection && (
        <div className='flex shrink-0 items-center gap-2 bg-[#ffd279] px-4 py-2 text-[13px] text-wa-strong'>
          <span className='h-3 w-3 animate-spin rounded-full border-2 border-wa-strong border-t-transparent' />
          Connecting… Messages will send when you're back online.
        </div>
      )}

      {/* search + filters */}
      <div className='shrink-0 border-b border-wa-border bg-wa-surface px-3 pb-2 pt-2'>
        <div className='flex h-[38px] items-center gap-4 rounded-lg bg-wa-panel px-4 sm:h-[35px]'>
          <IoSearchOutline size={17} className='shrink-0 text-wa-icon' />
          <input
            type='text'
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            id='chat-search'
            placeholder='Search chats and messages'
            className='w-full bg-transparent text-base text-wa-text outline-none placeholder:text-wa-subtle sm:text-sm'
          />
          {filterText && (
            <button onClick={() => setFilterText("")} className='text-wa-icon' title='Clear search'>
              <IoClose size={18} />
            </button>
          )}
        </div>
        <div className='mt-2 flex gap-2 overflow-x-auto'>
          {[["all", "All"], ["unread", `Unread${unreadCount ? ` ${unreadCount}` : ""}`], ["favorites", "Favourites"], ["groups", "Groups"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 rounded-full px-3 py-1 text-[13px] transition-colors ${filter === key ? "bg-wa-chip text-wa-teal" : "bg-wa-panel text-wa-muted hover:bg-wa-raised"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* chat list */}
      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar'>
        {!loaded && <ChatListSkeleton />}

        {loaded && conversations.length === 0 && (
          <div className='flex flex-col items-center px-8 pt-16 text-center'>
            <div className='flex h-20 w-20 items-center justify-center rounded-full bg-wa-panel text-wa-green'>
              <MdOutlineChat size={36} />
            </div>
            <p className='mt-5 text-[15px] text-wa-text'>No chats yet</p>
            <p className='mt-1 text-sm text-wa-muted'>Find people on Chatify and start a conversation.</p>
            <button onClick={() => setDrawer('search')} className='wa-btn mt-6'>Start a new chat</button>
          </div>
        )}

        {filter === 'requests' && (
          <p className='border-b border-wa-border px-5 py-3 text-center text-xs text-wa-muted'>
            Messages from people who aren't in your contacts. They won't see that you read them until you accept. <button onClick={() => setFilter('all')} className='font-medium text-wa-green hover:underline'>Back to all chats</button>
          </p>
        )}

        {filter === 'archived' && (
          <p className='border-b border-wa-border px-5 py-3 text-center text-xs text-wa-muted'>
            Archived chats stay archived when new messages arrive. <button onClick={() => setFilter('all')} className='font-medium text-wa-green hover:underline'>Back to all chats</button>
          </p>
        )}

        {/* message requests row */}
        {loaded && filter === 'all' && requestCount > 0 && !filterText.trim() && (
          <button onClick={() => setFilter('requests')} className='flex w-full items-center gap-3 pl-3 pr-4 text-left transition-colors hover:bg-wa-hover'>
            <span className='flex h-[49px] w-[49px] shrink-0 items-center justify-center text-wa-teal'><IoMailUnreadOutline size={22} /></span>
            <span className='flex min-w-0 flex-1 items-center justify-between border-b border-wa-border py-4'>
              <span className='text-[17px] text-wa-text'>Message requests</span>
              <span className='flex h-5 min-w-[20px] items-center justify-center rounded-full bg-wa-badge px-1.5 text-xs font-medium text-white'>{requestCount}</span>
            </span>
          </button>
        )}

        {/* Locked chats row (opens with the secret code) */}
        {loaded && filter === 'all' && lockedCount > 0 && !filterText.trim() && (
          <button onClick={() => (lockedOpen ? setFilter('locked') : setLockPrompt(true))} className='flex w-full items-center gap-3 pl-3 pr-4 text-left transition-colors hover:bg-wa-hover'>
            <span className='flex h-[49px] w-[49px] shrink-0 items-center justify-center text-wa-teal'><IoLockClosedOutline size={21} /></span>
            <span className='flex min-w-0 flex-1 items-center justify-between border-b border-wa-border py-4'>
              <span className='text-[17px] text-wa-text'>Locked chats</span>
              <span className='text-xs font-medium text-wa-green'>{lockedCount}</span>
            </span>
          </button>
        )}

        {filter === 'locked' && (
          <p className='border-b border-wa-border px-5 py-3 text-center text-xs text-wa-muted'>
            Locked chats are hidden from your chat list and search, and their notifications don't show who wrote. <button onClick={() => { setFilter('all'); setLockedOpen(false) }} className='font-medium text-wa-green hover:underline'>Lock and go back</button>
          </p>
        )}

        {/* WhatsApp-style 'Archived' row at the top of the list */}
        {loaded && filter === 'all' && archivedCount > 0 && !filterText.trim() && (
          <button onClick={() => setFilter('archived')} className='flex w-full items-center gap-3 pl-3 pr-4 text-left transition-colors hover:bg-wa-hover'>
            <span className='flex h-[49px] w-[49px] shrink-0 items-center justify-center text-wa-teal'><MdOutlineArchive size={22} /></span>
            <span className='flex min-w-0 flex-1 items-center justify-between border-b border-wa-border py-4'>
              <span className='text-[17px] text-wa-text'>Archived</span>
              <span className='text-xs font-medium text-wa-green'>{archivedCount}</span>
            </span>
          </button>
        )}

        {loaded && conversations.length > 0 && visibleChats.length === 0 && !(filter === 'all' && (archivedCount > 0 || requestCount > 0) && !filterText.trim()) && (
          <p className='px-8 pt-10 text-center text-sm text-wa-muted'>
            {filter === 'archived' ? 'No archived chats' : filter === 'requests' ? 'No message requests' : filter === 'unread' ? 'No unread chats' : filter === 'favorites' ? 'Add chats to Favourites from the chat menu to find them here.' : filter === 'groups' ? 'No group chats yet' : filter === 'locked' ? 'No locked chats' : 'No chats found'}
          </p>
        )}

        {filterText.trim() && visibleChats.length > 0 && <p className='px-5 pb-1 pt-4 text-sm text-wa-teal'>Chats</p>}

        {visibleChats.map((conv) => {
          const peer = conv.userDetails || {}
          const unread = Boolean(conv?.unseenMsg)
          const muted = isMuted(conv)
          return (
            <NavLink
              to={"/" + peer._id}
              key={conv?._id}
              onContextMenu={(e) => { e.preventDefault(); openChatMenu(conv, e.currentTarget.getBoundingClientRect()) }}
              onTouchStart={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                pressTimer.current = setTimeout(() => { pressTimer.current = 'fired'; openChatMenu(conv, rect) }, 450)
              }}
              onTouchEnd={(e) => {
                if (pressTimer.current === 'fired') e.preventDefault()
                clearTimeout(pressTimer.current); pressTimer.current = null
              }}
              onTouchMove={() => { clearTimeout(pressTimer.current); pressTimer.current = null }}
              className={({ isActive }) => `group/chat flex select-none items-center gap-3 pl-3 pr-4 transition-colors ${isActive ? "bg-wa-panel" : "hover:bg-wa-hover"}`}
            >
              <Avatar imageUrl={peer.profile_pic} name={peer.name} userId={conv.isGroup ? undefined : peer._id} group={conv.isGroup} width={49} height={49} />
              <div className='min-w-0 flex-1 border-b border-wa-border py-3'>
                <div className='flex items-baseline justify-between gap-2'>
                  <h3 className='truncate text-[17px] text-wa-text'>{people.name(peer)}{peer.self ? ' (You)' : ''}</h3>
                  <span className={`shrink-0 text-xs ${(unread || conv.markedUnread) && !muted ? "font-medium text-wa-badge" : "text-wa-muted"}`}>
                    {formatListTime(conv?.lastMsg?.createdAt || conv.lastActivity)}
                  </span>
                </div>
                <div className='mt-0.5 flex items-center gap-2'>
                  <div className='flex min-w-0 flex-1 items-center gap-1 text-sm text-wa-muted'>
                    {lastMessagePreview(conv)}
                  </div>
                  <div className='flex shrink-0 items-center gap-1.5 text-wa-subtle'>
                    {muted && <IoNotificationsOffOutline size={16} title='Muted' />}
                    {conv.mentioned && unread && <span className='flex h-5 w-5 items-center justify-center rounded-full bg-wa-badge text-[13px] font-semibold text-white' title='You were mentioned'>@</span>}
                    {conv.pinned && <BsPinAngleFill size={14} title='Pinned' />}
                    {(unread || conv.markedUnread) && (
                      <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-medium text-white ${muted ? 'bg-wa-subtle' : 'bg-wa-badge'}`}>
                        {unread ? conv.unseenMsg : ''}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openChatMenu(conv, e.currentTarget.getBoundingClientRect()) }}
                      className='-mr-1 hidden w-0 overflow-hidden text-wa-subtle transition-all group-hover/chat:w-5 sm:block'
                      title='Chat options'
                    >
                      <IoChevronDown size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </NavLink>
          )
        })}

        {/* messages matching the search */}
        {filterText.trim().length >= 2 && (
          <div>
            <p className='px-5 pb-1 pt-4 text-sm text-wa-teal'>Messages</p>
            {searching && <p className='px-5 py-3 text-sm text-wa-muted'>Searching…</p>}
            {!searching && messageResults.length === 0 && <p className='px-5 py-3 text-sm text-wa-muted'>No messages found</p>}
            {!searching && shownResults.length === 0 && messageResults.length > 0 && <p className='px-5 py-3 text-sm text-wa-muted'>No messages found</p>}
            {!searching && shownResults.map(({ message, peer, authorName, author }) => (
              <button
                key={message._id}
                onClick={() => navigate('/' + peer._id, { state : { jumpTo : { _id : message._id, createdAt : message.createdAt }, highlight : filterText.trim() } })}
                className='block w-full border-b border-wa-border px-5 py-3 text-left hover:bg-wa-hover'
              >
                <div className='flex items-baseline justify-between gap-2'>
                  <span className='truncate text-[15px] text-wa-text'>{people.name(peer)}</span>
                  <span className='shrink-0 text-xs text-wa-muted'>{formatListTime(message.createdAt)}</span>
                </div>
                <p className='mt-0.5 line-clamp-2 text-sm text-wa-muted'>
                  {String(message.msgByUserId) === String(user._id) ? 'You: ' : peer?.isGroup && (author || authorName) ? `${author ? people.name(author) : authorName}: ` : ''}
                  {renderFormatted(message.text, filterText.trim())}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {chatMenu && (
        <PopoverMenu anchor={chatMenu.anchor} items={chatMenuItems(chatMenu.conv)} onClose={() => setChatMenu(null)} />
      )}

      {confirm && (
        <Dialog
          title={confirm.title}
          onClose={() => setConfirm(null)}
          actions={[
            { label : 'Cancel', onClick : () => setConfirm(null) },
            { label : confirm.label, danger : true, onClick : () => { confirm.action === 'exit' ? exitGroup(confirm.conv) : chatAction(confirm.conv, confirm.action); setConfirm(null) } },
          ]}
        >
          {confirm.body}
        </Dialog>
      )}

      {drawer === 'profile' && <EditUserDetails onClose={() => setDrawer(null)} user={user} />}
      {drawer === 'search' && <SearchUser onClose={() => setDrawer(null)} onNewGroup={() => setDrawer('newgroup')} />}
      {drawer === 'newgroup' && <NewGroup onClose={() => setDrawer(null)} />}
      {drawer === 'starred' && <StarredMessages onClose={() => setDrawer(null)} />}
      {drawer === 'settings' && <SettingsDrawer onClose={() => setDrawer(null)} />}
      {drawer === 'status' && <StatusPanel onClose={() => setDrawer(null)} onUnseenChange={setStatusUnseen} />}
      {drawer === 'calls' && <CallsPanel onClose={() => setDrawer(null)} />}
      {drawer === 'planner' && <Planner initialTab={plannerTab} onClose={() => setDrawer(null)} />}
      {muteFor && <MuteDialog name={people.name(muteFor.userDetails)} onClose={() => setMuteFor(null)} onMute={(seconds) => chatAction(muteFor, 'mute', { seconds })} />}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
      {lockPrompt && (
        <Dialog
          title='Locked chats'
          onClose={() => { setLockPrompt(false); setLockCode(''); setLockError('') }}
          actions={[{ label : 'Cancel', onClick : () => { setLockPrompt(false); setLockCode(''); setLockError('') } }, { label : 'Open', primary : true, disabled : lockCode.length < 4, onClick : openLocked }]}
        >
          <p className='mb-3'>Enter your secret code to see locked chats.</p>
          <input type='password' autoFocus value={lockCode} onChange={(e) => { setLockCode(e.target.value); setLockError('') }} onKeyDown={(e) => e.key === 'Enter' && lockCode.length >= 4 && openLocked()} placeholder='Secret code' aria-label='Secret code' className='wa-input' />
          {lockError && <p className='mt-2 text-sm text-red-600'>{lockError}</p>}
        </Dialog>
      )}
    </div>
    </div>
  );
}

const ChatListSkeleton = () => (
  <div className='animate-pulse'>
    {Array.from({ length : 7 }).map((_, i) => (
      <div key={i} className='flex items-center gap-3 px-3 py-3'>
        <div className='h-[49px] w-[49px] shrink-0 rounded-full bg-wa-panel' />
        <div className='flex-1 space-y-2'>
          <div className='h-3.5 w-2/5 rounded bg-wa-panel' />
          <div className='h-3 w-4/5 rounded bg-wa-panel' />
        </div>
      </div>
    ))}
  </div>
)

export default SideBar;
