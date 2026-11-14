import React, { useRef } from 'react'
import { BsCheck2, BsCheck2All, BsClock, BsPinAngleFill } from 'react-icons/bs'
import { IoAlertCircle, IoChevronDown, IoPlay, IoDownloadOutline, IoStar, IoBan } from 'react-icons/io5'
import { RiShareForwardFill } from 'react-icons/ri'
import { MdOutlineEmojiEmotions } from 'react-icons/md'
import { formatBubbleTime } from '../helpers/formatTime'
import { renderFormatted, plainPreview } from '../helpers/formatText'
import { thumbUrl, videoPoster, formatBytes, fileExtension, downloadMedia } from '../helpers/media'

// delivery state of my own message
export const statusOf = (msg) => {
  if (msg.status) return msg.status            // uploading | sending | failed (local only)
  if (msg.seen) return 'read'
  if (msg.deliveredAt) return 'delivered'
  return 'sent'
}

export const StatusIcon = ({ status, light = false, size = 16 }) => {
  const grey = light ? 'text-white' : 'text-[#8696a0]'
  switch (status) {
    case 'uploading':
    case 'sending': return <BsClock size={size - 4} className={grey} title='Sending' />
    case 'failed': return <IoAlertCircle size={size} className='text-red-500' title='Not sent' />
    case 'read': return <BsCheck2All size={size} className='text-wa-tick' title='Read' />
    case 'delivered': return <BsCheck2All size={size} className={grey} title='Delivered' />
    default: return <BsCheck2 size={size} className={grey} title='Sent' />
  }
}

export const ReplyQuote = ({ reply, mine, authorName, onClick, compact = false }) => {
  if (!reply) return null
  const media = reply.imageUrl ? 'image' : reply.videoUrl ? 'video' : null
  const label = reply.deleted
    ? 'This message was deleted'
    : reply.text
      ? plainPreview(reply.text)
      : media === 'image' ? '📷 Photo' : media === 'video' ? '🎥 Video' : reply.fileName ? `📄 ${reply.fileName}` : 'Message'
  return (
    <button
      type='button'
      onClick={onClick}
      className={`flex w-full min-w-0 overflow-hidden rounded-md text-left ${mine ? 'bg-[#d1f4cc]' : 'bg-[#f0f2f5]'} ${compact ? '' : 'mb-1'}`}
    >
      <span className='w-1 shrink-0 bg-[#06cf9c]' />
      <span className='min-w-0 flex-1 px-2 py-1.5'>
        <span className='block truncate text-[13px] font-medium text-[#06cf9c]'>{authorName}</span>
        <span className={`line-clamp-2 text-[13px] text-wa-muted ${reply.deleted ? 'italic' : ''}`}>{label}</span>
      </span>
      {media === 'image' && <img src={thumbUrl(reply.imageUrl, 120)} alt='' className='h-14 w-14 shrink-0 object-cover' />}
      {media === 'video' && <img src={videoPoster(reply.videoUrl)} alt='' className='h-14 w-14 shrink-0 bg-black object-cover' />}
    </button>
  )
}

const MessageBubble = ({
  msg, mine, firstOfGroup, authorNameOf, selectMode, selected, highlighted, searchTerm,
  onToggleSelect, onOpenMenu, onOpenMedia, onJumpTo, onRetry, onToggleReaction, onQuickReact
}) => {
  const pressTimer = useRef(null)
  const bubbleRef = useRef(null)
  const deleted = msg.deletedForEveryone
  const status = mine ? statusOf(msg) : null
  const hasImage = !!(msg.imageUrl || (msg.localPreview && msg.kind === 'image'))
  const hasVideo = !!(msg.videoUrl || (msg.localPreview && msg.kind === 'video'))
  const hasFile = !!(msg.fileUrl || (msg.kind === 'file' && msg.fileName))
  const hasMedia = !deleted && (hasImage || hasVideo)
  const mediaOnly = hasMedia && !msg.text
  const local = !!msg.status

  const openMenu = () => {
    if (deleted && local) return
    onOpenMenu(msg, bubbleRef.current?.getBoundingClientRect())
  }

  const touchStart = () => {
    if (selectMode) return
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null
      if (navigator.vibrate) navigator.vibrate(15)
      openMenu()
    }, 450)
  }
  const touchEnd = () => { if (pressTimer.current) clearTimeout(pressTimer.current) }

  const grouped = (msg.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || []
    acc[r.emoji].push(r.userId)
    return acc
  }, {})

  // room reserved after the text so the time/ticks never overlap it
  const metaWidth = 62 + (mine ? 22 : 0) + (msg.editedAt ? 42 : 0) + (msg.starred ? 15 : 0) + (msg.pinned ? 15 : 0)

  const meta = (
    <span className={`flex items-center gap-1 whitespace-nowrap text-[11px] leading-none ${mediaOnly ? 'text-white' : 'text-wa-muted'}`}>
      {msg.starred && <IoStar size={11} className={mediaOnly ? '' : 'text-[#8696a0]'} />}
      {msg.pinned && <BsPinAngleFill size={11} />}
      {msg.editedAt && !deleted && <span className='italic'>Edited</span>}
      {formatBubbleTime(msg.createdAt)}
      {mine && !deleted && <StatusIcon status={status} light={mediaOnly} />}
    </span>
  )

  return (
    <div
      className={`group/msg flex items-start gap-2 ${selectMode ? 'cursor-pointer' : ''} ${selected ? '-mx-3 bg-wa-green/10 px-3 sm:-mx-[5%] sm:px-[5%]' : ''}`}
      onClick={selectMode ? () => onToggleSelect(msg) : undefined}
    >
      {selectMode && (
        <span className={`mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${selected ? 'border-wa-green bg-wa-green text-white' : 'border-[#8696a0] bg-white'}`}>
          {selected && <BsCheck2 size={14} />}
        </span>
      )}

      <div className={`flex min-w-0 flex-1 items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
        <div
          ref={bubbleRef}
          id={`msg-${msg._id}`}
          onContextMenu={(e) => { if (!selectMode) { e.preventDefault(); openMenu() } }}
          onTouchStart={touchStart}
          onTouchEnd={touchEnd}
          onTouchMove={touchEnd}
          className={`relative max-w-[85%] select-text rounded-lg shadow-bubble transition-[box-shadow,background-color] duration-500 sm:max-w-[75%] lg:max-w-[65%]
            ${mine ? 'bg-wa-light' : 'bg-white'}
            ${firstOfGroup ? (mine ? 'rounded-tr-none bubble-tail-out' : 'rounded-tl-none bubble-tail-in') : ''}
            ${hasMedia ? 'p-1' : 'px-2 pb-2 pt-1.5'}
            ${highlighted ? 'ring-2 ring-[#ffd166] ring-offset-2 ring-offset-transparent' : ''}
            ${(msg.reactions || []).length ? 'mb-4' : ''}`}
          style={{ minWidth : msg.fileUrl || msg.kind === 'file' ? 240 : undefined }}
        >
          {/* hover menu button (desktop) */}
          {!selectMode && !(deleted && local) && (
            <button
              type='button'
              onClick={(e) => { e.stopPropagation(); openMenu() }}
              className={`absolute right-1 top-1 z-10 hidden h-6 w-6 items-center justify-center rounded-full text-[#8696a0] opacity-0 transition-opacity group-hover/msg:opacity-100 sm:flex ${mediaOnly ? 'bg-black/30 text-white' : mine ? 'bg-wa-light' : 'bg-white'}`}
              title='Message options'
            >
              <IoChevronDown size={16} />
            </button>
          )}

          {msg.forwarded && !deleted && (
            <p className={`flex items-center gap-1 text-[12.5px] italic text-wa-muted ${hasMedia ? 'px-1.5 pb-1 pt-0.5' : 'mb-0.5'}`}>
              <RiShareForwardFill size={14} /> Forwarded
            </p>
          )}

          {msg.replyTo && !deleted && (
            <div className={hasMedia ? 'mb-1' : ''}>
              <ReplyQuote reply={msg.replyTo} mine={mine} authorName={authorNameOf(msg.replyTo.msgByUserId)} onClick={(e) => { e.stopPropagation(); onJumpTo(msg.replyTo) }} />
            </div>
          )}

          {deleted ? (
            <p className='flex items-center gap-1.5 pr-14 text-[14.2px] italic text-wa-muted'>
              <IoBan size={15} /> {mine ? 'You deleted this message' : 'This message was deleted'}
              <span className='absolute bottom-1.5 right-2'>{meta}</span>
            </p>
          ) : (
            <>
              {hasImage && (
                <button type='button' onClick={(e) => { e.stopPropagation(); !selectMode && onOpenMedia(msg) }} className='relative block w-full overflow-hidden rounded-md'>
                  <img
                    src={msg.localPreview || thumbUrl(msg.imageUrl, 640)}
                    alt='attachment'
                    loading='lazy'
                    className='max-h-[260px] min-h-[120px] w-full min-w-[200px] bg-[#e9edef] object-cover sm:max-h-[330px]'
                  />
                  {msg.status === 'uploading' && <UploadOverlay progress={msg.progress} />}
                </button>
              )}
              {hasVideo && (
                <button type='button' onClick={(e) => { e.stopPropagation(); !selectMode && !local && onOpenMedia(msg) }} className='relative block w-full overflow-hidden rounded-md bg-black'>
                  {msg.localPreview ? (
                    <video src={msg.localPreview} muted playsInline preload='metadata' className='max-h-[260px] min-h-[140px] w-full min-w-[220px] object-cover sm:max-h-[330px]' />
                  ) : (
                    <img src={videoPoster(msg.videoUrl)} alt='video' loading='lazy' className='max-h-[260px] min-h-[140px] w-full min-w-[220px] object-cover sm:max-h-[330px]' />
                  )}
                  {msg.status === 'uploading' ? <UploadOverlay progress={msg.progress} /> : (
                    <span className='absolute inset-0 flex items-center justify-center'>
                      <span className='flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white'><IoPlay size={24} className='ml-1' /></span>
                    </span>
                  )}
                </button>
              )}
              {hasFile && (
                <div className={`flex items-center gap-3 rounded-md p-2 ${mine ? 'bg-[#d1f4cc]' : 'bg-[#f5f6f6]'} ${msg.text ? 'mb-1' : 'mb-4'}`}>
                  <span className='flex h-10 w-9 shrink-0 items-center justify-center rounded bg-[#e2564b] text-[10px] font-bold text-white'>
                    {fileExtension(msg.fileName).slice(0, 4)}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-[14px] text-wa-text'>{msg.fileName}</p>
                    <p className='text-xs text-wa-muted'>
                      {msg.status === 'uploading' ? `Uploading… ${msg.progress || 0}%` : `${fileExtension(msg.fileName)}${msg.fileSize ? ` · ${formatBytes(msg.fileSize)}` : ''}`}
                    </p>
                  </div>
                  {msg.fileUrl && (
                    <button type='button' onClick={(e) => { e.stopPropagation(); downloadMedia(msg.fileUrl, msg.fileName) }} className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#8696a0]/40 text-[#54656f] hover:bg-black/5' title='Download'>
                      <IoDownloadOutline size={18} />
                    </button>
                  )}
                </div>
              )}

              <div className={`relative ${hasMedia ? (msg.text ? 'px-1.5 pb-1 pt-1' : '') : ''}`}>
                {msg.text && (
                  <span className='whitespace-pre-wrap break-words text-[14.2px] leading-[19px] text-wa-text'>
                    {renderFormatted(msg.text, searchTerm)}
                  </span>
                )}
                {/* spacer so the time never overlaps the text */}
                {msg.text && <span className='inline-block' style={{ width : metaWidth }} />}
                <span className={mediaOnly ? 'absolute bottom-1.5 right-1.5 rounded-full bg-black/35 px-1.5 py-1' : 'absolute -bottom-1 right-0'}>
                  {meta}
                </span>
              </div>
            </>
          )}

          {mine && msg.status === 'failed' && (
            <button type='button' onClick={(e) => { e.stopPropagation(); onRetry(msg) }} className='mt-1 flex items-center gap-1 text-xs font-medium text-red-600 hover:underline'>
              <IoAlertCircle size={14} /> Not sent · Tap to retry
            </button>
          )}

          {/* reactions */}
          {Object.keys(grouped).length > 0 && (
            <div className={`absolute -bottom-4 z-[5] flex items-center gap-0.5 rounded-full border border-wa-border bg-white px-1.5 py-0.5 text-[13px] shadow-bubble ${mine ? 'right-2' : 'left-2'}`}>
              {Object.entries(grouped).map(([emoji, users]) => (
                <button key={emoji} type='button' onClick={(e) => { e.stopPropagation(); onToggleReaction(msg, emoji) }} className='flex items-center leading-none' title='Tap to add or remove'>
                  {emoji}
                </button>
              ))}
              {(msg.reactions || []).length > 1 && <span className='ml-0.5 text-[11px] text-wa-muted'>{msg.reactions.length}</span>}
            </div>
          )}
        </div>

        {/* quick react (desktop hover) */}
        {!selectMode && !deleted && !local && (
          <button
            type='button'
            onClick={(e) => { e.stopPropagation(); onQuickReact(msg, e.currentTarget.getBoundingClientRect()) }}
            className='hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-[#54656f] opacity-0 transition-opacity hover:bg-black/10 group-hover/msg:opacity-100 sm:flex'
            title='React'
          >
            <MdOutlineEmojiEmotions size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

const UploadOverlay = ({ progress = 0 }) => (
  <span className='absolute inset-0 flex items-center justify-center bg-black/30'>
    <span className='relative flex h-12 w-12 items-center justify-center'>
      <svg viewBox='0 0 36 36' className='absolute inset-0 -rotate-90'>
        <circle cx='18' cy='18' r='16' fill='rgba(0,0,0,.45)' stroke='rgba(255,255,255,.25)' strokeWidth='3' />
        <circle cx='18' cy='18' r='16' fill='none' stroke='#fff' strokeWidth='3' strokeDasharray={`${(progress / 100) * 100.5} 100.5`} strokeLinecap='round' />
      </svg>
      <span className='relative text-[11px] font-medium text-white'>{progress}%</span>
    </span>
  </span>
)

export default React.memo(MessageBubble)
