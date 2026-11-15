import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { IoGridOutline, IoFilmOutline, IoBookmarkOutline, IoLockClosedOutline, IoCameraOutline, IoCopy, IoHeart, IoChatbubble, IoLinkOutline, IoArrowBack, IoSettingsOutline, IoPersonCircleOutline, IoMenu, IoPlay } from 'react-icons/io5'
import { BsPinAngleFill } from 'react-icons/bs'
import Avatar from '../Avatar'
import UsernameField, { normalizeUsername } from '../apps/UsernameField'
import { api, enc, compact, usePaged, useOnVisible } from '../../helpers/social'
import uploadFile from '../../helpers/uploadFile'
import { setUser } from '../../redux/userSlice'
import { notify, notifyError } from '../../helpers/toast'
import { MediaThumb, PeopleModal, ActionSheet, RichText } from '../social/common'
import { ReportSheet } from '../social/extras'
import { FollowButton } from './PixifyHome'
import { usePixify } from './PixifyLayout'
import { HighlightsRow } from './Highlights'

// 3-column grid of posts (hover shows likes / comments)
export const PostGrid = ({ paged, empty }) => {
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  return (
    <>
      <div className='grid grid-cols-3 gap-[3px]'>
        {paged.items.map((p) => (
          <Link key={p._id} to={`/pixify/p/${p._id}`} className='group relative aspect-square overflow-hidden bg-px-raised'>
            <MediaThumb media={p.media[0]} className='h-full w-full' />
            {p.pinned ? <BsPinAngleFill className='absolute right-2 top-2 text-white drop-shadow' size={16} />
              : p.media.length > 1 ? <IoCopy className='absolute right-2 top-2 text-white drop-shadow' size={18} />
              : p.isReel ? <IoFilmOutline className='absolute right-2 top-2 text-white drop-shadow' size={18} /> : null}
            {p.isReel && p.views > 0 && <span className='absolute bottom-1.5 left-2 flex items-center gap-1 text-xs font-semibold text-white drop-shadow'><IoPlay size={12} />{compact(p.views)}</span>}
            <span className='absolute inset-0 hidden items-center justify-center gap-6 bg-black/35 font-bold text-white group-hover:flex'>
              {!(p.hideLikes && !p.mine) && <span className='flex items-center gap-1.5'><IoHeart size={20} />{compact(p.reactionCount)}</span>}
              {!p.commentsOff && <span className='flex items-center gap-1.5'><IoChatbubble size={19} className='-scale-x-100' />{compact(p.commentCount)}</span>}
            </span>
          </Link>
        ))}
        {paged.loading && [0, 1, 2].map((i) => <span key={i} className='aspect-square animate-pulse bg-px-raised' />)}
      </div>
      {!paged.loading && !paged.items.length && empty}
      <div ref={more} />
    </>
  )
}

const Stat = ({ n, label, onClick }) => (
  <button onClick={onClick} disabled={!onClick} className='text-center md:text-left'>
    <span className='block font-semibold md:inline'>{compact(n)}</span> <span className='text-px-muted md:text-px-text'>{label}</span>
  </button>
)

const PixifyProfile = () => {
  const { handle } = useParams()
  const navigate = useNavigate()
  const { version, openPostComposer, shareProfile } = usePixify()
  const [profile, setProfile] = useState(undefined)
  const [tab, setTab] = useState('posts')
  const [list, setList] = useState(null) // { title, people }
  const [menu, setMenu] = useState(false)
  const [myMenu, setMyMenu] = useState(false)
  const [reporting, setReporting] = useState(false)

  const load = () => api.get(`/users/${enc(handle)}?app=pixify`).then((r) => setProfile(r.profile)).catch(() => setProfile(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setProfile(undefined); setTab('posts'); load() }, [handle, version])

  const isMe = profile?.self
  const posts = usePaged(profile?.canView || isMe ? `/users/${profile?._id}/posts?app=pixify&v=${version}` : null)
  const saved = usePaged(tab === 'saved' && isMe ? `/saved?v=${version}` : null)
  const tagged = usePaged(tab === 'tagged' && (profile?.canView || isMe) ? `/users/${profile?._id}/posts?app=pixify&tab=tagged&v=${version}` : null)

  if (profile === undefined) return <span className='mx-auto mt-24 block h-7 w-7 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />
  if (profile === null) {
    return (
      <div className='px-6 py-20 text-center'>
        <h2 className='text-xl font-bold'>Sorry, this page isn't available.</h2>
        <p className='mt-3 text-sm text-px-muted'>The link may be broken, or the account may have been removed. <Link to='/pixify' className='text-px-blue'>Go back to Pixify.</Link></p>
      </div>
    )
  }

  const openList = async (type) => {
    if (!profile.canView) return
    setList({ title : type === 'followers' ? 'Followers' : 'Following', people : null })
    try {
      const r = await api.get(`/users/${profile._id}/follows?type=${type}`)
      setList({ title : type === 'followers' ? 'Followers' : 'Following', people : r.people, type })
    } catch (e) { setList(null); notifyError(e.message) }
  }

  const reels = { ...posts, items : posts.items.filter((p) => p.isReel) }
  const toggle = async (url, body, text) => { try { await api.post(url, body); notify(text); load() } catch (e) { notifyError(e.message) } }

  return (
    <div className='mx-auto max-w-[935px] pb-10 md:px-5 md:pt-8'>
      {/* phone header */}
      <div className='flex h-11 items-center gap-3 border-b border-px-border px-4 md:hidden'>
        <button onClick={() => navigate(-1)} title='Back'><IoArrowBack size={22} /></button>
        <span className='flex-1 truncate text-center font-semibold'>{profile.username || profile.name}</span>
        {isMe ? <button onClick={() => setMyMenu(true)} title='Menu'><IoMenu size={24} /></button> : <span className='w-6' />}
      </div>

      <header className='flex gap-6 px-4 pt-4 md:gap-20 md:px-12 md:pt-0'>
        <div className='shrink-0 md:w-[150px] md:pl-4'>
          <span className='hidden md:block'><Avatar width={150} height={150} name={profile.name} imageUrl={profile.profile_pic} /></span>
          <span className='md:hidden'><Avatar width={80} height={80} name={profile.name} imageUrl={profile.profile_pic} /></span>
        </div>
        <section className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-3'>
            <h1 className='mr-2 text-xl'>{profile.username || profile.name}</h1>
            {isMe ? (
              <>
                <button onClick={() => navigate('/pixify/edit')} className='h-8 rounded-lg bg-px-raised px-4 text-sm font-semibold hover:bg-px-border'>Edit profile</button>
                <button onClick={() => shareProfile(profile)} className='h-8 rounded-lg bg-px-raised px-4 text-sm font-semibold hover:bg-px-border'>Share profile</button>
                <button onClick={() => setMyMenu(true)} className='hidden h-8 items-center px-1 md:flex' title='Settings and activity'><IoSettingsOutline size={24} /></button>
              </>
            ) : (
              <>
                <FollowButton person={profile} initial={profile.followStatus} onChange={() => load()} />
                <button onClick={() => navigate(`/pixify/direct/u/${profile.username || profile._id}`)} className='h-8 rounded-lg bg-px-raised px-4 text-sm font-semibold hover:bg-px-border'>Message</button>
                <button onClick={() => setMenu(true)} className='h-8 px-1 text-xl leading-none' title='Options'>⋯</button>
              </>
            )}
          </div>
          <div className='mt-5 hidden gap-10 text-base md:flex'>
            <Stat n={profile.posts} label={profile.posts === 1 ? 'post' : 'posts'} />
            <Stat n={profile.followers} label={profile.followers === 1 ? 'follower' : 'followers'} onClick={profile.canView ? () => openList('followers') : null} />
            <Stat n={profile.following} label='following' onClick={profile.canView ? () => openList('following') : null} />
          </div>
          <div className='mt-4 hidden text-sm md:block'>
            <p className='font-semibold'>{profile.name}{profile.pronouns && <span className='ml-2 font-normal text-px-muted'>{profile.pronouns}</span>}</p>
            {profile.bio && <RichText text={profile.bio} app='pixify' className='block' linkClass='text-[#00376b] dark:text-[#e0f1ff]' />}
            {profile.website && <a href={profile.website} target='_blank' rel='noopener noreferrer nofollow' className='flex items-center gap-1 font-semibold text-[#00376b] dark:text-[#e0f1ff]'><IoLinkOutline />{profile.website.replace(/^https?:\/\//, '')}</a>}
            {profile.followsMe && <p className='mt-1 text-xs text-px-muted'>Follows you</p>}
            {profile.followedBy?.length > 0 && <p className='mt-2 text-xs text-px-muted'>Followed by {profile.followedBy.map((p) => p.username).join(', ')}</p>}
          </div>
        </section>
      </header>
      {/* phone: name + bio below */}
      <div className='mt-3 px-4 text-sm md:hidden'>
        <p className='font-semibold'>{profile.name}{profile.pronouns && <span className='ml-2 font-normal text-px-muted'>{profile.pronouns}</span>}</p>
        {profile.bio && <RichText text={profile.bio} app='pixify' className='block' />}
        {profile.website && <a href={profile.website} target='_blank' rel='noopener noreferrer nofollow' className='font-semibold text-[#00376b] dark:text-[#e0f1ff]'>{profile.website.replace(/^https?:\/\//, '')}</a>}
        {profile.followsMe && <p className='mt-1 text-xs text-px-muted'>Follows you</p>}
        {profile.followedBy?.length > 0 && <p className='mt-1 text-xs text-px-muted'>Followed by {profile.followedBy.map((p) => p.username).join(', ')}</p>}
      </div>
      {/* story highlights (Instagram: round circles under the bio) */}
      {(profile.canView || isMe) && <HighlightsRow key={`${profile._id}:${version}`} profile={profile} isMe={isMe} />}
      <div className='mt-4 flex justify-around border-t border-px-border py-3 text-sm md:hidden'>
        <Stat n={profile.posts} label='posts' />
        <Stat n={profile.followers} label='followers' onClick={profile.canView ? () => openList('followers') : null} />
        <Stat n={profile.following} label='following' onClick={profile.canView ? () => openList('following') : null} />
      </div>

      {!profile.canView ? (
        <div className='mt-4 border-t border-px-border px-6 py-14 text-center md:mt-12'>
          <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-px-text'><IoLockClosedOutline size={30} /></span>
          <p className='mt-4 font-semibold'>This account is private</p>
          <p className='mt-1 text-sm text-px-muted'>Follow this account to see their photos and videos.</p>
        </div>
      ) : (
        <>
          <nav className='mt-0 flex justify-center gap-14 border-t border-px-border text-xs font-semibold uppercase tracking-widest md:mt-12'>
            {[['posts', 'Posts', IoGridOutline], ['reels', 'Reels', IoFilmOutline], ...(isMe ? [['saved', 'Saved', IoBookmarkOutline]] : []), ['tagged', 'Tagged', IoPersonCircleOutline]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
                className={`-mt-px flex items-center gap-1.5 border-t py-4 ${tab === id ? 'border-px-text text-px-text' : 'border-transparent text-px-muted'}`}>
                <Icon size={14} /><span className='hidden sm:inline'>{label}</span>
              </button>
            ))}
          </nav>
          {tab === 'posts' && <PostGrid paged={posts} empty={(
            <div className='py-14 text-center'>
              <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-px-text'><IoCameraOutline size={32} /></span>
              <p className='mt-4 text-2xl font-extrabold'>{isMe ? 'Share photos' : 'No posts yet'}</p>
              {isMe && <><p className='mt-2 text-sm'>When you share photos, they will appear on your profile.</p><button onClick={openPostComposer} className='mt-3 text-sm font-semibold text-px-blue'>Share your first photo</button></>}
            </div>
          )} />}
          {tab === 'reels' && <PostGrid paged={reels} empty={<p className='py-14 text-center text-sm text-px-muted'>No reels yet. A post with a single video becomes a reel.</p>} />}
          {tab === 'tagged' && <PostGrid paged={tagged} empty={(
            <div className='py-14 text-center'>
              <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-px-text'><IoPersonCircleOutline size={34} /></span>
              <p className='mt-4 text-2xl font-extrabold'>{isMe ? 'Photos of you' : 'No photos'}</p>
              <p className='mt-2 text-sm text-px-muted'>{isMe ? "When people tag you in photos, they'll appear here." : "Photos they're tagged in will appear here."}</p>
            </div>
          )} />}
          {tab === 'saved' && <PostGrid paged={saved} empty={<p className='py-14 text-center text-sm text-px-muted'>Save photos and videos you want to see again. Only you can see what you've saved.</p>} />}
        </>
      )}

      {list && (
        <PeopleModal title={list.title} app='pixify' people={list.people} onClose={() => setList(null)}
          renderAction={(p) => (p.self ? null : (
            isMe && list.type === 'followers'
              ? <button onClick={async () => { try { await api.post(`/followers/${p._id}/remove`); setList((l) => ({ ...l, people : l.people.filter((x) => x._id !== p._id) })); load() } catch (e) { notifyError(e.message) } }} className='h-8 rounded-lg bg-px-raised px-3 text-sm font-semibold'>Remove</button>
              : <FollowButton person={p} initial={p.followStatus} />
          ))} />
      )}
      {reporting && <ReportSheet app='pixify' target={{ user : profile._id }} onClose={() => setReporting(false)} />}
      {myMenu && (
        <ActionSheet onClose={() => setMyMenu(false)} items={[
          { label : 'Edit profile', onClick : () => navigate('/pixify/edit') },
          { label : 'Your activity (likes)', onClick : () => navigate('/pixify/activity') },
          { label : 'Archive', onClick : () => navigate('/pixify/archive') },
          { label : 'Stories archive', onClick : () => navigate('/pixify/archive/stories') },
          { label : 'Close friends', onClick : () => navigate('/pixify/close-friends') },
          { label : 'Saved', onClick : () => setTab('saved') },
          { label : 'Favorites', onClick : () => navigate('/pixify/people/favorites') },
          { label : 'Muted accounts', onClick : () => navigate('/pixify/people/muted') },
          { label : 'Scheduled posts', onClick : () => navigate('/pixify/scheduled') },
          { label : 'Hidden words', onClick : () => navigate('/pixify/hidden-words') },
        ]} />
      )}
      {menu && (
        <ActionSheet onClose={() => setMenu(false)} items={[
          { label : 'Report', danger : true, onClick : () => setReporting(true) },
          { label : profile.muted ? 'Unmute' : 'Mute', onClick : () => toggle(`/mute/${profile._id}`, { mute : !profile.muted }, profile.muted ? 'Unmuted' : `Muted ${profile.username}. Their posts won't show in your feed.`) },
          { label : profile.favorite ? 'Remove from favorites' : 'Add to favorites', hidden : profile.followStatus !== 'active', onClick : () => toggle(`/favorites/${profile._id}`, { favorite : !profile.favorite }, profile.favorite ? 'Removed from Favorites' : 'Added to Favorites') },
          { label : 'Share this profile', onClick : () => shareProfile(profile) },
          { label : 'Copy profile link', onClick : async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/pixify/u/${profile.username}`); notify('Link copied') } catch { notifyError("Couldn't copy") } } },
          { label : 'Remove follower', danger : true, hidden : !profile.followsMe, onClick : async () => { try { await api.post(`/followers/${profile._id}/remove`); notify('Removed'); load() } catch (e) { notifyError(e.message) } } },
          { label : 'Open chat', onClick : () => navigate('/' + profile._id) },
        ]} />
      )}
    </div>
  )
}

/* ---------------- edit profile ---------------- */

export const PixifyEditProfile = () => {
  const me = useSelector((s) => s.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name : me.name, bio : me.pixify?.bio || '', website : me.pixify?.website || '', pronouns : me.pixify?.pronouns || '', private : !!me.pixify?.private })
  const [username, setUsername] = useState(me.username || '')
  const [usernameState, setUsernameState] = useState('idle')
  const [photo, setPhoto] = useState(me.profile_pic)
  const [busy, setBusy] = useState(false)
  const [photoMenu, setPhotoMenu] = useState(false)
  const file = useRef(null)

  useEffect(() => {
    // the profile in Redux may be loaded after this screen opens
    if (!me._id) return
    setForm((f) => ({ ...f, name : f.name || me.name || '' }))
    setUsername((u) => u || me.username || '')
    setPhoto((p) => p || me.profile_pic || '')
    api.get(`/users/${me._id}?app=pixify`).then((r) => setForm((f) => ({ ...f, bio : r.profile.bio, website : r.profile.website, pronouns : r.profile.pronouns || '', private : r.profile.private }))).catch(() => {})
  }, [me._id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return notifyError('Choose a photo')
    setBusy(true)
    try { const up = await uploadFile(f); setPhoto(up.url) } catch { notifyError("Couldn't upload the photo") }
    setBusy(false)
  }

  const save = async (e) => {
    e.preventDefault()
    const newName = normalizeUsername(username)
    if (newName !== (me.username || '') && usernameState !== 'ok') return notifyError('Choose an available username')
    setBusy(true)
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/updateuser`, {
        name : form.name, profile_pic : photo, ...(newName !== (me.username || '') ? { username : newName } : {})
      }, { withCredentials : true })
      const r = await api.post('/profile', { app : 'pixify', bio : form.bio, website : form.website, pronouns : form.pronouns, private : form.private })
      dispatch(setUser({ ...res.data.data, pixify : r.data.pixify }))
      notify('Profile saved')
      navigate(`/pixify/u/${res.data.data.username || me._id}`)
    } catch (err) {
      notifyError(err?.response?.data?.message || err.message)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={save} className='mx-auto max-w-[640px] px-4 py-6 md:py-10'>
      <h1 className='mb-6 text-xl font-bold'>Edit profile</h1>
      <div className='flex items-center gap-4 rounded-2xl bg-px-raised/70 p-4'>
        <Avatar width={56} height={56} name={form.name} imageUrl={photo} />
        <div className='min-w-0 flex-1'>
          <p className='truncate font-semibold'>{me.username}</p>
          <p className='truncate text-sm text-px-muted'>{form.name}</p>
        </div>
        <button type='button' onClick={() => setPhotoMenu(true)} disabled={busy} className='h-8 rounded-lg bg-px-blue px-4 text-sm font-semibold text-white disabled:opacity-60'>Change photo</button>
        <input ref={file} type='file' accept='image/*' className='hidden' onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      <label className='mt-6 block font-semibold' htmlFor='px-name'>Name</label>
      <input id='px-name' value={form.name} onChange={(e) => setForm({ ...form, name : e.target.value })} maxLength={50} className='mt-2 h-11 w-full rounded-xl border border-px-border bg-transparent px-4 outline-none focus:border-px-muted' />

      <div className='mt-6'><UsernameField tone='px' value={username} current={me.username} nameHint={form.name} onChange={(v, s) => { setUsername(v); setUsernameState(s) }} /></div>

      <label className='mt-6 block font-semibold' htmlFor='px-pronouns'>Pronouns</label>
      <input id='px-pronouns' value={form.pronouns} onChange={(e) => setForm({ ...form, pronouns : e.target.value })} maxLength={30} placeholder='e.g. she/her' className='mt-2 h-11 w-full rounded-xl border border-px-border bg-transparent px-4 outline-none focus:border-px-muted' />

      <label className='mt-6 block font-semibold' htmlFor='px-web'>Website</label>
      <input id='px-web' value={form.website} onChange={(e) => setForm({ ...form, website : e.target.value })} maxLength={200} placeholder='https://' className='mt-2 h-11 w-full rounded-xl border border-px-border bg-transparent px-4 outline-none focus:border-px-muted' />

      <label className='mt-6 block font-semibold' htmlFor='px-bio'>Bio</label>
      <textarea id='px-bio' value={form.bio} onChange={(e) => setForm({ ...form, bio : e.target.value })} maxLength={150} rows={3} className='mt-2 w-full resize-none rounded-xl border border-px-border bg-transparent px-4 py-3 outline-none focus:border-px-muted' />
      <p className='text-right text-xs text-px-muted'>{form.bio.length} / 150</p>

      <label className='mt-6 flex cursor-pointer items-center gap-4 rounded-xl border border-px-border p-4'>
        <span className='min-w-0 flex-1'>
          <span className='block font-semibold'>Private account</span>
          <span className='block text-sm text-px-muted'>Only people you approve can see your photos, videos and stories. Your bio and profile photo stay visible.</span>
        </span>
        <input type='checkbox' className='peer sr-only' checked={form.private} onChange={(e) => setForm({ ...form, private : e.target.checked })} />
        <span className='relative h-6 w-10 shrink-0 rounded-full bg-px-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-px-text peer-checked:after:translate-x-4' />
      </label>

      <div className='mt-8 flex justify-end gap-3'>
        <button type='button' onClick={() => navigate(-1)} className='h-10 rounded-lg px-5 text-sm font-semibold hover:bg-px-hover'>Cancel</button>
        <button disabled={busy} className='h-10 rounded-lg bg-px-blue px-8 text-sm font-semibold text-white disabled:opacity-60'>{busy ? 'Saving…' : 'Submit'}</button>
      </div>

      {photoMenu && (
        <ActionSheet title='Change profile photo' onClose={() => setPhotoMenu(false)} items={[
          { label : 'Upload photo', bold : true, onClick : () => file.current?.click() },
          { label : 'Remove current photo', danger : true, hidden : !photo, onClick : () => setPhoto('') },
        ]} />
      )}
    </form>
  )
}

export default PixifyProfile
