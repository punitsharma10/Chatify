import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import moment from 'moment'
import {
  IoChevronBack, IoCallOutline, IoVideocamOutline, IoInformationCircleOutline, IoInformationCircle, IoHappyOutline, IoMicOutline,
  IoImageOutline, IoHeartOutline, IoArrowUndoOutline, IoEllipsisHorizontal, IoClose, IoAdd, IoPlay, IoPause, IoAlertCircle, IoCameraOutline,
} from 'react-icons/io5'
import Avatar from '../../Avatar'
import EmojiPicker from '../../EmojiPicker'
import { VoiceRecorder, voiceSupported, formatClock } from '../../Voice'
import { useCalls } from '../../CallManager'
import uploadFile from '../../../helpers/uploadFile'
import { api, uploadMedia, checkMediaFile, useOnVisible, splitMentions } from '../../../helpers/social'
import { socketCall } from '../../../helpers/socketCall'
import { notify, notifyError } from '../../../helpers/toast'
import { Modal, MediaThumb } from '../../social/common'
import { useThread, activeLabel, stampLabel, systemText, isJumboEmoji } from './directData'
import { ThreadAvatar, ShareSheet } from './DirectModals'
import DirectDetails from './DirectDetails'

// One Pixify Direct conversation, Instagram-style: blue bubbles for you, grey for them, hover actions,
// double-tap to ❤️, voice messages, photos, shared posts, "Seen", typing, and message requests.

const QUICK = ['❤️', '😂', '😮', '😢', '😡', '👍']
const EDIT_WINDOW = 15 * 60 * 1000
const GAP = 30 * 60 * 1000

const useMe = () => useSelector((s) => s.user)

/* ---------- message pieces ---------- */

// links and @mentions inside a text bubble
const BubbleText = ({ text, mine }) => (
  <span className='whitespace-pre-wrap break-words'>
    {text.split(/(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/gi).map((part, i) => {
      if (/^https?:\/\//i.test(part)) return <a key={i} href={part} target='_blank' rel='noopener noreferrer' className='underline' onClick={(e) => e.stopPropagation()}>{part}</a>
      return splitMentions(part).map((p, j) => (p.startsWith('@') && p.length > 3
        ? <Link key={`${i}-${j}`} to={`/pixify/u/${p.slice(1)}`} onClick={(e) => e.stopPropagation()} className={`font-semibold ${mine ? '' : 'text-px-blue'}`}>{p}</Link>
        : <React.Fragment key={`${i}-${j}`}>{p}</React.Fragment>))
    })}
  </span>
)

// shared Pixify post / reel
const PostCard = ({ postId }) => {
  const navigate = useNavigate()
  const [post, setPost] = useState(undefined)
  useEffect(() => {
    let alive = true
    api.get(`/posts/${postId}`).then((r) => alive && setPost(r.post)).catch(() => alive && setPost(null))
    return () => { alive = false }
  }, [postId])
  if (post === undefined) return <div className='h-[300px] w-[236px] animate-pulse rounded-2xl bg-px-raised' />
  if (post === null) {
    return (
      <div className='w-[236px] rounded-2xl bg-px-raised px-4 py-3'>
        <p className='text-sm font-semibold'>Post unavailable</p>
        <p className='text-[13px] text-px-muted'>This post may have been removed, or the account is private.</p>
      </div>
    )
  }
  const video = post.media?.[0]?.kind === 'video'
  return (
    <button onClick={(e) => { e.stopPropagation(); navigate(`/pixify/p/${post._id}`) }} className='block w-[236px] overflow-hidden rounded-2xl bg-px-raised text-left'>
      <span className='flex items-center gap-2 px-3 py-2'>
        <Avatar width={28} height={28} name={post.author.name} imageUrl={post.author.profile_pic} />
        <span className='truncate text-sm font-semibold'>{post.author.username || post.author.name}</span>
      </span>
      <span className='relative block'>
        <MediaThumb media={post.media?.[0]} className={`w-full ${video ? 'aspect-[9/14]' : 'aspect-square'}`} />
        {video && <span className='absolute right-2 top-2 text-white drop-shadow'><IoPlay size={20} /></span>}
      </span>
      {post.text && <span className='line-clamp-2 px-3 py-2 text-[13px]'><b className='mr-1'>{post.author.username}</b>{post.text}</span>}
    </button>
  )
}

const ProfileCard = ({ profile }) => {
  const navigate = useNavigate()
  if (profile.unavailable) return <div className='rounded-2xl bg-px-raised px-4 py-3 text-sm text-px-muted'>This account isn't available</div>
  return (
    <div className='flex w-[220px] flex-col items-center gap-1 rounded-2xl bg-px-raised px-4 py-4'>
      <Avatar width={64} height={64} name={profile.name} imageUrl={profile.profile_pic} />
      <p className='mt-1 max-w-full truncate text-sm font-semibold'>{profile.profileName || profile.name}</p>
      <p className='max-w-full truncate text-[13px] text-px-muted'>{profile.username}</p>
      <button onClick={(e) => { e.stopPropagation(); navigate(`/pixify/u/${profile.username || profile._id}`) }} className='mt-2 h-8 w-full rounded-lg bg-px-bg text-sm font-semibold hover:bg-px-hover'>View profile</button>
    </div>
  )
}

// voice message: play button + bars
const VoiceBubble = ({ audio, mine, progress }) => {
  const el = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const bars = audio.waveform?.length ? audio.waveform : Array(30).fill(0.35)
  const ratio = audio.duration ? Math.min(1, at / audio.duration) : 0
  const toggle = (e) => {
    e.stopPropagation()
    if (!el.current) return
    if (playing) el.current.pause()
    else el.current.play().catch(() => notifyError("Couldn't play this voice message"))
  }
  return (
    <div className={`flex w-[230px] items-center gap-2.5 rounded-3xl px-3 py-2.5 ${mine ? 'bg-[#3797f0] text-white' : 'bg-px-raised'}`}>
      {audio.url && <audio ref={el} src={audio.url} preload='none' onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setAt(0) }} onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)} />}
      <button onClick={toggle} disabled={!audio.url} aria-label={playing ? 'Pause' : 'Play'} className='shrink-0'>
        {progress !== undefined ? <span className='block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent' /> : playing ? <IoPause size={22} /> : <IoPlay size={22} />}
      </button>
      <span className='flex h-7 flex-1 items-center gap-[2px]'>
        {bars.map((v, i) => <span key={i} className={`w-[3px] flex-1 rounded-full ${i / bars.length < ratio ? (mine ? 'bg-white' : 'bg-px-text') : (mine ? 'bg-white/50' : 'bg-px-muted/50')}`} style={{ height : `${Math.max(12, v * 100)}%` }} />)}
      </span>
      <span className='shrink-0 text-xs tabular-nums'>{formatClock(playing || at ? at : audio.duration)}</span>
    </div>
  )
}

const MediaBubble = ({ media, onOpen, progress }) => (
  <div className={`grid max-w-[260px] gap-0.5 overflow-hidden rounded-2xl ${media.length > 1 ? 'grid-cols-2' : ''}`}>
    {media.map((m, i) => (
      <button key={i} onClick={(e) => { e.stopPropagation(); onOpen(i) }} className='relative block'>
        {m.local ? (
          m.kind === 'video' ? <video src={m.url} className='max-h-[320px] w-full object-cover' muted /> : <img src={m.url} alt='' className='max-h-[320px] w-full object-cover' />
        ) : (
          media.length === 1 && m.kind === 'image'
            ? <img src={m.url} alt='' loading='lazy' className='max-h-[320px] w-full object-cover' style={m.width && m.height ? { aspectRatio : `${m.width}/${m.height}` } : undefined} />
            : <MediaThumb media={m} className={`w-full ${media.length > 1 ? 'aspect-square' : 'max-h-[320px]'}`} />
        )}
        {m.kind === 'video' && <span className='absolute inset-0 flex items-center justify-center text-white'><IoPlay size={34} className='drop-shadow' /></span>}
        {progress !== undefined && <span className='absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white'>{progress}%</span>}
      </button>
    ))}
  </div>
)

const MediaViewer = ({ media, index, onClose }) => {
  const [i, setI] = useState(index)
  const m = media[i]
  return (
    <Modal onClose={onClose} label='Photo' className='flex max-h-[92vh] max-w-[92vw] items-center gap-3'>
      {media.length > 1 && <button onClick={() => setI((x) => (x - 1 + media.length) % media.length)} className='rounded-full bg-white/80 p-1 text-black' aria-label='Previous'><IoChevronBack size={22} /></button>}
      {m.kind === 'video'
        ? <video src={m.url} controls autoPlay className='max-h-[90vh] max-w-[85vw] rounded' />
        : <img src={m.url} alt='' className='max-h-[90vh] max-w-[85vw] rounded object-contain' />}
      {media.length > 1 && <button onClick={() => setI((x) => (x + 1) % media.length)} className='rotate-180 rounded-full bg-white/80 p-1 text-black' aria-label='Next'><IoChevronBack size={22} /></button>}
    </Modal>
  )
}

/* ---------- one message row ---------- */

const ReactionBar = ({ onPick, onMore, align }) => (
  <div className={`absolute bottom-full z-20 mb-1 flex animate-pop items-center gap-1 rounded-full bg-px-bg px-2 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.2)] ring-1 ring-px-border ${align === 'right' ? 'right-0' : 'left-0'}`} onClick={(e) => e.stopPropagation()}>
    {QUICK.map((e) => <button key={e} onClick={() => onPick(e)} className='text-[26px] leading-none transition-transform hover:scale-125'>{e}</button>)}
    <button onClick={onMore} className='ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-px-raised' aria-label='More reactions'><IoAdd size={18} /></button>
  </div>
)

const Message = ({ m, mine, me, sender, showSender, showAvatar, onReply, onEdit, onReact, onUnsend, onOpenMedia, onShowReactions, onForward }) => {
  const [bar, setBar] = useState(false)
  const [menu, setMenu] = useState(false)
  const [picker, setPicker] = useState(false)
  const [sheet, setSheet] = useState(false)
  const press = useRef(null)
  const myReaction = m.reactions.find((r) => r.userId === me)?.emoji
  const toggleHeart = () => !m.pending && !m.failed && onReact(m, myReaction === '❤️' ? '' : '❤️')
  const canEdit = mine && m.kind === 'text' && Date.now() - new Date(m.createdAt) < EDIT_WINDOW
  const jumbo = m.kind === 'text' && isJumboEmoji(m.text)

  useEffect(() => {
    if (!bar && !menu) return
    const close = () => { setBar(false); setMenu(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [bar, menu])

  let body
  if (m.kind === 'text') {
    body = jumbo ? <span className='text-[44px] leading-tight'>{m.text}</span> : (
      <div className={`max-w-full rounded-[22px] px-3 py-2 text-[15px] leading-[20px] ${mine ? 'bg-[#3797f0] text-white' : 'bg-px-raised'}`}>
        <BubbleText text={m.text} mine={mine} />
      </div>
    )
  } else if (m.kind === 'media') body = <MediaBubble media={m.media} progress={m.progress} onOpen={(i) => onOpenMedia(m.media, i)} />
  else if (m.kind === 'voice') body = <VoiceBubble audio={m.audio} mine={mine} progress={m.pending ? m.progress || 0 : undefined} />
  else if (m.kind === 'post') body = <PostCard postId={m.post} />
  else if (m.kind === 'profile') body = <ProfileCard profile={m.profile} />

  const counts = {}
  m.reactions.forEach((r) => { counts[r.emoji] = (counts[r.emoji] || 0) + 1 })
  const actions = !m.pending && !m.failed && (
    <div className={`flex shrink-0 items-center gap-0.5 self-center text-px-muted opacity-0 transition-opacity group-hover:opacity-100 max-md:hidden ${bar || menu ? 'opacity-100' : ''} ${mine ? 'flex-row-reverse' : ''}`}>
      <div className='relative'>
        <button onClick={(e) => { e.stopPropagation(); setMenu(false); setBar((v) => !v) }} title='React' className='rounded-full p-1.5 hover:text-px-text'><IoHappyOutline size={18} /></button>
        {bar && <ReactionBar align={mine ? 'right' : 'left'} onPick={(e) => { setBar(false); onReact(m, myReaction === e ? '' : e) }} onMore={() => { setBar(false); setPicker(true) }} />}
      </div>
      <button onClick={() => onReply(m)} title='Reply' className='rounded-full p-1.5 hover:text-px-text'><IoArrowUndoOutline size={18} /></button>
      <div className='relative'>
        <button onClick={(e) => { e.stopPropagation(); setBar(false); setMenu((v) => !v) }} title='More' className='rounded-full p-1.5 hover:text-px-text'><IoEllipsisHorizontal size={18} /></button>
        {menu && (
          <div className={`absolute bottom-full z-20 mb-1 w-44 animate-pop overflow-hidden rounded-xl bg-px-bg py-1 text-sm text-px-text shadow-[0_4px_16px_rgba(0,0,0,0.2)] ring-1 ring-px-border ${mine ? 'right-0' : 'left-0'}`} onClick={(e) => e.stopPropagation()}>
            <p className='px-4 py-2 text-xs text-px-muted'>{moment(m.createdAt).format('ddd h:mm A')}</p>
            {m.kind === 'text' && <button onClick={() => { setMenu(false); navigator.clipboard?.writeText(m.text).then(() => notify('Copied')) }} className='block w-full px-4 py-2 text-left hover:bg-px-hover'>Copy</button>}
            <button onClick={() => { setMenu(false); onForward(m) }} className='block w-full px-4 py-2 text-left hover:bg-px-hover'>Forward</button>
            {canEdit && <button onClick={() => { setMenu(false); onEdit(m) }} className='block w-full px-4 py-2 text-left hover:bg-px-hover'>Edit</button>}
            {mine && <button onClick={() => { setMenu(false); onUnsend(m) }} className='block w-full px-4 py-2 text-left text-[#ed4956] hover:bg-px-hover'>Unsend</button>}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className={`group flex items-end gap-2 px-4 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && <span className='w-7 shrink-0'>{showAvatar && sender && <Link to={`/pixify/u/${sender.username || sender._id}`}><Avatar width={28} height={28} name={sender.name} imageUrl={sender.profile_pic} /></Link>}</span>}
      <div className={`flex min-w-0 max-w-[75%] flex-col md:max-w-[60%] ${mine ? 'items-end' : 'items-start'}`}>
        {showSender && sender && <span className='mb-0.5 ml-3 text-xs text-px-muted'>{sender.username || sender.name}</span>}
        {m.replyTo && (
          <div className={`mb-0.5 flex max-w-full flex-col ${mine ? 'items-end' : 'items-start'}`}>
            <span className='mb-0.5 px-1 text-xs text-px-muted'>{mine ? 'You replied' : `${sender?.username || sender?.name || 'They'} replied`}{m.replyTo.deleted ? '' : m.replyTo.from === me ? ' to you' : ''}</span>
            <span className='max-w-full truncate rounded-[18px] border border-px-border px-3 py-1.5 text-[13px] text-px-muted'>{m.replyTo.deleted ? 'Original message was unsent' : m.replyTo.preview}</span>
          </div>
        )}
        <div className={`flex max-w-full items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <div className='relative min-w-0 cursor-default select-text' onDoubleClick={toggleHeart}
            onContextMenu={(e) => { if (window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); setSheet(true) } }}
            onTouchStart={() => { press.current = setTimeout(() => setSheet(true), 450) }} onTouchEnd={() => clearTimeout(press.current)} onTouchMove={() => clearTimeout(press.current)}>
            {body}
            {m.reactions.length > 0 && (
              <button onClick={() => onShowReactions(m)} className={`absolute -bottom-3.5 flex items-center gap-0.5 rounded-full bg-px-raised px-1.5 py-0.5 text-[13px] ring-2 ring-px-bg ${mine ? 'right-2' : 'left-2'}`}>
                {Object.keys(counts).slice(0, 3).join('')}{m.reactions.length > 1 && <span className='text-xs text-px-muted'>{m.reactions.length}</span>}
              </button>
            )}
          </div>
          {actions}
        </div>
        {m.reactions.length > 0 && <span className='h-3.5' />}
        {m.editedAt && <span className='mt-0.5 px-1 text-[11px] text-px-muted'>Edited</span>}
        {m.failed && <button onClick={m.retry} className='mt-0.5 flex items-center gap-1 text-xs text-[#ed4956]'><IoAlertCircle /> Not sent. Tap to try again.</button>}
      </div>
      {picker && <div className='fixed inset-0 z-[70] flex items-center justify-center bg-black/30' onClick={() => setPicker(false)}><div onClick={(e) => e.stopPropagation()} className='relative h-[420px] w-[340px]'><EmojiPicker className='absolute inset-0' onClose={() => setPicker(false)} onSelect={(e) => { setPicker(false); onReact(m, e) }} /></div></div>}
      {sheet && (
        <div className='fixed inset-0 z-[70] flex flex-col items-center justify-end bg-black/50' onClick={() => setSheet(false)}>
          <div className='mb-2 flex gap-2 rounded-full bg-px-bg px-3 py-2' onClick={(e) => e.stopPropagation()}>
            {QUICK.map((e) => <button key={e} onClick={() => { setSheet(false); onReact(m, myReaction === e ? '' : e) }} className='text-[28px]'>{e}</button>)}
          </div>
          <div role='menu' className='w-full max-w-[400px] animate-pop divide-y divide-px-border overflow-hidden rounded-t-2xl bg-px-bg text-px-text' onClick={(e) => e.stopPropagation()}>
            {[
              { label : 'Reply', onClick : () => onReply(m) },
              { label : 'Copy', hidden : m.kind !== 'text', onClick : () => navigator.clipboard?.writeText(m.text).then(() => notify('Copied')) },
              { label : 'Forward', onClick : () => onForward(m) },
              { label : 'Edit', hidden : !canEdit, onClick : () => onEdit(m) },
              { label : 'Unsend', hidden : !mine, danger : true, onClick : () => onUnsend(m) },
              { label : 'Cancel', onClick : () => {} },
            ].filter((it) => !it.hidden).map((it) => (
              <button key={it.label} role='menuitem' onClick={() => { setSheet(false); it.onClick() }} className={`h-12 w-full text-sm ${it.danger ? 'font-bold text-[#ed4956]' : ''}`}>{it.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- composer ---------- */

const Composer = ({ onSendText, onSendFiles, onSendVoice, onTyping, reply, editing, onCancel, onSaveEdit }) => {
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const input = useRef(null)
  const files = useRef(null)
  const camera = useRef(null)

  useEffect(() => { if (editing) { setText(editing.text); input.current?.focus() } }, [editing])
  useEffect(() => { if (reply) input.current?.focus() }, [reply])
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const submit = () => {
    const t = text.trim()
    if (!t) return
    if (editing) onSaveEdit(t)
    else onSendText(t)
    setText('')
    onTyping(false)
  }
  const pick = (e) => {
    const list = [...(e.target.files || [])]
    e.target.value = ''
    if (!list.length) return
    const bad = list.map(checkMediaFile).find(Boolean)
    if (bad) return notifyError(bad)
    if (list.length > 10) return notifyError('Send up to 10 photos or videos at a time')
    onSendFiles(list)
  }

  if (recording) {
    return (
      <div className='px-4 pb-4 pt-2'>
        <div className='rounded-full border border-px-border px-2 [&_*]:!text-px-text'>
          <VoiceRecorder onCancel={() => setRecording(false)} onError={(m) => { setRecording(false); notifyError(m) }} onSend={(v) => { setRecording(false); onSendVoice(v) }} />
        </div>
      </div>
    )
  }

  return (
    <div className='px-4 pb-4 pt-2'>
      {(reply || editing) && (
        <div className='mb-2 flex items-start gap-2 border-t border-px-border px-2 pt-2'>
          <div className='min-w-0 flex-1'>
            <p className='text-xs font-semibold'>{editing ? 'Editing message' : `Replying to ${reply.who}`}</p>
            <p className='truncate text-xs text-px-muted'>{editing ? editing.text : reply.preview}</p>
          </div>
          <button onClick={() => { onCancel(); if (editing) setText('') }} aria-label='Cancel'><IoClose size={18} /></button>
        </div>
      )}
      <div className='relative flex min-h-[44px] items-end gap-2 rounded-[22px] border border-px-border py-1.5 pl-3 pr-4'>
        <button onClick={() => setEmoji((v) => !v)} className='mb-0.5 shrink-0' aria-label='Emoji'><IoHappyOutline size={26} /></button>
        {emoji && <EmojiPicker className='absolute bottom-14 left-0 z-30' onClose={() => setEmoji(false)} onSelect={(e) => { setText((t) => t + e); input.current?.focus() }} />}
        <textarea ref={input} rows={1} value={text} placeholder='Message...' aria-label='Message'
          onChange={(e) => { setText(e.target.value); onTyping(!!e.target.value) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } if (e.key === 'Escape' && (reply || editing)) onCancel() }}
          className='max-h-[120px] min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-[15px] leading-5 outline-none placeholder:text-px-muted' />
        {text.trim() ? (
          <button onClick={submit} className='mb-1 shrink-0 text-[15px] font-semibold text-px-blue hover:text-px-text'>{editing ? 'Save' : 'Send'}</button>
        ) : (
          <div className='mb-0.5 flex shrink-0 items-center gap-3'>
            {voiceSupported() && <button onClick={() => setRecording(true)} aria-label='Voice message' title='Voice message'><IoMicOutline size={25} /></button>}
            <button onClick={() => files.current?.click()} aria-label='Add photo or video' title='Add photo or video'><IoImageOutline size={25} /></button>
            <button onClick={() => camera.current?.click()} aria-label='Camera' title='Camera' className='md:hidden'><IoCameraOutline size={25} /></button>
            <button onClick={() => onSendText('❤️')} aria-label='Send a heart' title='Like'><IoHeartOutline size={25} /></button>
          </div>
        )}
        <input ref={files} type='file' accept='image/*,video/*' multiple hidden onChange={pick} />
        <input ref={camera} type='file' accept='image/*,video/*' capture='environment' hidden onChange={pick} />
      </div>
    </div>
  )
}

/* ---------- the conversation ---------- */

const DirectThread = () => {
  const { threadId } = useParams()
  const navigate = useNavigate()
  const user = useMe()
  const me = user._id
  const socket = useSelector((s) => s.user.socketConnection)
  const calls = useCalls()
  const t = useThread(threadId, me)
  const { thread } = t
  const [details, setDetails] = useState(false)
  const [reply, setReply] = useState(null)
  const [editing, setEditing] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [reactionsOf, setReactionsOf] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [forwarding, setForwarding] = useState(null)

  useEffect(() => { setDetails(false); setReply(null); setEditing(null) }, [threadId])
  useEffect(() => { if (t.error === 'removed') navigate('/pixify/direct', { replace : true }) }, [t.error, navigate])

  const people = useMemo(() => {
    const map = { [me] : { _id : me, name : user.name, username : user.username, profile_pic : user.profile_pic } }
    thread?.members.forEach((m) => { map[m._id] = m })
    return map
  }, [thread, me, user])

  // mark as read while the chat is open and visible
  const lastOther = [...t.messages].reverse().find((m) => m.from !== me && !m.pending)
  const readMark = useRef(null)
  useEffect(() => {
    if (!thread || !lastOther) return
    const mark = () => {
      if (document.visibilityState !== 'visible' || readMark.current === lastOther._id) return
      if (thread.lastReadAt && new Date(thread.lastReadAt) >= new Date(lastOther.createdAt)) { readMark.current = lastOther._id; return }
      readMark.current = lastOther._id
      api.post(`/dm/threads/${threadId}/read`).catch(() => { readMark.current = null })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [thread, lastOther, threadId])

  // newest at the bottom; older pages load when scrolling up
  const older = useOnVisible(() => t.loadOlder(), t.hasOlder)

  const react = useCallback(async (m, emoji) => {
    try { t.upsert((await api.post(`/dm/messages/${m._id}/react`, { emoji })).message) } catch (e) { notifyError(e.message) }
  }, [t])
  const unsend = useCallback((m) => setConfirm({
    title : 'Unsend message?', text : 'Unsending will remove the message for everyone. People may have seen it already.', action : 'Unsend',
    run : async () => { try { await api.del(`/dm/messages/${m._id}`); t.setMessages((l) => l.filter((x) => x._id !== m._id)) } catch (e) { notifyError(e.message) } },
  }), [t])
  const saveEdit = async (text) => {
    const m = editing
    setEditing(null)
    if (text === m.text) return
    try { t.upsert((await api.patch(`/dm/messages/${m._id}`, { text })).message) } catch (e) { notifyError(e.message) }
  }
  const replyTo = (m) => {
    setEditing(null)
    const who = m.from === me ? 'yourself' : (people[m.from]?.username || people[m.from]?.name || 'them')
    const preview = m.kind === 'text' ? m.text : m.kind === 'media' ? 'Photo' : m.kind === 'voice' ? 'Voice message' : m.kind === 'post' ? 'Post' : 'Profile'
    setReply({ id : m._id, who, preview })
  }
  const withReply = (body) => {
    const r = reply
    setReply(null)
    return r ? { ...body, replyTo : r.id } : body
  }
  const sendText = (text) => t.send(withReply({ kind : 'text', text })).catch(() => {})
  const sendFiles = (list) => {
    const local = list.map((f) => ({ url : URL.createObjectURL(f), kind : f.type.startsWith('video/') ? 'video' : 'image', local : true }))
    t.send(withReply({ kind : 'media' }), {
      local : { media : local, progress : 0 },
      prepare : async (progress) => ({ media : await uploadMedia(list, progress) }),
    }).catch(() => {})
  }
  const sendVoice = ({ blob, type, duration, waveform }) => {
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
    t.send(withReply({ kind : 'voice' }), {
      local : { audio : { duration, waveform } },
      prepare : async (progress) => {
        const up = await uploadFile(new File([blob], `voice.${ext}`, { type }), { onProgress : progress })
        return { audio : { url : up.url, duration, waveform } }
      },
    }).catch(() => {})
  }

  const accept = async () => {
    try {
      t.setThread((await api.post(`/dm/threads/${threadId}/accept`)).thread)
      // it now lives in the inbox
      navigate(`/pixify/direct/t/${threadId}`, { replace : true, state : null })
    } catch (e) { notifyError(e.message) }
  }
  const deleteChat = () => setConfirm({
    title : thread?.status === 'request' ? 'Delete request?' : 'Delete chat?',
    text : 'This removes the conversation for you. Other people in it will still see it.', action : 'Delete',
    run : async () => { try { await api.post(`/dm/threads/${threadId}/delete`); navigate('/pixify/direct') } catch (e) { notifyError(e.message) } },
  })
  const block = (blockIt) => {
    const run = async () => {
      const res = await socketCall(socket, 'block-user', { userId : thread.peer._id, block : blockIt })
      if (!res.ok) return notifyError(res.error)
      t.reload()
      if (blockIt) notify(`Blocked ${thread.peer.username || thread.peer.name}`)
    }
    if (!blockIt) return run()
    setConfirm({ title : `Block ${thread.peer.username || thread.peer.name}?`, text : "They won't be able to message you or find your profile, posts or stories. They won't be told you blocked them.", action : 'Block', run })
  }

  if (t.loading && !thread) return <div className='flex h-full items-center justify-center'><span className='h-8 w-8 animate-spin rounded-full border-2 border-px-border border-t-px-text' /></div>
  if (t.error && !thread) return <div className='flex h-full flex-col items-center justify-center gap-2 p-6 text-center'><p className='font-semibold'>{t.error}</p><button onClick={() => navigate('/pixify/direct')} className='text-sm font-semibold text-px-blue'>Back to messages</button></div>
  if (!thread) return null

  const peer = thread.peer
  const sub = thread.isGroup ? `${thread.memberCount} members` : activeLabel(peer) || peer?.username
  const typingNames = Object.entries(t.typing).filter(([id, on]) => on && id !== me).map(([id]) => people[id]).filter(Boolean)

  // "Seen" under your last message
  const lastMine = [...t.messages].reverse().find((m) => !m.pending && !m.failed && m.kind !== 'system')
  let seen = ''
  if (lastMine && lastMine.from === me) {
    const readers = thread.members.filter((m) => m.lastReadAt && new Date(m.lastReadAt) >= new Date(lastMine.createdAt))
    if (!thread.isGroup && readers.length) {
      const mins = moment().diff(moment(readers[0].lastReadAt), 'minutes')
      seen = mins < 1 ? 'Seen just now' : mins < 60 ? `Seen ${mins}m ago` : 'Seen'
    } else if (thread.isGroup && readers.length) {
      seen = readers.length === thread.members.length ? 'Seen by everyone' : `Seen by ${readers.slice(0, 3).map((p) => p.username || p.name.split(' ')[0]).join(', ')}${readers.length > 3 ? ` +${readers.length - 3}` : ''}`
    }
  }

  const rows = []
  t.messages.forEach((m, i) => {
    const prev = t.messages[i - 1]
    const next = t.messages[i + 1]
    if (!prev || new Date(m.createdAt) - new Date(prev.createdAt) > GAP) rows.push(<p key={`s${m._id}`} className='py-3 text-center text-xs font-medium text-px-muted'>{stampLabel(m.createdAt)}</p>)
    if (m.kind === 'system') { rows.push(<p key={m._id} className='px-6 py-2 text-center text-xs text-px-muted'>{systemText(m.system, me)}</p>); return }
    const sameAsPrev = prev && prev.from === m.from && prev.kind !== 'system' && new Date(m.createdAt) - new Date(prev.createdAt) <= GAP
    const sameAsNext = next && next.from === m.from && next.kind !== 'system' && new Date(next.createdAt) - new Date(m.createdAt) <= GAP
    rows.push(
      <div key={m.clientId || m._id} className={sameAsPrev ? 'mt-0.5' : 'mt-2'}>
        <Message m={m} me={me} mine={m.from === me} sender={people[m.from]} showSender={thread.isGroup && m.from !== me && !sameAsPrev} showAvatar={!sameAsNext}
          onReply={replyTo} onEdit={(x) => { setReply(null); setEditing(x) }} onReact={react} onUnsend={unsend}
          onOpenMedia={(media, index) => setViewer({ media, index })} onShowReactions={setReactionsOf} onForward={setForwarding} />
      </div>
    )
  })

  const showComposer = thread.status === 'inbox' && !thread.blockedByMe && !thread.unavailable

  return (
    <div className='flex h-full min-h-0'>
      <div className={`flex h-full min-w-0 flex-1 flex-col ${details ? 'max-lg:hidden' : ''}`}>
        <header className='flex h-[75px] shrink-0 items-center gap-3 border-b border-px-border px-4 max-md:h-[60px]'>
          <button onClick={() => navigate('/pixify/direct')} className='md:hidden' aria-label='Back'><IoChevronBack size={28} /></button>
          <button onClick={() => (thread.isGroup ? setDetails(true) : navigate(`/pixify/u/${peer.username || peer._id}`))} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
            <ThreadAvatar thread={thread} size={44} />
            <span className='min-w-0'>
              <span className='block truncate font-semibold'>{thread.title}</span>
              {sub && <span className='block truncate text-xs text-px-muted'>{sub}</span>}
            </span>
          </button>
          {!thread.isGroup && showComposer && (
            <>
              <button onClick={() => calls.startCall(peer, 'audio')} title='Audio call' aria-label='Audio call'><IoCallOutline size={26} /></button>
              <button onClick={() => calls.startCall(peer, 'video')} title='Video call' aria-label='Video call'><IoVideocamOutline size={28} /></button>
            </>
          )}
          <button onClick={() => setDetails((v) => !v)} title='Conversation information' aria-label='Conversation information'>{details ? <IoInformationCircle size={28} /> : <IoInformationCircleOutline size={28} />}</button>
        </header>

        <div className='flex min-h-0 flex-1 flex-col-reverse overflow-y-auto'>
          <div className='pb-2'>
            <div ref={older} />
            {t.hasOlder && <p className='py-3 text-center'><span className='inline-block h-5 w-5 animate-spin rounded-full border-2 border-px-border border-t-px-text' /></p>}
            {!t.hasOlder && (
              <div className='flex flex-col items-center gap-1 px-4 pb-6 pt-8 text-center'>
                <ThreadAvatar thread={thread} size={96} />
                <p className='mt-2 text-xl font-semibold'>{thread.isGroup ? thread.title : peer?.profileName || peer?.name}</p>
                {!thread.isGroup && <p className='text-sm text-px-muted'>{peer?.username} · Pixify</p>}
                {thread.isGroup
                  ? <button onClick={() => setDetails(true)} className='mt-3 h-8 rounded-lg bg-px-raised px-4 text-sm font-semibold hover:bg-px-border'>View members</button>
                  : <button onClick={() => navigate(`/pixify/u/${peer?.username || peer?._id}`)} className='mt-3 h-8 rounded-lg bg-px-raised px-4 text-sm font-semibold hover:bg-px-border'>View profile</button>}
              </div>
            )}
            {rows}
            {seen && <p className='mt-1 px-4 text-right text-xs text-px-muted'>{seen}</p>}
            {typingNames.length > 0 && (
              <div className='mt-2 flex items-end gap-2 px-4'>
                <Avatar width={28} height={28} name={typingNames[0].name} imageUrl={typingNames[0].profile_pic} />
                <span className='flex gap-1 rounded-[22px] bg-px-raised px-4 py-3' aria-label='typing'>
                  {[0, 1, 2].map((i) => <span key={i} className='h-2 w-2 animate-bounce rounded-full bg-px-muted' style={{ animationDelay : `${i * 0.15}s` }} />)}
                </span>
              </div>
            )}
          </div>
        </div>

        {thread.status === 'request' && (
          <div className='shrink-0 border-t border-px-border px-4 py-4 text-center'>
            <p className='font-semibold'>Accept message request from {peer ? peer.username || peer.name : thread.title}?</p>
            <p className='mx-auto mt-1 max-w-md text-xs text-px-muted'>If you accept, they will also be able to call you and see info such as your activity status and when you've read messages.</p>
            <div className='mt-3 flex border-t border-px-border text-sm font-semibold max-md:flex-col'>
              {peer && <button onClick={() => block(true)} className='h-11 flex-1 text-[#ed4956] hover:bg-px-hover'>Block</button>}
              <button onClick={deleteChat} className='h-11 flex-1 text-[#ed4956] hover:bg-px-hover'>Delete</button>
              <button onClick={accept} className='h-11 flex-1 hover:bg-px-hover'>Accept</button>
            </div>
          </div>
        )}
        {thread.status === 'inbox' && thread.blockedByMe && (
          <div className='shrink-0 border-t border-px-border p-4 text-center text-sm'>
            <p className='text-px-muted'>You blocked this account.</p>
            <button onClick={() => block(false)} className='mt-1 font-semibold text-px-blue'>Unblock</button>
          </div>
        )}
        {thread.status === 'inbox' && !thread.blockedByMe && thread.unavailable && (
          <p className='shrink-0 border-t border-px-border p-4 text-center text-sm text-px-muted'>This account can't receive your messages.</p>
        )}
        {showComposer && (
          <Composer reply={reply} editing={editing} onCancel={() => { setReply(null); setEditing(null) }} onSaveEdit={saveEdit}
            onSendText={sendText} onSendFiles={sendFiles} onSendVoice={sendVoice} onTyping={t.setMyTyping} />
        )}
      </div>

      {details && (
        <DirectDetails thread={thread} onClose={() => setDetails(false)} onThread={t.setThread}
          onDelete={deleteChat} onBlock={() => block(!thread.blockedByMe)} />
      )}
      {forwarding && <ShareSheet forwardId={forwarding._id} onClose={() => setForwarding(null)} />}
      {viewer && <MediaViewer media={viewer.media} index={viewer.index} onClose={() => setViewer(null)} />}
      {reactionsOf && (
        <Modal onClose={() => setReactionsOf(null)} label='Reactions' closeButton={false} className='w-[min(400px,92vw)] overflow-hidden rounded-xl bg-px-bg text-px-text'>
          <p className='border-b border-px-border py-3 text-center font-semibold'>Reactions</p>
          <div className='max-h-[50vh] overflow-y-auto py-2'>
            {reactionsOf.reactions.map((r) => {
              const p = people[r.userId] || { name : 'Pixify user' }
              const mineR = r.userId === me
              return (
                <button key={r.userId} disabled={!mineR} onClick={() => { setReactionsOf(null); react(reactionsOf, '') }} className='flex w-full items-center gap-3 px-4 py-2 text-left enabled:hover:bg-px-hover'>
                  <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-semibold'>{mineR ? 'You' : p.username || p.name}</span>
                    {mineR && <span className='block text-xs text-px-muted'>Tap to remove</span>}
                  </span>
                  <span className='text-2xl'>{r.emoji}</span>
                </button>
              )
            })}
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal onClose={() => setConfirm(null)} label={confirm.title} closeButton={false} className='w-[min(400px,92vw)] overflow-hidden rounded-xl bg-px-bg text-center text-px-text'>
          <div className='px-8 pb-5 pt-7'>
            <p className='text-xl'>{confirm.title}</p>
            <p className='mt-2 text-sm text-px-muted'>{confirm.text}</p>
          </div>
          <button onClick={() => { const c = confirm; setConfirm(null); c.run() }} className='h-12 w-full border-t border-px-border text-sm font-bold text-[#ed4956]'>{confirm.action}</button>
          <button onClick={() => setConfirm(null)} className='h-12 w-full border-t border-px-border text-sm'>Cancel</button>
        </Modal>
      )}
    </div>
  )
}

export default DirectThread
