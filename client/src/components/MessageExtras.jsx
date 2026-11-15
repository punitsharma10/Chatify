import React, { useState } from 'react'
import { IoCheckmark, IoLocationSharp, IoPerson, IoEyeOutline, IoChatbubbleOutline, IoPersonAddOutline } from 'react-icons/io5'
import { MdOutlinePoll } from 'react-icons/md'
import Avatar from './Avatar'
import { formatPhone } from '../helpers/phone'

/* ---------- poll ---------- */

// WhatsApp-style poll: tap an option to vote (again to remove), bars show the share of votes,
// "View votes" lists who chose what.
export const PollCard = ({ poll, mine, myId, disabled, onVote, onViewVotes }) => {
  const mineVote = poll.votes.find((v) => String(v.userId) === String(myId))?.options || []
  const counts = poll.options.map((_, i) => poll.votes.filter((v) => v.options.includes(i)).length)
  const voters = poll.votes.length
  const max = Math.max(1, ...counts)

  const toggle = (i) => {
    if (disabled) return
    const has = mineVote.includes(i)
    const next = poll.multiple ? (has ? mineVote.filter((x) => x !== i) : [...mineVote, i]) : (has ? [] : [i])
    onVote(next)
  }

  return (
    <div className='min-w-[230px] max-w-[330px] pb-4 pt-0.5'>
      <p className='chat-text font-medium text-wa-text'>{poll.question}</p>
      <p className='mb-2 mt-0.5 flex items-center gap-1 text-[12.5px] text-wa-muted'>
        <MdOutlinePoll size={14} /> {poll.multiple ? 'Select one or more' : 'Select one'}
      </p>
      <div className='space-y-2.5'>
        {poll.options.map((opt, i) => {
          const chosen = mineVote.includes(i)
          return (
            <button key={i} type='button' disabled={disabled} onClick={(e) => { e.stopPropagation(); toggle(i) }} className='block w-full text-left disabled:cursor-default' aria-pressed={chosen}>
              <span className='flex items-center gap-2.5'>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${poll.multiple ? 'rounded' : 'rounded-full'} ${chosen ? 'border-wa-green bg-wa-green text-white' : 'border-wa-subtle'}`}>
                  {chosen && <IoCheckmark size={14} />}
                </span>
                <span className='min-w-0 flex-1 break-words text-[14.2px] text-wa-text'>{opt}</span>
                <span className='shrink-0 text-[13px] text-wa-muted'>{counts[i]}</span>
              </span>
              <span className='ml-[30px] mt-1.5 block h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10'>
                <span className='block h-full rounded-full bg-wa-green transition-[width] duration-300' style={{ width : `${(counts[i] / max) * 100}%` }} />
              </span>
            </button>
          )
        })}
      </div>
      <button type='button' onClick={(e) => { e.stopPropagation(); onViewVotes() }} className={`mt-3 w-full border-t pt-2 text-center text-[14px] font-medium text-wa-teal ${mine ? 'border-black/10 dark:border-white/10' : 'border-wa-border'}`}>
        {voters ? `View votes (${voters})` : 'No votes yet'}
      </button>
    </div>
  )
}

/* ---------- contact card ---------- */

export const ContactCard = ({ contact, myId, onMessage, onSave, isSaved }) => {
  const self = String(contact.userId) === String(myId)
  return (
    <div className='min-w-[240px] pb-4'>
      <div className='flex items-center gap-3 py-1.5'>
        <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wa-raised text-wa-subtle'><IoPerson size={24} /></span>
        <div className='min-w-0'>
          <p className='truncate text-[15px] text-wa-text'>{contact.name}</p>
          {contact.phone && <p className='truncate text-[13px] text-wa-muted'>{formatPhone(contact.phone)}</p>}
          {!contact.phone && contact.email && <p className='truncate text-[13px] text-wa-muted'>{contact.email}</p>}
        </div>
      </div>
      {contact.userId && !self && (
        <div className='mt-1 flex border-t border-black/10 pt-1 dark:border-white/10'>
          <button type='button' onClick={(e) => { e.stopPropagation(); onMessage(contact.userId) }} className='flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[14px] font-medium text-wa-teal'>
            <IoChatbubbleOutline size={16} /> Message
          </button>
          {!isSaved && (
            <button type='button' onClick={(e) => { e.stopPropagation(); onSave(contact) }} className='flex flex-1 items-center justify-center gap-1.5 border-l border-black/10 py-1.5 text-[14px] font-medium text-wa-teal dark:border-white/10'>
              <IoPersonAddOutline size={16} /> Add contact
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- location ---------- */

export const osmLink = ({ lat, lng }) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`

export const LocationCard = ({ location }) => (
  <a href={osmLink(location)} target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()} className='mb-4 block w-[250px] overflow-hidden rounded-md'>
    {/* drawn locally (no map tiles are loaded), opens OpenStreetMap */}
    <span className='relative flex h-[120px] items-center justify-center bg-[#d7ecd9] dark:bg-[#1d3a2f]' style={{ backgroundImage : 'linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px)', backgroundSize : '24px 24px' }}>
      <IoLocationSharp size={40} className='-mt-4 text-[#e53935] drop-shadow' />
    </span>
    <span className='block bg-black/5 px-2.5 py-2 dark:bg-white/5'>
      <span className='block truncate text-[14px] text-wa-text'>{location.name || 'Shared location'}</span>
      <span className='block text-[12px] text-wa-muted'>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
    </span>
  </a>
)

/* ---------- link preview ---------- */

export const LinkPreviewCard = ({ preview, mine }) => {
  const [imgOk, setImgOk] = useState(true)
  return (
    <a
      href={preview.url}
      target='_blank'
      rel='noopener noreferrer'
      onClick={(e) => e.stopPropagation()}
      className={`mb-1 flex overflow-hidden rounded-md ${mine ? 'bg-wa-quoteOut' : 'bg-wa-panel'}`}
    >
      {preview.image && imgOk && (
        <img src={preview.image} alt='' loading='lazy' referrerPolicy='no-referrer' onError={() => setImgOk(false)} className='h-[84px] w-[84px] shrink-0 object-cover' />
      )}
      <span className='min-w-0 flex-1 px-2.5 py-2'>
        <span className='line-clamp-2 text-[13.5px] font-medium leading-[18px] text-wa-text'>{preview.title}</span>
        {preview.description && <span className='mt-0.5 line-clamp-2 text-[12.5px] leading-4 text-wa-muted'>{preview.description}</span>}
        <span className='mt-0.5 block truncate text-[12px] text-wa-subtle'>{preview.siteName}</span>
      </span>
    </a>
  )
}

/* ---------- view once ---------- */

export const ViewOnceBubble = ({ msg, mine, onOpen }) => {
  const label = msg.viewOnce === 'video' ? 'Video' : 'Photo'
  const canOpen = !mine && !msg.opened && !msg.status
  return (
    <button
      type='button'
      disabled={!canOpen}
      onClick={(e) => { e.stopPropagation(); onOpen(msg) }}
      className='flex min-w-[180px] items-center gap-2.5 pb-3 pr-14 pt-1 text-left disabled:cursor-default'
      title={canOpen ? `Open ${label.toLowerCase()} (can only be viewed once)` : undefined}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-[12px] font-bold ${msg.opened ? 'border-wa-subtle text-wa-subtle' : 'border-wa-green text-wa-green'}`}>1</span>
      <span className={`text-[14.2px] ${msg.opened ? 'italic text-wa-muted' : 'text-wa-text'}`}>
        {msg.status ? `${label}` : msg.opened ? 'Opened' : label}
      </span>
      {!msg.opened && !msg.status && <IoEyeOutline size={16} className='text-wa-subtle' />}
    </button>
  )
}

/* ---------- reply to a status ---------- */

export const StatusReplyQuote = ({ reply, ownerName }) => (
  <div className='mb-1 flex overflow-hidden rounded-md bg-black/5 dark:bg-white/5'>
    <span className='w-1 shrink-0 bg-[#06cf9c]' />
    <span className='min-w-0 flex-1 px-2 py-1.5'>
      <span className='block truncate text-[13px] font-medium text-[#06cf9c]'>{ownerName} · Status</span>
      <span className='line-clamp-2 text-[13px] text-wa-muted'>{reply.text || (reply.kind === 'video' ? '🎥 Video' : '📷 Photo')}</span>
    </span>
    {reply.kind === 'text'
      ? <span className='flex h-14 w-11 shrink-0 items-center justify-center p-1 text-center text-[9px] leading-tight text-white' style={{ backgroundColor : reply.background || '#00a884' }}>{(reply.text || '').slice(0, 30)}</span>
      : reply.mediaUrl && reply.kind === 'image' ? <img src={reply.mediaUrl} alt='' className='h-14 w-14 shrink-0 object-cover' /> : null}
  </div>
)

/* ---------- poll votes dialog body ---------- */

export const PollVotes = ({ poll, nameOf, people }) => (
  <div className='max-h-[55dvh] overflow-y-auto scrollbar'>
    <p className='mb-3 text-[15px] font-medium text-wa-text'>{poll.question}</p>
    {poll.options.map((opt, i) => {
      const voters = poll.votes.filter((v) => v.options.includes(i))
      return (
        <div key={i} className='border-b border-wa-border py-2.5 last:border-0'>
          <p className='flex justify-between gap-3 text-[14.5px] text-wa-text'><span className='break-words'>{opt}</span><span className='shrink-0 text-wa-muted'>{voters.length} vote{voters.length === 1 ? '' : 's'}</span></p>
          {voters.map((v) => {
            const p = people(v.userId)
            return (
              <div key={v.userId} className='mt-2 flex items-center gap-2.5'>
                <Avatar width={28} height={28} name={nameOf(v.userId)} imageUrl={p?.profile_pic} />
                <span className='truncate text-sm text-wa-text'>{nameOf(v.userId)}</span>
              </div>
            )
          })}
        </div>
      )
    })}
  </div>
)
