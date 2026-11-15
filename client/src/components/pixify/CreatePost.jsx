import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { IoArrowBack, IoImagesOutline, IoClose, IoChevronBack, IoChevronForward, IoLocationOutline, IoPersonAddOutline, IoChevronForward as Chevron } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, uploadMedia, checkMediaFile } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { ConnectifyMark } from '../apps/AppLogos'
import { Modal } from '../social/common'
import { FILTERS, filterCss, applyFilter, PeoplePicker } from '../social/extras'

const Toggle = ({ on, onChange, label, hint, icon }) => (
  <label className='flex cursor-pointer items-center gap-3 py-3'>
    {icon}
    <span className='min-w-0 flex-1'>
      <span className='block text-[15px]'>{label}</span>
      {hint && <span className='block text-xs text-px-muted'>{hint}</span>}
    </span>
    <input type='checkbox' className='peer sr-only' checked={on} onChange={(e) => onChange(e.target.checked)} />
    <span className='relative h-6 w-10 shrink-0 rounded-full bg-px-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-px-text peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-px-blue' />
  </label>
)

// Pixify "Create new post": choose up to 10 photos / videos -> caption -> Share
const CreatePost = ({ onClose, onPosted }) => {
  const user = useSelector((s) => s.user)
  const [files, setFiles] = useState([]) // [{ file, url, kind }]
  const [index, setIndex] = useState(0)
  const [step, setStep] = useState('pick') // pick | details
  const [caption, setCaption] = useState('')
  const [alsoConnectify, setAlsoConnectify] = useState(false)
  const [commentsOff, setCommentsOff] = useState(false)
  const [hideLikes, setHideLikes] = useState(false)
  const [location, setLocation] = useState('')
  const [tagged, setTagged] = useState([])
  const [tagging, setTagging] = useState(false)
  const [filters, setFilters] = useState({}) // file url -> filter id
  const [progress, setProgress] = useState(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)

  // free the previews when the dialog closes (not on every change: the remaining ones are still shown)
  const filesRef = useRef(files)
  filesRef.current = files
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  const add = (list) => {
    const chosen = [...list]
    for (const f of chosen) { const p = checkMediaFile(f); if (p) return notifyError(p) }
    const next = [...files, ...chosen.map((file) => ({ file, url : URL.createObjectURL(file), kind : file.type.startsWith('video/') ? 'video' : 'image' }))].slice(0, 10)
    if (files.length + chosen.length > 10) notifyError('You can add up to 10 photos or videos')
    setFiles(next)
    if (next.length) setStep('details')
  }

  const remove = (i) => {
    URL.revokeObjectURL(files[i].url)
    const next = files.filter((_, x) => x !== i)
    setFiles(next)
    setIndex((x) => Math.min(x, Math.max(0, next.length - 1)))
    if (!next.length) setStep('pick')
  }

  const share = async () => {
    if (!files.length || progress !== null) return
    setProgress(0)
    try {
      // bake the chosen filter into each photo before uploading
      const ready = await Promise.all(files.map((f) => (f.kind === 'image' ? applyFilter(f.file, filters[f.url]) : f.file)))
      const media = await uploadMedia(ready, setProgress)
      const res = await api.post('/posts', {
        app : 'pixify', text : caption, media, commentsOff, hideLikes, location, tagged : tagged.map((p) => p._id),
        ...(alsoConnectify ? { crossPost : ['connectify'] } : {}),
      })
      notify(res.crossPosted?.length ? 'Shared to Pixify and Connectify' : 'Your post has been shared')
      onPosted(res.post)
    } catch (e) {
      setProgress(null)
      notifyError(e.message)
    }
  }

  const close = () => { if (progress === null) onClose() }
  const cur = files[index]

  return (
    <Modal onClose={close} label='Create new post' className={`flex h-[100dvh] w-full flex-col overflow-hidden bg-px-bg text-px-text sm:h-auto sm:max-h-[90dvh] sm:rounded-xl ${step === 'details' ? 'sm:w-[min(900px,95vw)]' : 'sm:w-[min(560px,95vw)]'}`}>
      <header className='flex h-12 shrink-0 items-center justify-between border-b border-px-border px-3'>
        {step === 'details'
          ? <button onClick={() => progress === null && setStep('pick')} title='Back' className='p-1'><IoArrowBack size={24} /></button>
          : <button onClick={close} title='Close' className='p-1 sm:invisible'><IoClose size={26} /></button>}
        <h2 className='font-semibold'>{step === 'details' ? 'New post' : 'Create new post'}</h2>
        {step === 'details'
          ? <button onClick={share} disabled={progress !== null} className='px-1 text-sm font-semibold text-px-blue hover:text-px-text disabled:opacity-60'>{progress !== null ? `${progress}%` : 'Share'}</button>
          : <span className='w-8' />}
      </header>

      {step === 'pick' && (
        <div className={`flex min-h-[360px] flex-1 flex-col items-center justify-center gap-4 p-8 text-center sm:aspect-square ${dragging ? 'bg-px-hover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) }}>
          <IoImagesOutline size={80} strokeWidth={8} />
          <p className='text-xl'>Drag photos and videos here</p>
          <button onClick={() => input.current?.click()} className='rounded-lg bg-px-blue px-4 py-1.5 text-sm font-semibold text-white hover:brightness-95'>Select from computer</button>
          {files.length > 0 && <button onClick={() => setStep('details')} className='text-sm font-semibold text-px-blue'>Continue with {files.length} selected</button>}
        </div>
      )}

      {step === 'details' && cur && (
        <div className='flex min-h-0 flex-1 flex-col overflow-y-auto sm:flex-row sm:overflow-hidden'>
          <div className='relative flex aspect-square w-full shrink-0 items-center justify-center bg-black sm:aspect-auto sm:w-[60%]'>
            {cur.kind === 'video'
              ? <video key={cur.url} src={cur.url} controls playsInline className='max-h-full max-w-full' />
              : <img src={cur.url} alt='' className='max-h-full max-w-full object-contain' style={{ filter : filterCss(filters[cur.url]) }} />}
            {index > 0 && <button onClick={() => setIndex(index - 1)} className='absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white'><IoChevronBack /></button>}
            {index < files.length - 1 && <button onClick={() => setIndex(index + 1)} className='absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white'><IoChevronForward /></button>}
            {/* strip of selected items */}
            <div className='absolute inset-x-2 bottom-2 flex items-center gap-2 overflow-x-auto rounded-lg bg-black/60 p-2 scrollbar-none'>
              {files.map((f, i) => (
                <span key={f.url} className={`relative h-14 w-14 shrink-0 overflow-hidden rounded ${i === index ? 'ring-2 ring-white' : 'opacity-70'}`}>
                  <button onClick={() => setIndex(i)} className='h-full w-full'>
                    {f.kind === 'video' ? <video src={f.url} muted className='h-full w-full object-cover' /> : <img src={f.url} alt='' className='h-full w-full object-cover' />}
                  </button>
                  {progress === null && <button onClick={() => remove(i)} title='Remove' className='absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white'><IoClose size={13} /></button>}
                </span>
              ))}
              {files.length < 10 && progress === null && (
                <button onClick={() => input.current?.click()} className='flex h-14 w-14 shrink-0 items-center justify-center rounded border border-white/40 text-2xl text-white' title='Add more'>+</button>
              )}
            </div>
            {progress !== null && <div className='absolute inset-x-0 top-0 h-1 bg-white/20'><div className='h-full bg-px-blue transition-[width]' style={{ width : `${progress}%` }} /></div>}
          </div>
          <div className='flex min-w-0 flex-1 flex-col border-px-border sm:border-l'>
            <div className='flex items-center gap-3 px-4 pt-4'>
              <Avatar width={28} height={28} name={user.name} imageUrl={user.profile_pic} />
              <span className='text-sm font-semibold'>{user.username}</span>
            </div>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} rows={6} autoFocus disabled={progress !== null}
              placeholder='Write a caption… Use @ to mention people and # for hashtags'
              className='mx-4 mt-3 resize-none bg-transparent text-[15px] outline-none placeholder:text-px-muted' />
            <p className='px-4 text-right text-xs text-px-muted'>{caption.length.toLocaleString()}/2,200</p>
            {/* Filters (photos) */}
            {cur.kind === 'image' && (
              <div className='border-t border-px-border px-4 py-3'>
                <p className='mb-2 text-sm font-semibold'>Filters</p>
                <div className='flex gap-3 overflow-x-auto pb-1 scrollbar-none'>
                  {FILTERS.map((f) => {
                    const active = (filters[cur.url] || 'normal') === f.id
                    return (
                      <button key={f.id} onClick={() => setFilters((x) => ({ ...x, [cur.url] : f.id }))} className='flex shrink-0 flex-col items-center gap-1'>
                        <img src={cur.url} alt='' className={`h-16 w-16 rounded object-cover ${active ? 'ring-2 ring-px-blue' : ''}`} style={{ filter : f.css }} />
                        <span className={`text-[11px] ${active ? 'font-semibold text-px-blue' : 'text-px-muted'}`}>{f.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <label className='flex items-center gap-3 border-t border-px-border px-4 py-3'>
              <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} placeholder='Add location' className='min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-px-text' />
              <IoLocationOutline size={20} />
            </label>
            <button onClick={() => setTagging(true)} className='flex items-center gap-3 border-t border-px-border px-4 py-3 text-left text-[15px]'>
              <span className='min-w-0 flex-1 truncate'>{tagged.length ? `Tagged: ${tagged.map((p) => p.username || p.name).join(', ')}` : 'Tag people'}</span>
              <IoPersonAddOutline size={20} /><Chevron size={16} className='text-px-muted' />
            </button>
            <div className='border-t border-px-border px-4'>
              <Toggle on={alsoConnectify} onChange={setAlsoConnectify} icon={<ConnectifyMark size={26} />} label='Also share to Connectify' hint='Your friends see it there too' />
              <Toggle on={hideLikes} onChange={setHideLikes} label='Hide like count on this post' hint='Only you will see the total number of likes' />
              <Toggle on={commentsOff} onChange={setCommentsOff} label='Turn off commenting' hint='You can change this later from the ••• menu' />
            </div>
          </div>
        </div>
      )}

      <input ref={input} type='file' accept='image/*,video/*' multiple className='hidden' onChange={(e) => { add(e.target.files || []); e.target.value = '' }} />
      {tagging && <PeoplePicker title='Tag people' app='pixify' initial={tagged} onClose={() => setTagging(false)} onDone={(list) => { setTagged(list); setTagging(false) }} />}
    </Modal>
  )
}

export default CreatePost
