import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IoClose, IoSearchOutline, IoCheckmark, IoLinkOutline, IoChatbubbleEllipsesOutline } from 'react-icons/io5'
import Avatar from '../../Avatar'
import { api, enc, postLink } from '../../../helpers/social'
import { notify, notifyError } from '../../../helpers/toast'
import { Modal } from '../../social/common'

// "New message" and the paper-plane "Share" sheet, both Instagram-style.

// group photo: two overlapping avatars, or the group's own photo
export const ThreadAvatar = ({ thread, size = 56 }) => {
  if (!thread) return null
  if (!thread.isGroup) {
    const p = thread.peer || {}
    return (
      <span className='relative inline-flex shrink-0'>
        <Avatar width={size} height={size} name={p.name} imageUrl={p.profile_pic} />
        {p.online && <span className={`absolute bottom-0 right-0 rounded-full bg-[#78de45] ring-2 ring-px-bg ${size > 40 ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'}`} />}
      </span>
    )
  }
  if (thread.avatar) return <Avatar width={size} height={size} name={thread.title} imageUrl={thread.avatar} group />
  const [a, b] = thread.members
  const small = Math.round(size * 0.72)
  return (
    <span className='relative inline-block shrink-0' style={{ width : size, height : size }}>
      <span className='absolute right-0 top-0'><Avatar width={small} height={small} name={a?.name || thread.title} imageUrl={a?.profile_pic} /></span>
      <span className='absolute bottom-0 left-0 rounded-full ring-2 ring-px-bg'><Avatar width={small} height={small} name={b?.name || 'You'} imageUrl={b?.profile_pic} /></span>
    </span>
  )
}

const Check = ({ on }) => (
  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-px-blue bg-px-blue text-white' : 'border-px-text/40'}`}>
    {on && <IoCheckmark size={16} />}
  </span>
)

// people search (Pixify accounts); empty query = suggestions
const usePeopleSearch = (q) => {
  const [res, setRes] = useState({ people : [], loading : false })
  useEffect(() => {
    const query = q.trim()
    if (!query) return setRes({ people : [], loading : false })
    let alive = true
    setRes((r) => ({ ...r, loading : true }))
    const t = setTimeout(() => {
      api.get(`/search?app=pixify&q=${enc(query)}`).then((r) => alive && setRes({ people : r.people || [], loading : false })).catch(() => alive && setRes({ people : [], loading : false }))
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q])
  return res
}

const useSuggested = () => {
  const [s, setS] = useState({ threads : [], people : [], loading : true })
  useEffect(() => {
    let alive = true
    api.get('/dm/suggested').then((r) => alive && setS({ ...r, loading : false })).catch(() => alive && setS({ threads : [], people : [], loading : false }))
    return () => { alive = false }
  }, [])
  return s
}

const Row = ({ avatar, title, subtitle, on, onClick }) => (
  <button onClick={onClick} className='flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-px-hover'>
    {avatar}
    <span className='min-w-0 flex-1'>
      <span className='block truncate text-sm font-semibold'>{title}</span>
      {subtitle && <span className='block truncate text-sm text-px-muted'>{subtitle}</span>}
    </span>
    <Check on={on} />
  </button>
)

// "New message": pick one person (their chat) or several (a new group)
export const NewMessageModal = ({ onClose }) => {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const found = usePeopleSearch(q)
  const sugg = useSuggested()
  const suggestedPeople = useMemo(() => {
    const fromThreads = sugg.threads.filter((t) => !t.isGroup && t.peer).map((t) => t.peer)
    return [...fromThreads, ...sugg.people.filter((p) => !fromThreads.some((x) => x._id === p._id))]
  }, [sugg])
  const list = q.trim() ? found.people.filter((p) => !p.self) : suggestedPeople
  const toggle = (p) => setPicked((l) => (l.some((x) => x._id === p._id) ? l.filter((x) => x._id !== p._id) : [...l, p]))

  const start = async () => {
    setBusy(true)
    try {
      const res = await api.post('/dm/threads', { userIds : picked.map((p) => p._id), name : picked.length > 1 ? name : '', group : picked.length > 1 })
      onClose()
      navigate(`/pixify/direct/t/${res.thread._id}`)
    } catch (e) {
      notifyError(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} label='New message' closeButton={false} className='flex h-[100dvh] w-screen flex-col overflow-hidden bg-px-bg text-px-text sm:h-[min(640px,85vh)] sm:w-[548px] sm:rounded-xl'>
      <div className='relative flex h-[42px] shrink-0 items-center justify-center border-b border-px-border'>
        <p className='font-bold'>New message</p>
        <button onClick={onClose} className='absolute right-2 p-1' aria-label='Close'><IoClose size={26} /></button>
      </div>
      <div className='flex min-h-[44px] shrink-0 flex-wrap items-center gap-1.5 border-b border-px-border px-4 py-1.5'>
        <span className='mr-2 font-semibold'>To:</span>
        {picked.map((p) => (
          <button key={p._id} onClick={() => toggle(p)} className='flex items-center gap-1 rounded-xl bg-[#e0f1ff] px-3 py-0.5 text-sm font-medium text-px-blue dark:bg-[#0c2c4a]'>
            {p.username || p.name}<IoClose size={14} />
          </button>
        ))}
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search...' className='min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-px-muted' />
      </div>
      {picked.length > 1 && (
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder='Group name (optional)' className='shrink-0 border-b border-px-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-px-muted' />
      )}
      <div className='min-h-0 flex-1 overflow-y-auto py-2'>
        {!q.trim() && <p className='px-4 pb-1 pt-2 text-sm font-semibold'>Suggested</p>}
        {(q.trim() ? found.loading : sugg.loading) && <p className='px-4 py-3 text-sm text-px-muted'>Searching...</p>}
        {!found.loading && q.trim() && !list.length && <p className='px-4 py-3 text-sm text-px-muted'>No account found.</p>}
        {list.map((p) => (
          <Row key={p._id} on={picked.some((x) => x._id === p._id)} onClick={() => toggle(p)}
            avatar={<Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />} title={p.profileName || p.name} subtitle={p.username} />
        ))}
      </div>
      <div className='shrink-0 p-4'>
        <button disabled={!picked.length || busy} onClick={start} className='h-11 w-full rounded-lg bg-px-blue font-semibold text-white hover:bg-[#1877f2] disabled:opacity-40'>Chat</button>
      </div>
    </Modal>
  )
}

// paper plane on a post / reel / profile: send to people or conversations, with an optional note
// forwardId: forward that Direct message instead of sharing a post / profile
export const ShareSheet = ({ post, profile, forwardId, onClose, onChats }) => {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState([]) // [{ key, threadId | userId, label }]
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const found = usePeopleSearch(q)
  const sugg = useSuggested()

  const items = useMemo(() => {
    if (q.trim()) return found.people.filter((p) => !p.self).map((p) => ({ key : `u${p._id}`, userId : p._id, label : p.username || p.name, sub : p.profileName || p.name, person : p }))
    const threads = sugg.threads.map((t) => ({ key : t.isGroup ? `t${t._id}` : `u${t.peer._id}`, ...(t.isGroup ? { threadId : t._id } : { userId : t.peer._id }), label : t.title, thread : t }))
    const people = sugg.people.map((p) => ({ key : `u${p._id}`, userId : p._id, label : p.username || p.name, person : p }))
    return [...threads, ...people.filter((p) => !threads.some((t) => t.key === p.key))]
  }, [q, found.people, sugg])
  const isOn = (it) => picked.some((x) => x.key === it.key)
  const toggle = (it) => setPicked((l) => (isOn(it) ? l.filter((x) => x.key !== it.key) : [...l, it]))

  const send = async () => {
    setBusy(true)
    try {
      const targets = { threadIds : picked.filter((x) => x.threadId).map((x) => x.threadId), userIds : picked.filter((x) => x.userId).map((x) => x.userId) }
      const res = forwardId
        ? await api.post(`/dm/messages/${forwardId}/forward`, targets)
        : await api.post('/dm/share', { ...(post ? { postId : post._id } : { profileId : profile._id }), ...targets, text })
      onClose()
      if (res.failed?.length) notifyError(res.failed[0])
      else notify('Sent')
    } catch (e) {
      notifyError(e.message)
      setBusy(false)
    }
  }

  const copy = async () => {
    const link = post ? postLink(post) : `${window.location.origin}/pixify/u/${profile.username || profile._id}`
    try { await navigator.clipboard.writeText(link); notify('Link copied') } catch { notifyError("Couldn't copy the link") }
    onClose()
  }

  return (
    <Modal onClose={onClose} label='Share' closeButton={false} className='flex h-[85dvh] w-screen flex-col overflow-hidden rounded-t-2xl bg-px-bg text-px-text max-sm:fixed max-sm:bottom-0 sm:h-[min(620px,85vh)] sm:w-[548px] sm:rounded-xl'>
      <div className='relative flex h-[48px] shrink-0 items-center justify-center'>
        <p className='font-bold'>{forwardId ? 'Forward' : 'Share'}</p>
        <button onClick={onClose} className='absolute right-2 p-1' aria-label='Close'><IoClose size={26} /></button>
      </div>
      <div className='mx-4 mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-px-raised px-3'>
        <IoSearchOutline className='text-px-muted' />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search' className='h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-px-muted' />
      </div>
      <div className='grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-y-3 overflow-y-auto px-2 py-2 sm:grid-cols-4'>
        {(q.trim() ? found.loading : sugg.loading) && <p className='col-span-full px-2 text-sm text-px-muted'>Loading...</p>}
        {!sugg.loading && !q.trim() && !items.length && <p className='col-span-full px-2 py-6 text-center text-sm text-px-muted'>Search for people to send this to.</p>}
        {q.trim() && !found.loading && !items.length && <p className='col-span-full px-2 text-sm text-px-muted'>No account found.</p>}
        {items.map((it) => (
          <button key={it.key} onClick={() => toggle(it)} className='flex flex-col items-center gap-1.5 rounded-lg p-1 hover:bg-px-hover'>
            <span className='relative'>
              {it.thread ? <ThreadAvatar thread={it.thread} size={72} /> : <Avatar width={72} height={72} name={it.person.name} imageUrl={it.person.profile_pic} />}
              {isOn(it) && <span className='absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-px-blue text-white ring-2 ring-px-bg'><IoCheckmark size={16} /></span>}
            </span>
            <span className='w-full truncate text-center text-xs'>{it.label}</span>
          </button>
        ))}
      </div>
      <div className='shrink-0 border-t border-px-border'>
        {picked.length ? (
          <div className='p-4'>
            {!forwardId && <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder='Write a message...' className='mb-3 w-full bg-transparent text-sm outline-none placeholder:text-px-muted' />}
            <button onClick={send} disabled={busy} className='h-11 w-full rounded-lg bg-px-blue font-semibold text-white hover:bg-[#1877f2] disabled:opacity-50'>{picked.length > 1 ? 'Send separately' : 'Send'}</button>
          </div>
        ) : forwardId ? <p className='px-4 py-4 text-center text-sm text-px-muted'>Choose who to forward to.</p> : (
          <div className='flex justify-center gap-6 px-4 py-3'>
            <button onClick={copy} className='flex w-20 flex-col items-center gap-1.5 text-xs'><span className='flex h-12 w-12 items-center justify-center rounded-full bg-px-raised'><IoLinkOutline size={24} /></span>Copy link</button>
            {post && onChats && <button onClick={() => { onClose(); onChats(post) }} className='flex w-20 flex-col items-center gap-1.5 text-xs'><span className='flex h-12 w-12 items-center justify-center rounded-full bg-px-raised'><IoChatbubbleEllipsesOutline size={24} /></span>Chats</button>}
          </div>
        )}
      </div>
    </Modal>
  )
}
