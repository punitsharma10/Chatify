import React, { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { IoSearchOutline, IoSend } from 'react-icons/io5'
import { BsCheck2 } from 'react-icons/bs'
import Dialog from './Dialog'
import Avatar from './Avatar'
import { usePeopleNames } from '../helpers/contacts'

const MAX_TARGETS = 5

// pick up to 5 chats to forward the selected messages to
const ForwardDialog = ({ count, onClose, onForward }) => {
  const conversations = useSelector((s) => s.chat.conversations)
  const names = usePeopleNames()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState([])
  const [sending, setSending] = useState(false)

  const people = useMemo(() => {
    // people and groups you can still write to
    const list = conversations.filter((c) => c.userDetails && (!c.isGroup || c.isMember)).map((c) => c.userDetails)
    const q = query.trim().toLowerCase()
    return list.filter((p) => !p.blockedByMe && (!q || names.name(p).toLowerCase().includes(q)))
  }, [conversations, query, names])

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_TARGETS ? p : [...p, id]))

  const send = async () => {
    setSending(true)
    await onForward(picked)
    setSending(false)
  }

  return (
    <Dialog title={`Forward ${count} message${count > 1 ? 's' : ''} to`} onClose={onClose} wide>
      <div className='flex h-[38px] items-center gap-3 rounded-lg bg-wa-panel px-3'>
        <IoSearchOutline size={17} className='text-[#54656f]' />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search chats'
          className='w-full bg-transparent text-base text-wa-text outline-none sm:text-sm'
          autoFocus
        />
      </div>
      
      <div className='-mx-2 mt-2 max-h-[45dvh] overflow-y-auto scrollbar'>
        {people.length === 0 && <p className='py-6 text-center'>No chats found</p>}
        {people.map((p) => {
          const on = picked.includes(String(p._id))
          return (
            <button
              key={p._id}
              onClick={() => toggle(String(p._id))}
              className='flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-wa-hover'
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${on ? 'border-wa-green bg-wa-green text-white' : 'border-[#8696a0]'}`}>
                {on && <BsCheck2 size={14} />}
              </span>
              <Avatar width={40} height={40} name={p.name} imageUrl={p.profile_pic} group={!!p.isGroup} />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-[15px] text-wa-text'>{names.name(p)}{p.self ? ' (You)' : ''}</span>
                <span className='block truncate text-xs'>{p.isGroup ? 'Group' : p.about}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* WhatsApp-style footer: selected names + round send button */}
      <div className='-mx-6 -mb-5 mt-4 flex items-center gap-3 bg-wa-panel px-6 py-3'>
        <p className='min-w-0 flex-1 truncate text-sm text-wa-text'>
          {picked.length ? conversations.map((c) => c.userDetails).filter((p) => p && picked.includes(String(p._id))).map((p) => names.name(p)).join(', ') : <span className='text-wa-muted'>Select up to {MAX_TARGETS} chats</span>}
        </p>
        <button onClick={onClose} className='h-9 rounded-full border border-[#d1d7db] bg-white px-5 text-sm font-medium text-wa-teal hover:bg-wa-hover'>Cancel</button>
        <button
          onClick={send}
          disabled={!picked.length || sending}
          className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-green text-white shadow-menu transition-colors hover:bg-wa-greenDark disabled:opacity-40'
          title='Forward'
        >
          {sending ? <span className='h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent' /> : <IoSend size={20} />}
        </button>
      </div>
    </Dialog>
  )
}

export default ForwardDialog
