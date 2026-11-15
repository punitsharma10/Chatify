import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { IoCallOutline, IoVideocamOutline } from 'react-icons/io5'
import { MdCallMade, MdCallReceived, MdCallMissed } from 'react-icons/md'
import Drawer from './Drawer'
import Avatar from './Avatar'
import { socketCall } from '../helpers/socketCall'
import { usePeopleNames } from '../helpers/contacts'
import { useCalls } from './CallManager'
import { formatListTime } from '../helpers/formatTime'
import { formatCallDuration } from './MessageBubble'

// WhatsApp "Calls": recent calls across all chats, tap to open the chat, buttons to call back
const CallsPanel = ({ onClose }) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const me = useSelector((s) => s.user._id)
  const blocked = useSelector((s) => s.user.blocked)
  const names = usePeopleNames()
  const navigate = useNavigate()
  const { startCall, startGroupCall, inCall } = useCalls()
  const [calls, setCalls] = useState(null)

  useEffect(() => {
    socketCall(socket, 'call-history').then((res) => setCalls(res.ok ? res.calls : []))
  }, [socket])

  return (
    <Drawer title='Calls' onClose={onClose}>
      {!calls && <div className='mx-auto my-8 h-6 w-6 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' />}
      {calls && calls.length === 0 && (
        <div className='px-8 pt-12 text-center'>
          <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-wa-panel text-wa-green'><IoCallOutline size={28} /></span>
          <p className='mt-4 text-[15px] text-wa-text'>No calls yet</p>
          <p className='mt-1 text-sm text-wa-muted'>Start a voice or video call from any chat.</p>
        </div>
      )}
      {(calls || []).map(({ message, peer }) => {
        const call = message.call
        const outgoing = String(message.msgByUserId) === String(me)
        const missed = !outgoing && call.status !== 'answered' && !call.group
        const Arrow = outgoing ? MdCallMade : missed ? MdCallMissed : MdCallReceived
        const label = call.group
          ? (call.status === 'answered' ? `${call.participants} joined · ${formatCallDuration(call.duration)}` : 'No one joined')
          : call.status === 'answered' ? formatCallDuration(call.duration) : outgoing ? (call.status === 'declined' ? 'Declined' : 'No answer') : call.status === 'declined' ? 'Declined' : 'Missed'
        const canCall = !inCall && (peer.isGroup || !blocked.includes(String(peer._id)))
        const callBack = (type) => (peer.isGroup ? startGroupCall({ _id : peer._id, name : peer.name, avatar : peer.profile_pic }, type) : startCall({ ...peer, name : names.name(peer) }, type))
        return (
          <div key={message._id} className='flex items-center gap-3 pl-4 pr-2 hover:bg-wa-hover'>
            <button onClick={() => { navigate('/' + peer._id); onClose() }} className='flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left'>
              <Avatar width={46} height={46} name={names.name(peer)} imageUrl={peer.profile_pic} group={!!peer.isGroup} />
              <span className='min-w-0 flex-1'>
                <span className={`block truncate text-[16px] ${missed ? 'text-red-500' : 'text-wa-text'}`}>{names.name(peer)}</span>
                <span className='flex items-center gap-1 text-[13px] text-wa-muted'>
                  <Arrow size={15} className={missed ? 'text-red-500' : 'text-wa-green'} />
                  {call.type === 'video' ? 'Video' : 'Voice'} · {label} · {formatListTime(message.createdAt)}
                </span>
              </span>
            </button>
            {canCall && (
              <button onClick={() => callBack(call.type)} className='wa-icon-btn shrink-0' title={call.type === 'video' ? 'Video call' : 'Voice call'}>
                {call.type === 'video' ? <IoVideocamOutline size={21} /> : <IoCallOutline size={19} />}
              </button>
            )}
          </div>
        )
      })}
    </Drawer>
  )
}

export default CallsPanel
