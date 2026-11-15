import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IoArrowBack, IoLinkOutline } from 'react-icons/io5'
import Avatar from './Avatar'
import { socketCall } from '../helpers/socketCall'
import { notifyError } from '../helpers/toast'

// Opened from a group invite link (/join/<code>): shows the group and a Join button, like WhatsApp.
const JoinGroup = () => {
  const { code } = useParams()
  const socket = useSelector((s) => s.user.socketConnection)
  const navigate = useNavigate()
  const [state, setState] = useState({ loading : true })
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!socket) return
    socketCall(socket, 'group-invite-info', { code }).then((res) => setState(res.ok ? { group : res.group } : { error : res.error }))
  }, [socket, code])

  const join = async () => {
    setJoining(true)
    const res = await socketCall(socket, 'group-join', { code })
    setJoining(false)
    if (!res.ok) return notifyError(res.error)
    navigate('/' + res.groupId, { replace : true })
  }

  const g = state.group
  return (
    <div className='flex h-full flex-col bg-wa-hover'>
      <header className='flex h-[59px] shrink-0 items-center gap-3 bg-wa-panel px-3'>
        <Link to='/' className='wa-icon-btn' title='Back'><IoArrowBack size={22} /></Link>
        <span className='text-base text-wa-text'>Group invite</span>
      </header>
      <div className='flex flex-1 items-center justify-center p-6'>
        <div className='w-full max-w-sm rounded-xl bg-wa-surface p-8 text-center shadow-bubble'>
          {state.loading && <div className='mx-auto h-8 w-8 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' />}
          {state.error && (
            <>
              <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-wa-panel text-wa-icon'><IoLinkOutline size={30} /></span>
              <p className='mt-4 text-[17px] text-wa-text'>Couldn't open this link</p>
              <p className='mt-1 text-sm text-wa-muted'>{state.error}</p>
              <Link to='/' className='wa-btn mt-6'>Back to chats</Link>
            </>
          )}
          {g && (
            <>
              <div className='flex justify-center'><Avatar width={96} height={96} name={g.name} imageUrl={g.avatar} group /></div>
              <h2 className='mt-4 break-words text-[20px] text-wa-text'>{g.name}</h2>
              <p className='mt-1 text-sm text-wa-muted'>Group · {g.memberCount} member{g.memberCount === 1 ? '' : 's'}</p>
              {g.description && <p className='mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-wa-strong'>{g.description}</p>}
              {g.isMember
                ? <button onClick={() => navigate('/' + g._id, { replace : true })} className='wa-btn mt-6'>Open group</button>
                : <button onClick={join} disabled={joining} className='wa-btn mt-6'>{joining ? 'Joining…' : 'Join group'}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default JoinGroup
