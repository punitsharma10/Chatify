import React, { useEffect, useState } from 'react'
import { IoClose, IoSearchOutline } from 'react-icons/io5'
import { socketCall } from '../helpers/socketCall'
import { formatListTime } from '../helpers/formatTime'
import { renderFormatted } from '../helpers/formatText'
import Loading from './Loading'
import { searchLocal } from '../helpers/e2ee'

// "Search messages" panel for one conversation
const ChatSearch = ({ socket, peerId, peerName, myId, onClose, onSelect, onTermChange }) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    onTermChange(q.trim())
    const term = q.trim()
    if (!term) { setResults([]); return }
    setLoading(true)
    const t = setTimeout(async () => {
      // plain messages are searched on the server, end-to-end encrypted ones on this device
      const [res, local] = await Promise.all([socketCall(socket, 'search-messages', { peerId, q : term }), searchLocal(term, peerId)])
      const server = res.ok ? res.results : []
      const seen = new Set(server.map((r) => String(r.message._id)))
      const mine = local.filter((r) => !seen.has(r.id)).map((r) => ({ message : { _id : r.id, text : r.text, createdAt : r.at, msgByUserId : r.from } }))
      setResults([...server, ...mine].sort((a, b) => new Date(b.message.createdAt) - new Date(a.message.createdAt)))
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [q, socket, peerId, onTermChange])

  useEffect(() => () => onTermChange(''), [onTermChange])

  return (
    <div className='flex h-full flex-col bg-wa-surface'>
      <header className='flex h-[59px] shrink-0 items-center gap-4 bg-wa-panel px-4'>
        <button onClick={onClose} className='wa-icon-btn -ml-2' title='Close'><IoClose size={22} /></button>
        <h2 className='text-base text-wa-text'>Search messages</h2>
      </header>
      <div className='shrink-0 border-b border-wa-border px-3 py-2'>
        <div className='flex h-[38px] items-center gap-3 rounded-lg bg-wa-panel px-3'>
          <IoSearchOutline size={17} className='text-wa-icon' />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search...'
            className='w-full bg-transparent text-base text-wa-text outline-none sm:text-sm'
            autoFocus
          />
        </div>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>
        {!q.trim() && <p className='px-8 py-10 text-center text-sm text-wa-muted'>Search for messages with {peerName}.</p>}
        {loading && <div className='py-6'><Loading /></div>}
        {!loading && q.trim() && results.length === 0 && <p className='px-8 py-10 text-center text-sm text-wa-muted'>No messages found</p>}
        {!loading && results.map(({ message }) => (
          <button
            key={message._id}
            onClick={() => onSelect(message)}
            className='block w-full border-b border-wa-border px-5 py-3 text-left hover:bg-wa-hover'
          >
            <p className='text-xs text-wa-muted'>{formatListTime(message.createdAt)}</p>
            <p className='mt-0.5 line-clamp-2 text-sm text-wa-text'>
              {String(message.msgByUserId) === String(myId) && <span className='text-wa-muted'>You: </span>}
              {renderFormatted(message.text, q.trim())}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ChatSearch
