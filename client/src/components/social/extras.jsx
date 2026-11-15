import React, { useEffect, useState } from 'react'
import { IoClose, IoCheckmark, IoSearchOutline, IoChevronForward } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, enc } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { Modal } from './common'

// Pieces shared by Pixify and Connectify: people picker (tag people, "with" friends, invites), Report sheet,
// photo filters, recent searches.

const tone = (t) => (t === 'px'
  ? { card : 'bg-px-bg text-px-text', border : 'border-px-border', muted : 'text-px-muted', hover : 'hover:bg-px-hover', raised : 'bg-px-raised', blue : 'bg-px-blue', blueText : 'text-px-blue' }
  : { card : 'bg-cx-card text-cx-text', border : 'border-cx-border', muted : 'text-cx-muted', hover : 'hover:bg-cx-hover', raised : 'bg-cx-input', blue : 'bg-cx-blue', blueText : 'text-cx-blue' })

/* ---------- people picker ---------- */

// pick people by searching (Pixify accounts) or from a fixed list (e.g. your friends)
export const PeoplePicker = ({ title, app = 'pixify', t = 'px', initial = [], source, onDone, onClose, doneLabel = 'Done', max = 20 }) => {
  const c = tone(t)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(initial)
  const [found, setFound] = useState(source || [])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (source) {
      const s = q.trim().toLowerCase()
      setFound(s ? source.filter((p) => (p.name || '').toLowerCase().includes(s) || (p.username || '').includes(s)) : source)
      return
    }
    const query = q.trim()
    if (!query) { setFound([]); return }
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => api.get(`/search?app=${app}&q=${enc(query)}`).then((r) => alive && setFound((r.people || []).filter((p) => !p.self))).catch(() => {}).finally(() => alive && setLoading(false)), 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [q, source, app])

  const on = (p) => picked.some((x) => x._id === p._id)
  const toggle = (p) => setPicked((l) => (on(p) ? l.filter((x) => x._id !== p._id) : l.length >= max ? (notifyError(`Up to ${max} people`), l) : [...l, p]))

  return (
    <Modal onClose={onClose} label={title} closeButton={false} className={`flex h-[100dvh] w-screen flex-col overflow-hidden sm:h-[min(560px,85vh)] sm:w-[480px] sm:rounded-xl ${c.card}`}>
      <div className={`relative flex h-12 shrink-0 items-center justify-center border-b ${c.border}`}>
        <p className='font-bold'>{title}</p>
        <button onClick={onClose} className='absolute left-2 p-1' aria-label='Close'><IoClose size={24} /></button>
        <button onClick={() => onDone(picked)} className={`absolute right-3 text-sm font-semibold ${c.blueText}`}>{doneLabel}</button>
      </div>
      <div className={`mx-3 my-2 flex shrink-0 items-center gap-2 rounded-lg px-3 ${c.raised}`}>
        <IoSearchOutline className={c.muted} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search' className='h-9 flex-1 bg-transparent text-sm outline-none' />
      </div>
      {picked.length > 0 && (
        <div className='flex shrink-0 flex-wrap gap-1.5 px-3 pb-2'>
          {picked.map((p) => <button key={p._id} onClick={() => toggle(p)} className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${c.blue}`}>{p.username || p.name}<IoClose size={12} /></button>)}
        </div>
      )}
      <div className='min-h-0 flex-1 overflow-y-auto pb-2'>
        {loading && <p className={`px-4 py-3 text-sm ${c.muted}`}>Searching...</p>}
        {!loading && !found.length && <p className={`px-4 py-6 text-center text-sm ${c.muted}`}>{source ? 'No one to show.' : 'Search for people.'}</p>}
        {found.map((p) => (
          <button key={p._id} onClick={() => toggle(p)} className={`flex w-full items-center gap-3 px-4 py-2 text-left ${c.hover}`}>
            <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
            <span className='min-w-0 flex-1'>
              <span className='block truncate text-sm font-semibold'>{app === 'pixify' ? p.username || p.name : p.name}</span>
              <span className={`block truncate text-sm ${c.muted}`}>{app === 'pixify' ? p.profileName || p.name : p.username}</span>
            </span>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on(p) ? `border-transparent ${c.blue} text-white` : 'border-current opacity-40'}`}>{on(p) && <IoCheckmark size={16} />}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/* ---------- report ---------- */

const REASONS = ["It's spam", 'Nudity or sexual activity', 'Hate speech or symbols', 'Violence or dangerous organizations', 'Bullying or harassment', 'Scam or fraud', 'False information', 'Intellectual property violation', 'Suicide or self-injury', 'Something else']

// "Report" -> "Why are you reporting this?" -> thanks
export const ReportSheet = ({ app, target, onClose, t = 'px' }) => {
  const c = tone(t)
  const [done, setDone] = useState(false)
  const send = async (reason) => {
    try { await api.post('/report', { app, ...target, reason }); setDone(true) } catch (e) { notifyError(e.message) }
  }
  return (
    <Modal onClose={onClose} label='Report' closeButton={false} className={`w-[min(420px,94vw)] overflow-hidden rounded-xl ${c.card}`}>
      <div className={`relative flex h-12 items-center justify-center border-b ${c.border}`}>
        <p className='font-bold'>Report</p>
        <button onClick={onClose} className='absolute right-2 p-1' aria-label='Close'><IoClose size={24} /></button>
      </div>
      {done ? (
        <div className='px-6 py-8 text-center'>
          <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#58c322] text-white'><IoCheckmark size={34} /></span>
          <p className='mt-3 font-semibold'>Thanks for letting us know</p>
          <p className={`mt-1 text-sm ${c.muted}`}>Your feedback helps keep {app === 'pixify' ? 'Pixify' : 'Connectify'} safe. The person won't know who reported them.</p>
          <button onClick={onClose} className={`mt-5 h-10 w-full rounded-lg text-sm font-semibold text-white ${c.blue}`}>Close</button>
        </div>
      ) : (
        <>
          <p className='px-4 pb-1 pt-4 font-semibold'>Why are you reporting this?</p>
          <p className={`px-4 pb-2 text-xs ${c.muted}`}>Your report is anonymous.</p>
          <div className='max-h-[60vh] overflow-y-auto'>
            {REASONS.map((r) => (
              <button key={r} onClick={() => send(r)} className={`flex w-full items-center justify-between border-t px-4 py-3 text-left text-sm ${c.border} ${c.hover}`}>{r}<IoChevronForward className={c.muted} /></button>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

/* ---------- photo filters (Pixify) ---------- */

export const FILTERS = [
  { id : 'normal', name : 'Original', css : 'none' },
  { id : 'clarendon', name : 'Clarendon', css : 'contrast(1.2) saturate(1.35)' },
  { id : 'gingham', name : 'Gingham', css : 'brightness(1.05) hue-rotate(-10deg) sepia(0.04)' },
  { id : 'moon', name : 'Moon', css : 'grayscale(1) contrast(1.1) brightness(1.1)' },
  { id : 'lark', name : 'Lark', css : 'contrast(0.9) brightness(1.1) saturate(1.1)' },
  { id : 'reyes', name : 'Reyes', css : 'sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)' },
  { id : 'juno', name : 'Juno', css : 'saturate(1.4) contrast(1.15) hue-rotate(-8deg)' },
  { id : 'slumber', name : 'Slumber', css : 'saturate(0.66) brightness(1.05) sepia(0.15)' },
  { id : 'crema', name : 'Crema', css : 'sepia(0.3) contrast(0.9) saturate(0.9) brightness(1.05)' },
  { id : 'ludwig', name : 'Ludwig', css : 'saturate(1.2) contrast(1.05) brightness(1.05)' },
  { id : 'aden', name : 'Aden', css : 'hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)' },
  { id : 'inkwell', name : 'Inkwell', css : 'sepia(0.3) contrast(1.1) brightness(1.1) grayscale(1)' },
]
export const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css || 'none'

// draws the photo with the filter into a new JPEG file (so the uploaded photo looks like the preview)
export const applyFilter = (file, id) => new Promise((resolve) => {
  const css = filterCss(id)
  if (css === 'none' || !file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file)
  const img = new Image()
  const url = URL.createObjectURL(file)
  img.onload = () => {
    try {
      const scale = Math.min(1, 2160 / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!('filter' in ctx)) { URL.revokeObjectURL(url); return resolve(file) }
      ctx.filter = css
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => { URL.revokeObjectURL(url); resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type : 'image/jpeg' }) : file) }, 'image/jpeg', 0.92)
    } catch { URL.revokeObjectURL(url); resolve(file) }
  }
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
  img.src = url
})

/* ---------- recent searches (this browser only) ---------- */

const accountId = () => { try { return JSON.parse(atob(localStorage.getItem('token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || '' } catch { return '' } }
const key = (app) => `chatify-recent-search-${app}-${accountId()}`
export const recentSearches = (app) => { try { return JSON.parse(localStorage.getItem(key(app)) || '[]') } catch { return [] } }
export const addRecentSearch = (app, item) => {
  try {
    const list = recentSearches(app).filter((x) => x.id !== item.id)
    localStorage.setItem(key(app), JSON.stringify([item, ...list].slice(0, 20)))
  } catch { /* storage unavailable */ }
}
export const removeRecentSearch = (app, id) => { try { localStorage.setItem(key(app), JSON.stringify(id ? recentSearches(app).filter((x) => x.id !== id) : [])) } catch { /* ignore */ } }

/* ---------- small helpers ---------- */

export const toggleCall = async (url, body, okText) => {
  try { const r = await api.post(url, body); if (okText) notify(okText); return r } catch (e) { notifyError(e.message); return null }
}

// "Tagged: neha, rahul" pill list
export const PeopleLine = ({ people, render }) => {
  if (!people?.length) return null
  if (people.length <= 2) return <>{people.map((p, i) => <React.Fragment key={p._id}>{i > 0 && ' and '}{render(p)}</React.Fragment>)}</>
  return <>{render(people[0])} and {people.length - 1} others</>
}
