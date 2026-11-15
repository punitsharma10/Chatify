import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { IoAdd, IoImages, IoHappyOutline, IoVideocam, IoClose, IoPersonAdd } from 'react-icons/io5'
import Avatar from '../Avatar'
import useStories from '../apps/useStories'
import { StoryPreview, useStoryComposer, useStoryViewer, usePersonLabel } from '../apps/stories'
import { ConnectifyMark } from '../apps/AppLogos'
import { PersonPhoto } from '../social/common'
import { api, usePaged, useOnVisible } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { useConnectify, Card } from './ConnectifyLayout'
import { CxPostCard } from './CxPost'

const StoriesRow = () => {
  const user = useSelector((s) => s.user)
  const { data, ordered, reload } = useStories('connectify')
  const composer = useStoryComposer('connectify', { onPosted : reload, tone : 'cx' })
  const viewer = useStoryViewer('connectify', reload)
  const label = usePersonLabel('connectify')
  const mine = data?.mine || []
  const me = { _id : user._id, name : user.name, username : user.username, profile_pic : user.profile_pic, self : true }
  return (
    <section aria-label='Stories' className='flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-none sm:px-0'>
      <button onClick={composer.openPicker} className='group relative h-[200px] w-[112px] shrink-0 overflow-hidden rounded-xl bg-cx-card text-left shadow-[0_1px_2px_rgba(0,0,0,.2)]' title='Create story'>
        <span className='block h-[150px] overflow-hidden'>
          {user.profile_pic
            ? <img src={user.profile_pic} alt='' className='h-full w-full object-cover transition-transform group-hover:scale-105' />
            : <span className='flex h-full w-full items-center justify-center bg-cx-input'><Avatar width={72} height={72} name={user.name} /></span>}
        </span>
        <span className='absolute left-1/2 top-[132px] flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-4 border-cx-card bg-cx-blue text-white'><IoAdd size={20} /></span>
        <span className='absolute inset-x-0 bottom-2.5 text-center text-[13px] font-semibold'>Create story</span>
      </button>
      {mine.length > 0 && (
        <button onClick={() => viewer.open([{ user : me, statuses : mine }], 0, { mine : true })} className='relative h-[200px] w-[112px] shrink-0 overflow-hidden rounded-xl bg-black' title='Your story'>
          <StoryPreview status={mine[mine.length - 1]} className='h-full w-full' />
          <span className='absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60' />
          <span className='absolute left-2.5 top-2.5 rounded-full ring-4 ring-cx-blue'><Avatar width={34} height={34} name={user.name} imageUrl={user.profile_pic} /></span>
          <span className='absolute inset-x-2 bottom-2 text-left text-[13px] font-semibold text-white'>Your story</span>
        </button>
      )}
      {!data && [0, 1, 2].map((i) => <span key={i} className='h-[200px] w-[112px] shrink-0 animate-pulse rounded-xl bg-cx-card' />)}
      {ordered.map((g, i) => (
        <button key={g.user._id} onClick={() => viewer.open(ordered, i)} className={`relative h-[200px] w-[112px] shrink-0 overflow-hidden rounded-xl bg-black ${g.muted ? 'opacity-60' : ''}`} title={label(g.user)}>
          <StoryPreview status={g.statuses[g.statuses.length - 1]} className='h-full w-full transition-transform hover:scale-105' />
          <span className='pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60' />
          <span className={`absolute left-2.5 top-2.5 rounded-full ring-4 ${g.allViewed ? 'ring-white/50' : 'ring-cx-blue'}`}><Avatar width={34} height={34} name={g.user.name} imageUrl={g.user.profile_pic} /></span>
          <span className='absolute inset-x-2 bottom-2 line-clamp-2 text-left text-[13px] font-semibold text-white'>{label(g.user)}</span>
        </button>
      ))}
      {composer.element}
      {viewer.element}
    </section>
  )
}

export const FriendButton = ({ person, initial = 'none', onChange, compact : small = false }) => {
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => setStatus(initial), [initial])
  const act = async (action) => {
    setBusy(true)
    try { const r = await api.post(`/friends/${person._id}`, { action }); setStatus(r.friendStatus); onChange?.(r.friendStatus) } catch (e) { notifyError(e.message) }
    setBusy(false)
  }
  const base = `flex items-center justify-center gap-1.5 rounded-md font-semibold disabled:opacity-60 ${small ? 'h-8 px-3 text-sm' : 'h-9 px-3 text-[15px]'}`
  if (status === 'friends') return <button disabled={busy} onClick={() => act('remove')} className={`${base} bg-cx-input hover:brightness-95`} title='Unfriend'>✓ Friends</button>
  if (status === 'sent') return <button disabled={busy} onClick={() => act('cancel')} className={`${base} bg-cx-input hover:brightness-95`}>Cancel request</button>
  if (status === 'received') {
    return (
      <span className={small ? 'grid grid-cols-2 gap-1.5' : 'flex gap-2'}>
        <button disabled={busy} onClick={() => act('accept')} className={`${base} bg-cx-blue text-white ${small ? '!px-1' : ''}`}>Confirm</button>
        <button disabled={busy} onClick={() => act('decline')} className={`${base} bg-cx-input ${small ? '!px-1' : ''}`}>Delete</button>
      </span>
    )
  }
  if (status === 'self') return null
  return <button disabled={busy} onClick={() => act('request')} className={`${base} bg-cx-blue/10 text-cx-blue hover:bg-cx-blue/20 dark:bg-cx-blue/20`}><IoPersonAdd size={16} />Add friend</button>
}

const PeopleYouMayKnow = () => {
  const [people, setPeople] = useState(null)
  const [hidden, setHidden] = useState([])
  useEffect(() => { api.get('/friends/suggestions').then((r) => setPeople(r.people)).catch(() => setPeople([])) }, [])
  const shown = (people || []).filter((p) => !hidden.includes(p._id))
  if (!shown.length) return null
  return (
    <Card className='mb-4 py-3'>
      <div className='flex items-center justify-between px-4 pb-2'><p className='text-[17px] font-semibold'>People you may know</p><Link to='/connectify/friends' className='text-[15px] text-cx-blue hover:underline'>See all</Link></div>
      <div className='flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none'>
        {shown.slice(0, 12).map((p) => (
          <div key={p._id} className='relative w-[180px] shrink-0 overflow-hidden rounded-lg border border-cx-border'>
            <button onClick={() => setHidden((h) => [...h, p._id])} className='absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white' title='Remove'><IoClose size={16} /></button>
            <Link to={`/connectify/u/${p.username || p._id}`} className='flex aspect-square items-center justify-center overflow-hidden bg-cx-input'>
              <PersonPhoto person={p} />
            </Link>
            <div className='p-3'>
              <Link to={`/connectify/u/${p.username || p._id}`} className='block truncate text-[15px] font-semibold hover:underline'>{p.name}</Link>
              <p className='mb-2 truncate text-[13px] text-cx-muted'>{p.mutualFriends ? `${p.mutualFriends} mutual friend${p.mutualFriends > 1 ? 's' : ''}` : p.fromContacts ? 'In your Chats contacts' : ' '}</p>
              <FriendButton person={p} compact />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export const CreatePostCard = () => {
  const user = useSelector((s) => s.user)
  const { openComposer } = useConnectify()
  const firstName = (user.name || '').trim().split(/\s+/)[0]
  return (
    <Card className='mb-4 px-4 pb-2 pt-3'>
      <div className='flex items-center gap-2'>
        <Link to={`/connectify/u/${user.username || user._id}`}><Avatar width={40} height={40} name={user.name} imageUrl={user.profile_pic} /></Link>
        <button onClick={() => openComposer()} className='h-10 flex-1 truncate rounded-full bg-cx-input px-3 text-left text-[17px] text-cx-muted hover:brightness-95'>What's on your mind, {firstName}?</button>
      </div>
      <div className='mt-3 grid grid-cols-3 border-t border-cx-border pt-1'>
        <button onClick={() => notify('Live video is coming soon to Connectify')} className='flex items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoVideocam size={22} className='text-[#f02849]' /><span className='hidden sm:inline'>Live video</span></button>
        <button onClick={() => openComposer({ withPhotos : true })} className='flex items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoImages size={21} className='text-[#45bd62]' /><span className='hidden sm:inline'>Photo/video</span></button>
        <button onClick={() => openComposer()} className='flex items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoHappyOutline size={22} className='text-[#f7b928]' /><span className='hidden sm:inline'>Feeling</span></button>
      </div>
    </Card>
  )
}

const ConnectifyHome = () => {
  const user = useSelector((s) => s.user)
  const { version, openComposer } = useConnectify()
  const feed = usePaged(`/feed?app=connectify&v=${version}`)
  const more = useOnVisible(feed.loadMore, !feed.done && !feed.loading)
  const firstName = (user.name || '').trim().split(/\s+/)[0]
  return (
    <div className='mx-auto w-full max-w-[590px] px-0 py-4 sm:px-4'>
      <StoriesRow />
      <div className='mt-4'><CreatePostCard /></div>
      {feed.items.slice(0, 2).map((p) => <CxPostCard key={p._id} post={p} onDeleted={(d) => feed.setItems((l) => l.filter((x) => x._id !== d._id))} />)}
      <PeopleYouMayKnow />
      {feed.items.slice(2).map((p) => <CxPostCard key={p._id} post={p} onDeleted={(d) => feed.setItems((l) => l.filter((x) => x._id !== d._id))} />)}
      {feed.loading && [0, 1].map((i) => (
        <Card key={i} className='mb-4 p-4'>
          <div className='flex items-center gap-2'><span className='h-10 w-10 animate-pulse rounded-full bg-cx-input' /><span className='h-3 w-40 animate-pulse rounded bg-cx-input' /></div>
          <div className='mt-4 h-40 animate-pulse rounded bg-cx-input' />
        </Card>
      ))}
      {feed.error && <Card className='p-6 text-center text-cx-muted'>{feed.error} <button onClick={feed.reload} className='font-semibold text-cx-blue'>Retry</button></Card>}
      <div ref={more} />
      {!feed.loading && !feed.items.length && !feed.error && (
        <Card className='flex flex-col items-center px-6 py-10 text-center'>
          <ConnectifyMark size={56} />
          <h2 className='mt-4 text-xl font-bold'>Welcome to Connectify, {firstName}!</h2>
          <p className='mt-2 max-w-sm text-[15px] text-cx-muted'>Add friends to see their posts here, or share what's on your mind.</p>
          <div className='mt-5 flex gap-2'>
            <button onClick={() => openComposer()} className='rounded-md bg-cx-blue px-4 py-2 text-[15px] font-semibold text-white hover:brightness-95'>Create a post</button>
            <Link to='/connectify/friends' className='rounded-md bg-cx-input px-4 py-2 text-[15px] font-semibold hover:brightness-95'>Find friends</Link>
          </div>
        </Card>
      )}
      {feed.done && feed.items.length > 0 && <p className='py-6 text-center text-sm text-cx-muted'>You're all caught up</p>}
    </div>
  )
}

export default ConnectifyHome
