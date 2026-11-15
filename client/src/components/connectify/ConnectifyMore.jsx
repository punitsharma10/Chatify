import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  IoPeople, IoAdd, IoEarth, IoLockClosed, IoCalendar, IoLocationSharp, IoStar, IoStarOutline, IoCheckmarkCircle, IoCheckmarkCircleOutline,
  IoStorefront, IoBookmark, IoBookmarkOutline, IoChatbubbleEllipses, IoCamera, IoClose, IoArrowBack, IoGift, IoHandLeft, IoTime, IoPlayCircle, IoSearchOutline, IoPersonAdd,
} from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, enc, usePaged, useOnVisible, uploadMedia, longAgo, compact } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { Modal, ActionSheet, MediaThumb, PeopleModal } from '../social/common'
import { PeoplePicker } from '../social/extras'
import { useConnectify, Card } from './ConnectifyLayout'
import { CxPostCard } from './CxPost'

// Facebook-style Groups, Events, Marketplace, Watch, Memories, Saved, Birthdays, Pokes and #hashtags.

const userLink = (p) => `/connectify/u/${p.username || p._id}`
const Spinner = () => <span className='mx-auto my-10 block h-7 w-7 animate-spin rounded-full border-2 border-cx-border border-t-cx-muted' />
const Btn = ({ primary, className = '', ...rest }) => <button className={`flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[15px] font-semibold disabled:opacity-50 ${primary ? 'bg-cx-blue text-white hover:brightness-95' : 'bg-cx-input hover:brightness-95'} ${className}`} {...rest} />
const Page = ({ title, action, children, wide }) => (
  <div className={`mx-auto px-0 py-4 sm:px-4 ${wide ? 'max-w-[1100px]' : 'max-w-[680px]'}`}>
    <div className='mb-3 flex items-center justify-between gap-3 px-3 sm:px-0'><h1 className='text-2xl font-bold'>{title}</h1>{action}</div>
    {children}
  </div>
)
const Tabs = ({ tabs, value, onChange }) => (
  <div className='mb-3 flex gap-2 overflow-x-auto px-3 scrollbar-none sm:px-0'>
    {tabs.map(([id, label]) => <button key={id} onClick={() => onChange(id)} className={`h-9 shrink-0 rounded-full px-4 text-[15px] font-semibold ${value === id ? 'bg-cx-blue/15 text-cx-blue' : 'bg-cx-input hover:brightness-95'}`}>{label}</button>)}
  </div>
)
const field = 'mt-1 w-full rounded-md border border-cx-border bg-cx-input px-3 outline-none focus:border-cx-blue'
const useFriends = () => {
  const me = useSelector((s) => s.user)
  const [friends, setFriends] = useState(null)
  const load = useCallback(async () => {
    if (friends) return friends
    try { const r = await api.get(`/users/${me._id}/friends`); const list = r.people.filter((p) => !p.self); setFriends(list); return list } catch { setFriends([]); return [] }
  }, [friends, me._id])
  return { friends, load }
}
const PostList = ({ paged, empty, inGroup }) => {
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  return (
    <>
      {paged.items.map((p) => <CxPostCard key={p._id} post={p} inGroup={inGroup} onDeleted={(d) => paged.setItems((l) => l.filter((x) => x._id !== d._id))} onHidden={(d) => paged.setItems((l) => l.filter((x) => x._id !== d._id))} />)}
      {paged.loading && <Spinner />}
      {!paged.loading && !paged.items.length && <Card className='p-8 text-center text-cx-muted'>{empty}</Card>}
      <div ref={more} />
    </>
  )
}
const CoverPicker = ({ value, onChange, label = 'Add cover photo' }) => {
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
    <div className='relative mt-2 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-cx-input'>
      {value && <img src={value} alt='' className='absolute inset-0 h-full w-full object-cover' />}
      <button type='button' onClick={() => input.current?.click()} disabled={busy} className='relative flex h-9 items-center gap-2 rounded-md bg-white/90 px-3 text-sm font-semibold text-black shadow'><IoCamera />{busy ? 'Uploading…' : value ? 'Change photo' : label}</button>
      <input ref={input} type='file' accept='image/*' className='hidden' onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

/* ================= Groups ================= */

const GroupCard = ({ g }) => (
  <Link to={`/connectify/groups/${g._id}`} className='flex items-center gap-3 rounded-lg p-2 hover:bg-cx-hover'>
    <span className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cx-input'>{g.cover ? <img src={g.cover} alt='' className='h-full w-full object-cover' /> : <IoPeople size={26} className='text-cx-muted' />}</span>
    <span className='min-w-0 flex-1'>
      <span className='block truncate text-[15px] font-semibold'>{g.name}</span>
      <span className='flex items-center gap-1 text-[13px] text-cx-muted'>{g.privacy === 'private' ? <IoLockClosed size={11} /> : <IoEarth size={11} />}{g.privacy === 'private' ? 'Private' : 'Public'} group · {compact(g.memberCount)} member{g.memberCount === 1 ? '' : 's'}</span>
      {g.lastPostAt && <span className='block text-[13px] text-cx-muted'>Last active {longAgo(g.lastPostAt)}</span>}
    </span>
  </Link>
)

const CreateGroup = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name : '', description : '', privacy : 'public', cover : '' })
  const [invite, setInvite] = useState([])
  const [picking, setPicking] = useState(false)
  const { friends, load } = useFriends()
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try { const r = await api.post('/groups', { ...form, invite : invite.map((p) => p._id) }); onCreated(r.group) } catch (e) { notifyError(e.message); setBusy(false) }
  }
  return (
    <Modal onClose={onClose} closeButton={false} label='Create group' className='flex max-h-[95dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-lg bg-cx-card text-cx-text'>
      <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>Create group<button onClick={onClose} className='absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input' title='Close'><IoClose size={20} /></button></header>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>
        <label className='block font-semibold'>Group name<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name : e.target.value })} maxLength={75} className={`${field} h-11 font-normal`} /></label>
        <label className='mt-3 block font-semibold'>Choose privacy
          <select value={form.privacy} onChange={(e) => setForm({ ...form, privacy : e.target.value })} className={`${field} h-11 font-normal`}>
            <option value='public'>Public: anyone can see who's in the group and what they post</option>
            <option value='private'>Private: only members can see who's in the group and what they post</option>
          </select>
        </label>
        <label className='mt-3 block font-semibold'>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description : e.target.value })} maxLength={1000} rows={3} className={`${field} resize-none py-2 font-normal`} /></label>
        <p className='mt-3 font-semibold'>Cover photo</p>
        <CoverPicker value={form.cover} onChange={(cover) => setForm({ ...form, cover })} />
        <button onClick={async () => { await load(); setPicking(true) }} className='mt-3 flex items-center gap-2 text-[15px] font-semibold text-cx-blue'><IoPersonAdd />{invite.length ? `${invite.length} friend${invite.length > 1 ? 's' : ''} invited` : 'Invite friends (optional)'}</button>
      </div>
      <div className='shrink-0 border-t border-cx-border p-3'><Btn primary className='w-full' onClick={create} disabled={!form.name.trim() || busy}>Create</Btn></div>
      {picking && <PeoplePicker title='Invite friends' app='connectify' t='cx' source={friends || []} initial={invite} max={100} onClose={() => setPicking(false)} onDone={(l) => { setInvite(l); setPicking(false) }} />}
    </Modal>
  )
}

export const ConnectifyGroups = () => {
  const navigate = useNavigate()
  const [tab, setTab] = useState('yours')
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    setGroups(null)
    const t = setTimeout(() => api.get(`/groups?tab=${tab}${tab === 'discover' && q.trim() ? `&q=${enc(q.trim())}` : ''}`).then((r) => setGroups(r.groups)).catch(() => setGroups([])), tab === 'discover' ? 250 : 0)
    return () => clearTimeout(t)
  }, [tab, q])
  return (
    <Page title='Groups' action={<Btn primary onClick={() => setCreating(true)}><IoAdd size={18} />Create new group</Btn>}>
      <Tabs tabs={[['yours', 'Your groups'], ['discover', 'Discover']]} value={tab} onChange={setTab} />
      {tab === 'discover' && <div className='mx-3 mb-3 flex items-center gap-2 rounded-full bg-cx-input px-3 sm:mx-0'><IoSearchOutline className='text-cx-muted' /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search groups' className='h-10 flex-1 bg-transparent outline-none' /></div>}
      <Card className='p-2'>
        {groups === null && <Spinner />}
        {groups?.length === 0 && <p className='py-10 text-center text-cx-muted'>{tab === 'yours' ? "You haven't joined any groups yet. Discover groups or create your own." : 'No groups found.'}</p>}
        {groups?.map((g) => <GroupCard key={g._id} g={g} />)}
      </Card>
      {creating && <CreateGroup onClose={() => setCreating(false)} onCreated={(g) => { setCreating(false); notify('Group created'); navigate(`/connectify/groups/${g._id}`) }} />}
    </Page>
  )
}

export const ConnectifyGroup = () => {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { openComposer, version } = useConnectify()
  const [group, setGroup] = useState(undefined)
  const [tab, setTab] = useState('discussion')
  const [members, setMembers] = useState(null)
  const [requests, setRequests] = useState(null)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(null) // member menu
  const [inviting, setInviting] = useState(false)
  const { friends, load : loadFriends } = useFriends()
  const load = useCallback(() => api.get(`/groups/${groupId}`).then((r) => setGroup(r.group)).catch(() => setGroup(null)), [groupId])
  useEffect(() => { setGroup(undefined); setTab('discussion'); load() }, [load])
  const posts = usePaged(group?.canSeePosts ? `/groups/${groupId}/posts?v=${version}` : null)
  useEffect(() => {
    if (tab === 'members') api.get(`/groups/${groupId}/members`).then((r) => setMembers(r.people)).catch(() => setMembers([]))
    if (tab === 'requests') api.get(`/groups/${groupId}/requests`).then((r) => setRequests(r.people)).catch(() => setRequests([]))
  }, [tab, groupId])
  const act = async (url, body, text, after) => { try { const r = await api.post(url, body); if (r.group) setGroup(r.group); if (text) notify(text); after?.(r) } catch (e) { notifyError(e.message) } }

  if (group === undefined) return <Spinner />
  if (group === null) return <div className='px-6 py-20 text-center'><h2 className='text-xl font-bold'>This group isn't available</h2><Link to='/connectify/groups' className='mt-4 inline-block font-semibold text-cx-blue'>Go to Groups</Link></div>
  const admin = group.role === 'admin'
  return (
    <div className='pb-10'>
      <div className='bg-cx-card shadow-[0_1px_2px_rgba(0,0,0,.1)]'>
        <div className='mx-auto max-w-[940px]'>
          <div className='h-[180px] overflow-hidden bg-gradient-to-br from-cx-blue/60 to-[#8a3ffc]/60 sm:h-[300px] sm:rounded-b-lg'>{group.cover && <img src={group.cover} alt='' className='h-full w-full object-cover' />}</div>
          <div className='px-4 py-4 sm:px-8'>
            <h1 className='text-[28px] font-bold leading-tight'>{group.name}</h1>
            <p className='mt-1 flex items-center gap-1 text-[15px] text-cx-muted'>{group.privacy === 'private' ? <IoLockClosed /> : <IoEarth />}{group.privacy === 'private' ? 'Private' : 'Public'} group · <b>{compact(group.memberCount)}</b> member{group.memberCount === 1 ? '' : 's'}</p>
            <div className='mt-3 flex flex-wrap gap-2'>
              {group.role
                ? <>
                    <Btn primary onClick={async () => { await loadFriends(); setInviting(true) }}><IoAdd size={18} />Invite</Btn>
                    {admin && <Btn onClick={() => setEditing(true)}>Edit group</Btn>}
                    <Btn onClick={() => act(`/groups/${groupId}/leave`, {}, 'You left the group', () => navigate('/connectify/groups'))}>Leave group</Btn>
                  </>
                : group.requested
                  ? <Btn onClick={() => act(`/groups/${groupId}/cancel`, {}, 'Request cancelled')}>Cancel request</Btn>
                  : <Btn primary onClick={() => act(`/groups/${groupId}/join`, {}, group.privacy === 'private' ? 'Request sent to the admins' : 'You joined the group')}><IoPeople />Join group</Btn>}
            </div>
          </div>
          <nav className='mx-4 flex border-t border-cx-border sm:mx-8'>
            {[['discussion', 'Discussion'], ['about', 'About'], ['members', 'Members'], ...(admin ? [['requests', `Requests${group.requestCount ? ` (${group.requestCount})` : ''}`]] : [])].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`relative px-4 py-4 text-[15px] font-semibold ${tab === id ? 'text-cx-blue' : 'text-cx-muted hover:bg-cx-hover'}`}>{label}{tab === id && <span className='absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-cx-blue' />}</button>
            ))}
          </nav>
        </div>
      </div>
      <div className='mx-auto mt-4 max-w-[680px] sm:px-4'>
        {tab === 'discussion' && (!group.canSeePosts
          ? <Card className='p-8 text-center'><IoLockClosed size={40} className='mx-auto text-cx-muted' /><p className='mt-2 text-lg font-bold'>This group is private</p><p className='text-cx-muted'>Join this group to view or take part in discussions.</p></Card>
          : <>
              {group.role && <Card className='mb-4 p-3'><button onClick={() => openComposer({ group })} className='h-10 w-full rounded-full bg-cx-input px-4 text-left text-cx-muted hover:brightness-95'>Write something…</button></Card>}
              <PostList paged={posts} inGroup empty='No posts yet. Start the conversation!' />
            </>)}
        {tab === 'about' && (
          <Card className='p-4'>
            <h2 className='text-xl font-bold'>About this group</h2>
            {group.description && <p className='mt-2 whitespace-pre-wrap text-[15px]'>{group.description}</p>}
            <p className='mt-3 flex items-start gap-3 text-[15px]'>{group.privacy === 'private' ? <IoLockClosed size={20} /> : <IoEarth size={20} />}<span><b>{group.privacy === 'private' ? 'Private' : 'Public'}</b><span className='block text-cx-muted'>{group.privacy === 'private' ? 'Only members can see who\'s in the group and what they post.' : 'Anyone can see who\'s in the group and what they post.'}</span></span></p>
            <p className='mt-3 flex items-center gap-3 text-[15px]'><IoTime size={20} />Created {new Date(group.createdAt).toLocaleDateString(undefined, { month : 'long', day : 'numeric', year : 'numeric' })}</p>
          </Card>
        )}
        {tab === 'members' && (
          <Card className='p-2'>
            {members === null && <Spinner />}
            {members?.map((p) => (
              <div key={p._id} className='flex items-center gap-3 rounded-lg p-2 hover:bg-cx-hover'>
                <Link to={userLink(p)}><Avatar width={48} height={48} name={p.name} imageUrl={p.profile_pic} /></Link>
                <Link to={userLink(p)} className='min-w-0 flex-1'><span className='block truncate font-semibold'>{p.name}</span><span className='text-[13px] text-cx-muted'>{p.role === 'admin' ? 'Admin' : `Joined ${longAgo(p.joinedAt)}`}</span></Link>
                {admin && !p.self && <Btn onClick={() => setMenu(p)}>Manage</Btn>}
              </div>
            ))}
          </Card>
        )}
        {tab === 'requests' && (
          <Card className='p-2'>
            {requests === null && <Spinner />}
            {requests?.length === 0 && <p className='py-8 text-center text-cx-muted'>No pending requests</p>}
            {requests?.map((p) => (
              <div key={p._id} className='flex items-center gap-3 rounded-lg p-2'>
                <Avatar width={48} height={48} name={p.name} imageUrl={p.profile_pic} />
                <span className='min-w-0 flex-1'><span className='block truncate font-semibold'>{p.name}</span><span className='text-[13px] text-cx-muted'>Requested {longAgo(p.at)}</span></span>
                <Btn primary onClick={() => act(`/groups/${groupId}/requests/${p._id}`, { approve : true }, `${p.name} joined`, () => setRequests((l) => l.filter((x) => x._id !== p._id)))}>Approve</Btn>
                <Btn onClick={() => act(`/groups/${groupId}/requests/${p._id}`, { approve : false }, 'Declined', () => setRequests((l) => l.filter((x) => x._id !== p._id)))}>Decline</Btn>
              </div>
            ))}
          </Card>
        )}
      </div>
      {menu && (
        <ActionSheet tone='cx' title={menu.name} onClose={() => setMenu(null)} items={[
          { label : menu.role === 'admin' ? 'Remove as admin' : 'Make admin', onClick : () => act(`/groups/${groupId}/members/${menu._id}`, { action : menu.role === 'admin' ? 'member' : 'admin' }, 'Updated', () => setMembers((l) => l.map((x) => (x._id === menu._id ? { ...x, role : menu.role === 'admin' ? 'member' : 'admin' } : x)))) },
          { label : 'Remove from group', danger : true, onClick : () => act(`/groups/${groupId}/members/${menu._id}`, { action : 'remove' }, 'Removed', () => { setMembers((l) => l.filter((x) => x._id !== menu._id)); load() }) },
        ]} />
      )}
      {inviting && <PeoplePicker title='Invite friends' app='connectify' t='cx' source={friends || []} max={100} doneLabel='Send invites' onClose={() => setInviting(false)} onDone={(l) => { setInviting(false); if (l.length) act(`/groups/${groupId}/invite`, { userIds : l.map((p) => p._id) }, `Invited ${l.length} friend${l.length > 1 ? 's' : ''}`) }} />}
      {editing && <EditGroup group={group} onClose={() => setEditing(false)} onSaved={(g) => { setGroup(g); setEditing(false) }} onDeleted={() => navigate('/connectify/groups')} />}
    </div>
  )
}

const EditGroup = ({ group, onClose, onSaved, onDeleted }) => {
  const [form, setForm] = useState({ name : group.name, description : group.description, privacy : group.privacy, cover : group.cover })
  const [confirm, setConfirm] = useState(false)
  const save = async () => { try { onSaved((await api.patch(`/groups/${group._id}`, form)).group); notify('Group updated') } catch (e) { notifyError(e.message) } }
  if (confirm) return <ActionSheet tone='cx' title='Delete this group and all its posts? You can’t undo this.' onClose={() => setConfirm(false)} items={[{ label : 'Delete group', danger : true, onClick : async () => { try { await api.del(`/groups/${group._id}`); notify('Group deleted'); onDeleted() } catch (e) { notifyError(e.message) } } }]} />
  return (
    <Modal onClose={onClose} closeButton={false} label='Edit group' className='flex max-h-[95dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-lg bg-cx-card text-cx-text'>
      <header className='flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>Edit group</header>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>
        <label className='block font-semibold'>Name<input value={form.name} onChange={(e) => setForm({ ...form, name : e.target.value })} maxLength={75} className={`${field} h-11 font-normal`} /></label>
        <label className='mt-3 block font-semibold'>Privacy<select value={form.privacy} onChange={(e) => setForm({ ...form, privacy : e.target.value })} className={`${field} h-11 font-normal`}><option value='public'>Public</option><option value='private'>Private</option></select></label>
        <label className='mt-3 block font-semibold'>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description : e.target.value })} maxLength={1000} rows={3} className={`${field} resize-none py-2 font-normal`} /></label>
        <CoverPicker value={form.cover} onChange={(cover) => setForm({ ...form, cover })} />
        <button onClick={() => setConfirm(true)} className='mt-4 text-[15px] font-semibold text-[#e41e3f]'>Delete group</button>
      </div>
      <div className='flex shrink-0 justify-end gap-2 border-t border-cx-border p-3'><Btn onClick={onClose}>Cancel</Btn><Btn primary onClick={save}>Save</Btn></div>
    </Modal>
  )
}

/* ================= Events ================= */

const dateBox = (d) => {
  const x = new Date(d)
  return <span className='flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-cx-input leading-tight'><span className='text-[11px] font-bold uppercase text-[#e41e3f]'>{x.toLocaleDateString(undefined, { month : 'short' })}</span><span className='text-xl font-bold'>{x.getDate()}</span></span>
}
const when = (e) => new Date(e.startsAt).toLocaleString(undefined, { weekday : 'short', month : 'short', day : 'numeric', hour : 'numeric', minute : '2-digit' })
const localInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16) }

const EventForm = ({ event, onClose, onSaved }) => {
  const [form, setForm] = useState(event
    ? { title : event.title, description : event.description, location : event.location, privacy : event.privacy, cover : event.cover, startsAt : localInput(event.startsAt), endsAt : event.endsAt ? localInput(event.endsAt) : '' }
    : { title : '', description : '', location : '', privacy : 'friends', cover : '', startsAt : localInput(Date.now() + 24 * 3600 * 1000), endsAt : '' })
  const [invite, setInvite] = useState([])
  const [picking, setPicking] = useState(false)
  const { friends, load } = useFriends()
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const body = { ...form, startsAt : new Date(form.startsAt).toISOString(), endsAt : form.endsAt ? new Date(form.endsAt).toISOString() : null }
      const r = event ? await api.patch(`/events/${event._id}`, body) : await api.post('/events', { ...body, invite : invite.map((p) => p._id) })
      onSaved(r.event)
    } catch (e) { notifyError(e.message); setBusy(false) }
  }
  return (
    <Modal onClose={onClose} closeButton={false} label='Event' className='flex max-h-[95dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-lg bg-cx-card text-cx-text'>
      <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>{event ? 'Edit event' : 'Create event'}<button onClick={onClose} className='absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input' title='Close'><IoClose size={20} /></button></header>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>
        <CoverPicker value={form.cover} onChange={(cover) => setForm({ ...form, cover })} />
        <label className='mt-3 block font-semibold'>Event name<input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title : e.target.value })} maxLength={100} className={`${field} h-11 font-normal`} /></label>
        <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <label className='block font-semibold'>Starts<input type='datetime-local' value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt : e.target.value })} className={`${field} h-11 font-normal`} /></label>
          <label className='block font-semibold'>Ends (optional)<input type='datetime-local' value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt : e.target.value })} className={`${field} h-11 font-normal`} /></label>
        </div>
        <label className='mt-3 block font-semibold'>Location<input value={form.location} onChange={(e) => setForm({ ...form, location : e.target.value })} maxLength={120} placeholder='Add a place or a link' className={`${field} h-11 font-normal`} /></label>
        <label className='mt-3 block font-semibold'>Who can see it?
          <select value={form.privacy} onChange={(e) => setForm({ ...form, privacy : e.target.value })} className={`${field} h-11 font-normal`}>
            <option value='public'>Public: anyone on Connectify</option><option value='friends'>Friends</option><option value='private'>Private: only people you invite</option>
          </select>
        </label>
        <label className='mt-3 block font-semibold'>Details<textarea value={form.description} onChange={(e) => setForm({ ...form, description : e.target.value })} maxLength={2000} rows={3} className={`${field} resize-none py-2 font-normal`} /></label>
        {!event && <button onClick={async () => { await load(); setPicking(true) }} className='mt-3 flex items-center gap-2 text-[15px] font-semibold text-cx-blue'><IoPersonAdd />{invite.length ? `${invite.length} friend${invite.length > 1 ? 's' : ''} invited` : 'Invite friends'}</button>}
      </div>
      <div className='shrink-0 border-t border-cx-border p-3'><Btn primary className='w-full' onClick={save} disabled={!form.title.trim() || !form.startsAt || busy}>{event ? 'Save' : 'Create event'}</Btn></div>
      {picking && <PeoplePicker title='Invite friends' app='connectify' t='cx' source={friends || []} initial={invite} max={100} onClose={() => setPicking(false)} onDone={(l) => { setInvite(l); setPicking(false) }} />}
    </Modal>
  )
}

const EventRow = ({ e }) => (
  <Link to={`/connectify/events/${e._id}`} className='flex items-center gap-3 rounded-lg p-2 hover:bg-cx-hover'>
    {e.cover ? <img src={e.cover} alt='' className='h-14 w-14 shrink-0 rounded-lg object-cover' /> : dateBox(e.startsAt)}
    <span className='min-w-0 flex-1'>
      <span className='block text-[13px] font-semibold text-[#e41e3f]'>{when(e)}</span>
      <span className='block truncate text-[15px] font-semibold'>{e.title}</span>
      <span className='block truncate text-[13px] text-cx-muted'>{e.location || (e.host ? `Hosted by ${e.host.name}` : '')} · {e.goingCount} going</span>
    </span>
    {e.myStatus && <span className='shrink-0 text-[13px] font-semibold text-cx-blue'>{e.myStatus === 'going' ? 'Going' : 'Interested'}</span>}
  </Link>
)

export const ConnectifyEvents = () => {
  const navigate = useNavigate()
  const [tab, setTab] = useState('upcoming')
  const [events, setEvents] = useState(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => { setEvents(null); api.get(`/events?tab=${tab}`).then((r) => setEvents(r.events)).catch(() => setEvents([])) }, [tab])
  return (
    <Page title='Events' action={<Btn primary onClick={() => setCreating(true)}><IoAdd size={18} />Create new event</Btn>}>
      <Tabs tabs={[['upcoming', 'Upcoming'], ['going', 'Going / interested'], ['hosting', 'Hosting'], ['past', 'Past']]} value={tab} onChange={setTab} />
      <Card className='p-2'>
        {events === null && <Spinner />}
        {events?.length === 0 && <p className='py-10 text-center text-cx-muted'>No events here yet.</p>}
        {events?.map((e) => <EventRow key={e._id} e={e} />)}
      </Card>
      {creating && <EventForm onClose={() => setCreating(false)} onSaved={(e) => { setCreating(false); notify('Event created'); navigate(`/connectify/events/${e._id}`) }} />}
    </Page>
  )
}

export const ConnectifyEvent = () => {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(undefined)
  const [editing, setEditing] = useState(false)
  const [guests, setGuests] = useState(undefined)
  const [inviting, setInviting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const { friends, load : loadFriends } = useFriends()
  useEffect(() => { api.get(`/events/${eventId}`).then((r) => setEvent(r.event)).catch(() => setEvent(null)) }, [eventId])
  const rsvp = async (status) => { try { setEvent((await api.post(`/events/${eventId}/rsvp`, { status })).event) } catch (e) { notifyError(e.message) } }
  if (event === undefined) return <Spinner />
  if (event === null) return <div className='px-6 py-20 text-center'><h2 className='text-xl font-bold'>This event isn't available</h2><Link to='/connectify/events' className='mt-4 inline-block font-semibold text-cx-blue'>Go to Events</Link></div>
  const past = new Date(event.endsAt || event.startsAt) < new Date()
  return (
    <div className='mx-auto max-w-[760px] pb-10 sm:px-4 sm:pt-4'>
      <Card className='overflow-hidden'>
        <div className='h-[200px] bg-gradient-to-br from-[#e41e3f]/50 to-cx-blue/50 sm:h-[280px]'>{event.cover && <img src={event.cover} alt='' className='h-full w-full object-cover' />}</div>
        <div className='p-4'>
          <p className='font-semibold text-[#e41e3f]'>{when(event)}{event.endsAt ? ` – ${new Date(event.endsAt).toLocaleString(undefined, { month : 'short', day : 'numeric', hour : 'numeric', minute : '2-digit' })}` : ''}</p>
          <h1 className='text-[26px] font-bold leading-tight'>{event.title}</h1>
          {event.location && <p className='mt-1 flex items-center gap-1 text-cx-muted'><IoLocationSharp />{event.location}</p>}
          <div className='mt-3 flex flex-wrap gap-2'>
            {!past && !event.isHost && <>
              <Btn primary={event.myStatus === 'interested'} onClick={() => rsvp(event.myStatus === 'interested' ? null : 'interested')}>{event.myStatus === 'interested' ? <IoStar /> : <IoStarOutline />}Interested</Btn>
              <Btn primary={event.myStatus === 'going'} onClick={() => rsvp(event.myStatus === 'going' ? null : 'going')}>{event.myStatus === 'going' ? <IoCheckmarkCircle /> : <IoCheckmarkCircleOutline />}Going</Btn>
            </>}
            {(event.isHost || event.myStatus === 'going') && !past && <Btn onClick={async () => { await loadFriends(); setInviting(true) }}><IoPersonAdd />Invite</Btn>}
            {event.isHost && <Btn onClick={() => setEditing(true)}>Edit</Btn>}
            {event.isHost && <Btn onClick={() => setConfirm(true)}>Cancel event</Btn>}
          </div>
        </div>
      </Card>
      <Card className='mt-4 p-4'>
        <h2 className='text-xl font-bold'>Details</h2>
        <ul className='mt-2 space-y-2 text-[15px]'>
          <li className='flex items-center gap-3'><IoPeople size={20} className='text-cx-muted' /><button onClick={() => { setGuests(null); api.get(`/events/${eventId}/guests`).then(setGuests).catch(() => setGuests({ going : [], interested : [] })) }} className='hover:underline'><b>{event.goingCount}</b> going · <b>{event.interestedCount}</b> interested</button></li>
          {event.host && <li className='flex items-center gap-3'><Avatar width={20} height={20} name={event.host.name} imageUrl={event.host.profile_pic} />Hosted by <Link to={userLink(event.host)} className='font-semibold hover:underline'>{event.host.name}</Link></li>}
          <li className='flex items-center gap-3'>{event.privacy === 'public' ? <IoEarth size={20} className='text-cx-muted' /> : <IoLockClosed size={20} className='text-cx-muted' />}{event.privacy === 'public' ? 'Public · Anyone on Connectify' : event.privacy === 'friends' ? "Friends of the host" : 'Private · Only invited people'}</li>
        </ul>
        {event.description && <p className='mt-3 whitespace-pre-wrap text-[15px]'>{event.description}</p>}
        {event.goingPreview?.length > 0 && <div className='mt-3 flex -space-x-2'>{event.goingPreview.map((p) => <span key={p._id} className='rounded-full ring-2 ring-cx-card'><Avatar width={32} height={32} name={p.name} imageUrl={p.profile_pic} /></span>)}</div>}
      </Card>
      {editing && <EventForm event={event} onClose={() => setEditing(false)} onSaved={(e) => { setEvent(e); setEditing(false); notify('Event updated') }} />}
      {guests !== undefined && <PeopleModal tone='cx' app='connectify' title='Guests' people={guests === null ? null : [...guests.going.map((p) => ({ ...p, tag : 'Going' })), ...guests.interested.map((p) => ({ ...p, tag : 'Interested' }))]} onClose={() => setGuests(undefined)} renderAction={(p) => <span className='text-sm text-cx-muted'>{p.tag}</span>} />}
      {inviting && <PeoplePicker title='Invite friends' app='connectify' t='cx' source={friends || []} max={100} doneLabel='Send invites' onClose={() => setInviting(false)} onDone={async (l) => { setInviting(false); if (!l.length) return; try { await api.post(`/events/${eventId}/invite`, { userIds : l.map((p) => p._id) }); notify(`Invited ${l.length}`) } catch (e) { notifyError(e.message) } }} />}
      {confirm && <ActionSheet tone='cx' title='Cancel this event? Guests will no longer see it.' onClose={() => setConfirm(false)} items={[{ label : 'Cancel event', danger : true, onClick : async () => { try { await api.del(`/events/${eventId}`); notify('Event cancelled'); navigate('/connectify/events') } catch (e) { notifyError(e.message) } } }]} />}
    </div>
  )
}

/* ================= Marketplace ================= */

const CATEGORIES = { electronics : 'Electronics', vehicles : 'Vehicles', property : 'Property', home : 'Home & garden', clothing : 'Clothing', hobbies : 'Hobbies', family : 'Family', entertainment : 'Entertainment', free : 'Free stuff', other : 'Other' }
const CONDITIONS = { new : 'New', like_new : 'Used - like new', good : 'Used - good', fair : 'Used - fair' }
const price = (l) => (l.price === 0 ? 'Free' : new Intl.NumberFormat(undefined, { style : 'currency', currency : l.currency || 'INR', maximumFractionDigits : l.price % 1 ? 2 : 0 }).format(l.price))

const ListingForm = ({ listing, onClose, onSaved }) => {
  const [form, setForm] = useState(listing
    ? { title : listing.title, price : String(listing.price), category : listing.category, condition : listing.condition, description : listing.description, location : listing.location, photos : listing.photos }
    : { title : '', price : '', category : 'other', condition : 'good', description : '', location : '', photos : [] })
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const addPhotos = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 10 - form.photos.length)
    if (!list.length) return
    setBusy(true)
    try { const up = await uploadMedia(list); setForm((f) => ({ ...f, photos : [...f.photos, ...up] })) } catch (e) { notifyError(e.message) }
    setBusy(false)
  }
  const save = async () => {
    setBusy(true)
    try {
      const body = { ...form, price : Number(form.price || 0) }
      onSaved((listing ? await api.patch(`/market/${listing._id}`, body) : await api.post('/market', body)).listing)
    } catch (e) { notifyError(e.message); setBusy(false) }
  }
  return (
    <Modal onClose={onClose} closeButton={false} label='Listing' className='flex max-h-[95dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-lg bg-cx-card text-cx-text'>
      <header className='relative flex h-[60px] shrink-0 items-center justify-center border-b border-cx-border text-xl font-bold'>{listing ? 'Edit listing' : 'Item for sale'}<button onClick={onClose} className='absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-cx-input' title='Close'><IoClose size={20} /></button></header>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>
        <p className='font-semibold'>Photos · {form.photos.length}/10</p>
        <div className='mt-2 grid grid-cols-4 gap-2'>
          {form.photos.map((m, i) => (
            <span key={m.url} className='relative aspect-square overflow-hidden rounded-md'>
              <MediaThumb media={m} className='h-full w-full' />
              <button onClick={() => setForm((f) => ({ ...f, photos : f.photos.filter((_, x) => x !== i) }))} className='absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white' title='Remove'><IoClose size={14} /></button>
            </span>
          ))}
          {form.photos.length < 10 && <button onClick={() => input.current?.click()} disabled={busy} className='flex aspect-square flex-col items-center justify-center rounded-md border-2 border-dashed border-cx-border text-sm text-cx-muted'><IoCamera size={24} />{busy ? '…' : 'Add'}</button>}
        </div>
        <input ref={input} type='file' accept='image/*' multiple className='hidden' onChange={(e) => { addPhotos(e.target.files || []); e.target.value = '' }} />
        <label className='mt-3 block font-semibold'>Title<input value={form.title} onChange={(e) => setForm({ ...form, title : e.target.value })} maxLength={100} className={`${field} h-11 font-normal`} /></label>
        <label className='mt-3 block font-semibold'>Price (₹)<input value={form.price} onChange={(e) => setForm({ ...form, price : e.target.value.replace(/[^\d.]/g, '') })} inputMode='decimal' placeholder='0 for free' className={`${field} h-11 font-normal`} /></label>
        <div className='mt-3 grid grid-cols-2 gap-3'>
          <label className='block font-semibold'>Category<select value={form.category} onChange={(e) => setForm({ ...form, category : e.target.value })} className={`${field} h-11 font-normal`}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className='block font-semibold'>Condition<select value={form.condition} onChange={(e) => setForm({ ...form, condition : e.target.value })} className={`${field} h-11 font-normal`}>{Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label className='mt-3 block font-semibold'>Location<input value={form.location} onChange={(e) => setForm({ ...form, location : e.target.value })} maxLength={100} placeholder='e.g. Kothrud, Pune' className={`${field} h-11 font-normal`} /></label>
        <label className='mt-3 block font-semibold'>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description : e.target.value })} maxLength={2000} rows={4} className={`${field} resize-none py-2 font-normal`} /></label>
      </div>
      <div className='shrink-0 border-t border-cx-border p-3'><Btn primary className='w-full' onClick={save} disabled={!form.title.trim() || !form.photos.length || busy}>{listing ? 'Save' : 'Publish'}</Btn></div>
    </Modal>
  )
}

const ListingTile = ({ l }) => (
  <Link to={`/connectify/marketplace/${l._id}`} className='block min-w-0'>
    <span className='relative block aspect-square overflow-hidden rounded-lg bg-cx-input'>
      <MediaThumb media={l.photos[0]} className='h-full w-full' />
      {l.status !== 'available' && <span className='absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs font-semibold uppercase text-white'>{l.status}</span>}
    </span>
    <span className='mt-1 block text-[17px] font-semibold'>{price(l)}</span>
    <span className='block truncate text-[15px]'>{l.title}</span>
    <span className='block truncate text-[13px] text-cx-muted'>{l.location}</span>
  </Link>
)

export const ConnectifyMarket = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'browse'
  const category = params.get('category') || ''
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t) }, [q])
  const paged = usePaged(`/market?tab=${tab}${category ? `&category=${category}` : ''}${query ? `&q=${enc(query)}` : ''}`, 'listings')
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p) }
  return (
    <Page wide title='Marketplace' action={<Btn primary onClick={() => setCreating(true)}><IoAdd size={18} />Create new listing</Btn>}>
      <Tabs tabs={[['browse', 'Browse all'], ['saved', 'Saved'], ['mine', 'Your listings']]} value={tab} onChange={(v) => set('tab', v === 'browse' ? '' : v)} />
      {tab === 'browse' && (
        <>
          <div className='mx-3 mb-3 flex items-center gap-2 rounded-full bg-cx-input px-3 sm:mx-0'><IoSearchOutline className='text-cx-muted' /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search Marketplace' className='h-10 flex-1 bg-transparent outline-none' /></div>
          <div className='mb-3 flex gap-2 overflow-x-auto px-3 scrollbar-none sm:px-0'>
            <button onClick={() => set('category', '')} className={`h-8 shrink-0 rounded-full px-3 text-sm font-semibold ${!category ? 'bg-cx-blue text-white' : 'bg-cx-input'}`}>All</button>
            {Object.entries(CATEGORIES).map(([k, v]) => <button key={k} onClick={() => set('category', k)} className={`h-8 shrink-0 rounded-full px-3 text-sm font-semibold ${category === k ? 'bg-cx-blue text-white' : 'bg-cx-input'}`}>{v}</button>)}
          </div>
        </>
      )}
      <div className='grid grid-cols-2 gap-x-2 gap-y-4 px-3 sm:grid-cols-3 sm:px-0 lg:grid-cols-4'>
        {paged.items.map((l) => <ListingTile key={l._id} l={l} />)}
      </div>
      {paged.loading && <Spinner />}
      {!paged.loading && !paged.items.length && <Card className='p-8 text-center text-cx-muted'>{tab === 'mine' ? 'You have no listings yet. Sell something!' : tab === 'saved' ? 'Save listings to find them here.' : 'Nothing listed here yet.'}</Card>}
      <div ref={more} />
      {creating && <ListingForm onClose={() => setCreating(false)} onSaved={(l) => { setCreating(false); notify('Your listing is published'); navigate(`/connectify/marketplace/${l._id}`) }} />}
    </Page>
  )
}

export const ConnectifyListing = () => {
  const { listingId } = useParams()
  const navigate = useNavigate()
  const [l, setL] = useState(undefined)
  const [i, setI] = useState(0)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { api.get(`/market/${listingId}`).then((r) => setL(r.listing)).catch(() => setL(null)) }, [listingId])
  const patch = async (body, text) => { try { setL((await api.patch(`/market/${listingId}`, body)).listing); notify(text) } catch (e) { notifyError(e.message) } }
  if (l === undefined) return <Spinner />
  if (l === null) return <div className='px-6 py-20 text-center'><h2 className='text-xl font-bold'>This listing isn't available</h2><Link to='/connectify/marketplace' className='mt-4 inline-block font-semibold text-cx-blue'>Go to Marketplace</Link></div>
  return (
    <div className='mx-auto max-w-[1000px] pb-10 sm:px-4 sm:pt-4'>
      <button onClick={() => navigate('/connectify/marketplace')} className='m-3 flex items-center gap-1 font-semibold text-cx-blue sm:mx-0'><IoArrowBack />Marketplace</button>
      <Card className='overflow-hidden md:flex'>
        <div className='relative flex aspect-square items-center justify-center bg-black md:w-[60%]'>
          <img src={l.photos[i]?.url} alt={l.title} className='max-h-full max-w-full object-contain' />
          {l.photos.length > 1 && <div className='absolute inset-x-0 bottom-2 flex justify-center gap-1'>{l.photos.map((_, x) => <button key={x} onClick={() => setI(x)} className={`h-2 w-2 rounded-full ${x === i ? 'bg-white' : 'bg-white/50'}`} aria-label={`Photo ${x + 1}`} />)}</div>}
        </div>
        <div className='flex-1 p-4'>
          <h1 className='text-2xl font-bold'>{l.title}</h1>
          <p className='mt-1 text-xl'>{price(l)}{l.status !== 'available' && <span className='ml-2 rounded bg-cx-input px-2 py-0.5 text-sm font-semibold uppercase'>{l.status}</span>}</p>
          <p className='mt-1 text-sm text-cx-muted'>Listed {longAgo(l.createdAt)}{l.location ? ` in ${l.location}` : ''}</p>
          <div className='mt-4 flex flex-wrap gap-2'>
            {l.mine ? <>
              <Btn onClick={() => setEditing(true)}>Edit</Btn>
              {l.status !== 'sold' && <Btn primary onClick={() => patch({ status : 'sold' }, 'Marked as sold')}>Mark as sold</Btn>}
              {l.status === 'available' && <Btn onClick={() => patch({ status : 'pending' }, 'Marked as pending')}>Mark as pending</Btn>}
              {l.status !== 'available' && <Btn onClick={() => patch({ status : 'available' }, 'Marked as available')}>Mark as available</Btn>}
              <Btn onClick={() => setConfirm(true)}>Delete</Btn>
            </> : <>
              <Btn primary onClick={() => navigate('/' + l.seller._id)}><IoChatbubbleEllipses />Message seller</Btn>
              <Btn onClick={async () => { try { const r = await api.post(`/market/${l._id}/save`, { save : !l.saved }); setL((x) => ({ ...x, saved : r.saved })); notify(r.saved ? 'Saved' : 'Removed from saved') } catch (e) { notifyError(e.message) } }}>{l.saved ? <IoBookmark /> : <IoBookmarkOutline />}{l.saved ? 'Saved' : 'Save'}</Btn>
            </>}
          </div>
          <h2 className='mt-5 text-[17px] font-bold'>Details</h2>
          <p className='mt-1 text-[15px]'><span className='text-cx-muted'>Condition</span> · {CONDITIONS[l.condition]}</p>
          <p className='text-[15px]'><span className='text-cx-muted'>Category</span> · {CATEGORIES[l.category]}</p>
          {l.description && <p className='mt-2 whitespace-pre-wrap text-[15px]'>{l.description}</p>}
          {l.seller && (
            <>
              <h2 className='mt-5 text-[17px] font-bold'>Seller information</h2>
              <Link to={userLink(l.seller)} className='mt-2 flex items-center gap-2 font-semibold hover:underline'><Avatar width={40} height={40} name={l.seller.name} imageUrl={l.seller.profile_pic} />{l.seller.name}</Link>
            </>
          )}
        </div>
      </Card>
      {editing && <ListingForm listing={l} onClose={() => setEditing(false)} onSaved={(x) => { setL(x); setEditing(false); notify('Listing updated') }} />}
      {confirm && <ActionSheet tone='cx' title='Delete this listing?' onClose={() => setConfirm(false)} items={[{ label : 'Delete', danger : true, onClick : async () => { try { await api.del(`/market/${l._id}`); notify('Listing deleted'); navigate('/connectify/marketplace?tab=mine') } catch (e) { notifyError(e.message) } } }]} />}
    </div>
  )
}

/* ================= Watch, Memories, Saved, #hashtags ================= */

export const ConnectifyWatch = () => {
  const paged = usePaged('/watch')
  return <Page title='Watch'><PostList paged={paged} empty='No videos yet. Videos from friends, groups and public posts show up here.' /></Page>
}

export const ConnectifyMemories = () => {
  const [posts, setPosts] = useState(null)
  useEffect(() => { api.get('/memories').then((r) => setPosts(r.posts)).catch(() => setPosts([])) }, [])
  return (
    <Page title='Memories'>
      <Card className='mb-4 p-4'><p className='text-lg font-bold'>On this day</p><p className='text-cx-muted'>Posts you shared on {new Date().toLocaleDateString(undefined, { month : 'long', day : 'numeric' })} in earlier years.</p></Card>
      {posts === null && <Spinner />}
      {posts?.length === 0 && <Card className='p-8 text-center text-cx-muted'>No memories to look back on today. Come back tomorrow!</Card>}
      {posts?.map((p) => (
        <div key={p._id}>
          <p className='mb-2 px-3 font-semibold text-cx-muted sm:px-0'>{new Date().getFullYear() - new Date(p.createdAt).getFullYear()} year{new Date().getFullYear() - new Date(p.createdAt).getFullYear() > 1 ? 's' : ''} ago</p>
          <CxPostCard post={p} />
        </div>
      ))}
    </Page>
  )
}

export const ConnectifySaved = () => {
  const paged = usePaged('/saved?app=connectify')
  return <Page title='Saved'><PostList paged={paged} empty='Save posts from the ••• menu to find them here. Only you can see what you save.' /></Page>
}

export const ConnectifyTag = () => {
  const { tag } = useParams()
  const paged = usePaged(`/hashtags/${enc(tag)}?app=connectify`)
  return <Page title={`#${tag}`}><p className='mb-3 px-3 text-cx-muted sm:px-0'>{compact(paged.count || 0)} post{paged.count === 1 ? '' : 's'}</p><PostList paged={paged} empty={`No posts with #${tag} yet.`} /></Page>
}

/* ================= Birthdays, Pokes ================= */

export const BirthdaysCard = () => {
  const [b, setB] = useState(null)
  useEffect(() => { api.get('/birthdays').then(setB).catch(() => {}) }, [])
  if (!b?.today.length) return null
  return (
    <Link to='/connectify/birthdays' className='flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-cx-hover'>
      <IoGift size={28} className='shrink-0 text-cx-blue' />
      <span className='text-[15px]'><b>{b.today[0].name}</b>{b.today.length > 1 ? <> and <b>{b.today.length - 1} other{b.today.length > 2 ? 's' : ''}</b></> : ''} {b.today.length > 1 ? 'have' : 'has'} a birthday today.</span>
    </Link>
  )
}

export const ConnectifyBirthdays = () => {
  const [b, setB] = useState(null)
  useEffect(() => { api.get('/birthdays').then(setB).catch(() => setB({ today : [], upcoming : [] })) }, [])
  const row = (p, sub) => (
    <div key={p._id} className='flex items-center gap-3 rounded-lg p-2'>
      <Link to={userLink(p)}><Avatar width={56} height={56} name={p.name} imageUrl={p.profile_pic} /></Link>
      <span className='min-w-0 flex-1'><Link to={userLink(p)} className='block truncate font-semibold hover:underline'>{p.name}</Link><span className='text-[13px] text-cx-muted'>{sub}</span></span>
      <Link to={`/${p._id}`} className='flex h-9 items-center gap-2 rounded-md bg-cx-input px-3 text-[15px] font-semibold'><IoChatbubbleEllipses />Message</Link>
    </div>
  )
  return (
    <Page title='Birthdays'>
      {b === null && <Spinner />}
      {b && (
        <>
          <Card className='mb-4 p-3'><h2 className='px-2 text-lg font-bold'>Today's birthdays</h2>{b.today.length ? b.today.map((p) => row(p, 'Wish them a happy birthday 🎂')) : <p className='px-2 py-4 text-cx-muted'>No birthdays today.</p>}</Card>
          <Card className='p-3'><h2 className='px-2 text-lg font-bold'>Upcoming birthdays</h2>{b.upcoming.length ? b.upcoming.map((p) => row(p, `${new Date(2024, p.month - 1, p.day).toLocaleDateString(undefined, { month : 'long', day : 'numeric' })} · in ${p.inDays} day${p.inDays > 1 ? 's' : ''}`)) : <p className='px-2 py-4 text-cx-muted'>No birthdays in the next 30 days. Friends can add theirs in Edit details.</p>}</Card>
        </>
      )}
    </Page>
  )
}

export const ConnectifyPokes = () => {
  const [people, setPeople] = useState(null)
  useEffect(() => { api.get('/pokes').then((r) => setPeople(r.people)).catch(() => setPeople([])) }, [])
  const pokeBack = async (p) => { try { await api.post(`/pokes/${p._id}`); setPeople((l) => l.filter((x) => x._id !== p._id)); notify(`You poked ${p.name.split(' ')[0]} back`) } catch (e) { notifyError(e.message) } }
  return (
    <Page title='Pokes'>
      <Card className='p-3'>
        {people === null && <Spinner />}
        {people?.length === 0 && <p className='py-8 text-center text-cx-muted'>No new pokes. Poke friends from their profile.</p>}
        {people?.map((p) => (
          <div key={p._id} className='flex items-center gap-3 rounded-lg p-2'>
            <Link to={userLink(p)}><Avatar width={56} height={56} name={p.name} imageUrl={p.profile_pic} /></Link>
            <span className='min-w-0 flex-1'><span className='block font-semibold'>{p.name} poked you</span><span className='text-[13px] text-cx-muted'>{longAgo(p.at)}</span></span>
            <Btn primary onClick={() => pokeBack(p)}><IoHandLeft />Poke back</Btn>
          </div>
        ))}
      </Card>
    </Page>
  )
}

// shortcuts shown in the left column and the Menu
export const SHORTCUTS = [
  { path : '/connectify/friends', label : 'Friends', Icon : IoPeople, color : 'text-cx-blue' },
  { path : '/connectify/groups', label : 'Groups', Icon : IoPeople, color : 'text-[#1b74e4]' },
  { path : '/connectify/marketplace', label : 'Marketplace', Icon : IoStorefront, color : 'text-[#0a7cff]' },
  { path : '/connectify/watch', label : 'Watch', Icon : IoPlayCircle, color : 'text-[#0a7cff]' },
  { path : '/connectify/events', label : 'Events', Icon : IoCalendar, color : 'text-[#e41e3f]' },
  { path : '/connectify/memories', label : 'Memories', Icon : IoTime, color : 'text-cx-blue' },
  { path : '/connectify/saved', label : 'Saved', Icon : IoBookmark, color : 'text-[#c03fd6]' },
  { path : '/connectify/birthdays', label : 'Birthdays', Icon : IoGift, color : 'text-[#e41e3f]' },
  { path : '/connectify/pokes', label : 'Pokes', Icon : IoHandLeft, color : 'text-[#f7b928]' },
  { path : '/connectify/search', label : 'Search', Icon : IoSearchOutline, color : 'text-cx-blue' },
]
