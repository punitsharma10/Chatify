import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IoCamera, IoPencil, IoChatbubbleEllipses, IoHome, IoLocationSharp, IoBriefcase, IoTime, IoSearchOutline, IoCloseCircle, IoArrowBack, IoPeople, IoSchool, IoHeart, IoLink, IoGift, IoEllipsisHorizontal, IoHandLeft, IoAt, IoFlag } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, enc, longAgo, usePaged, useOnVisible } from '../../helpers/social'
import uploadFile from '../../helpers/uploadFile'
import { setUser } from '../../redux/userSlice'
import { notify, notifyError } from '../../helpers/toast'
import { MediaThumb, Modal, ReactionIcon, PersonPhoto, ActionSheet } from '../social/common'
import { ReportSheet } from '../social/extras'
import { APPS } from '../../helpers/apps'
import { AppMark } from '../apps/AppLogos'
import { useConnectify, Card, SideLink } from './ConnectifyLayout'
import { CxPostCard, removeHidden } from './CxPost'
import { FriendButton, CreatePostCard } from './ConnectifyHome'
import { SHORTCUTS } from './ConnectifyMore'

const userLink = (p) => `/connectify/u/${p.username || p._id}`
const Spinner = () => <span className='mx-auto my-10 block h-7 w-7 animate-spin rounded-full border-2 border-cx-border border-t-cx-muted' />

export const RELATIONSHIPS = { '' : 'Not set', single : 'Single', in_a_relationship : 'In a relationship', engaged : 'Engaged', married : 'Married', its_complicated : "It's complicated", separated : 'Separated', divorced : 'Divorced', widowed : 'Widowed' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const birthdayText = (b) => (b?.month ? `${MONTHS[b.month - 1]} ${b.day}${b.year ? `, ${b.year}` : ''}` : '')

/* ---------------- profile ---------------- */

const EditProfile = ({ profile, onClose, onSaved }) => {
  const [form, setForm] = useState({ bio : profile.bio, city : profile.city, work : profile.work, education : profile.education || '', hometown : profile.hometown || '', relationship : profile.relationship || '', website : profile.website || '' })
  const [bday, setBday] = useState({ month : profile.birthday?.month || '', day : profile.birthday?.day || '', year : profile.birthday?.year || '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const birthday = bday.month && bday.day ? { month : Number(bday.month), day : Number(bday.day), ...(bday.year ? { year : Number(bday.year) } : {}) } : null
      await api.post('/profile', { app : 'connectify', ...form, birthday })
      notify('Profile updated'); onSaved()
    } catch (e) { notifyError(e.message) }
    setBusy(false)
  }
  const field = (key, label, max, placeholder) => (
    <label className='mt-4 block'>
      <span className='text-[15px] font-semibold'>{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key] : e.target.value })} maxLength={max} placeholder={placeholder}
        className='mt-1 h-10 w-full rounded-md border border-cx-border bg-cx-input px-3 outline-none focus:border-cx-blue' />
    </label>
  )
  return (
    <Modal onClose={onClose} closeButton={false} label='Edit profile' className='w-full max-w-[600px] overflow-hidden rounded-lg bg-cx-card text-cx-text'>
      <header className='flex h-[60px] items-center justify-center border-b border-cx-border text-xl font-bold'>Edit details</header>
      <div className='p-4'>
        <label className='block'>
          <span className='text-[15px] font-semibold'>Bio</span>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio : e.target.value })} maxLength={101} rows={3} placeholder='Describe who you are'
            className='mt-1 w-full resize-none rounded-md border border-cx-border bg-cx-input p-3 text-center outline-none focus:border-cx-blue' />
          <span className='block text-right text-xs text-cx-muted'>{101 - form.bio.length} characters remaining</span>
        </label>
        {field('city', 'Current city', 60, 'e.g. Pune')}
        {field('work', 'Work', 80, 'e.g. Developer at Omnis')}
        {field('education', 'Education', 80, 'e.g. Studied at Pune University')}
        {field('hometown', 'Hometown', 60, 'e.g. Nagpur')}
        {field('website', 'Website', 200, 'e.g. mysite.com')}
        <label className='mt-4 block'>
          <span className='text-[15px] font-semibold'>Relationship</span>
          <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship : e.target.value })} className='mt-1 h-10 w-full rounded-md border border-cx-border bg-cx-input px-3 outline-none'>
            {Object.entries(RELATIONSHIPS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <div className='mt-4'>
          <span className='text-[15px] font-semibold'>Birthday</span> <span className='text-xs text-cx-muted'>(friends see the day and month)</span>
          <div className='mt-1 grid grid-cols-3 gap-2'>
            <select value={bday.month} onChange={(e) => setBday({ ...bday, month : e.target.value })} aria-label='Month' className='h-10 rounded-md border border-cx-border bg-cx-input px-2 outline-none'>
              <option value=''>Month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={bday.day} onChange={(e) => setBday({ ...bday, day : e.target.value })} aria-label='Day' className='h-10 rounded-md border border-cx-border bg-cx-input px-2 outline-none'>
              <option value=''>Day</option>{Array.from({ length : 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
            <input value={bday.year} onChange={(e) => setBday({ ...bday, year : e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder='Year (private)' aria-label='Year' className='h-10 rounded-md border border-cx-border bg-cx-input px-2 outline-none' />
          </div>
        </div>
        <p className='mt-4 text-sm text-cx-muted'>Your name and profile picture are shared with Chatify. Change them in Chatify → Profile.</p>
      </div>
      <div className='flex justify-end gap-2 border-t border-cx-border p-3'>
        <button onClick={onClose} className='h-9 rounded-md px-4 font-semibold text-cx-blue hover:bg-cx-hover'>Cancel</button>
        <button onClick={save} disabled={busy} className='h-9 rounded-md bg-cx-blue px-6 font-semibold text-white disabled:opacity-60'>Save</button>
      </div>
    </Modal>
  )
}

const FriendsGrid = ({ id, limit }) => {
  const [people, setPeople] = useState(null)
  useEffect(() => { api.get(`/users/${id}/friends`).then((r) => setPeople(r.people)).catch(() => setPeople([])) }, [id])
  if (people === null) return <Spinner />
  if (!people.length) return <p className='py-6 text-center text-cx-muted'>No friends to show</p>
  return (
    <div className={`grid gap-2 ${limit ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {people.slice(0, limit || 1000).map((p) => (limit ? (
        <Link key={p._id} to={userLink(p)} className='min-w-0'>
          <span className='flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-cx-input'><PersonPhoto person={p} size={64} /></span>
          <span className='mt-1 block truncate text-[13px] font-semibold'>{p.name}</span>
        </Link>
      ) : (
        <div key={p._id} className='flex items-center gap-3 rounded-lg border border-cx-border p-3'>
          <Link to={userLink(p)}><Avatar width={64} height={64} name={p.name} imageUrl={p.profile_pic} /></Link>
          <Link to={userLink(p)} className='min-w-0 flex-1 truncate text-[17px] font-semibold hover:underline'>{p.name}</Link>
          {!p.self && !p.isFriend && <FriendButton person={p} compact />}
        </div>
      )))}
    </div>
  )
}

const Photos = ({ id }) => {
  const paged = usePaged(`/users/${id}/posts?app=connectify`)
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  const media = paged.items.flatMap((p) => (p.media || []).map((m, i) => ({ m, post : p, key : `${p._id}-${i}` })))
  return (
    <>
      <div className='grid grid-cols-3 gap-1 sm:grid-cols-4'>
        {media.map(({ m, post, key }) => <Link key={key} to={`/connectify/p/${post._id}`} className='aspect-square overflow-hidden rounded-md bg-cx-input'><MediaThumb media={m} className='h-full w-full' /></Link>)}
      </div>
      {paged.loading && <Spinner />}
      {!paged.loading && !media.length && <p className='py-6 text-center text-cx-muted'>No photos to show</p>}
      <div ref={more} />
    </>
  )
}

const Intro = ({ profile, onEdit }) => (
  <Card className='p-4'>
    <h2 className='text-xl font-bold'>Intro</h2>
    {profile.bio && <p className='mt-3 text-center text-[15px]'>{profile.bio}</p>}
    {profile.self && <button onClick={onEdit} className='mt-3 h-9 w-full rounded-md bg-cx-input font-semibold hover:brightness-95'>{profile.bio ? 'Edit bio' : 'Add bio'}</button>}
    <ul className='mt-3 space-y-3 text-[15px]'>
      {profile.work && <li className='flex items-center gap-3'><IoBriefcase className='text-cx-muted' size={20} />Works at <b>{profile.work}</b></li>}
      {profile.education && <li className='flex items-center gap-3'><IoSchool className='text-cx-muted' size={20} />Studied at <b>{profile.education}</b></li>}
      {profile.city && <li className='flex items-center gap-3'><IoHome className='text-cx-muted' size={20} />Lives in <b>{profile.city}</b></li>}
      {profile.hometown && <li className='flex items-center gap-3'><IoLocationSharp className='text-cx-muted' size={20} />From <b>{profile.hometown}</b></li>}
      {profile.relationship && <li className='flex items-center gap-3'><IoHeart className='text-cx-muted' size={20} />{RELATIONSHIPS[profile.relationship]}</li>}
      {profile.birthday && <li className='flex items-center gap-3'><IoGift className='text-cx-muted' size={20} />Birthday: {birthdayText(profile.birthday)}</li>}
      {profile.website && <li className='flex items-center gap-3'><IoLink className='text-cx-muted' size={20} /><a href={profile.website} target='_blank' rel='noopener noreferrer nofollow' className='truncate text-cx-blue hover:underline'>{profile.website.replace(/^https?:\/\//, '')}</a></li>}
      {profile.username && <li className='flex items-center gap-3'><IoAt className='text-cx-muted' size={20} />@{profile.username}</li>}
      <li className='flex items-center gap-3'><IoTime className='text-cx-muted' size={20} />Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { month : 'long', year : 'numeric' })}</li>
    </ul>
    {profile.self && <button onClick={onEdit} className='mt-4 h-9 w-full rounded-md bg-cx-input font-semibold hover:brightness-95'>Edit details</button>}
  </Card>
)

export const ConnectifyProfile = () => {
  const { handle } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { version } = useConnectify()
  const [profile, setProfile] = useState(undefined)
  const [tab, setTab] = useState('posts')
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const cover = useRef(null)
  const tool = async (url, body, text) => { try { await api.post(url, body); notify(text); load() } catch (e) { notifyError(e.message) } }

  const load = useCallback(() => api.get(`/users/${enc(handle)}?app=connectify`).then((r) => setProfile(r.profile)).catch(() => setProfile(null)), [handle])
  useEffect(() => { setProfile(undefined); setTab('posts'); load() }, [load, version])
  const posts = usePaged(profile ? `/users/${profile._id}/posts?app=connectify&v=${version}` : null)
  const more = useOnVisible(posts.loadMore, !posts.done && !posts.loading)

  const changeCover = async (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return notifyError('Choose a photo')
    setUploading(true)
    try {
      const up = await uploadFile(f)
      const r = await api.post('/profile', { app : 'connectify', cover_pic : up.url })
      dispatch(setUser(r.data))
      setProfile((p) => ({ ...p, cover_pic : up.url }))
    } catch (e) { notifyError(e.message) }
    setUploading(false)
  }

  if (profile === undefined) return <Spinner />
  if (profile === null) {
    return <div className='px-6 py-20 text-center'><h2 className='text-xl font-bold'>This content isn't available right now</h2><Link to='/connectify' className='mt-4 inline-block rounded-md bg-cx-blue px-4 py-2 font-semibold text-white'>Go to Feed</Link></div>
  }

  return (
    <div className='pb-10'>
      <div className='bg-cx-card shadow-[0_1px_2px_rgba(0,0,0,.1)]'>
        <div className='mx-auto max-w-[940px]'>
          <div className='relative h-[200px] overflow-hidden bg-gradient-to-b from-cx-input to-cx-border sm:h-[300px] sm:rounded-b-lg md:h-[350px]'>
            {profile.cover_pic && <img src={profile.cover_pic} alt='' className='h-full w-full object-cover' />}
            {profile.self && (
              <button onClick={() => cover.current?.click()} disabled={uploading} className='absolute bottom-3 right-3 flex h-9 items-center gap-2 rounded-md bg-white px-3 text-[15px] font-semibold text-black shadow hover:bg-gray-100 disabled:opacity-70'>
                <IoCamera size={18} /><span className='hidden sm:inline'>{uploading ? 'Uploading…' : profile.cover_pic ? 'Edit cover photo' : 'Add cover photo'}</span>
              </button>
            )}
            <input ref={cover} type='file' accept='image/*' className='hidden' onChange={(e) => { changeCover(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className='flex flex-col items-center gap-3 px-4 pb-4 sm:flex-row sm:items-end sm:px-8'>
            <span className='-mt-[84px] rounded-full ring-4 ring-cx-card sm:-mt-8'><Avatar width={168} height={168} name={profile.name} imageUrl={profile.profile_pic} /></span>
            <div className='min-w-0 flex-1 text-center sm:pb-2 sm:text-left'>
              <h1 className='text-[32px] font-bold leading-tight'>{profile.name}</h1>
              <p className='font-semibold text-cx-muted'>{profile.friendCount} friend{profile.friendCount === 1 ? '' : 's'}{!profile.self && profile.mutualFriends > 0 ? ` · ${profile.mutualFriends} mutual` : ''}</p>
              {profile.friendsPreview?.length > 0 && <div className='mt-1 flex justify-center -space-x-2 sm:justify-start'>{profile.friendsPreview.slice(0, 8).map((p) => <Link key={p._id} to={userLink(p)} className='rounded-full ring-2 ring-cx-card'><Avatar width={32} height={32} name={p.name} imageUrl={p.profile_pic} /></Link>)}</div>}
            </div>
            <div className='flex gap-2 sm:pb-2'>
              {profile.self ? (
                <button onClick={() => setEditing(true)} className='flex h-9 items-center gap-2 rounded-md bg-cx-input px-3 font-semibold hover:brightness-95'><IoPencil />Edit profile</button>
              ) : (
                <>
                  <FriendButton person={profile} initial={profile.friendStatus} onChange={() => load()} />
                  <button onClick={() => navigate(`/connectify/messages/u/${profile.username || profile._id}`)} className='flex h-9 items-center gap-2 rounded-md bg-cx-blue px-3 font-semibold text-white'><IoChatbubbleEllipses />Message</button>
                  {profile.friendStatus === 'friends' && (
                    <button onClick={() => tool(`/pokes/${profile._id}`, {}, `You poked ${profile.name.split(' ')[0]}`)} disabled={profile.pokedByMe} title={profile.pokedByMe ? 'Poked' : 'Poke'} className='flex h-9 items-center gap-2 rounded-md bg-cx-input px-3 font-semibold hover:brightness-95 disabled:opacity-60'><IoHandLeft />{profile.pokedMe && !profile.pokedByMe ? 'Poke back' : profile.pokedByMe ? 'Poked' : 'Poke'}</button>
                  )}
                  <button onClick={() => setMenu(true)} title='More' className='flex h-9 w-10 items-center justify-center rounded-md bg-cx-input hover:brightness-95'><IoEllipsisHorizontal /></button>
                </>
              )}
            </div>
          </div>
          <nav className='mx-4 flex border-t border-cx-border sm:mx-8'>
            {[['posts', 'Posts'], ['about', 'About'], ['friends', 'Friends'], ['photos', 'Photos']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`relative px-4 py-4 text-[15px] font-semibold ${tab === id ? 'text-cx-blue' : 'text-cx-muted hover:bg-cx-hover'}`}>
                {label}{tab === id && <span className='absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-cx-blue' />}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className='mx-auto mt-4 max-w-[940px] px-0 sm:px-4'>
        {tab === 'posts' && (
          <div className='flex flex-col gap-4 lg:flex-row'>
            <div className='flex flex-col gap-4 lg:w-[40%]'>
              <Intro profile={profile} onEdit={() => setEditing(true)} />
              <Card className='p-4'>
                <div className='mb-3 flex items-center justify-between'><h2 className='text-xl font-bold'>Friends</h2><button onClick={() => setTab('friends')} className='text-cx-blue hover:underline'>See all</button></div>
                <FriendsGrid id={profile._id} limit={9} />
              </Card>
            </div>
            <div className='min-w-0 flex-1'>
              {profile.self && <CreatePostCard />}
              {posts.items.map((p) => <CxPostCard key={p._id} post={p} onDeleted={(d) => posts.setItems((l) => l.filter((x) => x._id !== d._id))} onHidden={removeHidden(posts.setItems)} />)}
              {posts.loading && <Spinner />}
              {!posts.loading && !posts.items.length && <Card className='p-6 text-center text-cx-muted'>No posts available</Card>}
              <div ref={more} />
            </div>
          </div>
        )}
        {tab === 'about' && <div className='max-w-[680px]'><Intro profile={profile} onEdit={() => setEditing(true)} /></div>}
        {tab === 'friends' && <Card className='p-4'><h2 className='mb-3 text-xl font-bold'>Friends</h2><FriendsGrid id={profile._id} /></Card>}
        {tab === 'photos' && <Card className='p-4'><h2 className='mb-3 text-xl font-bold'>Photos</h2><Photos id={profile._id} /></Card>}
      </div>
      {editing && <EditProfile profile={profile} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
      {menu && (
        <ActionSheet tone='cx' onClose={() => setMenu(false)} items={[
          { label : profile.snoozedUntil ? 'Unsnooze' : `Snooze ${profile.name.split(' ')[0]} for 30 days`, onClick : () => tool(`/cx/snooze/${profile._id}`, { snooze : !profile.snoozedUntil }, profile.snoozedUntil ? 'Unsnoozed' : 'Snoozed for 30 days') },
          { label : profile.unfollowed ? 'Follow posts again' : 'Unfollow', hidden : profile.friendStatus !== 'friends', onClick : () => tool(`/cx/unfollow/${profile._id}`, { unfollow : !profile.unfollowed }, profile.unfollowed ? 'You\'ll see their posts again' : 'You\'ll stay friends but won\'t see their posts') },
          { label : 'Copy link to profile', onClick : async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${userLink(profile)}`); notify('Link copied') } catch { notifyError("Couldn't copy") } } },
          { label : 'Report profile', danger : true, onClick : () => setReporting(true) },
        ]} />
      )}
      {reporting && <ReportSheet app='connectify' t='cx' target={{ user : profile._id }} onClose={() => setReporting(false)} />}
    </div>
  )
}

/* ---------------- friends ---------------- */

const PersonCard = ({ p, children, sub }) => (
  <div className='overflow-hidden rounded-lg bg-cx-card shadow-[0_1px_2px_rgba(0,0,0,.2)]'>
    <Link to={userLink(p)} className='flex aspect-square items-center justify-center overflow-hidden bg-cx-input'><PersonPhoto person={p} /></Link>
    <div className='p-3'>
      <Link to={userLink(p)} className='block truncate text-[17px] font-semibold hover:underline'>{p.name}</Link>
      <p className='mb-2 h-5 truncate text-[13px] text-cx-muted'>{sub}</p>
      {children}
    </div>
  </div>
)

export const ConnectifyFriends = () => {
  const me = useSelector((s) => s.user)
  const [reqs, setReqs] = useState(null)
  const [sugs, setSugs] = useState(null)
  const [tab, setTab] = useState('home')
  const load = () => {
    api.get('/friends/requests').then(setReqs).catch(() => setReqs({ received : [], sent : [] }))
    api.get('/friends/suggestions').then((r) => setSugs(r.people)).catch(() => setSugs([]))
  }
  useEffect(load, [])
  const mutual = (p) => (p.mutualFriends ? `${p.mutualFriends} mutual friend${p.mutualFriends > 1 ? 's' : ''}` : p.fromContacts ? 'In your Chatify contacts' : '')
  return (
    <div className='mx-auto max-w-[1100px] px-3 py-4 sm:px-6'>
      <div className='mb-4 flex flex-wrap gap-2'>
        {[['home', 'Home'], ['requests', `Friend requests${reqs?.received.length ? ` (${reqs.received.length})` : ''}`], ['all', 'All friends'], ['sent', 'Sent requests']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-9 rounded-full px-4 text-[15px] font-semibold ${tab === id ? 'bg-cx-blue/15 text-cx-blue' : 'bg-cx-input hover:brightness-95'}`}>{label}</button>
        ))}
      </div>
      {(tab === 'home' || tab === 'requests') && (
        <section className='mb-6'>
          <h2 className='mb-3 text-xl font-bold'>Friend requests</h2>
          {reqs === null ? <Spinner /> : !reqs.received.length ? <p className='text-cx-muted'>When you have friend requests, you'll see them here.</p> : (
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
              {reqs.received.map((p) => <PersonCard key={p._id} p={p} sub={mutual(p) || longAgo(p.at)}><FriendButton person={p} initial='received' compact onChange={() => setTimeout(load, 400)} /></PersonCard>)}
            </div>
          )}
        </section>
      )}
      {tab === 'home' && (
        <section>
          <h2 className='mb-3 text-xl font-bold'>People you may know</h2>
          {sugs === null ? <Spinner /> : !sugs.length ? <p className='text-cx-muted'>No suggestions right now. Save contacts in Chatify or add friends to see more.</p> : (
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
              {sugs.map((p) => <PersonCard key={p._id} p={p} sub={mutual(p)}><FriendButton person={p} compact /></PersonCard>)}
            </div>
          )}
        </section>
      )}
      {tab === 'sent' && (
        <section>
          <h2 className='mb-3 text-xl font-bold'>Sent requests</h2>
          {reqs === null ? <Spinner /> : !reqs.sent.length ? <p className='text-cx-muted'>No pending requests.</p> : (
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
              {reqs.sent.map((p) => <PersonCard key={p._id} p={p} sub={mutual(p)}><FriendButton person={p} initial='sent' compact /></PersonCard>)}
            </div>
          )}
        </section>
      )}
      {tab === 'all' && <Card className='p-4'><h2 className='mb-3 text-xl font-bold'>All friends</h2><FriendsGrid id={me._id} /></Card>}
    </div>
  )
}

/* ---------------- notifications ---------------- */

const NOTE = {
  react : 'reacted to your post',
  comment : 'commented on your post:',
  reply : 'replied to your comment:',
  comment_like : 'liked your comment:',
  mention : 'mentioned you:',
  friend_request : 'sent you a friend request',
  friend_accept : 'accepted your friend request',
  share : 'shared your post',
  tag : 'tagged you in a post',
  poke : 'poked you',
  group_invite : 'invited you to join',
  group_join_request : 'asked to join',
  group_join_accept : 'approved your request to join',
  event_invite : 'invited you to',
  event_going : 'is going to your event',
  page_follow : 'started following your Page',
}

// where tapping a notification goes
const noteTarget = (n) => {
  if (n.group && n.type === 'group_join_request') return `/connectify/groups/${n.group._id}?tab=requests`
  if (n.group && ['group_invite', 'group_join_accept'].includes(n.type)) return `/connectify/groups/${n.group._id}`
  if (n.page) return `/connectify/pages/${n.page._id}`
  if (n.event) return `/connectify/events/${n.event._id}`
  if (n.type === 'poke') return '/connectify/pokes'
  return n.post ? `/connectify/p/${n.post._id}` : userLink(n.actor)
}

export const ConnectifyNotifications = () => {
  const socket = useSelector((s) => s.user.socketConnection)
  const navigate = useNavigate()
  const [list, setList] = useState(null)
  const [filter, setFilter] = useState('all')
  const load = useCallback(() => {
    api.get('/notifications?app=connectify').then((r) => {
      setList(r.notifications)
      if (r.notifications.some((n) => !n.read)) api.post('/notifications/read', { app : 'connectify' }).catch(() => {})
    }).catch(() => setList([]))
  }, [])
  useEffect(() => {
    load()
    if (!socket) return
    const on = (e) => { if (e?.app === 'connectify' && !e.read) load() }
    socket.on('social-notification', on)
    return () => socket.off('social-notification', on)
  }, [socket, load])
  const shown = (list || []).filter((n) => filter === 'all' || !n.read)
  return (
    <div className='mx-auto max-w-[680px] px-0 py-4 sm:px-4'>
      <Card className='p-2'>
        <h1 className='px-2 pt-2 text-2xl font-bold'>Notifications</h1>
        <div className='flex gap-2 px-2 py-3'>
          {[['all', 'All'], ['unread', 'Unread']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`h-9 rounded-full px-3 text-[15px] font-semibold ${filter === id ? 'bg-cx-blue/15 text-cx-blue' : 'hover:bg-cx-hover'}`}>{label}</button>)}
        </div>
        {list === null && <Spinner />}
        {list && !shown.length && <p className='py-10 text-center text-cx-muted'>{filter === 'unread' ? "You're all caught up" : 'No notifications yet'}</p>}
        {shown.map((n) => (
          <div key={n._id} className='flex items-start gap-3 rounded-lg p-2 hover:bg-cx-hover'>
            <Link to={userLink(n.actor)} className='relative shrink-0'>
              <Avatar width={56} height={56} name={n.actor.name} imageUrl={n.actor.profile_pic} />
              {n.reaction && <span className='absolute -bottom-1 -right-1'><ReactionIcon type={n.reaction} size={24} /></span>}
              {['friend_request', 'friend_accept'].includes(n.type) && <span className='absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-cx-blue text-white ring-2 ring-cx-card'><IoPeople size={15} /></span>}
              {n.type === 'page_follow' && <span className='absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#f7923b] text-white ring-2 ring-cx-card'><IoFlag size={14} /></span>}
              {['comment', 'reply', 'mention'].includes(n.type) &&<span className='absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#45bd62] text-white ring-2 ring-cx-card'><IoChatbubbleEllipses size={14} /></span>}
            </Link>
            <div className='min-w-0 flex-1'>
              <button onClick={() => navigate(noteTarget(n))} className='text-left text-[15px]'>
                <b>{n.actor.name}</b> {NOTE[n.type] || ''} {n.group && <b>{n.group.name}</b>}{n.event && <b>{n.event.title}</b>}{n.page && <b>{n.page.name}</b>} {n.text && <span>"{n.text.slice(0, 100)}"</span>}
                {n.post?.text && ['react', 'share'].includes(n.type) && <span className='text-cx-muted'>: {n.post.text.slice(0, 60)}</span>}
              </button>
              <p className={`text-[13px] ${n.read ? 'text-cx-muted' : 'font-semibold text-cx-blue'}`}>{longAgo(n.createdAt)}</p>
              {n.type === 'friend_request' && n.friendStatus === 'received' && <div className='mt-2'><FriendButton person={n.actor} initial='received' compact /></div>}
            </div>
            {!n.read && <span className='mt-6 h-3 w-3 shrink-0 rounded-full bg-cx-blue' />}
          </div>
        ))}
      </Card>
    </div>
  )
}

/* ---------------- search ---------------- */

export const ConnectifySearch = () => {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState(null)
  const seq = useRef(0)
  useEffect(() => {
    const id = ++seq.current
    if (!q.trim()) { setPeople(null); return }
    const t = setTimeout(() => api.get(`/search?app=connectify&q=${enc(q.trim())}`).then((r) => id === seq.current && setPeople(r.people)).catch(() => id === seq.current && setPeople([])), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className='mx-auto max-w-[680px] px-3 py-4'>
      <div className='flex h-11 items-center gap-2 rounded-full bg-cx-card px-4 shadow-[0_1px_2px_rgba(0,0,0,.2)]'>
        <IoSearchOutline className='text-cx-muted' />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search Connectify' aria-label='Search' className='min-w-0 flex-1 bg-transparent outline-none placeholder:text-cx-muted' />
        {q && <button onClick={() => setQ('')} title='Clear'><IoCloseCircle size={20} className='text-cx-muted' /></button>}
      </div>
      <Card className='mt-4 p-2'>
        {people === null && <p className='p-6 text-center text-cx-muted'>Search for people by name or @username.</p>}
        {people?.length === 0 && <p className='p-6 text-center text-cx-muted'>We didn't find any results.</p>}
        {people?.map((p) => (
          <div key={p._id} className='flex items-center gap-3 rounded-lg p-2 hover:bg-cx-hover'>
            <Link to={userLink(p)} className='flex min-w-0 flex-1 items-center gap-3'>
              <Avatar width={56} height={56} name={p.name} imageUrl={p.profile_pic} />
              <span className='min-w-0'><span className='block truncate text-[17px] font-semibold'>{p.name}</span><span className='block truncate text-[13px] text-cx-muted'>{p.isFriend ? 'Friend' : `@${p.username}`}</span></span>
            </Link>
            {!p.self && !p.isFriend && <FriendButton person={p} compact />}
          </div>
        ))}
      </Card>
    </div>
  )
}

/* ---------------- one post ---------------- */

export const ConnectifyPostPage = () => {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { bump } = useConnectify()
  const [post, setPost] = useState(undefined)
  useEffect(() => {
    setPost(undefined)
    api.get(`/posts/${postId}`).then((r) => {
      if (r.post.app !== 'connectify') return navigate(`/pixify/p/${postId}`, { replace : true })
      setPost(r.post)
    }).catch(() => setPost(null))
  }, [postId, navigate])
  return (
    <div className='mx-auto max-w-[680px] px-0 py-4 sm:px-4'>
      <button onClick={() => navigate(-1)} className='mb-3 ml-3 flex items-center gap-2 font-semibold text-cx-muted sm:ml-0'><IoArrowBack /> Back</button>
      {post === undefined && <Spinner />}
      {post === null && <Card className='p-8 text-center'><h2 className='text-xl font-bold'>This content isn't available right now</h2><p className='mt-2 text-cx-muted'>It may have been deleted, or shared with a small group that doesn't include you.</p></Card>}
      {post && <CxPostCard post={post} expanded onDeleted={() => { bump(); navigate('/connectify', { replace : true }) }} />}
    </div>
  )
}

/* ---------------- menu (phones) ---------------- */

export const ConnectifyMenu = () => {
  const me = useSelector((s) => s.user)
  const navigate = useNavigate()
  return (
    <div className='mx-auto max-w-[680px] px-3 py-4'>
      <h1 className='mb-3 text-2xl font-bold'>Menu</h1>
      <Card className='mb-4 p-2'><SideLink icon={<Avatar width={36} height={36} name={me.name} imageUrl={me.profile_pic} />} label={me.name} onClick={() => navigate(`/connectify/u/${me.username || me._id}`)} /></Card>
      <div className='grid grid-cols-2 gap-2'>
        {SHORTCUTS.map((s) => <Card key={s.path} className='p-3'><button onClick={() => navigate(s.path)} className='w-full text-left'><s.Icon size={26} className={s.color} /><span className='mt-2 block font-semibold'>{s.label}</span></button></Card>)}
      </div>
      <h2 className='mb-2 mt-5 font-semibold text-cx-muted'>Your apps</h2>
      <Card className='p-2'>
        {APPS.map((a) => <SideLink key={a.id} icon={<AppMark app={a.id} size={30} />} label={`${a.name} · ${a.hint}`} onClick={() => navigate(a.path)} />)}
      </Card>
    </div>
  )
}
