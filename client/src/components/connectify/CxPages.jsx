import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  IoAdd, IoFlag, IoCheckmark, IoCamera, IoClose, IoEllipsisHorizontal, IoSearchOutline, IoPencil, IoInformationCircle, IoLocationSharp,
  IoGlobeOutline, IoMail, IoCall, IoPeople, IoShieldCheckmark, IoTime, IoPersonAdd,
} from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, enc, usePaged, uploadMedia, compact, longAgo } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { Modal, ActionSheet } from '../social/common'
import { PeoplePicker } from '../social/extras'
import { useConnectify, Card } from './ConnectifyLayout'
import { Spinner, Btn, Tabs, field, useFriends, PostList, CoverPicker } from './ConnectifyMore'
import { PageAvatar, pageLink } from './CxPost'

// Facebook-style Pages: the Pages hub (yours / followed / discover), creating and editing a Page,
// the Page itself (cover, picture, Follow, Posts / About) and its admins.

const followers = (n) => `${compact(n)} follower${n === 1 ? '' : 's'}`

const useCategories = () => {
  const [list, setList] = useState([])
  useEffect(() => { api.get('/pages/categories').then((r) => setList(r.categories)).catch(() => {}) }, [])
  return list
}

// round profile-picture picker
const AvatarPicker = ({ value, onChange }) => {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const pick = async (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return notifyError('Choose a photo')
    setBusy(true)
    try { onChange((await uploadMedia([f]))[0].url) } catch (e) { notifyError(e.message) }
    setBusy(false)
  }
  return (
    <div className='mt-2 flex items-center gap-3'>
      <PageAvatar page={{ avatar : value }} size={72} />
      <div className='flex flex-wrap gap-2'>
        <Btn type='button' onClick={() => input.current?.click()} disabled={busy}><IoCamera />{busy ? 'Uploading…' : value ? 'Change picture' : 'Add profile picture'}</Btn>
        {value && !busy && <Btn type='button' onClick={() => onChange('')}>Remove</Btn>}
      </div>
      <input ref={input} type='file' accept='image/*' className='hidden' onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

const EMPTY = { name : '', category : '', bio : '', avatar : '', cover : '', website : '', location : '', email : '', phone : '' }

// create (no `page`) or edit a Page
const PageForm = ({ page, onClose, onSaved }) => {
  const categories = useCategories()
  const [form, setForm] = useState(page ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, page[k] || ''])) : EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k] : e.target.value }))
  const save = async () => {
    setBusy(true)
    try {
      const r = page ? await api.patch(`/pages/${page._id}`, form) : await api.post('/pages', form)
      onSaved(r.page)
    } catch (e) { notifyError(e.message); setBusy(false) }
  }
  const title = page ? 'Edit Page' : 'Create a Page'
  return (
    <Modal onClose={() => !busy && onClose()} closeButton={false} label={title} className='flex h-[100dvh] w-full flex-col overflow-hidden bg-cx-card text-cx-text sm:h-auto sm:max-h-[92dvh] sm:max-w-[540px] sm:rounded-lg'>
      <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>
        {title}
        <button onClick={onClose} className='absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input hover:brightness-95' title='Close' aria-label='Close'><IoClose size={20} /></button>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>
        {!page && <p className='mb-3 text-[15px] text-cx-muted'>Your Page is where people go to learn more about you. Make sure it has all the information they may need.</p>}
        <label className='block font-semibold'>Page name (required)
          <input autoFocus={!page} value={form.name} onChange={set('name')} maxLength={75} placeholder='Use the name of your business, brand or organisation' className={`${field} h-11 font-normal`} />
        </label>
        <label className='mt-3 block font-semibold'>Category (required)
          <select value={form.category} onChange={set('category')} className={`${field} h-11 font-normal`}>
            <option value='' disabled>Choose a category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className='mt-3 block font-semibold'>Bio (optional)
          <textarea value={form.bio} onChange={set('bio')} maxLength={255} rows={3} placeholder='Tell people what your Page is about' className={`${field} resize-none py-2 font-normal`} />
          <span className='block text-right text-xs font-normal text-cx-muted'>{form.bio.length}/255</span>
        </label>
        <p className='mt-2 font-semibold'>Profile picture</p>
        <AvatarPicker value={form.avatar} onChange={(avatar) => setForm((f) => ({ ...f, avatar }))} />
        <p className='mt-4 font-semibold'>Cover photo</p>
        <CoverPicker value={form.cover} onChange={(cover) => setForm((f) => ({ ...f, cover }))} />
        {form.cover && <button type='button' onClick={() => setForm((f) => ({ ...f, cover : '' }))} className='mt-1 text-sm font-semibold text-cx-blue'>Remove cover photo</button>}
        <p className='mt-4 text-[17px] font-bold'>Contact and location</p>
        <label className='mt-2 block font-semibold'>Website<input value={form.website} onChange={set('website')} maxLength={200} inputMode='url' placeholder='example.com' className={`${field} h-11 font-normal`} /></label>
        <label className='mt-3 block font-semibold'>Location<input value={form.location} onChange={set('location')} maxLength={120} placeholder='City, address or area' className={`${field} h-11 font-normal`} /></label>
        <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <label className='block font-semibold'>Email<input type='email' value={form.email} onChange={set('email')} maxLength={120} className={`${field} h-11 font-normal`} /></label>
          <label className='block font-semibold'>Phone<input type='tel' value={form.phone} onChange={set('phone')} maxLength={30} className={`${field} h-11 font-normal`} /></label>
        </div>
      </div>
      <div className='flex shrink-0 justify-end gap-2 border-t border-cx-border p-3'>
        {page && <Btn onClick={onClose}>Cancel</Btn>}
        <Btn primary className={page ? '' : 'w-full'} onClick={save} disabled={!form.name.trim() || !form.category || busy}>{page ? 'Save' : 'Create Page'}</Btn>
      </div>
    </Modal>
  )
}

const FollowButton = ({ page, onChange, className = '' }) => {
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try { const r = await api.post(`/pages/${page._id}/follow`, { follow : !page.following }); onChange(r.page); if (r.page.following) notify(`You're now following ${r.page.name}`) } catch (e) { notifyError(e.message) }
    setBusy(false)
  }
  return page.following
    ? <Btn onClick={toggle} disabled={busy} className={className} aria-pressed='true'><IoCheckmark size={18} />Following</Btn>
    : <Btn primary onClick={toggle} disabled={busy} className={className} aria-pressed='false'><IoFlag size={16} />Follow</Btn>
}

const PageRow = ({ p, onChange }) => (
  <div className='flex items-center gap-3 rounded-lg p-2 hover:bg-cx-hover'>
    <Link to={pageLink(p)}><PageAvatar page={p} size={56} /></Link>
    <Link to={pageLink(p)} className='min-w-0 flex-1'>
      <span className='block truncate text-[15px] font-semibold'>{p.name}</span>
      <span className='block truncate text-[13px] text-cx-muted'>{p.category} · {followers(p.followerCount)}</span>
      {p.isAdmin && p.lastPostAt && <span className='block truncate text-[13px] text-cx-muted'>Last post {longAgo(p.lastPostAt)}</span>}
    </Link>
    {!p.isAdmin && onChange && <FollowButton page={p} onChange={onChange} className='shrink-0' />}
  </div>
)

export const ConnectifyPagesHub = () => {
  const navigate = useNavigate()
  const [tab, setTab] = useState('yours')
  const [q, setQ] = useState('')
  const [pages, setPages] = useState(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    setPages(null)
    const t = setTimeout(() => api.get(`/pages?tab=${tab}${tab === 'discover' && q.trim() ? `&q=${enc(q.trim())}` : ''}`).then((r) => setPages(r.pages)).catch(() => setPages([])), tab === 'discover' ? 250 : 0)
    return () => clearTimeout(t)
  }, [tab, q])
  const replace = (p) => setPages((l) => l.map((x) => (x._id === p._id ? p : x)))
  const empty = { yours : "You don't manage any Pages yet. Create one for your business, brand or community.", followed : "You aren't following any Pages yet. Find some in Discover.", discover : 'No Pages found.' }[tab]
  return (
    <div className='mx-auto max-w-[680px] px-0 py-4 sm:px-4'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-3 px-3 sm:px-0'>
        <h1 className='text-2xl font-bold'>Pages</h1>
        <Btn primary onClick={() => setCreating(true)}><IoAdd size={18} />Create new Page</Btn>
      </div>
      <Tabs tabs={[['yours', 'Your Pages'], ['followed', 'Followed Pages'], ['discover', 'Discover']]} value={tab} onChange={setTab} />
      {tab === 'discover' && (
        <div className='mx-3 mb-3 flex items-center gap-2 rounded-full bg-cx-input px-3 sm:mx-0'>
          <IoSearchOutline className='text-cx-muted' />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search Pages by name or category' aria-label='Search Pages' className='h-10 min-w-0 flex-1 bg-transparent outline-none' />
        </div>
      )}
      <Card className='p-2'>
        {tab === 'discover' && pages?.length > 0 && <p className='px-2 pb-1 pt-1 text-[17px] font-bold'>{q.trim() ? 'Results' : 'Popular Pages'}</p>}
        {pages === null && <Spinner />}
        {pages?.length === 0 && (
          <div className='px-4 py-10 text-center'>
            <IoFlag size={40} className='mx-auto text-cx-muted' />
            <p className='mt-2 text-cx-muted'>{empty}</p>
            {tab === 'yours' && <Btn primary className='mx-auto mt-4' onClick={() => setCreating(true)}><IoAdd size={18} />Create new Page</Btn>}
          </div>
        )}
        {pages?.map((p) => <PageRow key={p._id} p={p} onChange={tab === 'followed' ? (x) => (x.following ? replace(x) : setPages((l) => l.filter((y) => y._id !== x._id))) : replace} />)}
      </Card>
      {creating && <PageForm onClose={() => setCreating(false)} onSaved={(p) => { setCreating(false); notify('Page created'); navigate(pageLink(p)) }} />}
    </div>
  )
}

// admins (admins only): add friends, remove admins (a Page always keeps one)
const AdminsModal = ({ page, onClose, onChange }) => {
  const [people, setPeople] = useState(null)
  const [picking, setPicking] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const { friends, load : loadFriends } = useFriends()
  const load = useCallback(() => api.get(`/pages/${page._id}/admins`).then((r) => setPeople(r.people)).catch((e) => { notifyError(e.message); setPeople([]) }), [page._id])
  useEffect(() => { load() }, [load])
  const add = async (list) => {
    setPicking(false)
    let last = null
    for (const p of list) {
      try { last = (await api.post(`/pages/${page._id}/admins`, { userId : p._id })).page } catch (e) { notifyError(`${p.name}: ${e.message}`) }
    }
    if (last) { onChange(last); notify(list.length > 1 ? 'Admins added' : `${list[0].name} is now an admin`) }
    load()
  }
  const remove = async (p) => {
    try {
      const r = await api.del(`/pages/${page._id}/admins/${p._id}`)
      if (p.self) { notify("You're no longer an admin of this Page"); onChange(r.page || { ...page, isAdmin : false }); onClose(); return }
      onChange(r.page); notify(`${p.name} was removed as admin`); load()
    } catch (e) { notifyError(e.message) }
  }
  const ids = new Set((people || []).map((p) => p._id))
  return (
    <Modal onClose={onClose} closeButton={false} label='Page admins' className='flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-lg bg-cx-card text-cx-text'>
      <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>
        Page admins
        <button onClick={onClose} className='absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input hover:brightness-95' title='Close' aria-label='Close'><IoClose size={20} /></button>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto p-2'>
        <p className='px-2 pb-2 text-sm text-cx-muted'>Admins can post as the Page, edit it, manage admins and delete it.</p>
        {people === null && <Spinner />}
        {people?.map((p) => (
          <div key={p._id} className='flex items-center gap-3 rounded-lg p-2'>
            <Link to={`/connectify/u/${p.username || p._id}`} onClick={onClose}><Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} /></Link>
            <span className='min-w-0 flex-1'><span className='block truncate font-semibold'>{p.name}{p.self ? ' (you)' : ''}</span><span className='text-[13px] text-cx-muted'>{p.creator ? 'Created this Page' : 'Admin'}</span></span>
            <Btn onClick={() => setConfirm(p)} disabled={people.length < 2} title={people.length < 2 ? 'A Page needs at least one admin' : undefined}>{p.self ? 'Leave' : 'Remove'}</Btn>
          </div>
        ))}
      </div>
      <div className='shrink-0 border-t border-cx-border p-3'>
        <Btn primary className='w-full' onClick={async () => { await loadFriends(); setPicking(true) }}><IoPersonAdd />Add admin</Btn>
      </div>
      {picking && <PeoplePicker title='Add a friend as admin' app='connectify' t='cx' source={(friends || []).filter((f) => !ids.has(f._id))} max={10} doneLabel='Add' onClose={() => setPicking(false)} onDone={(l) => (l.length ? add(l) : setPicking(false))} />}
      {confirm && (
        <ActionSheet tone='cx' title={confirm.self ? "Stop being an admin? You won't be able to manage this Page." : `Remove ${confirm.name} as admin?`} onClose={() => setConfirm(null)}
          items={[{ label : confirm.self ? 'Leave as admin' : 'Remove', danger : true, onClick : () => remove(confirm) }]} />
      )}
    </Modal>
  )
}

const InfoRow = ({ Icon, children }) => (
  <p className='flex items-start gap-3 py-1.5 text-[15px]'><Icon size={20} className='mt-0.5 shrink-0 text-cx-muted' /><span className='min-w-0 flex-1 break-words'>{children}</span></p>
)

const PageDetails = ({ page, full }) => (
  <>
    {page.bio && <p className={`whitespace-pre-wrap break-words text-[15px] ${full ? 'mb-2' : 'mb-3 text-center'}`}>{page.bio}</p>}
    <InfoRow Icon={IoInformationCircle}><b>Page</b> · {page.category}</InfoRow>
    {page.location && <InfoRow Icon={IoLocationSharp}>{page.location}</InfoRow>}
    {page.phone && <InfoRow Icon={IoCall}><a href={`tel:${page.phone.replace(/[^+\d]/g, '')}`} className='hover:underline'>{page.phone}</a></InfoRow>}
    {page.email && <InfoRow Icon={IoMail}><a href={`mailto:${page.email}`} className='text-cx-blue hover:underline'>{page.email}</a></InfoRow>}
    {page.website && <InfoRow Icon={IoGlobeOutline}><a href={page.website} target='_blank' rel='noopener noreferrer nofollow' className='text-cx-blue hover:underline'>{page.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></InfoRow>}
    <InfoRow Icon={IoPeople}>{followers(page.followerCount)}</InfoRow>
    {full && <InfoRow Icon={IoTime}>Created {new Date(page.createdAt).toLocaleDateString(undefined, { month : 'long', day : 'numeric', year : 'numeric' })}</InfoRow>}
  </>
)

export const ConnectifyPage = () => {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const { openComposer, version } = useConnectify()
  const [page, setPage] = useState(undefined)
  const [tab, setTab] = useState('posts')
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [admins, setAdmins] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const load = useCallback(() => api.get(`/pages/${pageId}`).then((r) => setPage(r.page)).catch(() => setPage(null)), [pageId])
  useEffect(() => { setPage(undefined); setTab('posts'); load() }, [load])
  const posts = usePaged(page ? `/pages/${pageId}/posts?v=${version}` : null)

  if (page === undefined) return <Spinner />
  if (page === null) return <div className='px-6 py-20 text-center'><IoFlag size={44} className='mx-auto text-cx-muted' /><h2 className='mt-2 text-xl font-bold'>This Page isn't available</h2><p className='text-cx-muted'>The link may be broken, or the Page may have been removed.</p><Link to='/connectify/pages' className='mt-4 inline-block font-semibold text-cx-blue'>Go to Pages</Link></div>
  const remove = async () => { try { await api.del(`/pages/${page._id}`); notify('Page deleted'); navigate('/connectify/pages') } catch (e) { notifyError(e.message) } }
  const composerBox = page.isAdmin && (
    <Card className='mb-4 p-3'>
      <div className='flex items-center gap-2'>
        <PageAvatar page={page} size={40} />
        <button onClick={() => openComposer({ page })} className='h-10 min-w-0 flex-1 truncate rounded-full bg-cx-input px-4 text-left text-cx-muted hover:brightness-95'>What's on your mind?</button>
      </div>
      <div className='mt-2 flex border-t border-cx-border pt-2'>
        <button onClick={() => openComposer({ page, withPhotos : true })} className='flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoCamera size={20} className='text-[#45bd62]' />Photo/video</button>
        <button onClick={() => openComposer({ page })} className='flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoPencil size={18} className='text-cx-blue' />Create post</button>
      </div>
    </Card>
  )

  return (
    <div className='pb-10'>
      <div className='bg-cx-card shadow-[0_1px_2px_rgba(0,0,0,.1)]'>
        <div className='mx-auto max-w-[940px]'>
          <div className='h-[160px] overflow-hidden bg-gradient-to-br from-cx-blue/50 to-[#f7923b]/50 sm:h-[300px] sm:rounded-b-lg'>{page.cover && <img src={page.cover} alt='' className='h-full w-full object-cover' />}</div>
          <div className='px-4 pb-4 sm:px-8'>
            <div className='flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:text-left'>
              <PageAvatar page={page} size={168} className='-mt-[84px] shrink-0 ring-4 ring-cx-card' />
              <div className='min-w-0 flex-1 pb-1'>
                <h1 className='break-words text-[28px] font-bold leading-tight sm:text-[32px]'>{page.name}</h1>
                <p className='text-[15px] text-cx-muted'><b className='text-cx-text'>{compact(page.followerCount)}</b> follower{page.followerCount === 1 ? '' : 's'}</p>
                <p className='text-[15px] text-cx-muted'>{page.category}</p>
              </div>
              <div className='flex flex-wrap justify-center gap-2 pb-1'>
                {page.isAdmin
                  ? <>
                      <Btn primary onClick={() => openComposer({ page })}><IoAdd size={18} />Create post</Btn>
                      <Btn onClick={() => setEditing(true)}><IoPencil />Edit page</Btn>
                    </>
                  : <FollowButton page={page} onChange={setPage} />}
                {page.isAdmin && <Btn onClick={() => setMenu(true)} title='More' aria-label='More options'><IoEllipsisHorizontal size={18} /></Btn>}
              </div>
            </div>
          </div>
          <nav className='mx-4 flex border-t border-cx-border sm:mx-8'>
            {[['posts', 'Posts'], ['about', 'About']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`relative px-4 py-4 text-[15px] font-semibold ${tab === id ? 'text-cx-blue' : 'text-cx-muted hover:bg-cx-hover'}`}>{label}{tab === id && <span className='absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-cx-blue' />}</button>
            ))}
          </nav>
        </div>
      </div>

      {tab === 'posts' && (
        <div className='mx-auto mt-4 grid max-w-[940px] grid-cols-1 gap-4 sm:px-4 lg:grid-cols-[360px_minmax(0,1fr)]'>
          <div className='min-w-0'>
            <Card className='p-4 lg:sticky lg:top-4'>
              <h2 className='mb-2 text-xl font-bold'>Intro</h2>
              <PageDetails page={page} />
            </Card>
          </div>
          <div className='min-w-0'>
            {composerBox}
            <PostList paged={posts} empty={page.isAdmin ? 'Create your first post to share with your followers.' : 'No posts yet.'} />
          </div>
        </div>
      )}
      {tab === 'about' && (
        <div className='mx-auto mt-4 max-w-[680px] sm:px-4'>
          <Card className='p-4'>
            <h2 className='mb-2 text-xl font-bold'>About</h2>
            <PageDetails page={page} full />
            {page.isAdmin && <InfoRow Icon={IoShieldCheckmark}>{page.adminCount} admin{page.adminCount === 1 ? '' : 's'} · <button onClick={() => setAdmins(true)} className='font-semibold text-cx-blue hover:underline'>Manage</button></InfoRow>}
          </Card>
        </div>
      )}

      {menu && (
        <ActionSheet tone='cx' onClose={() => setMenu(false)} items={[
          { label : 'Edit page', onClick : () => setEditing(true) },
          { label : 'Admins', onClick : () => setAdmins(true) },
          { label : 'Delete page', danger : true, onClick : () => setConfirmDelete(true) },
        ]} />
      )}
      {confirmDelete && <ActionSheet tone='cx' title='Delete this Page and all its posts? You can’t undo this.' onClose={() => setConfirmDelete(false)} items={[{ label : 'Delete page', danger : true, onClick : remove }]} />}
      {editing && <PageForm page={page} onClose={() => setEditing(false)} onSaved={(p) => { setPage(p); setEditing(false); notify('Page updated') }} />}
      {admins && <AdminsModal page={page} onClose={() => setAdmins(false)} onChange={(p) => { setPage(p); if (!p.isAdmin) posts.reload() }} />}
    </div>
  )
}
