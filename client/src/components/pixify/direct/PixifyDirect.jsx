import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom'
import { IoCreateOutline, IoChevronBack, IoPaperPlaneOutline, IoNotificationsOffOutline } from 'react-icons/io5'
import { useOnVisible, useSocialUnread, shortAgo, api } from '../../../helpers/social'
import { notifyError } from '../../../helpers/toast'
import { useThreadList, listPreview } from './directData'
import { NewMessageModal, ThreadAvatar } from './DirectModals'

// Pixify Direct: Instagram-style inbox. Left: conversations (or Requests); right: the open conversation.

const ThreadRow = ({ t, active, onClick }) => (
  <button onClick={onClick} aria-current={active ? 'true' : undefined}
    className={`flex w-full items-center gap-3 px-6 py-2 text-left max-md:px-4 ${active ? 'bg-px-raised' : 'hover:bg-px-hover'}`}>
    <ThreadAvatar thread={t} size={56} />
    <span className='min-w-0 flex-1'>
      <span className={`block truncate text-sm ${t.unread ? 'font-bold' : ''}`}>{t.title}</span>
      <span className={`flex min-w-0 items-center gap-1 text-[13px] ${t.unread ? 'font-semibold text-px-text' : 'text-px-muted'}`}>
        <span className='truncate'>{listPreview(t)}</span>
        {t.lastMessageAt && <span className='shrink-0 text-px-muted'>· {shortAgo(t.lastMessageAt)}</span>}
      </span>
    </span>
    {t.muted && <IoNotificationsOffOutline className='shrink-0 text-px-muted' size={16} />}
    {t.unread && !t.muted && <span className='h-2 w-2 shrink-0 rounded-full bg-px-blue' aria-label='Unread' />}
  </button>
)

const ThreadList = ({ folder, activeId, onNew }) => {
  const navigate = useNavigate()
  const user = useSelector((s) => s.user)
  const unread = useSocialUnread()
  const list = useThreadList(folder)
  const more = useOnVisible(list.loadMore, !!list.next)
  const requests = folder === 'requests'

  return (
    <div className='flex h-full flex-col'>
      <div className='flex h-[74px] shrink-0 items-center justify-between px-6 pt-3 max-md:h-[60px] max-md:px-4 max-md:pt-0'>
        {requests ? (
          <div className='flex items-center gap-3'>
            <button onClick={() => navigate('/pixify/direct')} aria-label='Back'><IoChevronBack size={26} /></button>
            <h1 className='text-xl font-bold'>Message requests</h1>
          </div>
        ) : (
          <>
            <div className='flex items-center gap-3'>
              <button onClick={() => navigate('/pixify')} aria-label='Back to Pixify' className='md:hidden'><IoChevronBack size={26} /></button>
              <h1 className='truncate text-xl font-bold'>{user.username || user.name}</h1>
            </div>
            <button onClick={onNew} title='New message' aria-label='New message'><IoCreateOutline size={26} /></button>
          </>
        )}
      </div>
      {requests ? (
        <p className='px-6 pb-3 text-[13px] text-px-muted max-md:px-4'>Open a chat to see who sent it. They won't know you've seen it until you accept.</p>
      ) : (
        <div className='flex items-center justify-between px-6 pb-2 pt-3 max-md:px-4'>
          <span className='font-bold'>Messages</span>
          <button onClick={() => navigate('/pixify/direct/requests')} className='text-sm font-semibold text-px-muted hover:text-px-text'>
            Requests{unread.dmRequests > 0 ? ` (${unread.dmRequests})` : ''}
          </button>
        </div>
      )}
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {list.loading && !list.threads.length && [0, 1, 2, 3].map((i) => (
          <div key={i} className='flex items-center gap-3 px-6 py-2'><span className='h-14 w-14 animate-pulse rounded-full bg-px-raised' /><span className='flex-1 space-y-2'><span className='block h-3 w-32 animate-pulse rounded bg-px-raised' /><span className='block h-3 w-20 animate-pulse rounded bg-px-raised' /></span></div>
        ))}
        {list.error && <p className='px-6 py-4 text-sm text-px-muted'>{list.error} <button onClick={list.reload} className='font-semibold text-px-blue'>Try again</button></p>}
        {!list.loading && !list.error && !list.threads.length && (
          <p className='px-6 py-10 text-center text-sm text-px-muted'>{requests ? 'No message requests.' : 'No messages yet.'}</p>
        )}
        {list.threads.map((t) => <ThreadRow key={t._id} t={t} active={t._id === activeId} onClick={() => navigate(`/pixify/direct/t/${t._id}`, { state : { folder } })} />)}
        <div ref={more} />
      </div>
    </div>
  )
}

// right side when no conversation is open
export const DirectEmpty = () => {
  const { openNewMessage } = useDirect()
  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center'>
      <span className='flex h-24 w-24 items-center justify-center rounded-full border-2 border-px-text'><IoPaperPlaneOutline size={48} /></span>
      <p className='text-xl'>Your messages</p>
      <p className='text-sm text-px-muted'>Send private photos and messages to a friend or group.</p>
      <button onClick={openNewMessage} className='mt-2 h-8 rounded-lg bg-px-blue px-4 text-sm font-semibold text-white hover:bg-[#1877f2]'>Send message</button>
    </div>
  )
}

// /pixify/direct/u/:handle -> that person's conversation
export const DirectOpenUser = () => {
  const { handle } = useParams()
  const navigate = useNavigate()
  useEffect(() => {
    let alive = true
    api.get(`/dm/with/${encodeURIComponent(handle)}`)
      .then((r) => alive && navigate(`/pixify/direct/t/${r.thread._id}`, { replace : true }))
      .catch((e) => { if (alive) { notifyError(e.message); navigate('/pixify/direct', { replace : true }) } })
    return () => { alive = false }
  }, [handle, navigate])
  return <div className='flex h-full items-center justify-center'><span className='h-8 w-8 animate-spin rounded-full border-2 border-px-border border-t-px-text' /></div>
}

const DirectCtx = React.createContext({ openNewMessage : () => {} })
export const useDirect = () => React.useContext(DirectCtx)

const PixifyDirect = () => {
  const { pathname, state } = useLocation()
  const open = useMatch('/pixify/direct/t/:threadId')
  const opening = useMatch('/pixify/direct/u/:handle')
  const [newMessage, setNewMessage] = useState(false)
  const folder = pathname.startsWith('/pixify/direct/requests') || (open && state?.folder === 'requests') ? 'requests' : 'inbox'
  const inThread = !!(open || opening)

  return (
    <DirectCtx.Provider value={{ openNewMessage : () => setNewMessage(true) }}>
      <div className='flex h-full min-h-0'>
        <aside className={`h-full w-full shrink-0 border-r border-px-border md:w-[350px] lg:w-[397px] ${inThread ? 'max-md:hidden' : ''}`}>
          <ThreadList folder={folder} activeId={open?.params.threadId} onNew={() => setNewMessage(true)} />
        </aside>
        <section className={`h-full min-w-0 flex-1 ${inThread ? '' : 'max-md:hidden'}`}>
          <Outlet />
        </section>
      </div>
      {newMessage && <NewMessageModal onClose={() => setNewMessage(false)} />}
    </DirectCtx.Provider>
  )
}

export default PixifyDirect
