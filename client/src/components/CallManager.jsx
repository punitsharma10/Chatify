import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { IoCall, IoVideocam, IoVideocamOff, IoMic, IoMicOff, IoLockClosed } from 'react-icons/io5'
import { MdCallEnd } from 'react-icons/md'
import Avatar from './Avatar'
import { socketCall } from '../helpers/socketCall'
import { notifyError } from '../helpers/toast'
import { playRingtone, playRingback, stopTones, playEndTone } from '../helpers/callSounds'
import { showNotification } from '../helpers/preferences'
import { usePeopleNames } from '../helpers/contacts'
import { useGroupCalls } from './GroupCall'

// One-to-one voice & video calls over WebRTC. The server only rings and relays the handshake;
// audio/video goes directly between the two browsers (encrypted by WebRTC).
const CallContext = createContext({ startCall : () => {}, inCall : false })
export const useCalls = () => useContext(CallContext)

const END_TEXT = {
  declined : 'Call declined',
  'no-answer' : 'No answer',
  cancelled : 'Call ended',
  hangup : 'Call ended',
  disconnected : 'Call ended',
  failed : "Couldn't connect",
}

const formatDuration = (sec) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}
export { formatDuration }

const getMedia = (type) => navigator.mediaDevices?.getUserMedia({
  audio : { echoCancellation : true, noiseSuppression : true },
  video : type === 'video' ? { facingMode : 'user', width : { ideal : 1280 }, height : { ideal : 720 } } : false
})

const mediaError = (error, type) => {
  if (!navigator.mediaDevices) return 'Calls need a secure (https) connection'
  if (error?.name === 'NotAllowedError') return `Allow ${type === 'video' ? 'camera and microphone' : 'microphone'} access in your browser to make calls`
  if (error?.name === 'NotFoundError') return `No ${type === 'video' ? 'camera or microphone' : 'microphone'} found on this device`
  if (error?.name === 'NotReadableError') return 'Your camera or microphone is being used by another app'
  return "Couldn't start your camera or microphone"
}

export const CallProvider = ({ children }) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const names = usePeopleNames()
  const [call, setCall] = useState(null) // { id, peer, type, direction, status, endText }
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [remoteCameraOff, setRemoteCameraOff] = useState(false)
  const [connectedAt, setConnectedAt] = useState(null)
  const [, tick] = useState(0)

  const ref = useRef({ call : null, pc : null, stream : null, pendingSignals : [], pendingCandidates : [], closeTimer : null })
  const namesRef = useRef(names)
  namesRef.current = names

  // group calls share the "one call at a time" rule with 1:1 calls
  const isBusy1to1 = useCallback(() => !!ref.current.call, [])
  const group = useGroupCalls({ socket, names, isBusy : isBusy1to1 })
  const groupBusy = useRef(false)
  groupBusy.current = !!group.gcall

  const update = useCallback((patch) => {
    ref.current.call = patch ? { ...(ref.current.call || {}), ...patch } : null
    setCall(ref.current.call)
  }, [])

  // call timer
  useEffect(() => {
    if (!connectedAt) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [connectedAt])

  const cleanup = useCallback(() => {
    const r = ref.current
    stopTones()
    if (r.pc) { r.pc.onicecandidate = null; r.pc.ontrack = null; r.pc.onconnectionstatechange = null; try { r.pc.close() } catch { /* already closed */ } }
    if (r.stream) r.stream.getTracks().forEach((t) => t.stop())
    r.pc = null
    r.stream = null
    r.pendingSignals = []
    r.pendingCandidates = []
    setLocalStream(null)
    setRemoteStream(null)
    setMuted(false)
    setCameraOff(false)
    setRemoteCameraOff(false)
    setConnectedAt(null)
  }, [])

  // show the reason ("Call declined", "No answer") for a moment, then close the call screen
  const endLocally = useCallback((reason, { silent = false } = {}) => {
    const r = ref.current
    if (!r.call) return
    cleanup()
    clearTimeout(r.closeTimer)
    if (silent) { update(null); return }
    playEndTone()
    update({ status : 'ended', endText : END_TEXT[reason] || 'Call ended' })
    r.closeTimer = setTimeout(() => update(null), 1600)
  }, [cleanup, update])

  const sendSignal = useCallback((data) => {
    const id = ref.current.call?.id
    if (id) socket?.emit('call-signal', { callId : id, data })
  }, [socket])

  const flushCandidates = async () => {
    const r = ref.current
    const list = r.pendingCandidates
    r.pendingCandidates = []
    for (const c of list) { try { await r.pc.addIceCandidate(c) } catch { /* stale candidate */ } }
  }

  const handleSignal = useCallback(async (data) => {
    const r = ref.current
    if (!r.pc) { r.pendingSignals.push(data); return }
    try {
      if (data.type === 'offer') {
        await r.pc.setRemoteDescription({ type : 'offer', sdp : data.sdp })
        await flushCandidates()
        const answer = await r.pc.createAnswer()
        await r.pc.setLocalDescription(answer)
        sendSignal({ type : 'answer', sdp : answer.sdp })
      } else if (data.type === 'answer') {
        await r.pc.setRemoteDescription({ type : 'answer', sdp : data.sdp })
        await flushCandidates()
      } else if (data.type === 'candidate' && data.candidate) {
        if (r.pc.remoteDescription) await r.pc.addIceCandidate(data.candidate)
        else r.pendingCandidates.push(data.candidate)
      }
    } catch (error) {
      console.error('call signal', error)
    }
  }, [sendSignal])

  const createPeer = useCallback((iceServers, stream) => {
    const r = ref.current
    const pc = new RTCPeerConnection({ iceServers })
    r.pc = pc
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal({ type : 'candidate', candidate : e.candidate.toJSON() }) }
    pc.ontrack = (e) => setRemoteStream(e.streams[0] || new MediaStream([e.track]))
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'connected') {
        stopTones()
        setConnectedAt((t) => t || Date.now())
        update({ status : 'active' })
      } else if (state === 'disconnected') {
        update({ status : 'reconnecting' })
      } else if (state === 'failed') {
        const id = ref.current.call?.id
        if (id) socket?.emit('call-end', { callId : id })
        notifyError("The call couldn't connect. Your network may be blocking calls.")
        endLocally('failed')
      }
    }
    // signals that arrived before the connection existed
    const queued = r.pendingSignals
    r.pendingSignals = []
    queued.forEach((d) => handleSignal(d))
    return pc
  }, [sendSignal, handleSignal, update, endLocally, socket])

  /* ---------- outgoing ---------- */
  const startCall = useCallback(async (peer, type) => {
    if (!socket) return notifyError('Not connected')
    if (ref.current.call || groupBusy.current) return notifyError("You're already on a call")
    clearTimeout(ref.current.closeTimer)
    update({ id : null, peer, type, direction : 'out', status : 'starting' })
    let stream
    try {
      stream = await getMedia(type)
    } catch (error) {
      update(null)
      return notifyError(mediaError(error, type))
    }
    if (!ref.current.call) { stream.getTracks().forEach((t) => t.stop()); return } // cancelled meanwhile
    ref.current.stream = stream
    setLocalStream(stream)
    const res = await socketCall(socket, 'call-start', { to : peer._id, type })
    if (!res.ok) {
      cleanup()
      update(null)
      return notifyError(res.error)
    }
    ref.current.iceServers = res.iceServers
    update({ id : res.callId, status : 'ringing' })
    playRingback()
  }, [socket, update, cleanup])

  /* ---------- incoming ---------- */
  const accept = useCallback(async () => {
    const c = ref.current.call
    if (!c || c.status !== 'incoming') return
    stopTones()
    update({ status : 'connecting' })
    let stream
    try {
      stream = await getMedia(c.type)
    } catch (error) {
      socket.emit('call-reject', { callId : c.id })
      notifyError(mediaError(error, c.type))
      endLocally('declined', { silent : true })
      return
    }
    ref.current.stream = stream
    setLocalStream(stream)
    const cfg = await socketCall(socket, 'call-config')
    createPeer(cfg.ok ? cfg.iceServers : [{ urls : 'stun:stun.l.google.com:19302' }], stream)
    const res = await socketCall(socket, 'call-accept', { callId : c.id })
    if (!res.ok) {
      notifyError(res.error)
      endLocally('hangup', { silent : true })
    }
  }, [socket, update, createPeer, endLocally])

  const decline = useCallback(() => {
    const c = ref.current.call
    if (!c) return
    socket?.emit('call-reject', { callId : c.id })
    endLocally('declined', { silent : true })
  }, [socket, endLocally])

  const hangUp = useCallback(() => {
    const c = ref.current.call
    if (!c) return
    if (c.id) socket?.emit('call-end', { callId : c.id })
    endLocally(c.status === 'ringing' || c.status === 'starting' ? 'cancelled' : 'hangup')
  }, [socket, endLocally])

  const toggleMute = () => {
    const track = ref.current.stream?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
    socket?.emit('call-media', { callId : ref.current.call?.id, audio : track.enabled, video : !cameraOff })
  }

  const toggleCamera = () => {
    const track = ref.current.stream?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCameraOff(!track.enabled)
    socket?.emit('call-media', { callId : ref.current.call?.id, audio : !muted, video : track.enabled })
  }

  /* ---------- socket events ---------- */
  useEffect(() => {
    if (!socket) return
    const onIncoming = ({ callId, type, from }) => {
      if ((ref.current.call && ref.current.call.status !== 'ended') || groupBusy.current) { socket.emit('call-reject', { callId }); return }
      clearTimeout(ref.current.closeTimer)
      update({ id : callId, peer : from, type, direction : 'in', status : 'incoming' })
      playRingtone()
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        showNotification({
          title : namesRef.current.name(from) || 'Chatify',
          body : `Incoming ${type === 'video' ? 'video' : 'voice'} call`,
          icon : from?.profile_pic || undefined,
          chatId : `call-${callId}`,
          onClick : () => window.focus()
        })
      }
    }
    const onAccepted = async ({ callId }) => {
      const r = ref.current
      if (r.call?.id !== callId || !r.stream) return
      stopTones()
      update({ status : 'connecting' })
      const pc = createPeer(r.iceServers || [{ urls : 'stun:stun.l.google.com:19302' }], r.stream)
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendSignal({ type : 'offer', sdp : offer.sdp })
      } catch (error) {
        console.error('call offer', error)
      }
    }
    const onSignal = ({ callId, data }) => { if (ref.current.call?.id === callId) handleSignal(data) }
    const onEnded = ({ callId, reason }) => {
      if (ref.current.call?.id !== callId) return
      endLocally(reason, { silent : reason === 'answered-elsewhere' })
    }
    const onMedia = ({ callId, video }) => { if (ref.current.call?.id === callId) setRemoteCameraOff(!video) }

    socket.on('call-incoming', onIncoming)
    socket.on('call-accepted', onAccepted)
    socket.on('call-signal', onSignal)
    socket.on('call-ended', onEnded)
    socket.on('call-media', onMedia)
    return () => {
      socket.off('call-incoming', onIncoming)
      socket.off('call-accepted', onAccepted)
      socket.off('call-signal', onSignal)
      socket.off('call-ended', onEnded)
      socket.off('call-media', onMedia)
    }
  }, [socket, update, createPeer, sendSignal, handleSignal, endLocally])

  // leaving the page ends the call cleanly
  useEffect(() => {
    const onUnload = () => { const id = ref.current.call?.id; if (id) socket?.emit('call-end', { callId : id }) }
    window.addEventListener('beforeunload', onUnload)
    return () => { window.removeEventListener('beforeunload', onUnload); cleanup() }
  }, [socket, cleanup])

  const value = {
    startCall,
    inCall : !!call || !!group.gcall,
    startGroupCall : group.startGroupCall,
    joinGroupCall : group.joinRunning,
    groupCallStates : group.groupCallStates,
    refreshGroupCall : group.refreshGroupCall,
  }

  return (
    <CallContext.Provider value={value}>
      {children}
      {call && (
        <CallScreen
          call={call}
          name={names.name(call.peer)}
          localStream={localStream}
          remoteStream={remoteStream}
          muted={muted}
          cameraOff={cameraOff}
          remoteCameraOff={remoteCameraOff}
          seconds={connectedAt ? (Date.now() - connectedAt) / 1000 : 0}
          onAccept={accept}
          onDecline={decline}
          onHangUp={hangUp}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
        />
      )}
      {group.screen}
    </CallContext.Provider>
  )
}

const Video = ({ stream, muted = false, className, mirror = false }) => {
  const el = useRef(null)
  useEffect(() => { if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream || null }, [stream])
  return <video ref={el} autoPlay playsInline muted={muted} className={`${className} ${mirror ? '-scale-x-100' : ''}`} />
}

const RemoteAudio = ({ stream }) => {
  const el = useRef(null)
  useEffect(() => { if (el.current) el.current.srcObject = stream || null }, [stream])
  return <audio ref={el} autoPlay />
}

// full-screen WhatsApp-style call UI
const CallScreen = ({ call, name, localStream, remoteStream, muted, cameraOff, remoteCameraOff, seconds, onAccept, onDecline, onHangUp, onToggleMute, onToggleCamera }) => {
  const video = call.type === 'video'
  const live = call.status === 'active' || call.status === 'reconnecting'
  const showRemoteVideo = video && live && remoteStream && !remoteCameraOff
  const statusText = {
    starting : 'Starting…',
    ringing : 'Ringing…',
    incoming : `Incoming ${video ? 'video' : 'voice'} call`,
    connecting : 'Connecting…',
    active : formatDuration(seconds),
    reconnecting : 'Reconnecting…',
    ended : call.endText,
  }[call.status]

  return (
    <div className='fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0b141a] text-white' role='dialog' aria-label={`${video ? 'Video' : 'Voice'} call with ${name}`}>
      {/* remote video fills the screen */}
      {showRemoteVideo && <Video stream={remoteStream} className='absolute inset-0 h-full w-full bg-black object-cover' />}
      {!video && remoteStream && <RemoteAudio stream={remoteStream} />}
      {/* the caller sees their own camera full screen while it rings */}
      {video && !live && localStream && !cameraOff && (
        <Video stream={localStream} muted mirror className='absolute inset-0 h-full w-full object-cover opacity-60' />
      )}

      <div className={`relative z-10 flex flex-col items-center px-6 pt-[max(2.5rem,env(safe-area-inset-top))] text-center ${showRemoteVideo ? 'bg-gradient-to-b from-black/60 to-transparent pb-10' : ''}`}>
        <p className='flex items-center gap-1.5 text-xs text-white/60'><IoLockClosed size={11} /> End-to-end encrypted</p>
        {!showRemoteVideo && (
          <div className='mt-10 sm:mt-14'>
            <Avatar width={128} height={128} name={name} imageUrl={call.peer?.profile_pic} />
          </div>
        )}
        <h2 className={`${showRemoteVideo ? 'mt-3 text-xl' : 'mt-6 text-[26px]'} max-w-full truncate font-normal`}>{name}</h2>
        <p className='mt-1 text-[15px] text-white/75'>{statusText}</p>
        {video && live && remoteCameraOff && <p className='mt-2 text-sm text-white/60'>Camera is off</p>}
      </div>

      {/* my camera, picture-in-picture */}
      {video && live && localStream && (
        <div className='absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 h-40 w-28 overflow-hidden rounded-xl bg-[#1f2c34] shadow-lg sm:h-48 sm:w-36'>
          {cameraOff
            ? <div className='flex h-full items-center justify-center text-white/60'><IoVideocamOff size={28} /></div>
            : <Video stream={localStream} muted mirror className='h-full w-full object-cover' />}
        </div>
      )}

      <div className='flex-1' />

      {/* controls */}
      <div className='relative z-10 flex justify-center gap-6 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-8 sm:gap-10'>
        {call.status === 'incoming' ? (
          <>
            <RoundButton label='Decline' className='bg-[#f15c6d] text-white hover:bg-[#e0475a]' onClick={onDecline}><MdCallEnd size={30} /></RoundButton>
            <RoundButton label='Accept' className='bg-wa-green text-white hover:bg-wa-greenDark animate-pulse' onClick={onAccept}>{video ? <IoVideocam size={28} /> : <IoCall size={28} />}</RoundButton>
          </>
        ) : call.status === 'ended' ? (
          <p className='h-[86px] text-sm text-white/60'>&nbsp;</p>
        ) : (
          <>
            {video && (
              <RoundButton label={cameraOff ? 'Camera on' : 'Camera off'} className={cameraOff ? 'bg-white text-[#0b141a]' : 'bg-white/15 text-white hover:bg-white/25'} onClick={onToggleCamera}>
                {cameraOff ? <IoVideocamOff size={26} /> : <IoVideocam size={26} />}
              </RoundButton>
            )}
            <RoundButton label={muted ? 'Unmute' : 'Mute'} className={muted ? 'bg-white text-[#0b141a]' : 'bg-white/15 text-white hover:bg-white/25'} onClick={onToggleMute}>
              {muted ? <IoMicOff size={26} /> : <IoMic size={26} />}
            </RoundButton>
            <RoundButton label='End call' className='bg-[#f15c6d] text-white hover:bg-[#e0475a]' onClick={onHangUp}><MdCallEnd size={30} /></RoundButton>
          </>
        )}
      </div>
    </div>
  )
}

const RoundButton = ({ label, className, onClick, children }) => (
  <div className='flex w-16 flex-col items-center gap-2'>
    <button onClick={onClick} title={label} className={`flex h-16 w-16 items-center justify-center rounded-full transition-colors ${className}`}>{children}</button>
    <span className='text-xs text-white/80'>{label}</span>
  </div>
)

export default CallProvider
