import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { IoClose, IoImages, IoEarth, IoPeople, IoLockClosed, IoCaretDown, IoArrowBack, IoHappy, IoLocation, IoPricetag } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, uploadMedia, checkMediaFile } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { PixifyMark } from '../apps/AppLogos'
import { Modal } from '../social/common'
import { SharedPreview } from './CxPost'
import { PeoplePicker } from '../social/extras'

// Facebook-style "Feeling / activity"
export const FEELINGS = [
  ['😊', 'feeling happy'], ['🥰', 'feeling loved'], ['😎', 'feeling cool'], ['🤩', 'feeling excited'], ['😌', 'feeling relaxed'], ['🙏', 'feeling thankful'],
  ['😴', 'feeling tired'], ['😢', 'feeling sad'], ['😤', 'feeling determined'], ['🤒', 'feeling sick'], ['😇', 'feeling blessed'], ['🥳', 'feeling festive'],
  ['🎉', 'celebrating'], ['✈️', 'travelling'], ['🍽️', 'eating'], ['☕', 'drinking coffee'], ['🎬', 'watching a movie'], ['🎧', 'listening to music'],
  ['📚', 'reading'], ['🏋️', 'working out'], ['🎮', 'playing games'], ['💻', 'working'], ['🛍️', 'shopping'], ['🏖️', 'on vacation'],
].map(([e, t]) => `${e} ${t}`)

const FeelingPicker = ({ value, onChange, onClose }) => (
  <div className='flex min-h-0 flex-1 flex-col'>
    <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>
      <button onClick={onClose} className='absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input' title='Back'><IoArrowBack size={20} /></button>
      How are you feeling?
    </header>
    <div className='grid min-h-0 flex-1 grid-cols-2 gap-1 overflow-y-auto p-3'>
      {value && <button onClick={() => { onChange(''); onClose() }} className='col-span-2 rounded-lg p-2 text-left text-[15px] font-semibold text-cx-blue hover:bg-cx-hover'>Remove feeling</button>}
      {FEELINGS.map((f) => (
        <button key={f} onClick={() => { onChange(f); onClose() }} className={`flex items-center gap-2 rounded-lg p-2 text-left text-[15px] hover:bg-cx-hover ${value === f ? 'bg-cx-hover font-semibold' : ''}`}>
          <span className='flex h-9 w-9 items-center justify-center rounded-full bg-cx-input text-xl'>{f.split(' ')[0]}</span>{f.split(' ').slice(1).join(' ')}
        </button>
      ))}
    </div>
  </div>
)

export const AUDIENCES = [
  { id : 'public', label : 'Public', hint : 'Anyone on or off Connectify', Icon : IoEarth },
  { id : 'friends', label : 'Friends', hint : 'Your friends on Connectify', Icon : IoPeople },
  { id : 'only_me', label : 'Only me', hint : 'Only you can see it', Icon : IoLockClosed },
]
export const audienceOf = (id) => AUDIENCES.find((a) => a.id === id) || AUDIENCES[1]

// coloured backgrounds for short text posts (same list as the server)
export const BACKGROUNDS = ['#1877f2', '#e4405f', '#7e57c2', '#00a884', '#ff8a65', '#263238', 'linear-gradient(135deg,#ff6a88,#ff99ac)', 'linear-gradient(135deg,#5b8cff,#8a3ffc)', 'linear-gradient(135deg,#f7971e,#ffd200)']

const AudiencePicker = ({ value, onChange, onClose }) => (
  <div className='flex min-h-0 flex-1 flex-col'>
    <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>
      <button onClick={onClose} className='absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input' title='Back'><IoArrowBack size={20} /></button>
      Post audience
    </header>
    <div className='p-4'>
      <p className='font-semibold'>Who can see your post?</p>
      <p className='mb-3 text-sm text-cx-muted'>Your post will show up in Feed, on your profile and in search results.</p>
      {AUDIENCES.map((a) => (
        <label key={a.id} className='flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-cx-hover'>
          <span className='flex h-14 w-14 items-center justify-center rounded-full bg-cx-input'><a.Icon size={24} /></span>
          <span className='flex-1'><span className='block font-semibold'>{a.label}</span><span className='block text-sm text-cx-muted'>{a.hint}</span></span>
          <input type='radio' name='audience' checked={value === a.id} onChange={() => { onChange(a.id); onClose() }} className='h-5 w-5 accent-cx-blue' />
        </label>
      ))}
    </div>
  </div>
)

// Create post (or share a post when `sharedPost` is given)
// group: post inside that Connectify group
const Composer = ({ sharedPost, withPhotos, group, onClose, onPosted }) => {
  const user = useSelector((s) => s.user)
  const firstName = (user.name || '').trim().split(/\s+/)[0]
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [audience, setAudience] = useState(sharedPost ? 'public' : 'friends')
  const [picking, setPicking] = useState(false)
  const [background, setBackground] = useState('')
  const [alsoPixify, setAlsoPixify] = useState(false)
  const [feeling, setFeeling] = useState('')
  const [location, setLocation] = useState('')
  const [placing, setPlacing] = useState(false)
  const [tagged, setTagged] = useState([])
  const [tagging, setTagging] = useState(false)
  const [friends, setFriends] = useState(null)
  const [feelingOpen, setFeelingOpen] = useState(false)
  const [progress, setProgress] = useState(null)
  const input = useRef(null)
  const filesRef = useRef(files)
  filesRef.current = files

  useEffect(() => { if (withPhotos) setTimeout(() => input.current?.click(), 50) }, [withPhotos])
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  const add = (list) => {
    const chosen = [...list]
    for (const f of chosen) { const p = checkMediaFile(f); if (p) return notifyError(p) }
    setBackground('')
    setFiles((cur) => [...cur, ...chosen.map((file) => ({ file, url : URL.createObjectURL(file), kind : file.type.startsWith('video/') ? 'video' : 'image' }))].slice(0, 10))
  }
  const canBg = !files.length && !sharedPost && text.length <= 130
  const canPost = (text.trim() || files.length || sharedPost) && progress === null

  const post = async () => {
    if (!canPost) return
    setProgress(0)
    try {
      const media = files.length ? await uploadMedia(files.map((f) => f.file), setProgress) : []
      const res = await api.post('/posts', {
        app : 'connectify', text, media, audience, feeling, location, tagged : tagged.map((p) => p._id),
        ...(group ? { group : group._id } : {}),
        ...(canBg && background ? { background } : {}),
        ...(sharedPost ? { sharedPost : sharedPost._id } : {}),
        ...(alsoPixify && media.length && !group ? { crossPost : ['pixify'] } : {})
      })
      notify(sharedPost ? 'Shared to your feed' : res.crossPosted?.length ? 'Posted to Connectify and Pixify' : 'Posted')
      onPosted(res.post)
    } catch (e) {
      setProgress(null)
      notifyError(e.message)
    }
  }

  const A = audienceOf(audience)
  return (
    <Modal onClose={() => progress === null && onClose()} closeButton={false} label='Create post' className='flex h-[100dvh] w-full flex-col overflow-hidden bg-cx-card text-cx-text sm:h-auto sm:max-h-[90dvh] sm:w-[500px] sm:rounded-lg sm:shadow-2xl'>
      {feelingOpen ? <FeelingPicker value={feeling} onChange={setFeeling} onClose={() => setFeelingOpen(false)} /> : picking ? <AudiencePicker value={audience} onChange={setAudience} onClose={() => setPicking(false)} /> : (
        <>
          <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>
            {sharedPost ? 'Share' : 'Create post'}
            <button onClick={() => progress === null && onClose()} className='absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input hover:brightness-95' title='Close'><IoClose size={22} /></button>
          </header>
          <div className='min-h-0 flex-1 overflow-y-auto px-4 pt-4'>
            <div className='flex items-center gap-2'>
              <Avatar width={40} height={40} name={user.name} imageUrl={user.profile_pic} />
              <div>
                <p className='text-[15px]'>
                  <b>{user.name}</b>
                  {feeling && <> is {feeling.split(' ')[0]} <b>{feeling.split(' ').slice(1).join(' ')}</b></>}
                  {tagged.length > 0 && <> with <b>{tagged[0].name}</b>{tagged.length > 1 && <> and <b>{tagged.length - 1} other{tagged.length > 2 ? 's' : ''}</b></>}</>}
                  {location && <> at <b>{location}</b></>}
                </p>
                {group
                  ? <span className='flex items-center gap-1 rounded-md bg-cx-input px-2 py-0.5 text-[13px] font-semibold'><IoPeople size={12} />{group.name}</span>
                  : <button onClick={() => setPicking(true)} className='flex items-center gap-1 rounded-md bg-cx-input px-2 py-0.5 text-[13px] font-semibold'><A.Icon size={12} />{A.label}<IoCaretDown size={10} /></button>}
              </div>
            </div>
            {canBg && background ? (
              <div className='mt-3 flex min-h-[220px] items-center justify-center rounded-lg p-6' style={{ background }}>
                <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={130} rows={3} placeholder={`What's on your mind, ${firstName}?`}
                  className='w-full resize-none bg-transparent text-center text-[26px] font-bold text-white outline-none placeholder:text-white/70' />
              </div>
            ) : (
              <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} rows={sharedPost || files.length ? 2 : 5}
                placeholder={sharedPost ? 'Say something about this…' : `What's on your mind, ${firstName}?`}
                className={`mt-3 w-full resize-none bg-transparent outline-none placeholder:text-cx-muted ${!files.length && text.length < 85 && !sharedPost ? 'text-2xl' : 'text-[15px]'}`} />
            )}
            {canBg && (
              <div className='mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none'>
                <button onClick={() => setBackground('')} title='No background' className={`h-8 w-8 shrink-0 rounded-lg border-2 bg-cx-card ${!background ? 'border-cx-blue' : 'border-cx-border'}`} />
                {BACKGROUNDS.map((b) => <button key={b} onClick={() => setBackground(b)} title='Background' className={`h-8 w-8 shrink-0 rounded-lg ${background === b ? 'ring-2 ring-cx-blue ring-offset-2 ring-offset-cx-card' : ''}`} style={{ background : b }} />)}
              </div>
            )}
            {files.length > 0 && (
              <div className='relative mt-3 rounded-lg border border-cx-border p-2'>
                <div className={`grid gap-1 ${files.length > 1 ? 'grid-cols-2' : ''}`}>
                  {files.map((f, i) => (
                    <span key={f.url} className='relative overflow-hidden rounded'>
                      {f.kind === 'video' ? <video src={f.url} muted className='max-h-60 w-full object-cover' /> : <img src={f.url} alt='' className='max-h-60 w-full object-cover' />}
                      {progress === null && <button onClick={() => { URL.revokeObjectURL(f.url); setFiles((l) => l.filter((_, x) => x !== i)) }} className='absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-cx-card/90 text-cx-text shadow' title='Remove'><IoClose size={16} /></button>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {sharedPost && <div className='mt-3'><SharedPreview post={sharedPost} /></div>}
            {placing && (
              <div className='mt-3 flex items-center gap-2 rounded-lg border border-cx-border px-3'>
                <IoLocation className='text-[#f5533d]' />
                <input autoFocus value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} placeholder='Where are you?' className='h-10 flex-1 bg-transparent text-[15px] outline-none' />
                <button onClick={() => { setPlacing(false); if (!location.trim()) setLocation('') }} className='text-sm font-semibold text-cx-blue'>Done</button>
              </div>
            )}
            {files.length > 0 && !group && (
              <label className='mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-cx-border p-3'>
                <PixifyMark size={28} />
                <span className='flex-1'><span className='block text-[15px] font-semibold'>Also share to Pixify</span><span className='block text-xs text-cx-muted'>Your followers see these photos on Pixify too</span></span>
                <input type='checkbox' checked={alsoPixify} onChange={(e) => setAlsoPixify(e.target.checked)} className='h-5 w-5 accent-cx-blue' />
              </label>
            )}
          </div>
          <div className='px-4 pb-4 pt-3'>
            {!sharedPost && (
              <div className='mb-3 flex items-center justify-between rounded-lg border border-cx-border px-4 py-2'>
                <span className='text-[15px] font-semibold'>Add to your post</span>
                <span className='flex items-center'>
                  <button onClick={() => input.current?.click()} disabled={progress !== null} title='Photo/video' className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-cx-hover'><IoImages size={24} className='text-[#45bd62]' /></button>
                  <button onClick={async () => { if (friends === null) { try { const me = await api.get(`/users/${user._id}/friends`); setFriends(me.people.filter((p) => !p.self)) } catch { setFriends([]) } } setTagging(true) }} title='Tag people' className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-cx-hover'><IoPricetag size={22} className='text-cx-blue' /></button>
                  <button onClick={() => setFeelingOpen(true)} title='Feeling/activity' className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-cx-hover'><IoHappy size={24} className='text-[#f7b928]' /></button>
                  <button onClick={() => setPlacing(true)} title='Check in' className='flex h-9 w-9 items-center justify-center rounded-full hover:bg-cx-hover'><IoLocation size={24} className='text-[#f5533d]' /></button>
                </span>
              </div>
            )}
            <button onClick={post} disabled={!canPost} className='relative h-9 w-full overflow-hidden rounded-md bg-cx-blue text-[15px] font-semibold text-white disabled:bg-cx-input disabled:text-cx-muted'>
              {progress !== null && <span className='absolute inset-y-0 left-0 bg-white/20' style={{ width : `${progress}%` }} />}
              <span className='relative'>{progress !== null ? `Posting… ${progress}%` : sharedPost ? 'Share now' : 'Post'}</span>
            </button>
          </div>
        </>
      )}
      <input ref={input} type='file' accept='image/*,video/*' multiple className='hidden' onChange={(e) => { add(e.target.files || []); e.target.value = '' }} />
      {tagging && <PeoplePicker title='Tag friends' app='connectify' t='cx' source={friends || []} initial={tagged} onClose={() => setTagging(false)} onDone={(list) => { setTagged(list); setTagging(false) }} />}
    </Modal>
  )
}

export default Composer
