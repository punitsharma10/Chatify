import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IoCall, IoVideocam, IoVideocamOff, IoMic, IoMicOff, IoLockClosed } from 'react-icons/io5'
import { MdCallEnd } from 'react-icons/md'
import Avatar from './Avatar'
import { socketCall } from '../helpers/socketCall'
import { notifyError } from '../helpers/toast'
import { playRingtone, playRingback, stopTones, playEndTone } from '../helpers/callSounds'
import { showNotification } from '../helpers/preferences'

// Group calls (up to 4 people). Everyone connects directly to everyone else ("mesh"):
// the person who joins sends an offer to each person already in the call.

const STUN = [{ urls : 'stun:stun.l.google.com:19302' }]

// ICE candidates that arrived before the other side's description
const flush = async (peer) => {
  const list = peer.pending
  peer.pending = []
  for (const c of list) { try { await peer.pc.addIceCandidate(c) } catch { /* stale */ } }
}

const getMedia = (type) => navigator.mediaDevices?.getUserMedia({
  audio : { echoCancellation : true, noiseSuppression : true },
  video : type === 'video' ? { facingMode : 'user', width : { ideal : 640 }, height : { ideal : 480 } } : false
})

const mediaError = (error, type) => {
  if (!navigator.mediaDevices) return 'Calls need a secure (https) connection'
  if (error?.name === 'NotAllowedError') return `Allow ${type === 'video' ? 'camera and microphone' : 'microphone'} access in your browser to join calls`
  if (error?.name === 'NotFoundError') return `No ${type === 'video' ? 'camera or microphone' : 'microphone'} found on this device`
  return "Couldn't start your camera or microphone"
}

export const useGroupCalls = ({ socket, names, isBusy }) => {
  const [gcall, setGcall] = useState(null) // { callId, groupId, type, group, from, status, endText }
  const [participants, setParticipants] = useState([]) // [{ userId, user, stream, cameraOff, muted }]
  const [localStream, setLocalStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [connectedAt, setConnectedAt] = useState(null)
  const [states, setStates] = useState({}) // groupId -> running call (for "Join" buttons)
  const [, tick] = useState(0)

  const r = useRef({ call : null, stream : null, peers : new Map(), iceServers : STUN, closeTimer : null })
  const namesRef = useRef(names)
  namesRef.current = names

  const update = useCallback((patch) => {
    r.current.call = patch ? { ...(r.current.call || {}), ...patch } : null
    setGcall(r.current.call)
  }, [])

  useEffect(() => {
    if (!connectedAt) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [connectedAt])

  const patchParticipant = useCallback((userId, patch) => {
    setParticipants((list) => {
      const i = list.findIndex((p) => p.userId === userId)
      if (i === -1) return patch.user ? [...list, { userId, cameraOff : false, muted : false, ...patch }] : list
      const copy = list.slice()
      copy[i] = { ...copy[i], ...patch }
      return copy
    })
  }, [])

  const closePeer = useCallback((userId) => {
    const peer = r.current.peers.get(userId)
    if (peer) { try { peer.pc.close() } catch { /* closed */ } }
    r.current.peers.delete(userId)
    setParticipants((list) => list.filter((p) => p.userId !== userId))
  }, [])

  const cleanup = useCallback(() => {
    stopTones()
    for (const uid of [...r.current.peers.keys()]) closePeer(uid)
    if (r.current.stream) r.current.stream.getTracks().forEach((t) => t.stop())
    r.current.stream = null
    setLocalStream(null)
    setParticipants([])
    setMuted(false)
    setCameraOff(false)
    setConnectedAt(null)
  }, [closePeer])

  const endLocally = useCallback((text, { silent = false } = {}) => {
    if (!r.current.call) return
    cleanup()
    clearTimeout(r.current.closeTimer)
    if (silent) { update(null); return }
    playEndTone()
    update({ status : 'ended', endText : text })
    r.current.closeTimer = setTimeout(() => update(null), 1500)
  }, [cleanup, update])

  const signal = useCallback((to, data) => {
    const callId = r.current.call?.callId
    if (callId) socket?.emit('group-call-signal', { callId, to, data })
  }, [socket])

  // one RTCPeerConnection per other participant
  const peerFor = useCallback((userId) => {
    const existing = r.current.peers.get(userId)
    if (existing) return existing
    const pc = new RTCPeerConnection({ iceServers : r.current.iceServers })
    const peer = { pc, pending : [] }
    r.current.peers.set(userId, peer)
    r.current.stream?.getTracks().forEach((t) => pc.addTrack(t, r.current.stream))
    pc.onicecandidate = (e) => { if (e.candidate) signal(userId, { type : 'candidate', candidate : e.candidate.toJSON() }) }
    pc.ontrack = (e) => patchParticipant(userId, { stream : e.streams[0] || new MediaStream([e.track]) })
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        stopTones()
        setConnectedAt((t) => t || Date.now())
        update({ status : 'active' })
        patchParticipant(userId, { connecting : false })
      } else if (pc.connectionState === 'failed') {
        patchParticipant(userId, { failed : true })
      }
    }
    return peer
  }, [signal, patchParticipant, update])

  const callUser = useCallback(async (user) => {
    const uid = String(user._id)
    patchParticipant(uid, { user, connecting : true })
    const peer = peerFor(uid)
    try {
      const offer = await peer.pc.createOffer()
      await peer.pc.setLocalDescription(offer)
      signal(uid, { type : 'offer', sdp : offer.sdp })
    } catch (error) {
      console.error('group offer', error)
    }
  }, [peerFor, patchParticipant, signal])

  // after start / join: connect to everyone already in the call
  const enter = useCallback(async (res, meta) => {
    r.current.iceServers = res.iceServers || STUN
    update({ ...meta, callId : res.callId, groupId : res.groupId, type : res.type, status : res.participants.length ? 'connecting' : 'waiting' })
    if (!res.participants.length) playRingback()
    for (const user of res.participants) await callUser(user)
  }, [update, callUser])

  const withMedia = useCallback(async (type) => {
    try {
      const stream = await getMedia(type)
      r.current.stream = stream
      setLocalStream(stream)
      return stream
    } catch (error) {
      notifyError(mediaError(error, type))
      return null
    }
  }, [])

  const startGroupCall = useCallback(async (group, type) => {
    if (!socket) return notifyError('Not connected')
    if (r.current.call || isBusy()) return notifyError("You're already on a call")
    clearTimeout(r.current.closeTimer)
    // a call may already be running in this group: join it with its own type
    const running = states[String(group._id)]
    const callType = running?.type || type
    update({ groupId : String(group._id), type : callType, group, status : 'joining' })
    if (!(await withMedia(callType))) { update(null); return }
    const res = await socketCall(socket, 'group-call-start', { groupId : group._id, type : callType })
    if (!res.ok) { cleanup(); update(null); return notifyError(res.error) }
    if (res.type !== callType) {
      // joined a call of the other type: get the right devices
      r.current.stream.getTracks().forEach((t) => t.stop())
      if (!(await withMedia(res.type))) { socket.emit('group-call-leave', { callId : res.callId }); update(null); return }
    }
    await enter(res, { group })
  }, [socket, isBusy, states, update, cleanup, enter, withMedia])

  const joinGroupCall = useCallback(async () => {
    const c = r.current.call
    if (!c || c.status !== 'incoming') return
    stopTones()
    update({ status : 'joining' })
    if (!(await withMedia(c.type))) { socket.emit('group-call-decline', { callId : c.callId }); update(null); return }
    const res = await socketCall(socket, 'group-call-join', { callId : c.callId })
    if (!res.ok) { cleanup(); update(null); return notifyError(res.error) }
    await enter(res, { group : c.group })
  }, [socket, update, cleanup, enter, withMedia])

  // "Join" from the group chat (call already running, no ringing)
  const joinRunning = useCallback(async (group, state) => {
    if (r.current.call || isBusy()) return notifyError("You're already on a call")
    update({ callId : state.callId, groupId : String(group._id), type : state.type, group, status : 'incoming' })
    await joinGroupCall()
  }, [isBusy, update, joinGroupCall])

  const declineGroupCall = useCallback(() => {
    const c = r.current.call
    if (!c) return
    socket?.emit('group-call-decline', { callId : c.callId })
    endLocally('', { silent : true })
  }, [socket, endLocally])

  const leaveGroupCall = useCallback(() => {
    const c = r.current.call
    if (!c) return
    if (c.callId) socket?.emit('group-call-leave', { callId : c.callId })
    endLocally('You left the call')
  }, [socket, endLocally])

  const toggleMute = () => {
    const track = r.current.stream?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
    socket?.emit('group-call-media', { callId : r.current.call?.callId, audio : track.enabled, video : !cameraOff })
  }
  const toggleCamera = () => {
    const track = r.current.stream?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCameraOff(!track.enabled)
    socket?.emit('group-call-media', { callId : r.current.call?.callId, audio : !muted, video : track.enabled })
  }

  useEffect(() => {
    if (!socket) return
    const mine = (callId) => r.current.call?.callId === callId

    const onIncoming = (d) => {
      if (r.current.call || isBusy()) return
      clearTimeout(r.current.closeTimer)
      update({ callId : d.callId, groupId : d.groupId, type : d.type, group : d.group, from : d.from, status : 'incoming' })
      playRingtone()
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        showNotification({
          title : d.group.name,
          body : `${namesRef.current.name(d.from)} is calling · group ${d.type === 'video' ? 'video' : 'voice'} call`,
          icon : d.group.avatar || undefined,
          chatId : `gcall-${d.callId}`,
          onClick : () => window.focus()
        })
      }
    }
    const onDismiss = ({ callId }) => { if (mine(callId) && r.current.call.status === 'incoming') endLocally('', { silent : true }) }
    const onJoined = ({ callId, user }) => {
      if (!mine(callId)) return
      stopTones()
      patchParticipant(String(user._id), { user, connecting : true })
      peerFor(String(user._id)) // ready for their offer
      if (r.current.call.status === 'waiting') update({ status : 'connecting' })
    }
    const onSignal = async ({ callId, from, data }) => {
      if (!mine(callId)) return
      const peer = peerFor(from)
      try {
        if (data.type === 'offer') {
          await peer.pc.setRemoteDescription({ type : 'offer', sdp : data.sdp })
          await flush(peer)
          const answer = await peer.pc.createAnswer()
          await peer.pc.setLocalDescription(answer)
          signal(from, { type : 'answer', sdp : answer.sdp })
        } else if (data.type === 'answer') {
          await peer.pc.setRemoteDescription({ type : 'answer', sdp : data.sdp })
          await flush(peer)
        } else if (data.type === 'candidate' && data.candidate) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate)
          else peer.pending.push(data.candidate)
        }
      } catch (error) {
        console.error('group signal', error)
      }
    }
    const onLeft = ({ callId, userId }) => { if (mine(callId)) closePeer(userId) }
    const onEnded = ({ callId }) => {
      if (!mine(callId)) return
      endLocally('Call ended', { silent : r.current.call.status === 'incoming' })
    }
    const onMedia = ({ callId, userId, video, audio }) => { if (mine(callId)) patchParticipant(userId, { cameraOff : !video, muted : !audio }) }
    const onState = (state) => setStates((s) => {
      const next = { ...s }
      if (state.callId) next[state.groupId] = state
      else delete next[state.groupId]
      return next
    })

    socket.on('group-call-incoming', onIncoming)
    socket.on('group-call-dismiss', onDismiss)
    socket.on('group-call-joined', onJoined)
    socket.on('group-call-signal', onSignal)
    socket.on('group-call-left', onLeft)
    socket.on('group-call-ended', onEnded)
    socket.on('group-call-media', onMedia)
    socket.on('group-call-state', onState)
    return () => {
      socket.off('group-call-incoming', onIncoming)
      socket.off('group-call-dismiss', onDismiss)
      socket.off('group-call-joined', onJoined)
      socket.off('group-call-signal', onSignal)
      socket.off('group-call-left', onLeft)
      socket.off('group-call-ended', onEnded)
      socket.off('group-call-media', onMedia)
      socket.off('group-call-state', onState)
    }
  }, [socket, isBusy, update, endLocally, patchParticipant, peerFor, signal, closePeer])

  useEffect(() => {
    const onUnload = () => { const id = r.current.call?.callId; if (id && r.current.stream) socket?.emit('group-call-leave', { callId : id }) }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [socket])

  // when opening a group chat: is a call running there?
  const refreshGroupCall = useCallback(async (groupId) => {
    const res = await socketCall(socket, 'group-call-status', { groupId })
    if (!res.ok) return
    setStates((s) => {
      const next = { ...s }
      if (res.call) next[String(groupId)] = res.call
      else delete next[String(groupId)]
      return next
    })
  }, [socket])

  return {
    gcall,
    groupCallStates : states,
    startGroupCall,
    joinRunning,
    refreshGroupCall,
    screen : gcall ? (
      <GroupCallScreen
        call={gcall}
        names={names}
        participants={participants}
        localStream={localStream}
        muted={muted}
        cameraOff={cameraOff}
        seconds={connectedAt ? (Date.now() - connectedAt) / 1000 : 0}
        onJoin={joinGroupCall}
        onDecline={declineGroupCall}
        onLeave={leaveGroupCall}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />
    ) : null
  }
}

const Video = ({ stream, muted = false, className, mirror = false }) => {
  const el = useRef(null)
  useEffect(() => { if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream || null }, [stream])
  return <video ref={el} autoPlay playsInline muted={muted} className={`${className} ${mirror ? '-scale-x-100' : ''}`} />
}

const Audio = ({ stream }) => {
  const el = useRef(null)
  useEffect(() => { if (el.current) el.current.srcObject = stream || null }, [stream])
  return <audio ref={el} autoPlay />
}

const formatDuration = (sec) => {
  const s = Math.max(0, Math.floor(sec))
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

const Tile = ({ name, picture, stream, video, cameraOff, muted, mine, status }) => (
  <div className='relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-[#1f2c34]' data-tile={mine ? 'me' : 'remote'}>
    {video && stream && !cameraOff
      ? <Video stream={stream} muted={mine} mirror={mine} className='absolute inset-0 h-full w-full object-cover' />
      : <Avatar width={84} height={84} name={name} imageUrl={picture} />}
    {!video && !mine && stream && <Audio stream={stream} />}
    <span className='absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1 truncate rounded-full bg-black/45 px-2.5 py-1 text-xs text-white'>
      {muted && <IoMicOff size={12} className='shrink-0' />}
      <span className='truncate'>{name}</span>
      {status && <span className='shrink-0 text-white/70'>· {status}</span>}
    </span>
  </div>
)

const GroupCallScreen = ({ call, names, participants, localStream, muted, cameraOff, seconds, onJoin, onDecline, onLeave, onToggleMute, onToggleCamera }) => {
  const video = call.type === 'video'
  const kind = video ? 'video' : 'voice'
  const statusText = {
    incoming : `${names.name(call.from)} is calling · group ${kind} call`,
    joining : 'Joining…',
    waiting : 'Ringing…',
    connecting : 'Connecting…',
    active : `${formatDuration(seconds)} · ${participants.length + 1} people`,
    ended : call.endText,
  }[call.status]
  const inCall = ['waiting', 'connecting', 'active'].includes(call.status)
  const count = participants.length + 1
  const grid = count <= 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'

  return (
    <div className='fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0b141a] text-white' role='dialog' aria-label={`Group ${kind} call in ${call.group?.name}`}>
      <div className='flex flex-col items-center px-6 pb-3 pt-[max(1.5rem,env(safe-area-inset-top))] text-center'>
        <p className='flex items-center gap-1.5 text-xs text-white/60'><IoLockClosed size={11} /> End-to-end encrypted</p>
        {!inCall && (
          <div className='mt-10 sm:mt-14'>
            <Avatar width={128} height={128} name={call.group?.name} imageUrl={call.group?.avatar} group />
          </div>
        )}
        <h2 className={`${inCall ? 'mt-1 text-lg' : 'mt-6 text-[26px]'} max-w-full truncate font-normal`}>{call.group?.name}</h2>
        <p className='mt-1 text-[14px] text-white/75'>{statusText}</p>
      </div>

      {inCall ? (
        <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 px-2 sm:px-4 ${grid}`}>
          <Tile mine name='You' stream={localStream} video={video} cameraOff={cameraOff} muted={muted} />
          {participants.map((p) => (
            <Tile
              key={p.userId}
              name={names.name(p.user)}
              picture={p.user?.profile_pic}
              stream={p.stream}
              video={video}
              cameraOff={p.cameraOff}
              muted={p.muted}
              status={p.failed ? "couldn't connect" : p.connecting && !p.stream ? 'connecting' : ''}
            />
          ))}
        </div>
      ) : <div className='flex-1' />}

      <div className='flex justify-center gap-6 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:gap-10'>
        {call.status === 'incoming' ? (
          <>
            <Round label='Decline' className='bg-[#f15c6d] text-white hover:bg-[#e0475a]' onClick={onDecline}><MdCallEnd size={30} /></Round>
            <Round label='Join' className='animate-pulse bg-wa-green text-white hover:bg-wa-greenDark' onClick={onJoin}>{video ? <IoVideocam size={28} /> : <IoCall size={28} />}</Round>
          </>
        ) : call.status === 'ended' || call.status === 'joining' ? (
          <p className='h-[86px]'>&nbsp;</p>
        ) : (
          <>
            {video && (
              <Round label={cameraOff ? 'Camera on' : 'Camera off'} className={cameraOff ? 'bg-white text-[#0b141a]' : 'bg-white/15 text-white hover:bg-white/25'} onClick={onToggleCamera}>
                {cameraOff ? <IoVideocamOff size={26} /> : <IoVideocam size={26} />}
              </Round>
            )}
            <Round label={muted ? 'Unmute' : 'Mute'} className={muted ? 'bg-white text-[#0b141a]' : 'bg-white/15 text-white hover:bg-white/25'} onClick={onToggleMute}>
              {muted ? <IoMicOff size={26} /> : <IoMic size={26} />}
            </Round>
            <Round label='Leave' className='bg-[#f15c6d] text-white hover:bg-[#e0475a]' onClick={onLeave}><MdCallEnd size={30} /></Round>
          </>
        )}
      </div>
    </div>
  )
}

const Round = ({ label, className, onClick, children }) => (
  <div className='flex w-16 flex-col items-center gap-2'>
    <button onClick={onClick} title={label} className={`flex h-16 w-16 items-center justify-center rounded-full transition-colors ${className}`}>{children}</button>
    <span className='text-xs text-white/80'>{label}</span>
  </div>
)
