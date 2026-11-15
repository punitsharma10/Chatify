import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { IoAdd, IoCheckmarkCircleOutline } from 'react-icons/io5'
import Avatar from '../Avatar'
import useStories from '../apps/useStories'
import { StoryPreview, useStoryViewer, usePersonLabel } from '../apps/stories'
import { api, usePaged, useOnVisible } from '../../helpers/social'
import { notifyError } from '../../helpers/toast'
import { MediaThumb } from '../social/common'
import { usePixify } from './PixifyLayout'
import { PostCard } from './Post'

// story ring: warm gradient when there's something new, grey when everything was seen
export const Ring = ({ seen, size = 66, children }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-full p-[2.5px] ${seen ? 'bg-px-border' : 'bg-gradient-to-tr from-[#ffb03a] via-[#ff3d77] to-[#a33ffc]'}`} style={{ width : size, height : size }}>
    <span className='flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[2.5px] border-px-bg bg-px-bg'>{children}</span>
  </span>
)

export const FollowButton = ({ person, initial = null, size = 'sm', onChange }) => {
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => setStatus(initial), [initial])
  const toggle = async (e) => {
    e?.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const r = await api.post(`/follow/${person._id}`, { follow : !status })
      setStatus(r.followStatus)
      onChange?.(r.followStatus)
    } catch (err) { notifyError(err.message) }
    setBusy(false)
  }
  if (size === 'link') {
    return <button onClick={toggle} disabled={busy} className={`text-xs font-semibold ${status ? 'text-px-text' : 'text-px-blue hover:text-px-text'}`}>{status === 'active' ? 'Following' : status === 'pending' ? 'Requested' : 'Follow'}</button>
  }
  return (
    <button onClick={toggle} disabled={busy} className={`h-8 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-60 ${status ? 'bg-px-raised text-px-text hover:bg-px-border' : 'bg-px-blue text-white hover:brightness-95'}`}>
      {status === 'active' ? 'Following' : status === 'pending' ? 'Requested' : 'Follow'}
    </button>
  )
}

const StoriesBar = () => {
  const user = useSelector((s) => s.user)
  const { openStory, storiesVersion } = usePixify()
  const { data, ordered, reload } = useStories('pixify')
  const viewer = useStoryViewer('pixify', reload)
  const label = usePersonLabel('pixify')
  useEffect(() => { if (storiesVersion) reload() }, [storiesVersion, reload])
  const mine = data?.mine || []
  const me = { _id : user._id, name : user.name, username : user.username, profile_pic : user.profile_pic, self : true }
  return (
    <section aria-label='Stories' className='flex gap-4 overflow-x-auto px-4 py-3 scrollbar-none md:px-2'>
      <button onClick={() => (mine.length ? viewer.open([{ user : me, statuses : mine }], 0, { mine : true }) : openStory())} className='flex w-[66px] shrink-0 flex-col items-center gap-1.5' title={mine.length ? 'View your story' : 'Add to your story'}>
        <span className='relative'>
          {mine.length
            ? <Ring seen><StoryPreview status={mine[mine.length - 1]} className='h-full w-full rounded-full' /></Ring>
            : <span className='flex h-[66px] w-[66px] items-center justify-center'><Avatar width={58} height={58} name={user.name} imageUrl={user.profile_pic} /></span>}
          <span onClick={(e) => { e.stopPropagation(); openStory() }} role='button' aria-label='Add to your story'
            className='absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-px-bg bg-px-blue text-white'><IoAdd size={15} /></span>
        </span>
        <span className='w-full truncate text-center text-xs text-px-muted'>Your story</span>
      </button>
      {!data && [0, 1, 2, 3, 4].map((i) => (
        <span key={i} className='flex w-[66px] shrink-0 flex-col items-center gap-1.5'>
          <span className='h-[66px] w-[66px] animate-pulse rounded-full bg-px-raised' /><span className='h-2.5 w-12 animate-pulse rounded bg-px-raised' />
        </span>
      ))}
      {ordered.map((g, i) => (
        <button key={g.user._id} onClick={() => viewer.open(ordered, i)} className={`flex w-[66px] shrink-0 flex-col items-center gap-1.5 ${g.muted ? 'opacity-50' : ''}`} title={label(g.user)}>
          <Ring seen={g.allViewed}><Avatar width={56} height={56} name={g.user.name} imageUrl={g.user.profile_pic} /></Ring>
          <span className={`w-full truncate text-center text-xs ${g.allViewed ? 'text-px-muted' : ''}`}>{label(g.user)}</span>
        </button>
      ))}
      {viewer.element}
    </section>
  )
}

const useSuggestions = () => {
  const [people, setPeople] = useState(null)
  useEffect(() => { api.get('/follow-suggestions').then((r) => setPeople(r.people)).catch(() => setPeople([])) }, [])
  return people
}

const PixifyHome = () => {
  const user = useSelector((s) => s.user)
  const navigate = useNavigate()
  const { version, openPostComposer } = usePixify()
  // Instagram's feed switch: everyone you follow, or only Favorites
  const [filter, setFilter] = useState('following')
  const feed = usePaged(`/feed?app=pixify&v=${version}${filter === 'favorites' ? '&filter=favorites' : ''}`)
  const more = useOnVisible(feed.loadMore, !feed.done && !feed.loading)
  const suggestions = useSuggestions()
  const [explore, setExplore] = useState(null)
  const empty = !feed.loading && feed.items.length === 0

  // nothing to show yet: fill the screen with Explore posts
  useEffect(() => {
    if (empty && explore === null) api.get('/explore').then((r) => setExplore(r.posts)).catch(() => setExplore([]))
  }, [empty, explore])

  return (
    <div className='mx-auto flex max-w-[935px] justify-center gap-16 px-0 md:pt-6 lg:px-4'>
      <div className='w-full max-w-[470px]'>
        <StoriesBar />
        <div className='flex gap-2 px-3 pb-1 pt-3 sm:px-0'>
          {[['following', 'Following'], ['favorites', 'Favorites']].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={`h-8 rounded-lg px-3 text-sm font-semibold ${filter === id ? 'bg-px-text text-px-bg' : 'bg-px-raised hover:bg-px-border'}`}>{label}</button>
          ))}
        </div>
        {filter === 'favorites' && !feed.loading && !feed.items.length && (
          <p className='px-6 py-12 text-center text-sm text-px-muted'>Add people to Favorites from the ••• menu on their posts or profile. Their posts show here.</p>
        )}
        <div className='mt-2'>
          {feed.items.map((p) => <PostCard key={p._id} post={p} onDeleted={(d) => feed.setItems((list) => list.filter((x) => x._id !== d._id))} onHidden={(d) => feed.setItems((list) => list.filter((x) => x._id !== d._id && (d.author._id !== x.author._id || x.mine)))} />)}
        </div>
        {feed.loading && [0, 1].map((i) => (
          <div key={i} className='mb-6 px-3 sm:px-0'>
            <div className='mb-3 flex items-center gap-3'><span className='h-8 w-8 animate-pulse rounded-full bg-px-raised' /><span className='h-3 w-32 animate-pulse rounded bg-px-raised' /></div>
            <div className='aspect-square w-full animate-pulse rounded bg-px-raised' />
          </div>
        ))}
        {feed.error && <p className='py-8 text-center text-sm text-px-muted'>{feed.error} <button onClick={feed.reload} className='font-semibold text-px-blue'>Retry</button></p>}
        <div ref={more} />

        {feed.done && feed.items.length > 0 && (
          <div className='flex flex-col items-center py-10 text-center'>
            <IoCheckmarkCircleOutline size={64} className='text-[#ff3d77]' />
            <p className='mt-2 text-lg'>You're all caught up</p>
            <p className='text-sm text-px-muted'>You've seen all new posts from people you follow.</p>
            <button onClick={() => navigate('/pixify/explore')} className='mt-2 text-sm font-semibold text-px-blue'>Explore more posts</button>
          </div>
        )}

        {empty && !feed.error && filter === 'following' && (
          <>
            <div className='flex flex-col items-center px-6 pb-6 pt-8 text-center'>
              <h2 className='text-xl font-bold'>Welcome to Pixify, {user.username || user.name}</h2>
              <p className='mt-1 text-sm text-px-muted'>Follow people to see their photos and videos here, or share your first post.</p>
              <button onClick={openPostComposer} className='mt-4 rounded-lg bg-px-blue px-5 py-2 text-sm font-semibold text-white hover:brightness-95'>Share a photo</button>
            </div>
            {explore?.length > 0 && (
              <section className='px-1 pt-4 sm:px-0'>
                <p className='mb-2 px-3 text-sm font-semibold sm:px-0'>Suggested posts</p>
                <div className='grid grid-cols-3 gap-1'>
                  {explore.map((p) => (
                    <Link key={p._id} to={`/pixify/p/${p._id}`} className='relative aspect-square overflow-hidden bg-px-raised'><MediaThumb media={p.media[0]} className='h-full w-full' /></Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* right column (wide screens) */}
      <aside className='hidden w-[320px] shrink-0 pt-8 lg:block'>
        <div className='flex items-center gap-3'>
          <Link to={`/pixify/u/${user.username || user._id}`}><Avatar width={44} height={44} name={user.name} imageUrl={user.profile_pic} /></Link>
          <div className='min-w-0 flex-1'>
            <Link to={`/pixify/u/${user.username || user._id}`} className='block truncate text-sm font-semibold'>{user.username}</Link>
            <p className='truncate text-sm text-px-muted'>{user.name}</p>
          </div>
          <button onClick={() => navigate('/connectify')} className='text-xs font-semibold text-px-blue hover:text-px-text'>Switch</button>
        </div>
        <div className='mt-6 flex items-center justify-between'>
          <p className='text-sm font-semibold text-px-muted'>Suggested for you</p>
        </div>
        <div className='mt-2 flex flex-col'>
          {suggestions === null && <span className='my-4 h-5 w-5 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
          {suggestions?.length === 0 && <p className='py-2 text-xs text-px-muted'>Suggestions appear as you follow people and save contacts in Chatify.</p>}
          {suggestions?.slice(0, 6).map((p) => (
            <div key={p._id} className='flex items-center gap-3 py-2'>
              <Link to={`/pixify/u/${p.username}`}><Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} /></Link>
              <div className='min-w-0 flex-1'>
                <Link to={`/pixify/u/${p.username}`} className='block truncate text-sm font-semibold'>{p.username}</Link>
                <p className='truncate text-xs text-px-muted'>{p.reason}</p>
              </div>
              <FollowButton person={p} size='link' />
            </div>
          ))}
        </div>
        <p className='mt-8 text-[11px] uppercase text-px-muted/70'>© {new Date().getFullYear()} Pixify · part of Chatify</p>
      </aside>
    </div>
  )
}

export default PixifyHome
