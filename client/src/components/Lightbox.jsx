import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IoClose, IoChevronBack, IoChevronForward, IoDownloadOutline } from 'react-icons/io5'
import { downloadMedia } from '../helpers/media'
import { formatFullDate } from '../helpers/formatTime'

// Full-screen viewer for chat photos / videos with prev/next, download, keyboard and swipe support.
const Lightbox = ({ items, startIndex = 0, onClose, title }) => {
  const [index, setIndex] = useState(startIndex)
  const touchX = useRef(null)
  const item = items[index]

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIndex((i) => Math.min(items.length - 1, i + 1)), [items.length])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  if (!item) return null

  return (
    <div
      className='fixed inset-0 z-[60] flex flex-col bg-black/95 text-white'
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (dx > 60) prev()
        if (dx < -60) next()
        touchX.current = null
      }}
    >
      <header className='flex h-14 shrink-0 items-center justify-between gap-3 px-3 pt-[env(safe-area-inset-top)] sm:px-5'>
        <div className='min-w-0'>
          <p className='truncate text-[15px]'>{item.sender || title}</p>
          <p className='text-xs text-white/60'>{formatFullDate(item.createdAt)}</p>
        </div>
        <div className='flex items-center gap-1'>
          <button onClick={() => downloadMedia(item.url, item.name)} className='flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10' title='Download'>
            <IoDownloadOutline size={22} />
          </button>
          <button onClick={onClose} className='flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10' title='Close'>
            <IoClose size={26} />
          </button>
        </div>
      </header>

      <div className='relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16'>
        {index > 0 && (
          <button onClick={prev} className='absolute left-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex' title='Previous'>
            <IoChevronBack size={24} />
          </button>
        )}
        {item.type === 'video' ? (
          <video key={item.url} src={item.url} className='max-h-full max-w-full' controls autoPlay playsInline />
        ) : (
          <img key={item.url} src={item.url} alt='' className='max-h-full max-w-full object-contain' />
        )}
        {index < items.length - 1 && (
          <button onClick={next} className='absolute right-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex' title='Next'>
            <IoChevronForward size={24} />
          </button>
        )}
      </div>

      {item.caption && <p className='mx-auto mb-3 max-w-2xl px-4 text-center text-sm text-white/90'>{item.caption}</p>}
      {items.length > 1 && (
        <p className='pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-white/60'>{index + 1} / {items.length}</p>
      )}
    </div>
  )
}

export default Lightbox
