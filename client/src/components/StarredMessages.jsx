import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { IoStar } from 'react-icons/io5'
import Drawer from './Drawer'
import Avatar from './Avatar'
import Loading from './Loading'
import { socketCall } from '../helpers/socketCall'
import { formatListTime } from '../helpers/formatTime'
import { renderFormatted, messagePreview } from '../helpers/formatText'
import { thumbUrl, videoPoster } from '../helpers/media'
import { usePeopleNames } from '../helpers/contacts'

// all starred messages across chats
const StarredMessages = ({ onClose }) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const me = useSelector((s) => s.user._id)
  const [items, setItems] = useState(null)
  const navigate = useNavigate()
  const names = usePeopleNames()

  useEffect(() => {
    socketCall(socket, 'get-starred').then((res) => setItems(res.ok ? res.messages : []))
  }, [socket])

  const open = ({ message, peer }) => {
    onClose()
    navigate('/' + peer._id, { state : { jumpTo : { _id : message._id, createdAt : message.createdAt } } })
  }

  return (
    <Drawer title='Starred messages' onClose={onClose} className='bg-wa-panel'>
      {!items && <div className='py-8'><Loading /></div>}
      {items && items.length === 0 && (
        <div className='flex flex-col items-center px-10 pt-16 text-center'>
          <span className='flex h-20 w-20 items-center justify-center rounded-full bg-white text-[#8696a0]'><IoStar size={36} /></span>
          <p className='mt-5 text-sm text-wa-muted'>Tap and hold (or right-click) any message and choose “Star” to find it here later.</p>
        </div>
      )}
      {items && items.map((item) => {
        const { message, peer, authorName, author } = item
        const peerName = names.name(peer)
        const mine = String(message.msgByUserId) === String(me)
        return (
          <button key={message._id} onClick={() => open(item)} className='block w-full border-b border-wa-border bg-white px-4 py-3 text-left hover:bg-wa-hover'>
            <div className='flex items-center gap-2'>
              <Avatar width={26} height={26} name={peer?.name} imageUrl={peer?.profile_pic} group={!!peer?.isGroup} />
              <p className='min-w-0 flex-1 truncate text-sm text-wa-text'>{peer?.isGroup ? `${mine ? 'You' : author ? names.name(author) : authorName} ▸ ${peerName}` : mine ? `You ▸ ${peerName}` : `${peerName} ▸ You`}</p>
              <span className='shrink-0 text-xs text-wa-muted'>{formatListTime(message.createdAt)}</span>
            </div>
            <div className='mt-2 flex items-start gap-2 pl-8'>
              {message.imageUrl && <img src={thumbUrl(message.imageUrl, 120)} alt='' className='h-14 w-14 rounded object-cover' />}
              {message.videoUrl && <img src={videoPoster(message.videoUrl)} alt='' className='h-14 w-14 rounded bg-black object-cover' />}
              <p className='line-clamp-3 flex-1 text-sm text-wa-text'>
                {message.text ? renderFormatted(message.text) : messagePreview(message)}
              </p>
              <IoStar size={13} className='mt-1 shrink-0 text-[#8696a0]' />
            </div>
          </button>
        )
      })}
    </Drawer>
  )
}

export default StarredMessages
