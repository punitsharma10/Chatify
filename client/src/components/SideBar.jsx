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
import { IoMailUnreadOutline, IoCall } from "react-icons/io5";
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
import { plainPreview, renderFormatted } from '../helpers/formatText';
import { MdOutlineChat, MdOutlineArchive, MdOutlineUnarchive, MdOutlineMarkChatUnread, MdOutlineMarkChatRead, MdOutlineCleaningServices } from "react-icons/md";
import { HiDotsVertical } from "react-icons/hi";
import { IoSearchOutline, IoClose, IoCamera, IoVideocam, IoChevronDown, IoNotificationsOffOutline, IoNotificationsOutline, IoTrashOutline, IoStarOutline, IoSettingsOutline, IoDocumentOutline, IoBan } from "react-icons/io5";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import { BiLogOut } from "react-icons/bi";
import { FaRegUser } from "react-icons/fa";

const SideBar = () => {
  const user = useSelector(state => state?.user)
  const { conversations, loaded, typing } = useSelector(state => state.chat)
  const socketConnection = user.socketConnection
  const [drawer, setDrawer] = useState(null) // profile | search | newgroup | starred | settings
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
      const res = await socketCall(socketConnection, 'search-messages', { q })
      setMessageResults(res.ok ? res.results : [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [filterText, socketConnection])

  const requestCount = conversations.filter(c => c.request).length
  const archivedCount = conversations.filter(c => c.archived && !c.request).length
  const unreadCount = conversations.filter(c => !c.archived && !c.request && (c.unseenMsg || c.markedUnread)).length

  const visibleChats = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    return conversations.filter(conv => {
      // message requests only appear in their own list
      if (filter === "requests") return !!conv.request && (!q || people.name(conv.userDetails).toLowerCase().includes(q))
      if (conv.request) return false
      if (filter === "archived") { if (!conv.archived) return false }
      else if (conv.archived && !q) return false
      if (filter === "unread" && !(conv?.unseenMsg || conv?.markedUnread)) return false
      if (q && !people.name(conv?.userDetails).toLowerCase().includes(q) && !conv?.userDetails?.name?.toLowerCase().includes(q)) return false
      return true
    })
  }, [conversations, filterText, filter, people])

  const chatAction = useCallback(async (conv, action) => {
    const res = await socketCall(socketConnection, 'chat-action', { peerId : conv.userDetails._id, action })
    if (!res.ok) return notifyError(res.error)
    const undoOf = { archive : 'unarchive', unarchive : 'archive', mute : 'unmute', unmute : 'mute', pin : 'unpin', unpin : 'pin' }
    const messages = {
      archive : 'Chat archived', unarchive : 'Chat unarchived', mute : 'Chat muted', unmute : 'Chat unmuted',
      pin : 'Chat pinned', unpin : 'Chat unpinned', clear : 'Chat cleared', delete : 'Chat deleted'
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
    { label : conv.muted ? 'Unmute notifications' : 'Mute notifications', icon : conv.muted ? <IoNotificationsOutline size={18} /> : <IoNotificationsOffOutline size={18} />, onClick : () => chatAction(conv, conv.muted ? 'unmute' : 'mute') },
    { label : conv.pinned ? 'Unpin chat' : 'Pin chat', icon : <BsPinAngle size={17} />, onClick : () => chatAction(conv, conv.pinned ? 'unpin' : 'pin'), hidden : conv.archived },
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
    if (!last) return null
    if (last.system) return <span className='truncate'>{systemText(last, user._id)}</span>
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
        {last.imageUrl && <span className='flex shrink-0 items-center gap-1'><IoCamera size={16} />{!last.text && <span>Photo</span>}</span>}
        {last.videoUrl && <span className='flex shrink-0 items-center gap-1'><IoVideocam size={16} />{!last.text && <span>Video</span>}</span>}
        {last.fileUrl && <span className='flex min-w-0 items-center gap-1'><IoDocumentOutline size={15} className='shrink-0' />{!last.text && <span className='truncate'>{last.fileName}</span>}</span>}
        {last.text && <span className='truncate'>{plainPreview(last.text)}</span>}
      </>
    )
  }

  return (
    <div className='relative flex h-full flex-col bg-white'>
      {/* header */}
      <header className='flex h-[59px] shrink-0 items-center justify-between bg-wa-panel px-3 sm:px-4'>
        <button onClick={() => setDrawer('profile')} title='Profile'>
          <Avatar width={40} height={40} name={user?.name} imageUrl={user?.profile_pic} />
        </button>

        <div className='relative flex items-center gap-1'>
          <button className='wa-icon-btn' title='New chat' onClick={() => setDrawer('search')}>
            <MdOutlinePersonAddAlt size={22} />
          </button>
          <button className={`wa-icon-btn ${menuOpen ? "bg-black/10" : ""}`} title='Menu' onClick={() => setMenuOpen(o => !o)}>
            <HiDotsVertical size={20} />
          </button>

          {menuOpen && (
            <>
              <div className='fixed inset-0 z-20' onClick={() => setMenuOpen(false)} />
              <div className='absolute right-0 top-11 z-30 w-56 origin-top-right animate-pop rounded-md bg-white py-2 shadow-menu'>
                {[
                  ['New group', <MdOutlineGroupAdd size={17} />, () => setDrawer('newgroup')],
                  ['New chat', <MdOutlineChat size={16} />, () => setDrawer('search')],
                  ['Starred messages', <IoStarOutline size={16} />, () => setDrawer('starred')],
                  ['Archived chats', <MdOutlineArchive size={17} />, () => setFilter('archived')],
                  ['Profile', <FaRegUser size={15} />, () => setDrawer('profile')],
                  ['Settings', <IoSettingsOutline size={17} />, () => setDrawer('settings')],
                  ['Log out', <BiLogOut size={17} />, handleLogout],
                ].map(([label, icon, fn]) => (
                  <button key={label} onClick={() => { setMenuOpen(false); fn() }} className='flex w-full items-center gap-3 px-6 py-3 text-left text-[14.5px] text-[#3b4a54] hover:bg-wa-panel'>
                    <span className='w-5 text-[#54656f]'>{icon}</span> {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {showNotifyBanner && (
        <div className='flex shrink-0 items-center gap-4 bg-[#53bdeb] px-4 py-3.5'>
          <span className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#53bdeb]'>
            <IoNotificationsOffSharp size={24} />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='text-[15px] text-[#111b21]'>Get notified of new messages</p>
            <button onClick={enableNotifications} className='mt-0.5 text-left text-sm text-[#111b21]/80 underline-offset-2 hover:underline'>
              Turn on desktop notifications ›
            </button>
          </div>
          <button onClick={dismissBanner} className='shrink-0 rounded-full p-1 text-[#111b21]/60 hover:bg-black/10 hover:text-[#111b21]' title='Dismiss'>
            <IoClose size={18} />
          </button>
        </div>
      )}

      {/* connection status */}
      {!user.connected && user.socketConnection && (
        <div className='flex shrink-0 items-center gap-2 bg-[#ffd279] px-4 py-2 text-[13px] text-[#3b4a54]'>
          <span className='h-3 w-3 animate-spin rounded-full border-2 border-[#3b4a54] border-t-transparent' />
          Connecting… Messages will send when you're back online.
        </div>
      )}

      {/* search + filters */}
      <div className='shrink-0 border-b border-wa-border bg-white px-3 pb-2 pt-2'>
        <div className='flex h-[38px] items-center gap-4 rounded-lg bg-wa-panel px-4 sm:h-[35px]'>
          <IoSearchOutline size={17} className='shrink-0 text-[#54656f]' />
          <input
            type='text'
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder='Search chats and messages'
            className='w-full bg-transparent text-base text-wa-text outline-none placeholder:text-[#8696a0] sm:text-sm'
          />
          {filterText && (
            <button onClick={() => setFilterText("")} className='text-[#54656f]' title='Clear search'>
              <IoClose size={18} />
            </button>
          )}
        </div>
        <div className='mt-2 flex gap-2 overflow-x-auto'>
          {[["all", "All"], ["unread", `Unread${unreadCount ? ` (${unreadCount})` : ""}`], ["archived", `Archived${archivedCount ? ` (${archivedCount})` : ""}`]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 rounded-full px-3 py-1 text-[13px] transition-colors ${filter === key ? "bg-[#e7fce3] text-[#008069]" : "bg-wa-panel text-wa-muted hover:bg-[#e9edef]"}`}
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
            {filter === 'archived' ? 'No archived chats' : filter === 'requests' ? 'No message requests' : filter === 'unread' ? 'No unread chats' : 'No chats found'}
          </p>
        )}

        {filterText.trim() && visibleChats.length > 0 && <p className='px-5 pb-1 pt-4 text-sm text-wa-teal'>Chats</p>}

        {visibleChats.map((conv) => {
          const peer = conv.userDetails || {}
          const unread = Boolean(conv?.unseenMsg)
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
                  <span className={`shrink-0 text-xs ${(unread || conv.markedUnread) && !conv.muted ? "font-medium text-wa-badge" : "text-wa-muted"}`}>
                    {formatListTime(conv?.lastMsg?.createdAt || conv.lastActivity)}
                  </span>
                </div>
                <div className='mt-0.5 flex items-center gap-2'>
                  <div className='flex min-w-0 flex-1 items-center gap-1 text-sm text-wa-muted'>
                    {lastMessagePreview(conv)}
                  </div>
                  <div className='flex shrink-0 items-center gap-1.5 text-[#8696a0]'>
                    {conv.muted && <IoNotificationsOffOutline size={16} title='Muted' />}
                    {conv.pinned && <BsPinAngleFill size={14} title='Pinned' />}
                    {(unread || conv.markedUnread) && (
                      <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-medium text-white ${conv.muted ? 'bg-[#8696a0]' : 'bg-wa-badge'}`}>
                        {unread ? conv.unseenMsg : ''}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openChatMenu(conv, e.currentTarget.getBoundingClientRect()) }}
                      className='-mr-1 hidden w-0 overflow-hidden text-[#8696a0] transition-all group-hover/chat:w-5 sm:block'
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
            {!searching && messageResults.map(({ message, peer, authorName, author }) => (
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
