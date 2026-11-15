import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { IoSearchOutline, IoCloseCircle, IoHeart, IoChatbubbleOutline, IoFilmOutline, IoCopy, IoArrowBack, IoLockClosed, IoClose, IoPlay, IoArchiveOutline } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, enc, compact, usePaged, useOnVisible } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { recentSearches, addRecentSearch, removeRecentSearch } from '../social/extras'
import { MediaThumb } from '../social/common'
import { usePixify } from './PixifyLayout'
import { PostView } from './Post'
import { FollowButton } from './PixifyHome'
import { PostGrid } from './PixifyProfile'

/* ---------------- Explore ---------------- */

// Instagram's Explore grid: blocks of 5 tiles, one tall reel tile per block, alternating right / left
const exploreBlocks = (items) => {
  const out = []
  for (let i = 0; i < items.length; i += 5) {
    const block = items.slice(i, i + 5)
    if (block.length < 5) { out.push(...block.map((p) => ({ p }))); continue }
    const t = Math.max(0, block.findIndex((p) => p.isReel || p.media?.[0]?.kind === 'video'))
    const tall = block[t]
    const rest = block.filter((_, x) => x !== t)
    out.push({ p : tall, tall : (i / 5) % 2 === 0 ? 'right' : 'left' }, ...rest.map((p) => ({ p })))
  }
  return out
}

// "Channel name · YouTube" on a YouTube Short (links to the Short on YouTube)
export const ShortCredit = ({ post, className = '' }) => (
  <a href={post.external.link} target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()} className={`hover:underline ${className}`}>
    {post.external.by} · YouTube
  </a>
)

export const PixifyExplore = () => {
  const { version } = usePixify()
  const navigate = useNavigate()
  const paged = usePaged(`/explore?v=${version}`)
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  const open = (p) => {
    // videos and YouTube Shorts open in the Reels player (that one first, then more); photos open the post
    if (p.isReel || p.media?.[0]?.kind === 'video') return navigate('/pixify/reels', { state : { start : p } })
    navigate(`/pixify/p/${p._id}`)
  }
  return (
    <div className='mx-auto max-w-[935px] pb-6 md:px-5 md:pt-6'>
      <button onClick={() => navigate('/pixify/search')} className='mx-3 my-3 flex h-9 w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg bg-px-raised px-3 text-px-muted md:hidden'>
        <IoSearchOutline size={16} /> Search
      </button>
      <div className='grid grid-flow-row-dense grid-cols-3 gap-1'>
        {exploreBlocks(paged.items).map(({ p, tall }) => (
          <button key={p._id} onClick={() => open(p)}
            className={`group relative overflow-hidden bg-px-raised ${tall ? `row-span-2 ${tall === 'right' ? 'col-start-3' : 'col-start-1'}` : 'aspect-square'}`}>
            <MediaThumb media={p.media[0]} className='absolute inset-0 h-full w-full' />
            {p.media.length > 1 && <IoCopy className='absolute right-2 top-2 text-white drop-shadow' size={18} />}
            {(p.isReel || p.media[0]?.kind === 'video') && <IoFilmOutline className='absolute right-2 top-2 text-white drop-shadow' size={18} />}
            {p.views > 0 && <span className='absolute bottom-1.5 left-2 flex items-center gap-1 text-xs font-semibold text-white drop-shadow'><IoPlay size={12} />{compact(p.views)}</span>}
            <span className='absolute inset-0 hidden items-center justify-center gap-5 bg-black/35 font-bold text-white group-hover:flex'>
              {p.external ? <span className='px-2 text-xs font-semibold'>{p.external.by}</span> : <>
                <span className='flex items-center gap-1'><IoHeart />{compact(p.reactionCount)}</span>
                {!p.commentsOff && <span className='flex items-center gap-1'><IoChatbubbleOutline className='-scale-x-100' />{compact(p.commentCount)}</span>}
              </>}
            </span>
          </button>
        ))}
        {paged.loading && Array.from({ length : 9 }).map((_, i) => <span key={i} className='aspect-square animate-pulse bg-px-raised' />)}
      </div>
      {!paged.loading && !paged.items.length && <p className='py-20 text-center text-sm text-px-muted'>Nothing to explore yet. Posts from public accounts show up here.</p>}
      {paged.done && paged.items.length > 0 && <p className='py-8 text-center text-sm text-px-muted'>You've seen everything for now.</p>}
      {paged.items.some((p) => p.external) && <p className='pt-4 text-center text-xs text-px-muted'>Some videos are Shorts from <a href='https://www.youtube.com' target='_blank' rel='noopener noreferrer' className='underline'>YouTube</a></p>}
      <div ref={more} />
    </div>
  )
}

/* ---------------- Reels (see Reels.jsx) ---------------- */

export { PixifyReels } from './Reels'

/* ---------------- Search ---------------- */

export const PixifySearch = () => {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [people, setPeople] = useState(null)
  const [tags, setTags] = useState([])
  const [recent, setRecent] = useState(() => recentSearches('pixify'))
  const seq = useRef(0)
  useEffect(() => {
    const id = ++seq.current
    if (!q.trim()) { setPeople(null); setTags([]); return }
    const t = setTimeout(() => {
      api.get(`/search?app=pixify&q=${enc(q.trim())}`).then((r) => { if (id === seq.current) { setPeople(r.people); setTags(r.tags || []) } }).catch((e) => { if (id === seq.current) { setPeople([]); notifyError(e.message) } })
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  const remember = (item) => { addRecentSearch('pixify', item); setRecent(recentSearches('pixify')) }
  return (
    <div className='mx-auto max-w-[600px] px-4 py-4 md:py-8'>
      <h1 className='mb-5 hidden text-2xl font-semibold md:block'>Search</h1>
      <div className='flex h-10 items-center gap-2 rounded-lg bg-px-raised px-3'>
        <IoSearchOutline className='text-px-muted' />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search people or #hashtags' aria-label='Search' className='min-w-0 flex-1 bg-transparent outline-none placeholder:text-px-muted' />
        {q && <button onClick={() => setQ('')} title='Clear'><IoCloseCircle className='text-px-muted' size={18} /></button>}
      </div>
      <div className='mt-4'>
        {people === null && (
          <div>
            <div className='flex items-center justify-between py-2'>
              <span className='font-semibold'>Recent</span>
              {recent.length > 0 && <button onClick={() => { removeRecentSearch('pixify'); setRecent([]) }} className='text-sm font-semibold text-px-blue'>Clear all</button>}
            </div>
            {!recent.length && <p className='py-8 text-center text-sm text-px-muted'>No recent searches. Find people by name or @username, or hashtags with #.</p>}
            {recent.map((it) => (
              <div key={it.id} className='flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-px-hover'>
                <Link to={it.tag ? `/pixify/tags/${enc(it.tag)}` : `/pixify/u/${it.username}`} className='flex min-w-0 flex-1 items-center gap-3'>
                  {it.tag ? <span className='flex h-11 w-11 items-center justify-center rounded-full border border-px-border text-xl'>#</span> : <Avatar width={44} height={44} name={it.name} imageUrl={it.profile_pic} />}
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-semibold'>{it.tag ? `#${it.tag}` : it.username}</span>
                    {!it.tag && <span className='block truncate text-sm text-px-muted'>{it.name}</span>}
                  </span>
                </Link>
                <button onClick={() => { removeRecentSearch('pixify', it.id); setRecent(recentSearches('pixify')) }} title='Remove'><IoClose size={20} className='text-px-muted' /></button>
              </div>
            ))}
          </div>
        )}
        {people?.length === 0 && !tags.length && <p className='py-8 text-center text-sm text-px-muted'>No results found.</p>}
        {tags.map((t) => (
          <Link key={t.tag} to={`/pixify/tags/${enc(t.tag)}`} onClick={() => remember({ id : '#' + t.tag, tag : t.tag })} className='flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-px-hover'>
            <span className='flex h-11 w-11 items-center justify-center rounded-full border border-px-border text-xl'>#</span>
            <span><span className='block text-sm font-semibold'>#{t.tag}</span><span className='block text-sm text-px-muted'>{compact(t.count)}{t.count >= 300 ? '+' : ''} post{t.count === 1 ? '' : 's'}</span></span>
          </Link>
        ))}
        {people?.map((p) => (
          <div key={p._id} className='flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-px-hover'>
            <Link to={`/pixify/u/${p.username}`} onClick={() => remember({ id : p._id, username : p.username, name : p.name, profile_pic : p.profile_pic })} className='flex min-w-0 flex-1 items-center gap-3'>
              <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
              <span className='min-w-0'>
                <span className='flex items-center gap-1 truncate text-sm font-semibold'>{p.username}{p.private && <IoLockClosed size={11} className='text-px-muted' />}</span>
                <span className='block truncate text-sm text-px-muted'>{p.name}{p.following ? ' • Following' : ''}</span>
              </span>
            </Link>
            {!p.self && !p.following && <FollowButton person={p} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- one post ---------------- */

export const PixifyPostPage = () => {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { bump } = usePixify()
  const [post, setPost] = useState(undefined)
  const [error, setError] = useState('')
  useEffect(() => {
    setPost(undefined)
    api.get(`/posts/${postId}`).then((r) => {
      // a Connectify link opened in Pixify goes to Connectify
      if (r.post.app !== 'pixify') return navigate(`/connectify/p/${postId}`, { replace : true })
      if (r.post.media?.[0]?.youtube) return navigate('/pixify/reels', { replace : true, state : { start : r.post } })
      setPost(r.post)
    }).catch((e) => { setPost(null); setError(e.message) })
  }, [postId, navigate])
  return (
    <div className='mx-auto max-w-[935px] md:px-5 md:py-6'>
      <div className='flex h-11 items-center gap-3 border-b border-px-border px-4 md:hidden'>
        <button onClick={() => navigate(-1)} title='Back'><IoArrowBack size={22} /></button><span className='font-semibold'>Post</span>
      </div>
      {post === undefined && <span className='mx-auto mt-24 block h-7 w-7 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
      {post === null && (
        <div className='px-6 py-20 text-center'>
          <h2 className='text-xl font-bold'>Sorry, this page isn't available.</h2>
          <p className='mt-3 text-sm text-px-muted'>{error || 'The post may have been removed.'} <Link to='/pixify' className='text-px-blue'>Go back to Pixify.</Link></p>
        </div>
      )}
      {post && <PostView post={post} onDeleted={() => { bump(); navigate('/pixify', { replace : true }) }} />}
    </div>
  )
}

/* ---------------- #hashtag ---------------- */

export const PixifyTag = () => {
  const { tag } = useParams()
  const navigate = useNavigate()
  const paged = usePaged(`/hashtags/${enc(tag)}?app=pixify`)
  return (
    <div className='mx-auto max-w-[935px] pb-10 md:px-5 md:pt-8'>
      <div className='flex h-11 items-center gap-3 border-b border-px-border px-4 md:hidden'>
        <button onClick={() => navigate(-1)} title='Back'><IoArrowBack size={22} /></button><span className='font-semibold'>#{tag}</span>
      </div>
      <header className='flex items-center gap-6 px-4 py-6 md:gap-12 md:px-12'>
        <span className='flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-px-border text-4xl md:h-36 md:w-36 md:text-6xl'>#</span>
        <div>
          <h1 className='text-2xl'>#{tag}</h1>
          <p className='mt-1 text-sm'><b>{compact(paged.count || 0)}</b> post{paged.count === 1 ? '' : 's'}</p>
        </div>
      </header>
      <p className='mb-2 px-4 text-sm font-semibold text-px-muted md:px-0'>Recent posts</p>
      <PostGrid paged={paged} empty={<p className='py-14 text-center text-sm text-px-muted'>No posts with #{tag} yet.</p>} />
    </div>
  )
}

/* ---------------- Archive / Your activity ---------------- */

const SimplePage = ({ title, children }) => {
  const navigate = useNavigate()
  return (
    <div className='mx-auto max-w-[935px] pb-10 md:px-5 md:pt-8'>
      <div className='flex h-11 items-center gap-3 border-b border-px-border px-4 md:border-0 md:px-0'>
        <button onClick={() => navigate(-1)} title='Back'><IoArrowBack size={22} /></button><h1 className='font-semibold md:text-xl'>{title}</h1>
      </div>
      {children}
    </div>
  )
}

export const PixifyArchive = () => {
  const paged = usePaged('/archive')
  return (
    <SimplePage title='Archive'>
      <p className='px-4 py-3 text-sm text-px-muted md:px-0'>Only you can see your archived posts. Open one and choose "Show on profile" to bring it back.</p>
      <PostGrid paged={paged} empty={(
        <div className='py-14 text-center'>
          <IoArchiveOutline size={56} className='mx-auto' />
          <p className='mt-3 text-xl font-bold'>No archived posts</p>
          <p className='mt-1 text-sm text-px-muted'>Archive posts from the ••• menu to hide them from your profile without deleting them.</p>
        </div>
      )} />
    </SimplePage>
  )
}

export const PixifyActivity = () => {
  const paged = usePaged('/liked?app=pixify')
  return (
    <SimplePage title='Your activity: Likes'>
      <p className='px-4 py-3 text-sm text-px-muted md:px-0'>Posts you've liked, newest first.</p>
      <PostGrid paged={paged} empty={<p className='py-14 text-center text-sm text-px-muted'>When you like posts, they'll show up here.</p>} />
    </SimplePage>
  )
}

// Favorites / Muted accounts
export const PixifyPeopleList = () => {
  const { list } = useParams()
  const [people, setPeople] = useState(null)
  const favorites = list === 'favorites'
  useEffect(() => {
    api.get(favorites ? '/favorites' : '/muted').then((r) => setPeople(r.people)).catch((e) => { setPeople([]); notifyError(e.message) })
  }, [favorites])
  const remove = async (p) => {
    try {
      await api.post(favorites ? `/favorites/${p._id}` : `/mute/${p._id}`, favorites ? { favorite : false } : { mute : false })
      setPeople((l) => l.filter((x) => x._id !== p._id))
      notify(favorites ? 'Removed from Favorites' : `Unmuted ${p.username}`)
    } catch (e) { notifyError(e.message) }
  }
  return (
    <SimplePage title={favorites ? 'Favorites' : 'Muted accounts'}>
      <div className='mx-auto max-w-[600px] px-4 md:px-0'>
        <p className='py-3 text-sm text-px-muted'>{favorites
          ? 'Posts from your favorites show in the Favorites feed. They aren\'t told when you add them.'
          : 'You won\'t see posts from muted accounts in your feed. They aren\'t told you muted them.'}</p>
        {people === null && <span className='mx-auto mt-10 block h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
        {people?.length === 0 && <p className='py-10 text-center text-sm text-px-muted'>{favorites ? 'Add people to Favorites from their profile ••• menu.' : 'No muted accounts.'}</p>}
        {people?.map((p) => (
          <div key={p._id} className='flex items-center gap-3 py-2'>
            <Link to={`/pixify/u/${p.username || p._id}`} className='flex min-w-0 flex-1 items-center gap-3'>
              <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
              <span className='min-w-0'><span className='block truncate text-sm font-semibold'>{p.username}</span><span className='block truncate text-sm text-px-muted'>{p.profileName || p.name}</span></span>
            </Link>
            <button onClick={() => remove(p)} className='h-8 rounded-lg bg-px-raised px-4 text-sm font-semibold hover:bg-px-border'>{favorites ? 'Remove' : 'Unmute'}</button>
          </div>
        ))}
      </div>
    </SimplePage>
  )
}
