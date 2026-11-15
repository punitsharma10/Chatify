import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import moment from 'moment'
import { IoAdd, IoArrowBack, IoChevronBack, IoChevronForward, IoClose, IoEllipsisHorizontal, IoPause, IoPlay, IoSearch, IoStar, IoCheckmark, IoVolumeHighOutline, IoVolumeMuteOutline, IoTimeOutline, IoGridOutline } from 'react-icons/io5'
import Avatar from '../Avatar'
import { STATUS_FONTS } from '../StatusPanel'
import { StoryPreview } from '../apps/stories'
import { api, shortAgo } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { ActionSheet, Modal } from '../social/common'

// Instagram's story archive, highlights and Close friends for Pixify.

export const CLOSE_FRIENDS_GREEN = '#1fbf4a'
const PHOTO_MS = 5000
const MAX_TITLE = 30

// green star badge (Close friends)
export const CloseFriendsBadge = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${className}`} style={{ backgroundColor : CLOSE_FRIENDS_GREEN }}>
    <IoStar size={10} />Close friends
  </span>
)

/* ---------------- full-screen viewer ---------------- */

// Plays a list of archived stories like Instagram: progress bars, tap left / right, hold to pause,
// photos and text for 5 s, videos play through. Esc / ✕ closes.
export const StoryItemsViewer = ({ items : startItems, start = 0, title, avatar, onClose, menu }) => {
  const [items, setItems] = useState(startItems)
  const [idx, setIdx] = useState(Math.min(start, startItems.length - 1))
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [sheet, setSheet] = useState(false)
  const videoRef = useRef(null)
  const pressedAt = useRef(0)
  const item = items[idx]

  useEffect(() => { setItems(startItems) }, [startItems])
  useEffect(() => { if (!items.length) onClose(); else if (idx >= items.length) setIdx(items.length - 1) }, [items.length, idx, onClose])

  const next = useCallback(() => {
    setProgress(0)
    if (idx < items.length - 1) setIdx(idx + 1)
    else onClose()
  }, [idx, items.length, onClose])
  const prev = useCallback(() => {
    setProgress(0)
    if (idx > 0) setIdx(idx - 1)
  }, [idx])

  const holding = paused || sheet
  useEffect(() => {
    if (!item || item.kind === 'video' || holding) return
    const started = Date.now() - progress * PHOTO_MS
    const t = setInterval(() => {
      const p = (Date.now() - started) / PHOTO_MS
      if (p >= 1) { clearInterval(t); next() } else setProgress(p)
    }, 50)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, holding, next])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (holding) v.pause(); else v.play().catch(() => {})
  }, [holding, item])

  useEffect(() => {
    const onKey = (e) => {
      if (sheet) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose, sheet])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  if (!item) return null
  const menuItems = menu ? menu(item, { remove : () => setItems((l) => l.filter((x) => x._id !== item._id)), close : onClose }) : null

  return (
    <div className='fixed inset-0 z-[60] flex items-center justify-center bg-[#1a1a1a] text-white' role='dialog' aria-modal='true' aria-label={title}>
      <div className='relative h-full w-full sm:h-[min(92dvh,860px)] sm:w-auto sm:aspect-[9/16]'>
        <button onClick={prev} disabled={idx === 0} className='absolute -left-14 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-black transition hover:bg-white disabled:invisible sm:flex' title='Previous'><IoChevronBack size={20} /></button>
        <button onClick={next} className='absolute -right-14 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-black transition hover:bg-white sm:flex' title='Next'><IoChevronForward size={20} /></button>

        <div className='relative flex h-full w-full items-center justify-center overflow-hidden bg-black sm:rounded-lg'>
          {/* content: tap the left third to go back, the rest to go forward; hold to pause */}
          <div
            className='absolute inset-0 flex select-none items-center justify-center'
            onPointerDown={() => { pressedAt.current = Date.now(); setPaused(true) }}
            onPointerUp={(e) => {
              setPaused(false)
              if (Date.now() - pressedAt.current > 300) return
              const rect = e.currentTarget.getBoundingClientRect()
              ;(e.clientX - rect.left < rect.width / 3 ? prev : next)()
            }}
            onPointerLeave={() => setPaused(false)}
          >
            {item.kind === 'text' && (
              <div className='flex h-full w-full items-center justify-center p-8 text-center' style={{ backgroundColor : item.background }}>
                <p className='whitespace-pre-wrap break-words text-[24px] leading-snug' style={STATUS_FONTS[item.font || 0]}>{item.text}</p>
              </div>
            )}
            {item.kind === 'image' && <img src={item.mediaUrl} alt='' className='max-h-full max-w-full object-contain' draggable={false} />}
            {item.kind === 'video' && (
              <video ref={videoRef} key={item._id} src={item.mediaUrl} autoPlay playsInline muted={muted} className='max-h-full max-w-full'
                onTimeUpdate={(e) => e.currentTarget.duration && setProgress(e.currentTarget.currentTime / e.currentTarget.duration)}
                onEnded={next} />
            )}
            {item.caption && <p className='absolute inset-x-0 bottom-6 mx-4 rounded-lg bg-black/45 px-3 py-2 text-center text-[15px]'>{item.caption}</p>}
          </div>

          {/* top: progress bars + header */}
          <div className='pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-2 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))]'>
            <div className='flex gap-[3px]'>
              {items.map((s, i) => (
                <span key={s._id} className='h-[2px] flex-1 overflow-hidden rounded-full bg-white/35'>
                  <span className='block h-full bg-white' style={{ width : i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%' }} />
                </span>
              ))}
            </div>
            <div className='pointer-events-auto mt-2.5 flex items-center gap-2 px-1'>
              <span className='h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/20'>{avatar}</span>
              <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5'>
                <span className='truncate text-sm font-semibold'>{title}</span>
                <span className='text-sm text-white/70'>{shortAgo(item.createdAt)}</span>
                {item.closeFriends && <CloseFriendsBadge />}
              </div>
              {item.kind === 'video' && (
                <button onClick={() => setMuted((m) => !m)} className='flex h-8 w-8 items-center justify-center' title={muted ? 'Unmute' : 'Mute'}>
                  {muted ? <IoVolumeMuteOutline size={20} /> : <IoVolumeHighOutline size={20} />}
                </button>
              )}
              <button onClick={() => setPaused((p) => !p)} className='flex h-8 w-8 items-center justify-center' title={paused ? 'Play' : 'Pause'}>{paused ? <IoPlay size={18} /> : <IoPause size={18} />}</button>
              {menuItems && <button onClick={() => setSheet(true)} className='flex h-8 w-8 items-center justify-center' title='More options'><IoEllipsisHorizontal size={22} /></button>}
              <button onClick={onClose} className='flex h-8 w-8 items-center justify-center' title='Close'><IoClose size={26} /></button>
            </div>
          </div>
        </div>
      </div>
      {sheet && menuItems && <ActionSheet onClose={() => setSheet(false)} items={menuItems} />}
    </div>
  )
}

/* ---------------- create / edit a highlight ---------------- */

const useArchive = (enabled = true) => {
  const [items, setItems] = useState(null)
  const [next, setNext] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async (before) => {
    setLoading(true)
    try {
      const r = await api.get(`/stories/archive${before ? `?before=${encodeURIComponent(before)}` : ''}`)
      setItems((l) => (before ? [...(l || []), ...r.items.filter((x) => !(l || []).some((y) => y._id === x._id))] : r.items))
      setNext(r.next)
    } catch (e) { notifyError(e.message); setItems((l) => l || []) }
    setLoading(false)
  }, [])
  useEffect(() => { if (enabled) load() }, [enabled, load])
  return { items, setItems, next, loading, more : () => next && !loading && load(next), reload : () => load() }
}

// date chip on archive thumbnails (Instagram: day over month)
const DateChip = ({ date }) => (
  <span className='absolute left-1.5 top-1.5 rounded-md bg-px-bg px-1.5 py-0.5 text-center leading-none text-px-text shadow-sm'>
    <span className='block text-[15px] font-bold'>{moment(date).format('D')}</span>
    <span className='block text-[10px] font-semibold uppercase'>{moment(date).format('MMM')}</span>
  </span>
)

const ArchiveThumb = ({ item, onClick, selected, order, children }) => (
  <button onClick={onClick} className='group relative aspect-[9/16] overflow-hidden bg-px-raised' aria-pressed={selected === undefined ? undefined : selected} title={moment(item.createdAt).format('D MMMM YYYY')}>
    <StoryPreview status={item} className='h-full w-full text-[10px]' />
    {selected !== undefined && <span className={`absolute inset-0 transition ${selected ? 'bg-white/30 dark:bg-black/30' : 'group-hover:bg-black/10'}`} />}
    <DateChip date={item.createdAt} />
    {item.closeFriends && <span className='absolute bottom-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white' style={{ backgroundColor : CLOSE_FRIENDS_GREEN }} title='Close friends'><IoStar size={11} /></span>}
    {selected !== undefined && (
      <span className={`absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${selected ? 'border-white bg-px-blue text-white' : 'border-white bg-black/20'}`}>{selected ? order : ''}</span>
    )}
    {children}
  </button>
)

// Pick stories from the archive and name the highlight. The first selected story is the cover.
export const HighlightEditor = ({ highlight, preselect = [], onClose, onSaved }) => {
  const archive = useArchive()
  const [title, setTitle] = useState(highlight?.title || '')
  const [selected, setSelected] = useState(() => (highlight ? highlight.items.map((i) => i._id) : preselect))
  const [busy, setBusy] = useState(false)
  const more = useRef(null)

  // the highlight's own stories may be older than the loaded archive pages
  const known = [...(highlight?.items || []), ...(archive.items || [])]
  const byId = Object.fromEntries(known.map((i) => [i._id, i]))
  const grid = Object.values(byId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const cover = byId[selected[0]]

  useEffect(() => {
    const el = more.current
    if (!el) return
    const ob = new IntersectionObserver((e) => e[0].isIntersecting && archive.more())
    ob.observe(el)
    return () => ob.disconnect()
  })

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 100 ? (notifyError('A highlight can have up to 100 stories'), s) : [...s, id]))

  const save = async () => {
    const t = title.trim()
    if (!t) return notifyError('Give your highlight a name')
    if (!selected.length) return notifyError('Choose at least one story')
    setBusy(true)
    try {
      const r = highlight
        ? await api.patch(`/highlights/${highlight._id}`, { title : t, items : selected })
        : await api.post('/highlights', { title : t, items : selected })
      notify(highlight ? 'Highlight updated' : 'Added to your profile')
      onSaved?.(r.highlight)
      onClose()
    } catch (e) { notifyError(e.message) }
    setBusy(false)
  }

  return (
    <Modal onClose={onClose} label={highlight ? 'Edit highlight' : 'New highlight'} closeButton={false}
      className='flex h-[100dvh] w-full flex-col overflow-hidden bg-px-bg text-px-text sm:h-[min(680px,90dvh)] sm:w-[540px] sm:rounded-xl'>
      <header className='flex h-12 shrink-0 items-center justify-between border-b border-px-border px-2'>
        <button onClick={onClose} className='h-9 rounded-lg px-3 text-sm hover:bg-px-hover'>Cancel</button>
        <h2 className='font-semibold'>{highlight ? 'Edit highlight' : 'New highlight'}</h2>
        <button onClick={save} disabled={busy || !title.trim() || !selected.length} className='h-9 rounded-lg px-3 text-sm font-semibold text-px-blue hover:text-px-text disabled:opacity-40'>{busy ? 'Saving…' : 'Done'}</button>
      </header>
      <div className='flex shrink-0 items-center gap-4 border-b border-px-border px-4 py-4'>
        <span className='flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-px-border p-[3px]'>
          <span className='flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-px-raised'>
            {cover ? <StoryPreview status={cover} className='h-full w-full rounded-full text-[8px]' /> : <IoAdd size={28} className='text-px-muted' />}
          </span>
        </span>
        <div className='min-w-0 flex-1'>
          <label htmlFor='hl-title' className='text-xs font-semibold text-px-muted'>Highlight name</label>
          <input id='hl-title' value={title} onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))} maxLength={MAX_TITLE} placeholder='Highlights' autoFocus
            className='mt-1 h-10 w-full rounded-lg border border-px-border bg-px-raised/40 px-3 text-[15px] outline-none focus:border-px-muted' />
          <p className='mt-1 flex justify-between text-xs text-px-muted'><span>The first story you pick is the cover.</span><span>{title.length}/{MAX_TITLE}</span></p>
        </div>
      </div>
      <div className='flex shrink-0 items-center justify-between px-4 py-2.5 text-sm'>
        <span className='font-semibold'>Stories</span>
        <span className='text-px-muted'>{selected.length} selected</span>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {archive.items === null && <span className='mx-auto my-10 block h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
        {archive.items && !grid.length && (
          <div className='px-8 py-12 text-center'>
            <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-px-text'><IoTimeOutline size={32} /></span>
            <p className='mt-4 text-lg font-bold'>No stories in your archive</p>
            <p className='mt-1 text-sm text-px-muted'>Stories you share to Pixify are saved to your archive, even after they disappear. Add one, then make it a highlight.</p>
          </div>
        )}
        <div className='grid grid-cols-3 gap-[3px] sm:grid-cols-4'>
          {grid.map((it) => <ArchiveThumb key={it._id} item={it} selected={selected.includes(it._id)} order={selected.indexOf(it._id) + 1} onClick={() => toggle(it._id)} />)}
        </div>
        {archive.next && <div ref={more} className='py-4'><span className='mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-px-border border-t-px-muted' /></div>}
      </div>
    </Modal>
  )
}

/* ---------------- profile row ---------------- */

const Circle = ({ children, big }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-full border border-px-border bg-px-bg p-[3px] ${big ? 'h-16 w-16 md:h-[87px] md:w-[87px]' : 'h-16 w-16'}`}>
    <span className='flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-px-raised'>{children}</span>
  </span>
)

// Round highlight circles under the bio (a "New" circle on my own profile)
export const HighlightsRow = ({ profile, isMe }) => {
  const [list, setList] = useState(null)
  const [viewing, setViewing] = useState(null) // highlight
  const [editing, setEditing] = useState(null) // 'new' | highlight
  const [confirm, setConfirm] = useState(null) // highlight to delete

  const load = useCallback(() => api.get(`/users/${profile._id}/highlights`).then((r) => setList(r.highlights)).catch(() => setList([])), [profile._id])
  useEffect(() => { setList(null); load() }, [load])

  if (!list || (!list.length && !isMe)) return null

  const remove = async (h) => {
    try { await api.del(`/highlights/${h._id}`); notify('Highlight deleted'); setViewing(null); load() } catch (e) { notifyError(e.message) }
  }
  const removeItem = async (h, item, done) => {
    const rest = h.items.filter((x) => x._id !== item._id).map((x) => x._id)
    if (!rest.length) return setConfirm(h)
    try {
      const r = await api.patch(`/highlights/${h._id}`, { items : rest })
      notify('Removed from highlight')
      done.remove()
      setList((l) => l.map((x) => (x._id === h._id ? r.highlight : x)))
    } catch (e) { notifyError(e.message) }
  }

  return (
    <section aria-label={`${profile.username || profile.name}'s highlights`} className='mt-4 md:mt-10'>
      <div className='flex gap-4 overflow-x-auto px-4 pb-2 pt-1 scrollbar-none md:gap-10 md:px-12'>
        {list.map((h) => (
          <button key={h._id} onClick={() => setViewing(h)} className='flex w-16 shrink-0 flex-col items-center gap-1.5 md:w-[87px]' title={h.title}>
            <Circle big><StoryPreview status={h.items[0]} className='h-full w-full rounded-full text-[8px]' /></Circle>
            <span className='w-full truncate text-center text-xs font-semibold'>{h.title}</span>
          </button>
        ))}
        {isMe && list.length < 100 && (
          <button onClick={() => setEditing('new')} className='flex w-16 shrink-0 flex-col items-center gap-1.5 md:w-[87px]' title='New highlight'>
            <Circle big><IoAdd className='text-px-muted' size={40} /></Circle>
            <span className='w-full truncate text-center text-xs font-semibold'>New</span>
          </button>
        )}
      </div>

      {viewing && (
        <StoryItemsViewer
          items={viewing.items}
          title={viewing.title}
          avatar={<StoryPreview status={viewing.items[0]} className='h-full w-full rounded-full text-[5px]' />}
          onClose={() => setViewing(null)}
          menu={isMe ? (item, done) => [
            { label : 'Edit highlight', bold : true, onClick : () => { setEditing(viewing); setViewing(null) } },
            { label : 'Remove from highlight', onClick : () => removeItem(viewing, item, done) },
            { label : 'Delete highlight', danger : true, onClick : () => setConfirm(viewing) },
          ] : null}
        />
      )}
      {editing && (
        <HighlightEditor highlight={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => load()} />
      )}
      {confirm && (
        <ActionSheet title={`Delete "${confirm.title}"? The stories stay in your archive.`} onClose={() => setConfirm(null)} items={[
          { label : 'Delete', danger : true, onClick : () => remove(confirm) },
        ]} />
      )}
    </section>
  )
}

/* ---------------- story archive page ---------------- */

const PageHeader = ({ title }) => {
  const navigate = useNavigate()
  return (
    <div className='flex h-11 items-center gap-3 border-b border-px-border px-4 md:border-0 md:px-0'>
      <button onClick={() => navigate(-1)} title='Back'><IoArrowBack size={22} /></button>
      <h1 className='font-semibold md:text-xl'>{title}</h1>
    </div>
  )
}

export const PixifyStoryArchive = () => {
  const user = useSelector((s) => s.user)
  const archive = useArchive()
  const [viewing, setViewing] = useState(null) // index
  const [creating, setCreating] = useState(null) // [ids]
  const [adding, setAdding] = useState(null) // item to add to a highlight
  const [highlights, setHighlights] = useState([])
  const [confirm, setConfirm] = useState(null)
  const more = useRef(null)

  const loadHighlights = useCallback(() => {
    if (user._id) api.get(`/users/${user._id}/highlights`).then((r) => setHighlights(r.highlights)).catch(() => {})
  }, [user._id])
  useEffect(() => { loadHighlights() }, [loadHighlights])

  useEffect(() => {
    const el = more.current
    if (!el) return
    const ob = new IntersectionObserver((e) => e[0].isIntersecting && archive.more())
    ob.observe(el)
    return () => ob.disconnect()
  })

  const addTo = async (h, item) => {
    if (h.items.some((x) => x._id === item._id)) return notify(`Already in ${h.title}`)
    try {
      await api.patch(`/highlights/${h._id}`, { items : [...h.items.map((x) => x._id), item._id] })
      notify(`Added to ${h.title}`)
      loadHighlights()
    } catch (e) { notifyError(e.message) }
  }

  const remove = async (item) => {
    try {
      await api.del(`/stories/archive/${item._id}`)
      archive.setItems((l) => l.filter((x) => x._id !== item._id))
      notify('Story deleted')
      loadHighlights()
    } catch (e) { notifyError(e.message) }
  }

  return (
    <div className='mx-auto max-w-[935px] pb-10 md:px-5 md:pt-8'>
      <PageHeader title='Archive' />
      <nav className='mt-0 flex justify-center gap-14 border-b border-px-border text-xs font-semibold uppercase tracking-widest md:mt-4'>
        <Link to='/pixify/archive' className='-mb-px flex items-center gap-1.5 border-b border-transparent py-3.5 text-px-muted'><IoGridOutline size={14} />Posts</Link>
        <span aria-current='page' className='-mb-px flex items-center gap-1.5 border-b border-px-text py-3.5'><IoTimeOutline size={14} />Stories</span>
      </nav>
      <div className='flex flex-wrap items-center gap-3 px-4 py-3 md:px-0'>
        <p className='min-w-0 flex-1 text-sm text-px-muted'>Only you can see your archived stories. Stories you share to Pixify are kept here after they disappear.</p>
        <button onClick={() => setCreating([])} disabled={!archive.items?.length} className='h-8 shrink-0 rounded-lg bg-px-blue px-4 text-sm font-semibold text-white disabled:opacity-50'>New highlight</button>
      </div>
      {archive.items === null && <span className='mx-auto mt-10 block h-7 w-7 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
      {archive.items?.length === 0 && (
        <div className='px-6 py-14 text-center'>
          <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-px-text'><IoTimeOutline size={32} /></span>
          <p className='mt-4 text-2xl font-extrabold'>Add to your story</p>
          <p className='mt-2 text-sm text-px-muted'>Keep your stories in your archive after they disappear, so you can look back on your memories. Only you can see what's in your archive.</p>
        </div>
      )}
      <div className='grid grid-cols-3 gap-[3px] md:grid-cols-4 md:gap-1'>
        {(archive.items || []).map((it, i) => <ArchiveThumb key={it._id} item={it} onClick={() => setViewing(i)} />)}
      </div>
      {archive.next && <div ref={more} className='py-6'><span className='mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-px-border border-t-px-muted' /></div>}

      {viewing !== null && archive.items?.length > 0 && (
        <StoryItemsViewer
          items={archive.items}
          start={viewing}
          title={user.username || user.name}
          avatar={<Avatar width={32} height={32} name={user.name} imageUrl={user.profile_pic} />}
          onClose={() => setViewing(null)}
          menu={(item, done) => [
            { label : 'Highlight', bold : true, onClick : () => setAdding(item) },
            { label : 'Delete', danger : true, onClick : () => setConfirm({ item, done }) },
          ]}
        />
      )}
      {adding && (
        <ActionSheet title='Add to highlight' onClose={() => setAdding(null)} items={[
          ...highlights.map((h) => ({ label : h.title, onClick : () => addTo(h, adding) })),
          { label : 'New highlight', bold : true, icon : <IoAdd size={18} />, onClick : () => setCreating([adding._id]) },
        ]} />
      )}
      {confirm && (
        <ActionSheet title='Delete this story? It will also be removed from your highlights.' onClose={() => setConfirm(null)} items={[
          { label : 'Delete', danger : true, onClick : () => { confirm.done.remove(); remove(confirm.item) } },
        ]} />
      )}
      {creating && <HighlightEditor preselect={creating} onClose={() => setCreating(null)} onSaved={loadHighlights} />}
    </div>
  )
}

/* ---------------- Close friends ---------------- */

export const PixifyCloseFriends = () => {
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState({})

  useEffect(() => {
    const t = setTimeout(() => api.get(`/close-friends${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(setData).catch((e) => { notifyError(e.message); setData((d) => d || { closeFriends : [], followers : [], count : 0, max : 500 }) }), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q])

  const toggle = async (p) => {
    if (busy[p._id]) return
    const add = !p.closeFriend
    setBusy((b) => ({ ...b, [p._id] : true }))
    try {
      await api.post(`/close-friends/${p._id}`, { add })
      setData((d) => {
        const set = (x) => (x._id === p._id ? { ...x, closeFriend : add } : x)
        const closeFriends = add ? [{ ...p, closeFriend : true }, ...d.closeFriends.filter((x) => x._id !== p._id)] : d.closeFriends.filter((x) => x._id !== p._id)
        return { ...d, count : d.count + (add ? 1 : -1), closeFriends, followers : d.followers.map(set) }
      })
    } catch (e) { notifyError(e.message) }
    setBusy((b) => ({ ...b, [p._id] : false }))
  }

  const Row = ({ p }) => (
    <div className='flex items-center gap-3 py-2'>
      <Link to={`/pixify/u/${p.username || p._id}`} className='flex min-w-0 flex-1 items-center gap-3'>
        <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
        <span className='min-w-0'><span className='block truncate text-sm font-semibold'>{p.username || p.name}</span><span className='block truncate text-sm text-px-muted'>{p.profileName || p.name}</span></span>
      </Link>
      <button onClick={() => toggle(p)} disabled={busy[p._id]} role='checkbox' aria-checked={!!p.closeFriend} aria-label={`${p.closeFriend ? 'Remove' : 'Add'} ${p.username || p.name} ${p.closeFriend ? 'from' : 'to'} Close friends`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-60 ${p.closeFriend ? 'border-transparent text-white' : 'border-px-border'}`}
        style={p.closeFriend ? { backgroundColor : CLOSE_FRIENDS_GREEN } : undefined}>
        {p.closeFriend && <IoCheckmark size={17} />}
      </button>
    </div>
  )

  const others = (data?.followers || []).filter((p) => !p.closeFriend)
  return (
    <div className='mx-auto max-w-[935px] pb-10 md:px-5 md:pt-8'>
      <PageHeader title='Close friends' />
      <div className='mx-auto max-w-[600px] px-4 md:px-0'>
        <div className='flex items-start gap-3 py-4'>
          <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white' style={{ backgroundColor : CLOSE_FRIENDS_GREEN }}><IoStar size={22} /></span>
          <p className='text-sm text-px-muted'>Choose who sees stories you share with Close friends. They'll see a green ring around your story. Nobody is told when you add or remove them. You can add people who follow you (up to {data?.max || 500}).</p>
        </div>
        <label className='flex h-9 items-center gap-2 rounded-lg bg-px-raised px-3'>
          <IoSearch className='shrink-0 text-px-muted' size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search' aria-label='Search followers' className='min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-px-muted' />
          {q && <button onClick={() => setQ('')} title='Clear'><IoClose size={16} /></button>}
        </label>
        {data === null && <span className='mx-auto mt-10 block h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
        {data && (
          <>
            <h2 className='mt-5 text-base font-bold'>Your list <span className='font-normal text-px-muted'>· {data.count}</span></h2>
            {data.closeFriends.length === 0 && <p className='py-3 text-sm text-px-muted'>{q ? 'No matches in your list.' : "You haven't added anyone yet."}</p>}
            {data.closeFriends.map((p) => <Row key={p._id} p={p} />)}
            <h2 className='mt-5 text-base font-bold'>Followers</h2>
            {others.length === 0 && <p className='py-3 text-sm text-px-muted'>{q ? 'No followers match your search.' : data.followers.length ? 'Everyone who follows you is on your list.' : 'When people follow you, you can add them here.'}</p>}
            {others.map((p) => <Row key={p._id} p={p} />)}
          </>
        )}
      </div>
    </div>
  )
}
