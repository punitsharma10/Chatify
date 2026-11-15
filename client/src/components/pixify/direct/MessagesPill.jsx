import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IoPaperPlaneOutline, IoEllipsisHorizontal, IoClose, IoExpandOutline, IoCreateOutline } from 'react-icons/io5'
import Avatar from '../../Avatar'
import { api, useSocialUnread, shortAgo, useOnVisible } from '../../../helpers/social'
import { useThreadList, listPreview, dmApp, dmBase } from './directData'
import { ThreadAvatar, NewMessageModal } from './DirectModals'
import DirectThread from './DirectThread'

// Instagram's floating Messages: a button at the bottom right (on phones just above the tab bar) with the unread
// count and your latest chats. Clicking it opens a popup over the current page with your conversations; a chat opens
// inside the popup, and "enlarge" goes to the full Messages page.

export const MessagesPopup = ({ onClose, unreadCount }) => {
  const navigate = useNavigate()
  const list = useThreadList('inbox')
  const more = useOnVisible(list.loadMore, !!list.next)
  const [open, setOpen] = useState(null) // thread id shown inside the popup
  const [newMessage, setNewMessage] = useState(false)
  // going to another page (e.g. a new chat opened in Messages) closes the popup
  const { pathname } = useLocation()
  const firstPath = React.useRef(pathname)
  useEffect(() => { if (pathname !== firstPath.current) onClose() }, [pathname, onClose])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const enlarge = () => { onClose(); navigate(open ? `${dmBase()}/t/${open}` : `${dmBase()}`) }

  return (
    <div role='dialog' aria-label='Messages'
      className='fixed inset-x-2 bottom-[60px] top-16 z-50 flex animate-pop flex-col overflow-hidden rounded-2xl bg-px-bg text-px-text shadow-[0_8px_40px_rgba(0,0,0,0.3)] ring-1 ring-px-border md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:h-[min(640px,calc(100dvh-120px))] md:w-[440px]'>
      {open ? (
        <div className='min-h-0 flex-1'><DirectThread threadId={open} embedded onBack={() => setOpen(null)} onEnlarge={enlarge} /></div>
      ) : (
        <>
          <header className='flex h-14 shrink-0 items-center gap-2 border-b border-px-border px-4'>
            <h2 className='text-lg font-bold'>Messages</h2>
            {unreadCount > 0 && <span className='flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#ff3040] px-1.5 text-xs font-semibold text-white'>{unreadCount}</span>}
            <span className='flex-1' />
            <button onClick={enlarge} title='Open Messages' aria-label='Open Messages' className='rounded-full p-1.5 hover:bg-px-hover'><IoExpandOutline size={20} /></button>
            <button onClick={onClose} title='Close' aria-label='Close' className='rounded-full p-1.5 hover:bg-px-hover'><IoClose size={24} /></button>
          </header>
          <div className='relative min-h-0 flex-1 overflow-y-auto py-1'>
            {list.loading && !list.threads.length && [0, 1, 2, 3].map((i) => (
              <div key={i} className='flex items-center gap-3 px-4 py-2'><span className='h-14 w-14 animate-pulse rounded-full bg-px-raised' /><span className='flex-1 space-y-2'><span className='block h-3 w-32 animate-pulse rounded bg-px-raised' /><span className='block h-3 w-20 animate-pulse rounded bg-px-raised' /></span></div>
            ))}
            {!list.loading && !list.threads.length && (
              <div className='flex flex-col items-center px-6 py-14 text-center'>
                <span className='flex h-16 w-16 items-center justify-center rounded-full border-2 border-px-text'><IoPaperPlaneOutline size={30} /></span>
                <p className='mt-3 font-semibold'>No messages yet</p>
                <button onClick={() => setNewMessage(true)} className='mt-3 h-8 rounded-lg bg-px-blue px-4 text-sm font-semibold text-white'>Send message</button>
              </div>
            )}
            {list.threads.map((t) => (
              <button key={t._id} onClick={() => setOpen(t._id)} className='flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-px-hover'>
                <ThreadAvatar thread={t} size={56} />
                <span className='min-w-0 flex-1'>
                  <span className={`block truncate text-[15px] ${t.unread ? 'font-bold' : ''}`}>{t.title}</span>
                  <span className={`flex min-w-0 items-center gap-1 text-[13px] ${t.unread ? 'font-semibold text-px-text' : 'text-px-muted'}`}>
                    <span className='truncate'>{t.unread ? 'New message' : listPreview(t)}</span>
                    {t.lastMessageAt && <span className='shrink-0 font-normal text-px-muted'>· {shortAgo(t.lastMessageAt)}</span>}
                  </span>
                </span>
                {t.unread && !t.muted && <span className='h-2 w-2 shrink-0 rounded-full bg-px-blue' aria-label='Unread' />}
              </button>
            ))}
            <div ref={more} />
          </div>
          {/* new message */}
          <button onClick={() => setNewMessage(true)} title='New message' aria-label='New message'
            className='absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-px-bg shadow-[0_2px_12px_rgba(0,0,0,0.25)] ring-1 ring-px-border hover:bg-px-hover'>
            <IoCreateOutline size={24} />
          </button>
        </>
      )}
      {newMessage && <NewMessageModal onClose={() => setNewMessage(false)} />}
    </div>
  )
}

const MessagesPill = ({ className = '' }) => {
  const unread = useSocialUnread()
  const [threads, setThreads] = useState([])
  const [popup, setPopup] = useState(false)
  // refresh the faces when new messages arrive
  useEffect(() => {
    let alive = true
    api.get(`/dm/threads?app=${dmApp()}`).then((r) => alive && setThreads(r.threads.slice(0, 3))).catch(() => {})
    return () => { alive = false }
  }, [unread.dm])
  const face = (t) => (t.isGroup ? t.members[0] : t.peer) || {}
  if (popup) return <MessagesPopup onClose={() => setPopup(false)} unreadCount={unread.dm} />
  return (
    <button onClick={() => setPopup(true)} aria-label={`Messages${unread.dm ? `, ${unread.dm} unread` : ''}`}
      className={`${className} fixed bottom-[60px] right-3 z-30 flex h-12 max-md:h-11 max-md:pl-3 max-md:[&>span:nth-child(2)]:hidden items-center gap-2.5 rounded-full bg-px-bg pl-4 pr-3 text-px-text shadow-[0_4px_18px_rgba(0,0,0,0.18)] ring-1 ring-px-border transition hover:bg-px-hover md:bottom-6 md:right-6 md:h-14 md:gap-3 md:pl-5 md:pr-4`}>
      <span className='relative'>
        <IoPaperPlaneOutline size={24} />
        {unread.dm > 0 && <span className='absolute -bottom-1.5 -left-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff3040] px-1 text-[11px] font-semibold text-white ring-2 ring-px-bg'>{unread.dm > 99 ? '99+' : unread.dm}</span>}
      </span>
      <span className='text-[15px] font-semibold'>Messages</span>
      {threads.length > 0 && (
        <span className='flex items-center -space-x-2'>
          {threads.map((t) => <span key={t._id} className='rounded-full ring-2 ring-px-bg'><Avatar width={26} height={26} name={face(t).name || t.title} imageUrl={face(t).profile_pic} /></span>)}
          <span className='flex h-[26px] w-[26px] items-center justify-center rounded-full bg-px-raised text-px-muted ring-2 ring-px-bg'><IoEllipsisHorizontal size={14} /></span>
        </span>
      )}
    </button>
  )
}

export default MessagesPill
