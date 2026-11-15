import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IoArrowBack, IoLocationOutline, IoTimeOutline, IoClose } from 'react-icons/io5'
import { api, usePaged, compact, enc } from '../../helpers/social'
import { thumbUrl } from '../../helpers/media'
import { notify, notifyError } from '../../helpers/toast'
import { PostGrid } from './PixifyProfile'
import { localInput } from './CreatePost'

const thumbUrlSafe = (m) => (m.kind === 'image' ? thumbUrl(m.url, 160) : m.poster || '')

const Page = ({ title, children }) => {
  const navigate = useNavigate()
  return (
    <div className='mx-auto max-w-[935px] pb-10 md:px-5 md:pt-8'>
      <div className='flex h-11 items-center gap-3 border-b border-px-border px-4 md:border-0 md:px-0'>
        <button onClick={() => navigate(-1)} title='Back' aria-label='Back'><IoArrowBack size={22} /></button><h1 className='font-semibold md:text-xl'>{title}</h1>
      </div>
      {children}
    </div>
  )
}

/* ---------- Place: posts tagged with a location (Instagram location pages) ---------- */

export const PixifyPlace = () => {
  const { name } = useParams()
  const paged = usePaged(`/places/${enc(name)}?app=pixify`)
  return (
    <Page title={name}>
      <header className='flex items-center gap-6 px-4 py-6 md:gap-12 md:px-12'>
        <span className='flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-px-border md:h-36 md:w-36'><IoLocationOutline className='text-4xl md:text-6xl' /></span>
        <div className='min-w-0'>
          <h2 className='truncate text-2xl'>{name}</h2>
          <p className='mt-1 text-sm'><b>{compact(paged.count || 0)}</b> post{paged.count === 1 ? '' : 's'}</p>
        </div>
      </header>
      <p className='mb-2 px-4 text-sm font-semibold text-px-muted md:px-0'>Recent posts</p>
      <PostGrid paged={paged} empty={<p className='py-14 text-center text-sm text-px-muted'>No posts from this place yet.</p>} />
    </Page>
  )
}

/* ---------- Scheduled posts (Pixify and Connectify) ---------- */

export const ScheduledList = ({ app, tone = 'px' }) => {
  const [posts, setPosts] = useState(null)
  const [moving, setMoving] = useState(null) // { post, at }
  const load = () => api.get(`/scheduled?app=${app}`).then((r) => setPosts(r.posts)).catch(() => setPosts([]))
  useEffect(() => { load() }, [app]) // eslint-disable-line react-hooks/exhaustive-deps
  const c = tone === 'px'
    ? { muted : 'text-px-muted', border : 'border-px-border', blue : 'text-px-blue', btn : 'bg-px-raised hover:bg-px-border', card : 'bg-px-bg' }
    : { muted : 'text-cx-muted', border : 'border-cx-border', blue : 'text-cx-blue', btn : 'bg-cx-input hover:brightness-95', card : 'bg-cx-card' }
  const act = async (fn, ok) => { try { await fn(); notify(ok); load() } catch (e) { notifyError(e.message) } }
  if (posts === null) return <span className='mx-auto my-10 block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40' />
  if (!posts.length) {
    return (
      <div className='px-6 py-14 text-center'>
        <IoTimeOutline size={52} className='mx-auto' />
        <p className='mt-3 text-xl font-bold'>No scheduled posts</p>
        <p className={`mt-1 text-sm ${c.muted}`}>When you create a post, open "Advanced settings" (Pixify) or "Schedule" (Connectify) to choose when it's shared.</p>
      </div>
    )
  }
  return (
    <div className='divide-y divide-current/10'>
      {posts.map((p) => (
        <div key={p._id} className={`flex items-center gap-3 border-b px-4 py-3 md:px-0 ${c.border}`}>
          {p.media?.[0]
            ? <img src={thumbUrlSafe(p.media[0])} alt={p.media[0].alt || ''} className='h-16 w-16 shrink-0 rounded object-cover' />
            : <span className='flex h-16 w-16 shrink-0 items-center justify-center rounded text-xs' style={{ background : p.background || 'rgba(127,127,127,.15)', color : p.background ? '#fff' : undefined }}>{p.poll ? 'Poll' : 'Text'}</span>}
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm'>{p.text || (p.poll ? 'Poll' : 'Photo')}</p>
            <p className={`text-xs ${c.muted}`}>Publishes {new Date(p.scheduledFor).toLocaleString([], { dateStyle : 'medium', timeStyle : 'short' })}</p>
            <div className='mt-1 flex gap-3 text-xs font-semibold'>
              <button onClick={() => act(() => api.post(`/posts/${p._id}/publish`), 'Published')} className={c.blue}>Publish now</button>
              <button onClick={() => setMoving({ post : p, at : localInput(new Date(p.scheduledFor).getTime()) })} className={c.blue}>Change time</button>
              <button onClick={() => act(() => api.del(`/posts/${p._id}`), 'Scheduled post deleted')} className='text-[#ed4956]'>Delete</button>
            </div>
          </div>
        </div>
      ))}
      {moving && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4' onClick={() => setMoving(null)}>
          <div role='dialog' aria-label='Change time' onClick={(e) => e.stopPropagation()} className={`w-full max-w-[360px] rounded-xl p-4 shadow-xl ${c.card}`}>
            <div className='mb-3 flex items-center justify-between'><p className='font-semibold'>Change time</p><button onClick={() => setMoving(null)} aria-label='Close'><IoClose size={22} /></button></div>
            <input type='datetime-local' value={moving.at} min={localInput(Date.now() + 5 * 60 * 1000)} onChange={(e) => setMoving((m) => ({ ...m, at : e.target.value }))} aria-label='Publish at'
              className={`h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none [color-scheme:light] dark:[color-scheme:dark] ${c.border}`} />
            <button onClick={() => { const m = moving; setMoving(null); act(() => api.post(`/posts/${m.post._id}/publish`, { at : new Date(m.at).toISOString() }), 'Time changed') }}
              className='mt-3 h-9 w-full rounded-lg bg-[#0095f6] text-sm font-semibold text-white'>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

export const PixifyScheduled = () => (
  <Page title='Scheduled posts'>
    <p className='px-4 py-3 text-sm text-px-muted md:px-0'>Only you can see these until they're shared.</p>
    <ScheduledList app='pixify' />
  </Page>
)

/* ---------- Hidden words (comment filter) ---------- */

export const PixifyHiddenWords = () => {
  const [words, setWords] = useState(null)
  const [text, setText] = useState('')
  useEffect(() => { api.get('/hidden-words').then((r) => setWords(r.words)).catch(() => setWords([])) }, [])
  const save = async (next) => {
    try { const r = await api.post('/hidden-words', { words : next }); setWords(r.words); return true } catch (e) { notifyError(e.message); return false }
  }
  const add = async (e) => {
    e.preventDefault()
    const list = text.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
    if (!list.length) return
    if (await save([...(words || []), ...list])) { setText(''); notify('Hidden words updated') }
  }
  return (
    <Page title='Hidden words'>
      <p className='px-4 py-3 text-sm text-px-muted md:px-0'>Comments on your posts that contain these words or phrases are hidden from everyone except the person who wrote them. You'll see them marked "Hidden".</p>
      <form onSubmit={add} className='flex gap-2 px-4 md:px-0'>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder='Add words, separated by commas' aria-label='Add hidden words'
          className='h-10 min-w-0 flex-1 rounded-lg bg-px-raised px-3 text-sm outline-none placeholder:text-px-muted' />
        <button disabled={!text.trim()} className='h-10 rounded-lg bg-px-blue px-4 text-sm font-semibold text-white disabled:opacity-50'>Add</button>
      </form>
      <div className='mt-4 flex flex-wrap gap-2 px-4 md:px-0'>
        {words === null && <span className='h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
        {words?.length === 0 && <p className='text-sm text-px-muted'>You haven't added any words yet.</p>}
        {words?.map((w) => (
          <span key={w} className='flex items-center gap-1 rounded-full bg-px-raised py-1 pl-3 pr-1 text-sm'>
            {w}
            <button onClick={() => save(words.filter((x) => x !== w))} aria-label={`Remove ${w}`} className='rounded-full p-0.5 hover:bg-px-border'><IoClose size={16} /></button>
          </span>
        ))}
      </div>
    </Page>
  )
}
