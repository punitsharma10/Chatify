import React, { useEffect, useRef, useState } from 'react'
import { IoPlay, IoPause, IoMic, IoTrashOutline } from 'react-icons/io5'
import { IoMdSend } from 'react-icons/io'

// Voice messages: recorder (composer) + player (chat bubble), WhatsApp style.

const MAX_SECONDS = 15 * 60
export const WAVE_BARS = 40

export const formatClock = (sec = 0) => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// best format this browser can record (Chrome/Firefox: webm/ogg opus, Safari: mp4/aac)
const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return null
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

export const voiceSupported = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

// squeeze many loudness samples into `bars` bars between 0.05 and 1
const toBars = (levels, bars = WAVE_BARS) => {
  if (!levels.length) return Array(bars).fill(0.05)
  const out = []
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * levels.length) / bars)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars))
    out.push(Math.max(...levels.slice(from, to)))
  }
  const peak = Math.max(...out, 0.01)
  return out.map((v) => Math.round(Math.max(0.05, Math.min(1, v / peak)) * 100) / 100)
}

const micError = (error) => {
  if (!navigator.mediaDevices) return 'Voice messages need a secure (https) connection'
  if (error?.name === 'NotAllowedError') return 'Allow microphone access in your browser to record voice messages'
  if (error?.name === 'NotFoundError') return 'No microphone found on this device'
  return "Couldn't start the microphone"
}

// Recording bar that replaces the text box: 🗑  ● 0:07 ▁▃▅▇▅▃  ⏸  ➤
export const VoiceRecorder = ({ onSend, onCancel, onError }) => {
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState([])
  const [paused, setPaused] = useState(false)
  const r = useRef({ recorder : null, stream : null, chunks : [], levels : [], ctx : null, elapsed : 0, startedAt : 0, done : false })

  useEffect(() => {
    const state = r.current
    let tick = null
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio : { echoCancellation : true, noiseSuppression : true } })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        state.stream = stream
        const mime = pickMime()
        const recorder = new MediaRecorder(stream, mime ? { mimeType : mime, audioBitsPerSecond : 32000 } : undefined)
        state.recorder = recorder
        recorder.ondataavailable = (e) => { if (e.data?.size) state.chunks.push(e.data) }
        recorder.start(250)
        state.startedAt = performance.now()

        // live loudness for the waveform
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (Ctx) {
          const ctx = new Ctx()
          state.ctx = ctx
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          ctx.createMediaStreamSource(stream).connect(analyser)
          const buf = new Uint8Array(analyser.fftSize)
          tick = setInterval(() => {
            if (state.recorder?.state !== 'recording') return
            analyser.getByteTimeDomainData(buf)
            let sum = 0
            for (const v of buf) sum += ((v - 128) / 128) ** 2
            state.levels.push(Math.min(1, Math.sqrt(sum / buf.length) * 4))
            setLevels(state.levels.slice(-48))
          }, 100)
        }
      } catch (error) {
        onError?.(micError(error))
        onCancel()
      }
    })()
    const clock = setInterval(() => {
      if (state.recorder?.state === 'recording') {
        const secs = state.elapsed + (performance.now() - state.startedAt) / 1000
        setSeconds(secs)
        if (secs >= MAX_SECONDS) finish(true)
      }
    }, 200)
    return () => {
      cancelled = true
      clearInterval(tick)
      clearInterval(clock)
      stopAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopAll = () => {
    const state = r.current
    try { if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop() } catch { /* already stopped */ }
    state.stream?.getTracks().forEach((t) => t.stop())
    state.ctx?.close().catch(() => {})
  }

  const togglePause = () => {
    const { recorder } = r.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      r.current.elapsed += (performance.now() - r.current.startedAt) / 1000
      recorder.pause()
      setPaused(true)
    } else if (recorder.state === 'paused') {
      r.current.startedAt = performance.now()
      recorder.resume()
      setPaused(false)
    }
  }

  const finish = (send) => {
    const state = r.current
    if (state.done) return
    state.done = true
    const { recorder } = state
    const duration = state.elapsed + (recorder?.state === 'recording' ? (performance.now() - state.startedAt) / 1000 : 0)
    if (!send || !recorder || duration < 0.6) { stopAll(); onCancel(); return }
    recorder.onstop = () => {
      const type = recorder.mimeType || 'audio/webm'
      const blob = new Blob(state.chunks, { type })
      onSend({ blob, type, duration : Math.round(duration * 10) / 10, waveform : toBars(state.levels) })
    }
    stopAll()
  }

  return (
    <div className='flex min-w-0 flex-1 items-center gap-2'>
      <button type='button' onClick={() => finish(false)} className='wa-icon-btn text-wa-icon' title='Delete recording'><IoTrashOutline size={21} /></button>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ${paused ? '' : 'animate-pulse'}`} />
      <span className='w-11 shrink-0 text-[15px] tabular-nums text-wa-text'>{formatClock(seconds)}</span>
      <div className='flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden'>
        {levels.map((v, i) => <span key={i} className='w-[3px] shrink-0 rounded-full bg-wa-subtle' style={{ height : `${Math.max(12, v * 100)}%` }} />)}
      </div>
      <button type='button' onClick={togglePause} className='wa-icon-btn text-red-500' title={paused ? 'Continue recording' : 'Pause'}>
        {paused ? <IoMic size={22} /> : <IoPause size={20} />}
      </button>
      <button type='button' onClick={() => finish(true)} className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wa-green text-white hover:bg-wa-greenDark' title='Send voice message'>
        <IoMdSend size={20} />
      </button>
    </div>
  )
}

// only one voice message plays at a time
const PLAY_EVENT = 'chatify-voice-play'
const SPEEDS = [1, 1.5, 2]

// Cloudinary converts the upload to mp3 on the fly for browsers that can't play the recorded format (e.g. Safari + webm)
const playableUrl = (url) => {
  if (!url || url.startsWith('blob:')) return url
  const canWebm = typeof document !== 'undefined' && document.createElement('audio').canPlayType('audio/webm; codecs="opus"')
  if (canWebm || !/\/video\/upload\//.test(url)) return url
  return url.replace(/\.(webm|ogg|weba|m4a|mp4)(\?.*)?$/i, '.mp3')
}

export const VoicePlayer = ({ url, duration = 0, waveform, mine, uploading, progress }) => {
  const audio = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [played, setPlayed] = useState(false)
  const bars = waveform?.length ? waveform : Array(WAVE_BARS).fill(0.3)
  const total = duration || audio.current?.duration || 0
  const ratio = total ? Math.min(1, current / total) : 0

  useEffect(() => {
    const stopOthers = (e) => { if (e.detail !== audio.current) audio.current?.pause() }
    window.addEventListener(PLAY_EVENT, stopOthers)
    return () => window.removeEventListener(PLAY_EVENT, stopOthers)
  }, [])

  const toggle = (e) => {
    e.stopPropagation()
    const el = audio.current
    if (!el || uploading) return
    if (el.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail : el }))
      el.playbackRate = speed
      el.play().catch(() => {})
    } else el.pause()
  }

  const seek = (e) => {
    e.stopPropagation()
    const el = audio.current
    if (!el || !total || uploading) return
    const rect = e.currentTarget.getBoundingClientRect()
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * total
    setCurrent(el.currentTime)
  }

  const nextSpeed = (e) => {
    e.stopPropagation()
    const s = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(s)
    if (audio.current) audio.current.playbackRate = s
  }

  return (
    <div className='flex w-[min(280px,62vw)] items-center gap-2 py-1 pr-1' data-voice>
      <audio
        ref={audio}
        src={playableUrl(url)}
        preload='metadata'
        onPlay={() => { setPlaying(true); setPlayed(true) }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
      />
      <button type='button' onClick={toggle} disabled={uploading} className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-wa-icon hover:bg-black/5 disabled:opacity-50' title={playing ? 'Pause' : 'Play'}>
        {uploading
          ? <span className='h-6 w-6 animate-spin rounded-full border-2 border-wa-subtle/30 border-t-wa-subtle' />
          : playing ? <IoPause size={24} /> : <IoPlay size={24} className='ml-0.5' />}
      </button>
      <div className='min-w-0 flex-1'>
        <div onClick={seek} className='flex h-7 cursor-pointer items-center gap-[2px]' title='Jump to'>
          {bars.map((v, i) => (
            <span
              key={i}
              className={`w-[3px] flex-1 rounded-full ${i / bars.length < ratio ? (mine ? 'bg-[#06cf9c]' : 'bg-[#4fb6ec]') : 'bg-wa-subtle/50'}`}
              style={{ height : `${Math.max(14, v * 100)}%` }}
            />
          ))}
        </div>
        <div className='mt-0.5 flex items-center justify-between text-[11px] text-wa-muted'>
          <span className='tabular-nums'>{uploading ? `Uploading… ${progress || 0}%` : formatClock(playing || current ? current : total)}</span>
        </div>
      </div>
      {playing || current ? (
        <button type='button' onClick={nextSpeed} className='shrink-0 rounded-full bg-wa-subtle/80 px-2 py-0.5 text-[11px] font-semibold text-white' title='Playback speed'>{speed}×</button>
      ) : (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-[#06cf9c]/15 text-[#06cf9c]' : played ? 'bg-[#4fb6ec]/15 text-[#4fb6ec]' : 'bg-wa-green/15 text-wa-green'}`}>
          <IoMic size={18} />
        </span>
      )}
    </div>
  )
}
