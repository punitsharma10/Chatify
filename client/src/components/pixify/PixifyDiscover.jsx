import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IoSearchOutline, IoCloseCircle, IoHeart, IoHeartOutline, IoChatbubbleOutline, IoPaperPlaneOutline, IoFilmOutline, IoCopy, IoArrowBack, IoLockClosed } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, enc, compact, usePaged, useOnVisible } from '../../helpers/social'
import { notifyError } from '../../helpers/toast'
import { MediaThumb, AutoVideo, RichText } from '../social/common'
import { usePixify } from './PixifyLayout'
import { PostView, usePostActions, handleOf } from './Post'
import { FollowButton } from './PixifyHome'

/* ---------------- Explore ---------------- */

export const PixifyExplore = () => {
  const { version } = usePixify()
  const navigate = useNavigate()
  const paged = usePaged(`/explore?v=${version}`)
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  return (
    <div className='mx-auto max-w-[935px] md:px-5 md:pt-6'>
      <button onClick={() => navigate('/pixify/search')} className='mx-3 my-3 flex h-9 w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg bg-px-raised px-3 text-px-muted md:hidden'>
        <IoSearchOutline size={16} /> Search
      </button>
      <div className='grid grid-cols-3 gap-1'>
        {paged.items.map((p, i) => (
          // every 10 items one tall tile, like an explore grid
          <Link key={p._id} to={`/pixify/p/${p._id}`} className={`group relative overflow-hidden bg-px-raised ${i % 10 === 2 ? 'row-span-2' : 'aspect-square'}`}>
            <MediaThumb media={p.media[0]} className='h-full w-full' />
            {p.media.length > 1 && <IoCopy className='absolute right-2 top-2 text-white drop-shadow' size={18} />}
            {p.isReel && <IoFilmOutline className='absolute right-2 top-2 text-white drop-shadow' size={18} />}
            <span className='absolute inset-0 hidden items-center justify-center gap-5 bg-black/35 font-bold text-white group-hover:flex'>
              <span className='flex items-center gap-1'><IoHeart />{compact(p.reactionCount)}</span>
            </span>
          </Link>
        ))}
        {paged.loading && Array.from({ length : 9 }).map((_, i) => <span key={i} className='aspect-square animate-pulse bg-px-raised' />)}
      </div>
      {!paged.loading && !paged.items.length && <p className='py-20 text-center text-sm text-px-muted'>Nothing to explore yet. Posts from public accounts show up here.</p>}
      <div ref={more} />
    </div>
  )
}

/* ---------------- Reels ---------------- */

const Reel = ({ post : initial }) => {
  const navigate = useNavigate()
  const { sendToChat } = usePixify()
  const actions = usePostActions(initial)
  const { post, like } = actions
  return (
    <section className='relative flex h-full snap-start snap-always items-center justify-center py-0 md:py-4'>
      <div className='relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:h-full md:w-auto md:rounded-lg'>
        <AutoVideo src={post.media[0].url} className='h-full w-full' fit='object-contain' />
        <div className='pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pr-16 text-white'>
          <div className='pointer-events-auto flex items-center gap-2'>
            <Link to={`/pixify/u/${post.author.username || post.author._id}`} className='flex items-center gap-2 text-sm font-semibold'>
              <Avatar width={32} height={32} name={post.author.name} imageUrl={post.author.profile_pic} />{handleOf(post.author)}
            </Link>
          </div>
          {post.text && <p className='pointer-events-auto mt-2 text-sm'><RichText text={post.text} app='pixify' limit={80} /></p>}
        </div>
        {/* actions on the right (inside on phones) */}
        <div className='absolute bottom-4 right-2 flex flex-col items-center gap-5 text-white md:text-white'>
          <button onClick={() => like()} className='flex flex-col items-center text-xs' title='Like'>
            {post.myReaction ? <IoHeart size={28} className='text-[#ff3040]' /> : <IoHeartOutline size={28} />}{compact(post.reactionCount)}
          </button>
          {!post.commentsOff && <button onClick={() => navigate(`/pixify/p/${post._id}`)} className='flex flex-col items-center text-xs' title='Comments'><IoChatbubbleOutline size={27} className='-scale-x-100' />{compact(post.commentCount)}</button>}
          <button onClick={() => sendToChat(post)} title='Send to a chat'><IoPaperPlaneOutline size={26} /></button>
        </div>
      </div>
    </section>
  )
}

export const PixifyReels = () => {
  const { version } = usePixify()
  const paged = usePaged(`/explore?reels=1&v=${version}`)
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  return (
    <div className='h-full snap-y snap-mandatory overflow-y-auto bg-black md:bg-px-bg'>
      {paged.items.map((p) => <div key={p._id} className='h-full'><Reel post={p} /></div>)}
      {paged.loading && <div className='flex h-full items-center justify-center'><span className='h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white' /></div>}
      {!paged.loading && !paged.items.length && (
        <div className='flex h-full flex-col items-center justify-center px-6 text-center text-white md:text-px-text'>
          <IoFilmOutline size={56} />
          <p className='mt-3 text-lg font-semibold'>No reels yet</p>
          <p className='mt-1 text-sm opacity-70'>Share a post with one video and it shows up here.</p>
        </div>
      )}
      <div ref={more} className='h-1' />
    </div>
  )
}

/* ---------------- Search ---------------- */

export const PixifySearch = () => {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState(null)
  const seq = useRef(0)
  useEffect(() => {
    const id = ++seq.current
    if (!q.trim()) { setPeople(null); return }
    const t = setTimeout(() => {
      api.get(`/search?app=pixify&q=${enc(q.trim())}`).then((r) => id === seq.current && setPeople(r.people)).catch((e) => { if (id === seq.current) { setPeople([]); notifyError(e.message) } })
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className='mx-auto max-w-[600px] px-4 py-4 md:py-8'>
      <h1 className='mb-5 hidden text-2xl font-semibold md:block'>Search</h1>
      <div className='flex h-10 items-center gap-2 rounded-lg bg-px-raised px-3'>
        <IoSearchOutline className='text-px-muted' />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search by name or @username' aria-label='Search' className='min-w-0 flex-1 bg-transparent outline-none placeholder:text-px-muted' />
        {q && <button onClick={() => setQ('')} title='Clear'><IoCloseCircle className='text-px-muted' size={18} /></button>}
      </div>
      <div className='mt-4'>
        {people === null && <p className='py-8 text-center text-sm text-px-muted'>Find people on Pixify by their name or username.</p>}
        {people?.length === 0 && <p className='py-8 text-center text-sm text-px-muted'>No results found.</p>}
        {people?.map((p) => (
          <div key={p._id} className='flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-px-hover'>
            <Link to={`/pixify/u/${p.username}`} className='flex min-w-0 flex-1 items-center gap-3'>
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
