import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoPaperPlaneOutline, IoEllipsisHorizontal } from 'react-icons/io5'
import Avatar from '../../Avatar'
import { api, useSocialUnread } from '../../../helpers/social'

// Instagram's floating "Messages" button (bottom right on desktop): unread count + your latest conversations.
const MessagesPill = () => {
  const navigate = useNavigate()
  const unread = useSocialUnread()
  const [threads, setThreads] = useState([])
  // refresh the faces when new messages arrive
  useEffect(() => {
    let alive = true
    api.get('/dm/threads').then((r) => alive && setThreads(r.threads.slice(0, 3))).catch(() => {})
    return () => { alive = false }
  }, [unread.dm])
  const face = (t) => (t.isGroup ? t.members[0] : t.peer) || {}
  return (
    <button onClick={() => navigate('/pixify/direct')} aria-label={`Messages${unread.dm ? `, ${unread.dm} unread` : ''}`}
      className='fixed bottom-6 right-6 z-30 hidden h-14 items-center gap-3 rounded-full bg-px-bg pl-5 pr-4 text-px-text shadow-[0_4px_18px_rgba(0,0,0,0.18)] ring-1 ring-px-border transition hover:bg-px-hover md:flex'>
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
