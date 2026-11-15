import React, { useCallback, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { IoClose, IoImagesOutline, IoText } from 'react-icons/io5'
import { StatusViewer, TextComposer, MediaStatusComposer, STATUS_FONTS } from '../StatusPanel'
import { MAX_UPLOAD_BYTES } from '../../helpers/uploadFile'
import { notifyError } from '../../helpers/toast'
import { thumbUrl } from '../../helpers/media'
import { usePeopleNames } from '../../helpers/contacts'

// "@alice" in Pixify (falls back to the name), the saved / profile name in Connectify
export const usePersonLabel = (app) => {
  const { name } = usePeopleNames()
  return useCallback((u) => {
    if (!u) return ''
    if (u.self) return 'Your story'
    if (app === 'pixify' && u.username) return u.username
    return name(u)
  }, [app, name])
}

// What a story looks like as a small preview (Connectify cards, Pixify thumbnails)
export const StoryPreview = ({ status, className = '' }) => {
  if (!status) return null
  if (status.kind === 'text') {
    return (
      <div className={`flex items-center justify-center overflow-hidden p-2 text-center text-[11px] leading-tight text-white ${className}`} style={{ backgroundColor : status.background, ...STATUS_FONTS[status.font || 0] }}>
        <span className='line-clamp-5 break-words'>{status.text}</span>
      </div>
    )
  }
  const src = status.kind === 'image' ? thumbUrl(status.mediaUrl, 360) : status.mediaUrl.startsWith('blob:') ? '' : status.mediaUrl.replace(/\.[a-z0-9]+$/i, '.jpg')
  if (!src) return <video src={status.mediaUrl} muted preload='metadata' className={`object-cover ${className}`} />
  return <img src={src} alt='' className={`object-cover ${className}`} draggable={false} />
}

// Pick "Photo or video" or "Text" for a new story, then open the composer with this app ticked.
// Returns { openPicker, element }: render `element` once in the page.
export const useStoryComposer = (app, { onPosted, tone = 'px' } = {}) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const [picker, setPicker] = useState(false)
  const [composer, setComposer] = useState(null) // 'text' | { file, url, kind }
  const fileRef = useRef(null)

  const pickFile = (file) => {
    if (!file) return
    if (!/^(image|video)\//.test(file.type)) return notifyError('Choose a photo or video')
    if (file.size > MAX_UPLOAD_BYTES) return notifyError('Files must be smaller than 100 MB')
    setComposer({ file, url : URL.createObjectURL(file), kind : file.type.startsWith('video/') ? 'video' : 'image' })
  }

  const card = tone === 'px' ? 'bg-px-bg text-px-text border border-px-border' : 'bg-cx-card text-cx-text'
  const row = tone === 'px' ? 'hover:bg-px-hover' : 'hover:bg-cx-hover'

  const element = (
    <>
      <input ref={fileRef} type='file' accept='image/*,video/*' className='hidden' onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
      {picker && (
        <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center' onClick={() => setPicker(false)}>
          <div role='dialog' aria-modal='true' aria-label='Create story' onClick={(e) => e.stopPropagation()} className={`w-full max-w-[400px] animate-pop overflow-hidden rounded-t-2xl sm:rounded-2xl ${card}`}>
            <div className={`relative flex h-12 items-center justify-center border-b font-semibold ${tone === 'px' ? 'border-px-border' : 'border-cx-border'}`}>
              Create story
              <button onClick={() => setPicker(false)} className='absolute right-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10' title='Close'><IoClose size={22} /></button>
            </div>
            <div className='grid grid-cols-2 gap-3 p-4'>
              <button onClick={() => { setPicker(false); fileRef.current?.click() }} className={`flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-[#5b8cff] to-[#8a3ffc] text-white transition hover:brightness-110`}>
                <span className='flex h-12 w-12 items-center justify-center rounded-full bg-white/25'><IoImagesOutline size={24} /></span>
                <span className='text-sm font-semibold'>Photo or video</span>
              </button>
              <button onClick={() => { setPicker(false); setComposer('text') }} className={`flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-[#ff6a88] to-[#ff9a3c] text-white transition hover:brightness-110`}>
                <span className='flex h-12 w-12 items-center justify-center rounded-full bg-white/25'><IoText size={24} /></span>
                <span className='text-sm font-semibold'>Text</span>
              </button>
            </div>
            <p className={`px-5 pb-4 text-center text-xs ${tone === 'px' ? 'text-px-muted' : 'text-cx-muted'} ${row}`}>Stories disappear after 24 hours. You can also share them to your other Chatify apps.</p>
          </div>
        </div>
      )}
      {composer === 'text' && <TextComposer socket={socket} defaultApps={[app]} onClose={() => setComposer(null)} onPosted={onPosted} />}
      {composer && composer !== 'text' && (
        <MediaStatusComposer socket={socket} item={composer} defaultApps={[app]} onClose={() => { URL.revokeObjectURL(composer.url); setComposer(null) }} onPosted={onPosted} />
      )}
    </>
  )

  return { openPicker : () => setPicker(true), element }
}

// Full-screen story viewer (the Chats status viewer), opened at a person's first unseen story.
export const useStoryViewer = (app, reload) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const label = usePersonLabel(app)
  const [viewer, setViewer] = useState(null)

  const open = (list, group, { mine = false } = {}) => {
    const first = mine ? 0 : list[group].statuses.findIndex((s) => !s.viewed)
    setViewer({ list, group, index : first === -1 ? 0 : first, mine })
  }

  const element = viewer && (
    <StatusViewer socket={socket} {...viewer} nameOf={label} onClose={() => { setViewer(null); reload?.() }} onDeleted={reload} />
  )
  return { open, element }
}
