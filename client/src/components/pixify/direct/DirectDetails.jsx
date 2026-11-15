import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoClose, IoEllipsisHorizontal, IoCheckmark, IoSearchOutline } from 'react-icons/io5'
import Avatar from '../../Avatar'
import { api, enc, uploadMedia } from '../../../helpers/social'
import { notifyError } from '../../../helpers/toast'
import { Modal, ActionSheet } from '../../social/common'
import { ThreadAvatar } from './DirectModals'
import { dmApp, dmBase, dmRoot } from './directData'

// "Details" panel of a conversation: mute, group name / photo, members, leave, block, delete.

const Toggle = ({ on, onChange, label }) => (
  <button role='switch' aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-px-text' : 'bg-px-border'}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-px-bg transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
)

const AddPeople = ({ thread, onClose, onAdded }) => {
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!q.trim()) return setFound([])
    let alive = true
    const t = setTimeout(() => api.get(`/search?app=${dmApp()}&q=${enc(q.trim())}`).then((r) => alive && setFound(r.people || [])).catch(() => {}), 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q])
  const inGroup = (p) => p.self || thread.members.some((m) => m._id === p._id)
  const toggle = (p) => setPicked((l) => (l.some((x) => x._id === p._id) ? l.filter((x) => x._id !== p._id) : [...l, p]))
  const add = async () => {
    setBusy(true)
    try {
      onAdded((await api.post(`/dm/threads/${thread._id}/members`, { userIds : picked.map((p) => p._id) })).thread)
      onClose()
    } catch (e) { notifyError(e.message); setBusy(false) }
  }
  return (
    <Modal onClose={onClose} label='Add people' closeButton={false} className='flex h-[100dvh] w-screen flex-col overflow-hidden bg-px-bg text-px-text sm:h-[min(560px,85vh)] sm:w-[480px] sm:rounded-xl'>
      <div className='relative flex h-[42px] shrink-0 items-center justify-center border-b border-px-border'>
        <p className='font-bold'>Add people</p>
        <button onClick={onClose} className='absolute right-2 p-1' aria-label='Close'><IoClose size={26} /></button>
      </div>
      <div className='flex shrink-0 flex-wrap items-center gap-1.5 border-b border-px-border px-4 py-2'>
        <IoSearchOutline className='text-px-muted' />
        {picked.map((p) => <span key={p._id} className='rounded-xl bg-[#e0f1ff] px-3 py-0.5 text-sm font-medium text-px-blue dark:bg-[#0c2c4a]'>{p.username || p.name}</span>)}
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search...' className='min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-px-muted' />
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto py-2'>
        {found.map((p) => {
          const already = inGroup(p)
          const on = picked.some((x) => x._id === p._id)
          return (
            <button key={p._id} disabled={already} onClick={() => toggle(p)} className='flex w-full items-center gap-3 px-4 py-2 text-left enabled:hover:bg-px-hover disabled:opacity-50'>
              <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
              <span className='min-w-0 flex-1'><span className='block truncate text-sm font-semibold'>{p.profileName || p.name}</span><span className='block truncate text-sm text-px-muted'>{already ? 'Already in the group' : p.username}</span></span>
              {!already && <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-px-blue bg-px-blue text-white' : 'border-px-text/40'}`}>{on && <IoCheckmark size={16} />}</span>}
            </button>
          )
        })}
        {!q.trim() && <p className='px-4 py-3 text-sm text-px-muted'>Search for people to add.</p>}
      </div>
      <div className='shrink-0 p-4'>
        <button disabled={!picked.length || busy} onClick={add} className='h-11 w-full rounded-lg bg-px-blue font-semibold text-white disabled:opacity-40'>Add</button>
      </div>
    </Modal>
  )
}

const DirectDetails = ({ thread, onClose, onThread, onDelete, onBlock }) => {
  const navigate = useNavigate()
  const [name, setName] = useState(thread.name)
  const [adding, setAdding] = useState(false)
  const [memberMenu, setMemberMenu] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photo = useRef(null)
  useEffect(() => setName(thread.name), [thread.name])

  const run = async (fn) => { try { const r = await fn(); if (r?.thread) onThread(r.thread) } catch (e) { notifyError(e.message) } }
  const mute = (muted) => run(async () => { await api.post(`/dm/threads/${thread._id}/mute`, { muted }); onThread({ ...thread, muted }) })
  const saveName = () => name.trim() !== thread.name && run(() => api.patch(`/dm/threads/${thread._id}`, { name : name.trim() }))
  const changePhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return notifyError('Choose a photo')
    setPhotoBusy(true)
    await run(async () => api.patch(`/dm/threads/${thread._id}`, { avatar : (await uploadMedia([file]))[0].url }))
    setPhotoBusy(false)
  }
  const leave = () => run(async () => { await api.post(`/dm/threads/${thread._id}/leave`); navigate(`${dmBase()}`) })

  return (
    <aside className='flex h-full w-full shrink-0 flex-col overflow-y-auto border-l border-px-border bg-px-bg lg:w-[360px]'>
      <div className='flex h-[75px] shrink-0 items-center justify-between border-b border-px-border px-6 max-md:h-[60px] max-md:px-4'>
        <h2 className='text-xl font-bold'>Details</h2>
        <button onClick={onClose} aria-label='Close details'><IoClose size={26} /></button>
      </div>

      <div className='flex items-center justify-between border-b border-px-border px-6 py-4 max-md:px-4'>
        <span>Mute messages</span>
        <Toggle on={thread.muted} onChange={mute} label='Mute messages' />
      </div>

      {thread.isGroup && (
        <div className='border-b border-px-border px-6 py-4 max-md:px-4'>
          <div className='flex items-center gap-3'>
            <button onClick={() => photo.current?.click()} title='Change group photo' className='relative'>
              <ThreadAvatar thread={thread} size={56} />
              {photoBusy && <span className='absolute inset-0 flex items-center justify-center rounded-full bg-black/40'><span className='h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white' /></span>}
            </button>
            <input ref={photo} type='file' accept='image/*' hidden onChange={changePhoto} />
            <label className='min-w-0 flex-1'>
              <span className='block text-xs text-px-muted'>Group name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} maxLength={100}
                placeholder='Add a name' className='w-full bg-transparent py-1 text-sm outline-none placeholder:text-px-muted' />
            </label>
          </div>
          {thread.avatar && <button onClick={() => run(() => api.patch(`/dm/threads/${thread._id}`, { avatar : '' }))} className='mt-2 text-xs font-semibold text-px-muted hover:text-px-text'>Remove group photo</button>}
        </div>
      )}

      <div className='border-b border-px-border py-2'>
        <div className='flex items-center justify-between px-6 py-2 max-md:px-4'>
          <span className='font-semibold'>Members</span>
          {thread.isGroup && <button onClick={() => setAdding(true)} className='text-sm font-semibold text-px-blue'>Add people</button>}
        </div>
        {thread.members.map((p) => (
          <div key={p._id} className='flex items-center gap-3 px-6 py-2 hover:bg-px-hover max-md:px-4'>
            <button onClick={() => navigate(`${dmRoot()}/u/${p.username || p._id}`)} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
              <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
              <span className='min-w-0'>
                <span className='block truncate text-sm font-semibold'>{p.username || p.name}</span>
                <span className='block truncate text-xs text-px-muted'>{p.role === 'admin' && thread.isGroup ? 'Admin · ' : ''}{p.profileName || p.name}</span>
              </span>
            </button>
            {thread.isGroup && thread.admin && <button onClick={() => setMemberMenu(p)} aria-label={`Options for ${p.username || p.name}`}><IoEllipsisHorizontal size={20} /></button>}
          </div>
        ))}
      </div>

      <div className='flex flex-col items-start gap-4 px-6 py-5 text-sm max-md:px-4'>
        {!thread.isGroup && thread.peer && <button onClick={onBlock} className='text-[#ed4956]'>{thread.blockedByMe ? 'Unblock' : 'Block'}</button>}
        {thread.isGroup && <button onClick={leave} className='text-[#ed4956]'>Leave chat</button>}
        <button onClick={onDelete} className='text-[#ed4956]'>Delete chat</button>
      </div>

      {adding && <AddPeople thread={thread} onClose={() => setAdding(false)} onAdded={onThread} />}
      {memberMenu && (
        <ActionSheet onClose={() => setMemberMenu(null)} title={memberMenu.username || memberMenu.name} items={[
          { label : memberMenu.role === 'admin' ? 'Remove as admin' : 'Make admin', onClick : () => run(() => api.post(`/dm/threads/${thread._id}/admins/${memberMenu._id}`, { admin : memberMenu.role !== 'admin' })) },
          { label : 'Remove from group', danger : true, onClick : () => run(() => api.del(`/dm/threads/${thread._id}/members/${memberMenu._id}`)) },
          { label : 'Cancel', onClick : () => {} },
        ]} />
      )}
    </aside>
  )
}

export default DirectDetails
