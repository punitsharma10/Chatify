import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { IoChevronBack, IoChevronForward, IoVolumeMuteOutline, IoVolumeHighOutline, IoPlay, IoClose } from 'react-icons/io5'
import { thumbUrl, videoPoster } from '../../helpers/media'
import { splitMentions, postLink, api } from '../../helpers/social'
import Avatar from '../Avatar'
import { AppMark } from '../apps/AppLogos'
import { socketCall, newClientId } from '../../helpers/socketCall'
import { notify, notifyError } from '../../helpers/toast'
import ForwardDialog from '../ForwardDialog'

// Caption / post text: @mentions link to profiles, #hashtags are highlighted, long text folds behind "more"
export const RichText = ({ text, app, limit = 0, className = '', linkClass = '' }) => {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const cut = limit && !open && text.length > limit
  const shown = cut ? text.slice(0, limit).replace(/\s+\S*$/, '') : text
  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {splitMentions(shown).map((part, i) => {
        if (part.startsWith('@') && part.length > 3) return <Link key={i} to={`/${app}/u/${part.slice(1).toLowerCase().replace(/\.+$/, '')}`} onClick={(e) => e.stopPropagation()} className={linkClass}>{part}</Link>
        if (part.startsWith('#') && part.length > 1) return <span key={i} className={linkClass}>{part}</span>
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
      {cut && <>… <button onClick={(e) => { e.stopPropagation(); setOpen(true) }} className='opacity-60 hover:opacity-100'>more</button></>}
    </span>
  )
}

// a video that plays muted when on screen (feeds), with a mute button
export const AutoVideo = ({ src, className = '', fit = 'object-cover', loop = true, controls = false, onClick }) => {
  const ref = useRef(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6) v.play().then(() => setPlaying(true)).catch(() => {})
      else { v.pause(); setPlaying(false) }
    }, { threshold : [0, 0.6, 1] })
    io.observe(v)
    return () => io.disconnect()
  }, [])
  const toggle = (e) => {
    e.stopPropagation()
    const v = ref.current
    if (!v) return
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {})
    else { v.pause(); setPlaying(false) }
  }
  return (
    <div className={`relative ${className}`} onClick={onClick || toggle}>
      <video ref={ref} src={src} poster={videoPoster(src)} muted={muted} loop={loop} playsInline controls={controls} preload='metadata' className={`h-full w-full ${fit}`} />
      {!playing && !controls && <span className='pointer-events-none absolute inset-0 flex items-center justify-center'><span className='flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white'><IoPlay size={30} /></span></span>}
      <button onClick={(e) => { e.stopPropagation(); setMuted((m) => !m) }} className='absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white' title={muted ? 'Unmute' : 'Mute'}>
        {muted ? <IoVolumeMuteOutline size={15} /> : <IoVolumeHighOutline size={15} />}
      </button>
    </div>
  )
}

// Photos / videos of a post, swipe or arrow through them. `aspect` = width/height of the frame.
export const MediaCarousel = ({ media, aspect, onDoubleClick, className = '', fit = 'object-cover', rounded = '' }) => {
  const [i, setI] = useState(0)
  const touch = useRef(null)
  if (!media?.length) return null
  const ratio = aspect || 1
  const go = (d) => setI((x) => Math.min(media.length - 1, Math.max(0, x + d)))
  return (
    <div className={`relative w-full select-none overflow-hidden bg-black ${rounded} ${className}`} style={{ aspectRatio : String(ratio) }}
      onDoubleClick={onDoubleClick}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
      onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null }}>
      <div className='flex h-full transition-transform duration-300' style={{ transform : `translateX(-${i * 100}%)` }}>
        {media.map((m, idx) => (
          <div key={idx} className='h-full w-full shrink-0'>
            {m.kind === 'video'
              ? (Math.abs(idx - i) <= 1 ? <AutoVideo src={m.url} className='h-full w-full' fit={fit} /> : null)
              : <img src={thumbUrl(m.url, 1080)} alt='' loading='lazy' draggable={false} className={`h-full w-full ${fit}`} />}
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <>
          {i > 0 && <button onClick={(e) => { e.stopPropagation(); go(-1) }} className='absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black shadow' title='Previous'><IoChevronBack size={16} /></button>}
          {i < media.length - 1 && <button onClick={(e) => { e.stopPropagation(); go(1) }} className='absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black shadow' title='Next'><IoChevronForward size={16} /></button>}
          <span className='absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white'>{i + 1}/{media.length}</span>
          <div className='absolute inset-x-0 bottom-2 flex justify-center gap-1'>
            {media.map((_, idx) => <span key={idx} className={`h-1.5 w-1.5 rounded-full ${idx === i ? 'bg-white' : 'bg-white/45'}`} />)}
          </div>
        </>
      )}
    </div>
  )
}

// thumbnail of the first photo / video (grids, notifications)
export const MediaThumb = ({ media, className = '' }) => {
  if (!media) return null
  const src = media.kind === 'video' ? videoPoster(media.url) : thumbUrl(media.url, 400)
  return <img src={src} alt='' loading='lazy' draggable={false} className={`object-cover ${className}`} />
}

// Pixify posts are shown between 4:5 (portrait) and 1.91:1 (landscape), like the original photo
export const pixifyAspect = (post) => {
  const m = post.media?.[0]
  if (!m?.width || !m?.height) return 1
  return Math.min(1.91, Math.max(0.8, m.width / m.height))
}

// "Send to chat": pick chats in Chats and send them a link to the post (shown there as a post card)
export const useSendToChat = () => {
  const socket = useSelector((s) => s.user.socketConnection)
  const [post, setPost] = useState(null)
  const element = post && (
    <ForwardDialog count={1} onClose={() => setPost(null)} onForward={async (targets) => {
      const text = postLink(post)
      const failed = []
      for (const receiver of targets) {
        const res = await socketCall(socket, 'send-message', { receiver, clientId : newClientId(), text }, 20000)
        if (!res.ok) failed.push(res.error)
      }
      setPost(null)
      if (failed.length) notifyError(failed[0])
      else notify(targets.length > 1 ? `Sent to ${targets.length} chats` : 'Sent')
    }} />
  )
  return { open : setPost, element }
}

export const copyPostLink = async (post) => {
  try { await navigator.clipboard.writeText(postLink(post)); notify('Link copied') } catch { notifyError("Couldn't copy the link") }
}

// simple bottom sheet / centered menu used by both apps
export const ActionSheet = ({ items, onClose, title, tone = 'px' }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const card = tone === 'px' ? 'bg-px-bg text-px-text divide-px-border' : 'bg-cx-card text-cx-text divide-cx-border'
  return (
    <div className='fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center' onClick={onClose}>
      <div role='menu' className={`w-full max-w-[400px] animate-pop divide-y overflow-hidden rounded-t-2xl sm:rounded-xl ${card}`} onClick={(e) => e.stopPropagation()}>
        {title && <p className='px-4 py-3 text-center text-sm font-semibold'>{title}</p>}
        {items.filter((it) => !it.hidden).map((it) => (
          <button key={it.label} role='menuitem' onClick={() => { if (!it.keepOpen) onClose(); it.onClick() }}
            className={`flex h-12 w-full items-center justify-center gap-2 text-sm ${it.danger ? 'font-bold text-[#ed4956]' : it.bold ? 'font-bold' : ''} hover:bg-black/5 dark:hover:bg-white/5`}>
            {it.icon}{it.label}
          </button>
        ))}
        <button onClick={onClose} className='h-12 w-full text-sm hover:bg-black/5 dark:hover:bg-white/5'>Cancel</button>
      </div>
    </div>
  )
}

// generic full-screen-on-phone modal
export const Modal = ({ children, onClose, className = '', label, closeButton = true }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className='fixed inset-0 z-[65] flex items-center justify-center bg-black/65 sm:p-6' onClick={onClose} role='dialog' aria-modal='true' aria-label={label}>
      {closeButton && <button onClick={onClose} className='absolute right-3 top-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10 sm:flex' title='Close'><IoClose size={28} /></button>}
      <div className={`animate-pop ${className}`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

// people list in a modal (likes, followers, friends)
export const PeopleModal = ({ title, people, onClose, tone = 'px', app, renderAction }) => {
  const navigate = useNavigate()
  const card = tone === 'px' ? 'bg-px-bg text-px-text' : 'bg-cx-card text-cx-text'
  const muted = tone === 'px' ? 'text-px-muted' : 'text-cx-muted'
  return (
    <Modal onClose={onClose} label={title} closeButton={false} className={`flex h-[100dvh] w-full flex-col overflow-hidden sm:h-[min(520px,85dvh)] sm:w-[400px] sm:rounded-xl ${card}`}>
      <header className={`relative flex h-12 shrink-0 items-center justify-center border-b font-semibold ${tone === 'px' ? 'border-px-border' : 'border-cx-border'}`}>
        {title}
        <button onClick={onClose} className='absolute right-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10' title='Close'><IoClose size={22} /></button>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto py-2'>
        {people === null && <span className='mx-auto my-6 block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40' />}
        {people?.length === 0 && <p className={`py-10 text-center text-sm ${muted}`}>No one yet</p>}
        {people?.map((p) => (
          <div key={p._id} className='flex items-center gap-3 px-4 py-2'>
            <button onClick={() => { onClose(); navigate(`/${app}/u/${p.username || p._id}`) }} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
              <PersonAvatar person={p} size={44} />
              <span className='min-w-0'>
                <span className='block truncate text-sm font-semibold'>{app === 'pixify' ? (p.username || p.name) : p.name}</span>
                <span className={`block truncate text-sm ${muted}`}>{app === 'pixify' ? p.name : p.mutualFriends ? `${p.mutualFriends} mutual friend${p.mutualFriends > 1 ? 's' : ''}` : ''}</span>
              </span>
            </button>
            {p.reaction && <ReactionIcon type={p.reaction} size={18} />}
            {renderAction?.(p)}
          </div>
        ))}
      </div>
    </Modal>
  )
}

// avatar that works for people cards (falls back to initials)
export const PersonAvatar = ({ person, size = 32, ring = '' }) => {
  return <span className={`inline-flex shrink-0 rounded-full ${ring}`}><Avatar width={size} height={size} name={person?.name} imageUrl={person?.profile_pic} /></span>
}

// Connectify reactions
export const REACTIONS = [
  { id : 'like', label : 'Like', emoji : '👍', color : '#1877f2' },
  { id : 'love', label : 'Love', emoji : '❤️', color : '#f33e58' },
  { id : 'care', label : 'Care', emoji : '🥰', color : '#f7b125' },
  { id : 'haha', label : 'Haha', emoji : '😆', color : '#f7b125' },
  { id : 'wow', label : 'Wow', emoji : '😮', color : '#f7b125' },
  { id : 'sad', label : 'Sad', emoji : '😢', color : '#f7b125' },
  { id : 'angry', label : 'Angry', emoji : '😡', color : '#e9710f' },
]
export const reactionOf = (id) => REACTIONS.find((r) => r.id === id) || REACTIONS[0]
export const ReactionIcon = ({ type, size = 18 }) => (
  <span className='inline-flex items-center justify-center rounded-full ring-2 ring-white dark:ring-[#242526]' style={{ fontSize : size * 0.82, width : size, height : size, lineHeight : 1 }} title={reactionOf(type).label}>{reactionOf(type).emoji}</span>
)

// The card Chats shows for a Pixify / Connectify post link
export const SharedPostCard = ({ app, postId, mine }) => {
  const [post, setPost] = useState(undefined)
  useEffect(() => {
    let alive = true
    api.get(`/posts/${postId}`).then((r) => alive && setPost(r.post)).catch(() => alive && setPost(null))
    return () => { alive = false }
  }, [postId])
  const appLabel = app === 'pixify' ? 'Pixify' : 'Connectify'
  return (
    <Link to={`/${app}/p/${postId}`} onClick={(e) => e.stopPropagation()} className={`mb-1 block w-[260px] max-w-full overflow-hidden rounded-md ${mine ? 'bg-wa-quoteOut' : 'bg-wa-panel'}`}>
      <span className='flex items-center gap-2 px-2.5 py-2'>
        <AppMark app={app} size={18} />
        <span className='min-w-0 flex-1 truncate text-[13px] font-medium text-wa-text'>{post ? `${app === 'pixify' ? post.author.username || post.author.name : post.author.name}` : appLabel}</span>
      </span>
      {post === undefined && <span className='block h-32 animate-pulse bg-black/5' />}
      {post === null && <span className='block px-2.5 pb-3 text-[13px] text-wa-muted'>This post isn't available</span>}
      {post && post.media?.[0] && <MediaThumb media={post.media[0]} className='aspect-square w-full' />}
      {post && !post.media?.length && post.text && (
        <span className='mx-2.5 mb-2 block rounded px-3 py-4 text-center text-[13px] text-white' style={{ background : post.background || '#1877f2' }}><span className='line-clamp-4'>{post.text}</span></span>
      )}
      {post && post.text && post.media?.length > 0 && <span className='line-clamp-2 px-2.5 pt-1.5 text-[12.5px] text-wa-muted'>{post.text}</span>}
      <span className='block px-2.5 py-1.5 text-[12px] text-wa-subtle'>View on {appLabel}</span>
    </Link>
  )
}

