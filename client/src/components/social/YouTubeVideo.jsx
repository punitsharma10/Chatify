import React, { useEffect, useRef, useState } from 'react'
import { IoVolumeHighOutline, IoVolumeMuteOutline } from 'react-icons/io5'
import { sound, setSound, useSound } from './common'

// A YouTube Short inside Reels. YouTube's terms require its own embedded player; this makes it behave like our
// reels: plays only while on screen (so off-screen Shorts don't use data), tap the middle to turn sound on / off,
// and the shared sound setting carries over between reels. YouTube's title and logo stay visible and clickable.
const YouTubeVideo = ({ id, poster, className = '' }) => {
  const box = useRef(null)
  const frame = useRef(null)
  const soundOn = useSound()
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio > 0.6), { threshold : [0, 0.6, 1] })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => { if (!visible) setReady(false) }, [visible])

  // talk to the YouTube player (enablejsapi=1)
  const command = (func, args = []) => {
    try { frame.current?.contentWindow?.postMessage(JSON.stringify({ event : 'command', func, args }), '*') } catch { /* player gone */ }
  }
  useEffect(() => {
    if (!ready) return
    if (soundOn) { command('unMute'); command('setVolume', [100]) } else command('mute')
    command('playVideo')
  }, [soundOn, ready])

  // the player needs a moment after loading before it accepts commands
  const onLoad = () => {
    setTimeout(() => setReady(true), 700)
    setTimeout(() => { if (sound.on) command('unMute'); command('playVideo') }, 1800)
  }
  const toggle = (e) => {
    e.stopPropagation()
    setSound(!sound.on)
    setFlash((n) => n + 1)
  }

  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${encodeURIComponent(id)}&controls=0&modestbranding=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
  return (
    <div ref={box} className={`relative bg-black ${className}`}>
      {poster && !visible && <img src={poster} alt='' className='absolute inset-0 h-full w-full object-cover opacity-80' />}
      {visible && (
        <iframe ref={frame} src={src} title='YouTube Short' onLoad={onLoad} allow='autoplay; encrypted-media; picture-in-picture' allowFullScreen
          className='absolute inset-0 h-full w-full border-0' />
      )}
      {/* tap area for sound (leaves YouTube's title bar and logo free) */}
      <button onClick={toggle} aria-label={soundOn ? 'Mute' : 'Turn sound on'} className='absolute inset-x-0 bottom-[22%] top-[14%] cursor-pointer bg-transparent' />
      {flash > 0 && (
        <span key={flash} className='pointer-events-none absolute inset-0 flex items-center justify-center'>
          <span className='flex h-16 w-16 animate-[heartpop_.9s_ease-out_forwards] items-center justify-center rounded-full bg-black/50 text-white'>{soundOn ? <IoVolumeHighOutline size={30} /> : <IoVolumeMuteOutline size={30} />}</span>
        </span>
      )}
      <button onClick={toggle} className='absolute right-3 top-14 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white' title={soundOn ? 'Mute' : 'Turn sound on'} aria-label={soundOn ? 'Mute' : 'Turn sound on'}>
        {soundOn ? <IoVolumeHighOutline size={16} /> : <IoVolumeMuteOutline size={16} />}
      </button>
    </div>
  )
}

export default YouTubeVideo
