import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import moment from 'moment'
import { IoAdd, IoClose, IoEyeOutline, IoText, IoImages, IoTrashOutline, IoChevronBack, IoChevronForward, IoPause, IoPlay, IoColorPaletteOutline, IoVolumeMuteOutline, IoVolumeHighOutline } from 'react-icons/io5'
import { IoMdSend } from 'react-icons/io'
import { HiDotsVertical } from 'react-icons/hi'
import Drawer from './Drawer'
import Avatar from './Avatar'
import Dialog from './Dialog'
import PopoverMenu from './PopoverMenu'
import uploadFile, { MAX_UPLOAD_BYTES } from '../helpers/uploadFile'
import { socketCall, newClientId } from '../helpers/socketCall'
import { notify, notifyError } from '../helpers/toast'
import { usePeopleNames } from '../helpers/contacts'
import { thumbUrl } from '../helpers/media'
import { canEncryptStatus } from '../helpers/e2ee'

export const STATUS_BACKGROUNDS = ['#00a884', '#5796ff', '#7e57c2', '#ff8a65', '#e53935', '#c0ca33', '#26a69a', '#8d6e63', '#54656f', '#ec407a']
export const STATUS_FONTS = [
  { fontFamily : '"Segoe UI", Helvetica, Arial, sans-serif' },
  { fontFamily : 'Georgia, "Times New Roman", serif' },
  { fontFamily : 'Consolas, "Courier New", monospace' },
  { fontFamily : '"Brush Script MT", "Segoe Script", cursive', fontSize : '1.15em' },
  { fontFamily : 'Impact, "Arial Black", sans-serif', textTransform : 'uppercase', letterSpacing : '.02em' },
]
const IMAGE_MS = 6000

const timeLabel = (date) => {
  const m = moment(date)
  if (m.isSame(moment(), 'day')) return `Today at ${m.format('h:mm a')}`
  return `Yesterday at ${m.format('h:mm a')}`
}

// avatar with a ring split into one segment per status (green = new, grey = seen)
export const StatusRing = ({ statuses, size = 48, children }) => {
  const n = Math.max(1, statuses.length)
  const r = size / 2 - 1.5
  const c = 2 * Math.PI * r
  const gap = n > 1 ? Math.min(6, c / n / 4) : 0
  const seg = c / n - gap
  return (
    <span className='relative inline-flex shrink-0 items-center justify-center' style={{ width : size, height : size }}>
      <svg width={size} height={size} className='absolute inset-0 -rotate-90'>
        {statuses.map((s, i) => (
          <circle key={s._id} cx={size / 2} cy={size / 2} r={r} fill='none' strokeWidth='2.5'
            stroke={s.viewed ? 'rgb(var(--wa-line))' : '#25d366'}
            strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={-i * (seg + gap)} strokeLinecap='round' />
        ))}
      </svg>
      <span className='flex items-center justify-center' style={{ width : size - 8, height : size - 8 }}>{children}</span>
    </span>
  )
}

const StatusThumb = ({ status, size }) => {
  if (status.kind === 'text') {
    return (
      <span className='flex h-full w-full items-center justify-center overflow-hidden rounded-full p-1 text-center text-[9px] leading-tight text-white' style={{ backgroundColor : status.background, width : size, height : size, ...STATUS_FONTS[status.font || 0] }}>
        {status.text.slice(0, 24)}
      </span>
    )
  }
  if (status.kind === 'video' && status.mediaUrl.startsWith('blob:')) return <video src={status.mediaUrl} muted preload='metadata' className='rounded-full object-cover' style={{ width : size, height : size }} />
  return <img src={status.kind === 'image' ? thumbUrl(status.mediaUrl, 120) : status.mediaUrl.replace(/\.[a-z0-9]+$/i, '.jpg')} alt='' className='rounded-full object-cover' style={{ width : size, height : size }} />
}

/* ---------------- list (Updates) ---------------- */

const StatusPanel = ({ onClose, onUnseenChange }) => {
  const user = useSelector((s) => s.user)
  const socket = user.socketConnection
  const names = usePeopleNames()
  const [data, setData] = useState(null)
  const [viewer, setViewer] = useState(null) // { list: [{user, statuses}], group, index, mine }
  const [composer, setComposer] = useState(null) // 'text' | { file, url, kind }
  const [showMuted, setShowMuted] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    const res = await socketCall(socket, 'status-list')
    if (res.ok) setData(res)
  }, [socket])

  useEffect(() => {
    load()
    if (!socket) return
    const onChange = () => load()
    socket.on('status-changed', onChange)
    socket.on('status-viewed', onChange)
    return () => { socket.off('status-changed', onChange); socket.off('status-viewed', onChange) }
  }, [socket, load])

  const recent = (data?.updates || []).filter((u) => !u.allViewed && !u.muted)
  const viewed = (data?.updates || []).filter((u) => u.allViewed && !u.muted)
  const muted = (data?.updates || []).filter((u) => u.muted)

  useEffect(() => { if (data) onUnseenChange?.(recent.length > 0) }, [data, recent.length, onUnseenChange])

  const me = { _id : user._id, name : user.name, profile_pic : user.profile_pic, self : true }
  const mine = data?.mine || []

  const open = (list, group) => {
    // start at the first unseen status of that person
    const first = list[group].statuses.findIndex((s) => !s.viewed)
    setViewer({ list, group, index : first === -1 ? 0 : first })
  }

  const pickFile = (file) => {
    if (!file) return
    if (!/^(image|video)\//.test(file.type)) return notifyError('Choose a photo or video')
    if (file.size > MAX_UPLOAD_BYTES) return notifyError('Files must be smaller than 100 MB')
    setComposer({ file, url : URL.createObjectURL(file), kind : file.type.startsWith('video/') ? 'video' : 'image' })
  }

  const Row = ({ u, list, i, muted : isMuted }) => (
    <button onClick={() => open(list, i)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-wa-hover ${isMuted ? 'opacity-60' : ''}`}>
      <StatusRing statuses={u.statuses}><StatusThumb status={u.statuses[u.statuses.length - 1]} size={40} /></StatusRing>
      <span className='min-w-0 flex-1 border-b border-wa-border pb-2.5 pt-1'>
        <span className='block truncate text-[16px] text-wa-text'>{names.name(u.user)}</span>
        <span className='block text-[13px] text-wa-muted'>{timeLabel(u.lastAt)}</span>
      </span>
    </button>
  )

  return (
    <Drawer title='Status' onClose={onClose}>
      {/* my status */}
      <div className='flex items-center gap-3 px-4 py-3'>
        <button onClick={() => (mine.length ? setViewer({ list : [{ user : me, statuses : mine }], group : 0, index : 0, mine : true }) : setComposer('text'))} className='relative' title={mine.length ? 'View my status' : 'Add status'}>
          {mine.length
            ? <StatusRing statuses={mine.map((s) => ({ ...s, viewed : true }))}><StatusThumb status={mine[mine.length - 1]} size={40} /></StatusRing>
            : <Avatar width={48} height={48} name={user.name} imageUrl={user.profile_pic} />}
          {!mine.length && <span className='absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-wa-surface bg-wa-green text-white'><IoAdd size={14} /></span>}
        </button>
        <div className='min-w-0 flex-1'>
          <p className='text-[16px] text-wa-text'>My status</p>
          <p className='truncate text-[13px] text-wa-muted'>{mine.length ? `${mine.length} update${mine.length > 1 ? 's' : ''} · ${timeLabel(mine[mine.length - 1].createdAt)}` : 'Click to add status update'}</p>
        </div>
        <button onClick={() => setComposer('text')} className='wa-icon-btn' title='Text status'><IoText size={19} /></button>
        <button onClick={() => fileRef.current?.click()} className='wa-icon-btn' title='Photo or video status'><IoImages size={19} /></button>
        <input ref={fileRef} type='file' accept='image/*,video/*' className='hidden' onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <p className='px-6 pb-2 text-xs text-wa-muted'>Status updates disappear after 24 hours. Choose who can see them in Settings → Privacy.</p>

      {!data && <div className='mx-auto my-8 h-6 w-6 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' />}

      {data && recent.length > 0 && <h4 className='px-6 pb-1 pt-4 text-[13px] font-medium uppercase text-wa-teal'>Recent</h4>}
      {recent.map((u, i) => <Row key={u.user._id} u={u} list={recent} i={i} />)}

      {data && viewed.length > 0 && <h4 className='px-6 pb-1 pt-4 text-[13px] font-medium uppercase text-wa-teal'>Viewed</h4>}
      {viewed.map((u, i) => <Row key={u.user._id} u={u} list={viewed} i={i} />)}

      {data && muted.length > 0 && (
        <button onClick={() => setShowMuted((v) => !v)} className='w-full px-6 pb-1 pt-4 text-left text-[13px] font-medium uppercase text-wa-teal'>
          Muted updates {showMuted ? '▾' : '▸'}
        </button>
      )}
      {showMuted && muted.map((u, i) => <Row key={u.user._id} u={u} list={muted} i={i} muted />)}

      {data && !data.updates.length && (
        <p className='px-8 pt-8 text-center text-sm text-wa-muted'>No updates yet. Updates from people who saved you as a contact show up here.</p>
      )}

      {viewer && (
        <StatusViewer
          socket={socket}
          {...viewer}
          nameOf={names.name}
          onClose={() => { setViewer(null); load() }}
          onDeleted={load}
        />
      )}
      {composer === 'text' && <TextComposer socket={socket} onClose={() => setComposer(null)} onPosted={load} />}
      {composer && composer !== 'text' && <MediaStatusComposer socket={socket} item={composer} onClose={() => { URL.revokeObjectURL(composer.url); setComposer(null) }} onPosted={load} />}
    </Drawer>
  )
}

/* ---------------- full-screen viewer ---------------- */

export const StatusViewer = ({ socket, list, group : startGroup, index : startIndex, mine = false, nameOf, onClose, onDeleted }) => {
  const [groupIdx, setGroupIdx] = useState(startGroup)
  const [idx, setIdx] = useState(startIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reply, setReply] = useState('')
  const [viewers, setViewers] = useState(null)
  const [menu, setMenu] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [mutedVideo, setMutedVideo] = useState(true)
  const [lists, setLists] = useState(list)
  const videoRef = useRef(null)
  const g = lists[groupIdx]
  const status = g?.statuses[idx]

  const next = useCallback(() => {
    setProgress(0)
    if (idx < g.statuses.length - 1) setIdx(idx + 1)
    else if (groupIdx < lists.length - 1) { setGroupIdx(groupIdx + 1); setIdx(0) }
    else onClose()
  }, [idx, g, groupIdx, lists.length, onClose])

  const prev = useCallback(() => {
    setProgress(0)
    if (idx > 0) setIdx(idx - 1)
    else if (groupIdx > 0) { setGroupIdx(groupIdx - 1); setIdx(lists[groupIdx - 1].statuses.length - 1) }
  }, [idx, groupIdx, lists])

  // mark as viewed
  useEffect(() => {
    if (!status || mine || status.viewed) return
    socketCall(socket, 'status-view', { statusId : status._id })
    setLists((ls) => ls.map((x, gi) => (gi !== groupIdx ? x : { ...x, statuses : x.statuses.map((s, si) => (si === idx ? { ...s, viewed : true } : s)) })))
  }, [status, mine, socket, groupIdx, idx])

  // progress timer (videos follow their own playback)
  const holding = paused || !!viewers || !!menu || confirmDelete || reply.length > 0
  useEffect(() => {
    if (!status || status.kind === 'video' || holding) return
    const started = Date.now() - progress * IMAGE_MS
    const t = setInterval(() => {
      const p = (Date.now() - started) / IMAGE_MS
      if (p >= 1) { clearInterval(t); next() } else setProgress(p)
    }, 50)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, holding, next])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (holding) v.pause(); else v.play().catch(() => {})
  }, [holding, status])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose])

  if (!status) return null

  const sendReply = async () => {
    const text = reply.trim()
    if (!text) return
    const res = await socketCall(socket, 'send-message', { receiver : g.user._id, clientId : newClientId(), text, statusId : status._id })
    if (!res.ok) return notifyError(res.error)
    setReply('')
    notify('Reply sent')
  }

  const showViewers = async () => {
    const res = await socketCall(socket, 'status-viewers', { statusId : status._id })
    if (!res.ok) return notifyError(res.error)
    setViewers(res.viewers)
  }

  const remove = async () => {
    setConfirmDelete(false)
    const res = await socketCall(socket, 'status-delete', { statusId : status._id })
    if (!res.ok) return notifyError(res.error)
    notify('Status deleted')
    onDeleted?.()
    const rest = g.statuses.filter((s) => s._id !== status._id)
    if (!rest.length) return onClose()
    setLists((ls) => ls.map((x, gi) => (gi === groupIdx ? { ...x, statuses : rest } : x)))
    setIdx(Math.min(idx, rest.length - 1))
    setProgress(0)
  }

  const toggleMute = async () => {
    const res = await socketCall(socket, 'status-mute', { userId : g.user._id, mute : !g.muted })
    if (!res.ok) return notifyError(res.error)
    notify(g.muted ? `${nameOf(g.user)}'s updates unmuted` : `${nameOf(g.user)}'s updates muted`)
    onClose()
  }

  return (
    <div className='fixed inset-0 z-[60] flex flex-col bg-[#0b141a] text-white' role='dialog' aria-label='Status viewer'>
      {/* progress bars */}
      <div className='mx-auto flex w-full max-w-[560px] gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]'>
        {g.statuses.map((s, i) => (
          <span key={s._id} className='h-[3px] flex-1 overflow-hidden rounded-full bg-white/30'>
            <span className='block h-full bg-white' style={{ width : i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%' }} />
          </span>
        ))}
      </div>
      <header className='mx-auto flex w-full max-w-[560px] items-center gap-3 px-3 py-2'>
        <button onClick={onClose} className='flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10' title='Close'><IoClose size={24} /></button>
        <Avatar width={38} height={38} name={g.user.self ? 'You' : nameOf(g.user)} imageUrl={g.user.profile_pic} />
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[15px]'>{g.user.self ? 'My status' : nameOf(g.user)}</p>
          <p className='text-xs text-white/70'>{timeLabel(status.createdAt)}</p>
        </div>
        {status.kind === 'video' && (
          <button onClick={() => setMutedVideo((m) => !m)} className='flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10' title={mutedVideo ? 'Unmute' : 'Mute'}>
            {mutedVideo ? <IoVolumeMuteOutline size={20} /> : <IoVolumeHighOutline size={20} />}
          </button>
        )}
        <button onClick={() => setPaused((p) => !p)} className='flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10' title={paused ? 'Play' : 'Pause'}>
          {paused ? <IoPlay size={20} /> : <IoPause size={20} />}
        </button>
        <button onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())} className='flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10' title='Menu'><HiDotsVertical size={20} /></button>
      </header>

      {/* content: tap left / right half to go back / forward, hold to pause */}
      <div className='relative flex min-h-0 flex-1 items-center justify-center'>
        <button onClick={prev} className='absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex' title='Previous'><IoChevronBack size={24} /></button>
        <button onClick={next} className='absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex' title='Next'><IoChevronForward size={24} /></button>
        <div
          className='relative flex h-full w-full max-w-[560px] select-none items-center justify-center'
          onPointerDown={() => setPaused(true)}
          onPointerUp={(e) => {
            setPaused(false)
            const rect = e.currentTarget.getBoundingClientRect()
            if (e.pointerType !== 'mouse') (e.clientX - rect.left < rect.width / 3 ? prev : next)()
          }}
          onPointerLeave={() => setPaused(false)}
        >
          {status.kind === 'text' && (
            <div className='flex h-full w-full items-center justify-center p-8 text-center' style={{ backgroundColor : status.background }}>
              <p className='whitespace-pre-wrap break-words text-[26px] leading-snug sm:text-[32px]' style={STATUS_FONTS[status.font || 0]}>{status.text}</p>
            </div>
          )}
          {status.kind === 'image' && <img src={status.mediaUrl} alt='' className='max-h-full max-w-full object-contain' draggable={false} />}
          {status.kind === 'video' && (
            <video
              ref={videoRef}
              key={status._id}
              src={status.mediaUrl}
              autoPlay
              playsInline
              muted={mutedVideo}
              className='max-h-full max-w-full'
              onTimeUpdate={(e) => e.currentTarget.duration && setProgress(e.currentTarget.currentTime / e.currentTarget.duration)}
              onEnded={next}
            />
          )}
          {status.caption && (
            <p className='absolute inset-x-0 bottom-4 mx-4 rounded-lg bg-black/40 px-3 py-2 text-center text-[15px]'>{status.caption}</p>
          )}
        </div>
      </div>

      <footer className='mx-auto w-full max-w-[560px] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2'>
        {mine ? (
          <button onClick={showViewers} className='mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm hover:bg-white/10'>
            <IoEyeOutline size={18} /> {status.viewCount || 0} view{status.viewCount === 1 ? '' : 's'}
          </button>
        ) : (
          <div className='flex items-center gap-2'>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendReply()}
              maxLength={4096}
              placeholder='Type a reply…'
              className='h-11 min-w-0 flex-1 rounded-full bg-white/15 px-4 text-[15px] text-white outline-none placeholder:text-white/60'
            />
            <button onClick={sendReply} disabled={!reply.trim()} className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-green text-white disabled:opacity-50' title='Send reply'><IoMdSend size={20} /></button>
          </div>
        )}
      </footer>

      {menu && (
        <PopoverMenu anchor={menu} onClose={() => setMenu(null)} items={mine
          ? [{ label : 'Delete', icon : <IoTrashOutline size={18} />, danger : true, onClick : () => setConfirmDelete(true) }]
          : [{ label : g.muted ? 'Unmute' : 'Mute', icon : <IoVolumeMuteOutline size={18} />, onClick : toggleMute }]} />
      )}
      {confirmDelete && (
        <Dialog title='Delete this status update?' onClose={() => setConfirmDelete(false)} actions={[{ label : 'Cancel', onClick : () => setConfirmDelete(false) }, { label : 'Delete', danger : true, onClick : remove }]}>
          It will also be deleted for everyone who received it.
        </Dialog>
      )}
      {viewers && (
        <Dialog title={`Viewed by ${viewers.length}`} onClose={() => setViewers(null)} actions={[{ label : 'Close', onClick : () => setViewers(null) }]}>
          <div className='max-h-[50dvh] overflow-y-auto scrollbar'>
            {viewers.length === 0 && <p className='py-4 text-center'>No views yet</p>}
            {viewers.map((v) => (
              <div key={v._id} className='flex items-center gap-3 py-2'>
                <Avatar width={36} height={36} name={nameOf(v)} imageUrl={v.profile_pic} />
                <span className='min-w-0 flex-1 truncate text-[15px] text-wa-text'>{nameOf(v)}</span>
                <span className='shrink-0 text-xs'>{moment(v.at).format('h:mm a')}</span>
              </div>
            ))}
            <p className='pt-3 text-xs'>People with read receipts turned off aren't shown.</p>
          </div>
        </Dialog>
      )}
    </div>
  )
}

/* ---------------- composers ---------------- */

const TextComposer = ({ socket, onClose, onPosted }) => {
  const [text, setText] = useState('')
  const [bg, setBg] = useState(() => STATUS_BACKGROUNDS[Math.floor(Math.random() * STATUS_BACKGROUNDS.length)])
  const [font, setFont] = useState(0)
  const [sending, setSending] = useState(false)

  const post = async () => {
    if (!text.trim()) return
    setSending(true)
    const res = await socketCall(socket, 'status-post', { kind : 'text', text, background : bg, font })
    setSending(false)
    if (!res.ok) return notifyError(res.error)
    notify('Status posted')
    onPosted?.()
    onClose()
  }

  return (
    <div className='fixed inset-0 z-[60] flex flex-col text-white transition-colors' style={{ backgroundColor : bg }}>
      <header className='flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]'>
        <button onClick={onClose} className='flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/10' title='Close'><IoClose size={26} /></button>
        <div className='flex gap-1'>
          <button onClick={() => setFont((f) => (f + 1) % STATUS_FONTS.length)} className='flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold hover:bg-black/10' style={STATUS_FONTS[font]} title='Font'>T</button>
          <button onClick={() => setBg((c) => STATUS_BACKGROUNDS[(STATUS_BACKGROUNDS.indexOf(c) + 1) % STATUS_BACKGROUNDS.length])} className='flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/10' title='Colour'><IoColorPaletteOutline size={22} /></button>
        </div>
      </header>
      <div className='flex flex-1 items-center justify-center px-6'>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={700}
          placeholder='Type a status'
          aria-label='Status text'
          rows={4}
          className='w-full max-w-xl resize-none bg-transparent text-center text-[28px] leading-snug text-white outline-none placeholder:text-white/70 sm:text-[34px]'
          style={STATUS_FONTS[font]}
        />
      </div>
      <footer className='flex items-center justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))]'>
        <span className='text-xs text-white/80'>{text.length}/700</span>
        <button onClick={post} disabled={!text.trim() || sending} className='flex h-14 w-14 items-center justify-center rounded-full bg-wa-green text-white shadow-menu disabled:opacity-60' title='Post status'><IoMdSend size={24} /></button>
      </footer>
    </div>
  )
}

const MediaStatusComposer = ({ socket, item, onClose, onPosted }) => {
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState(null)

  const post = async () => {
    setProgress(0)
    try {
      const up = await uploadFile(item.file, { onProgress : setProgress, encrypt : await canEncryptStatus() })
      const res = await socketCall(socket, 'status-post', { kind : item.kind, mediaUrl : up.url, caption })
      if (!res.ok) throw new Error(res.error)
      notify('Status posted')
      onPosted?.()
      onClose()
    } catch (error) {
      setProgress(null)
      notifyError(error?.message && !/Network|status code/i.test(error.message) ? error.message : "Couldn't upload. Check your connection and try again.")
    }
  }

  return (
    <div className='fixed inset-0 z-[60] flex flex-col bg-[#0b141a] text-white'>
      <header className='flex items-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]'>
        <button onClick={onClose} disabled={progress !== null} className='flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10' title='Close'><IoClose size={26} /></button>
      </header>
      <div className='flex min-h-0 flex-1 items-center justify-center p-4'>
        {item.kind === 'image' ? <img src={item.url} alt='' className='max-h-full max-w-full rounded object-contain' /> : <video src={item.url} controls playsInline className='max-h-full max-w-full' />}
      </div>
      <footer className='mx-auto flex w-full max-w-xl items-center gap-2 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]'>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={700} placeholder='Add a caption' className='h-12 min-w-0 flex-1 rounded-full bg-white/15 px-4 text-[15px] outline-none placeholder:text-white/60' onKeyDown={(e) => e.key === 'Enter' && progress === null && post()} />
        <button onClick={post} disabled={progress !== null} className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-green text-sm text-white disabled:opacity-80' title='Post status'>
          {progress !== null ? `${progress}%` : <IoMdSend size={22} />}
        </button>
      </footer>
    </div>
  )
}

export default StatusPanel

