import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  IoHeart, IoHeartOutline, IoChatbubbleOutline, IoPaperPlaneOutline, IoBookmark, IoBookmarkOutline, IoEllipsisHorizontal,
  IoChevronUp, IoChevronDown, IoFilmOutline, IoClose, IoMusicalNotes, IoLogoYoutube,
} from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, compact, shortAgo, usePaged, useOnVisible } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { AutoVideo, RichText, ActionSheet } from '../social/common'
import { ReportSheet } from '../social/extras'
import YouTubeVideo from '../social/YouTubeVideo'
import { usePixify } from './PixifyLayout'
import { usePostActions, handleOf, HeartBurst } from './Post'
import { FollowButton } from './PixifyHome'

// Pixify Reels, laid out like Instagram: the video in the middle, who posted it with Follow and the caption,
// and a column of actions (like, comment, share, save, more) with counts. Works the same for YouTube Shorts.

const userLink = (p) => `/pixify/u/${p.username || p._id}`

/* ---------- who posted it + caption ---------- */

const Who = ({ post, light }) => {
  const [followed, setFollowed] = useState(!!post.followingAuthor)
  if (post.external) {
    return (
      <a href={post.external.byUrl || post.external.link} target='_blank' rel='noopener noreferrer' onClick={(e) => e.stopPropagation()} className='pointer-events-auto flex min-w-0 items-center gap-2'>
        <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ff0000] text-white'><IoLogoYoutube size={18} /></span>
        <span className='truncate text-sm font-semibold'>{post.external.by}</span>
        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${light ? 'border-white/60' : 'border-px-border'}`}>YouTube</span>
      </a>
    )
  }
  return (
    <div className='pointer-events-auto flex min-w-0 items-center gap-2'>
      <Link to={userLink(post.author)} className='shrink-0'><Avatar width={32} height={32} name={post.author.name} imageUrl={post.author.profile_pic} /></Link>
      <Link to={userLink(post.author)} className='truncate text-sm font-semibold'>{handleOf(post.author)}</Link>
      {!post.mine && !followed && (
        <span className={light ? '[&_button]:!h-7 [&_button]:!bg-transparent [&_button]:!px-2 [&_button]:!text-white [&_button]:ring-1 [&_button]:ring-white/70' : '[&_button]:!h-auto [&_button]:!bg-transparent [&_button]:!px-1 [&_button]:!text-px-blue'}>
          <FollowButton person={post.author} onChange={(s) => setFollowed(!!s)} />
        </span>
      )}
    </div>
  )
}

const Info = ({ post, light }) => (
  <div className='min-w-0'>
    <Who post={post} light={light} />
    {post.text && <p className='pointer-events-auto mt-2 text-sm'><RichText text={post.text} app='pixify' limit={90} /></p>}
    <p className={`mt-2 flex items-center gap-1.5 truncate text-xs ${light ? 'text-white/90' : 'text-px-muted'}`}>
      <IoMusicalNotes size={12} className='shrink-0' />
      <span className='truncate'>{post.external ? `${post.external.by} · Original audio` : `${handleOf(post.author)} · Original audio`}</span>
      {post.views > 0 && !post.external && <span className='shrink-0'>· {compact(post.views)} plays</span>}
    </p>
  </div>
)

/* ---------- comments panel ---------- */

const Comments = ({ post, onClose, onAdded }) => {
  const me = useSelector((s) => s.user)
  const [list, setList] = useState(null)
  const [text, setText] = useState('')
  const input = useRef(null)
  useEffect(() => { api.get(`/posts/${post._id}/comments`).then((r) => setList(r.comments)).catch(() => setList([])) }, [post._id])
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 100); return () => clearTimeout(t) }, [])
  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    try { const r = await api.post(`/posts/${post._id}/comments`, { text : t }); setList((l) => [...(l || []), r.comment]); onAdded() } catch (err) { setText(t); notifyError(err.message) }
  }
  const like = async (c) => {
    const want = !c.liked
    setList((l) => l.map((x) => (x._id === c._id ? { ...x, liked : want, likeCount : x.likeCount + (want ? 1 : -1) } : x)))
    try { await api.post(`/comments/${c._id}/like`, { like : want }) } catch (e) { notifyError(e.message) }
  }
  return (
    <div className='fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center' onClick={onClose}>
      <div className='flex h-[70dvh] w-full animate-pop flex-col overflow-hidden rounded-t-2xl bg-px-bg text-px-text md:h-[min(620px,80vh)] md:w-[420px] md:rounded-2xl' onClick={(e) => e.stopPropagation()}>
        <header className='relative flex h-12 shrink-0 items-center justify-center border-b border-px-border font-semibold'>
          Comments
          <button onClick={onClose} className='absolute right-3' aria-label='Close'><IoClose size={24} /></button>
        </header>
        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-2'>
          {list === null && <span className='mx-auto my-8 block h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
          {list?.length === 0 && <div className='py-12 text-center'><p className='text-xl font-bold'>No comments yet</p><p className='mt-1 text-sm text-px-muted'>Start the conversation.</p></div>}
          {list?.filter((c) => !c.parent).map((c) => (
            <div key={c._id} className='flex gap-3 py-2'>
              <Link to={userLink(c.author)} className='shrink-0'><Avatar width={32} height={32} name={c.author.name} imageUrl={c.author.profile_pic} /></Link>
              <div className='min-w-0 flex-1 text-sm'>
                <p><Link to={userLink(c.author)} className='mr-1 font-semibold'>{handleOf(c.author)}</Link><span className='text-xs text-px-muted'>{shortAgo(c.createdAt)}</span></p>
                <RichText text={c.text} app='pixify' className='block' />
                {c.likeCount > 0 && <p className='mt-0.5 text-xs font-semibold text-px-muted'>{c.likeCount} like{c.likeCount > 1 ? 's' : ''}</p>}
              </div>
              <button onClick={() => like(c)} className='mt-1 shrink-0 self-start' aria-label={c.liked ? 'Unlike comment' : 'Like comment'}>
                {c.liked ? <IoHeart size={13} className='text-[#ff3040]' /> : <IoHeartOutline size={13} className='text-px-muted' />}
              </button>
            </div>
          ))}
        </div>
        {post.commentsOff ? <p className='border-t border-px-border p-3 text-center text-sm text-px-muted'>Commenting has been turned off.</p> : (
          <form onSubmit={send} className='flex shrink-0 items-center gap-3 border-t border-px-border px-4 py-2'>
            <Avatar width={32} height={32} name={me.name} imageUrl={me.profile_pic} />
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={2200} placeholder='Add a comment…' aria-label='Add a comment' className='h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-px-muted' />
            <button disabled={!text.trim()} className='text-sm font-semibold text-px-blue disabled:opacity-40'>Post</button>
          </form>
        )}
      </div>
    </div>
  )
}

/* ---------- actions column ---------- */

const Action = ({ label, onClick, children, count }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick() }} title={label} aria-label={label} className='flex flex-col items-center gap-1 transition-transform active:scale-90'>
    {children}
    {count !== undefined && <span className='text-xs font-semibold'>{count}</span>}
  </button>
)

const Actions = ({ actions, onComment, onMore }) => {
  const { post, like, save } = actions
  const { sendToChat } = usePixify()
  return (
    <div className='flex flex-col items-center gap-5'>
      <Action label={post.myReaction ? 'Unlike' : 'Like'} onClick={() => like()} count={post.hideLikes && !post.mine ? undefined : compact(post.reactionCount)}>
        {post.myReaction ? <IoHeart size={28} className='animate-[likepop_.3s_ease-out] text-[#ff3040]' /> : <IoHeartOutline size={28} />}
      </Action>
      {!post.commentsOff && <Action label='Comment' onClick={onComment} count={compact(post.commentCount)}><IoChatbubbleOutline size={27} className='-scale-x-100' /></Action>}
      <Action label='Share' onClick={() => sendToChat(post)}><IoPaperPlaneOutline size={26} /></Action>
      <Action label={post.saved ? 'Remove from saved' : 'Save'} onClick={save}>{post.saved ? <IoBookmark size={25} /> : <IoBookmarkOutline size={25} />}</Action>
      <Action label='More' onClick={onMore}><IoEllipsisHorizontal size={24} /></Action>
      {/* the account (or the YouTube channel) */}
      {post.external
        ? <span className='flex h-7 w-7 items-center justify-center rounded-md bg-[#ff0000] text-white'><IoLogoYoutube size={16} /></span>
        : <Link to={userLink(post.author)} onClick={(e) => e.stopPropagation()} className='overflow-hidden rounded-md ring-1 ring-current/20'><Avatar width={28} height={28} name={post.author.name} imageUrl={post.author.profile_pic} /></Link>}
    </div>
  )
}

/* ---------- one reel ---------- */

const Reel = ({ post : initial, onHidden }) => {
  const navigate = useNavigate()
  const actions = usePostActions(initial)
  const { post, doubleTap, heart } = actions
  const [comments, setComments] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const box = useRef(null)

  // one play counted when the reel is mostly on screen
  useEffect(() => {
    const el = box.current
    if (!el || post.mine) return
    let counted = false
    const io = new IntersectionObserver(([e]) => {
      if (!counted && e.intersectionRatio > 0.7) { counted = true; api.post(`/posts/${post._id}/view`).catch(() => {}) }
    }, { threshold : [0.7] })
    io.observe(el)
    return () => io.disconnect()
  }, [post._id, post.mine])

  const copy = async () => {
    try { await navigator.clipboard.writeText(post.external ? post.external.link : `${window.location.origin}/pixify/p/${post._id}`); notify('Link copied') } catch { notifyError("Couldn't copy the link") }
  }
  const m = post.media[0]

  return (
    <section ref={box} className='relative grid h-full snap-start snap-always grid-cols-1 md:grid-cols-[1fr_auto_1fr] md:gap-6 md:py-5'>
      {/* wide screens: who posted it + caption on the left; the video stays centred on the screen, like Instagram */}
      <div className='hidden min-w-0 items-end justify-end pb-4 md:flex'><div className='hidden w-[300px] xl:block'><Info post={post} /></div></div>

      <div className='relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:w-auto md:rounded-xl' onDoubleClick={doubleTap}>
        {m.youtube
          ? <YouTubeVideo id={m.youtube} poster={m.poster} className='h-full w-full' />
          : <AutoVideo src={m.url} poster={m.poster} tapForSound className='h-full w-full' fit='object-cover' />}
        <HeartBurst k={heart} />
        {/* caption over the video (phones and tablets) */}
        <div className='pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-4 pr-16 pt-16 text-white md:pr-4 xl:hidden'>
          <Info post={post} light />
        </div>
        {/* phones: actions over the video */}
        <div className='absolute bottom-36 right-2 text-white drop-shadow md:hidden'>
          <Actions actions={actions} onComment={() => setComments(true)} onMore={() => setMenu(true)} />
        </div>
      </div>

      {/* tablets and up: actions beside the video */}
      <div className='hidden items-end pb-4 md:flex'>
        <Actions actions={actions} onComment={() => setComments(true)} onMore={() => setMenu(true)} />
      </div>

      {comments && <Comments post={post} onClose={() => setComments(false)} onAdded={() => actions.setPost((p) => ({ ...p, commentCount : p.commentCount + 1 }))} />}
      {menu && (
        <ActionSheet onClose={() => setMenu(false)} items={[
          { label : 'Report', danger : true, hidden : post.mine || !!post.external, keepOpen : true, onClick : () => { setMenu(false); setReporting(true) } },
          { label : 'Not interested', hidden : post.mine, onClick : async () => { try { await api.post(`/posts/${post._id}/hide`, { hide : true }); notify("You'll see fewer reels like this"); onHidden?.(post) } catch (e) { notifyError(e.message) } } },
          { label : 'Go to post', hidden : !!post.external, onClick : () => navigate(`/pixify/p/${post._id}`) },
          { label : 'Watch on YouTube', hidden : !post.external, onClick : () => window.open(post.external.link, '_blank', 'noopener') },
          { label : 'Copy link', onClick : copy },
          { label : 'About this account', hidden : post.mine || !!post.external, onClick : () => navigate(userLink(post.author)) },
        ]} />
      )}
      {reporting && <ReportSheet app='pixify' target={{ post : post._id }} onClose={() => setReporting(false)} />}
    </section>
  )
}

/* ---------- the Reels page ---------- */

export const PixifyReels = () => {
  const { version } = usePixify()
  const { state } = useLocation()
  const paged = usePaged(`/explore?reels=1&v=${version}`)
  const scroller = useRef(null)
  // a reel tapped in Explore plays first, then the endless list
  const start = state?.start
  const items = start ? [start, ...paged.items.filter((p) => p._id !== start._id)] : paged.items
  const more = useOnVisible(paged.loadMore, !paged.done && !paged.loading)
  const step = (dir) => scroller.current?.scrollBy({ top : dir * scroller.current.clientHeight, behavior : 'smooth' })

  // arrow keys move between reels (desktop)
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
      if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className='relative h-full'>
      <div ref={scroller} className='h-full snap-y snap-mandatory overflow-y-auto bg-black scrollbar-none md:bg-px-bg'>
        {items.map((p) => <div key={p._id} className='h-full'><Reel post={p} onHidden={(d) => paged.setItems((l) => l.filter((x) => x._id !== d._id))} /></div>)}
        {paged.loading && <div className='flex h-full items-center justify-center'><span className='h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white md:border-px-border md:border-t-px-text' /></div>}
        {!paged.loading && !items.length && (
          <div className='flex h-full flex-col items-center justify-center px-6 text-center text-white md:text-px-text'>
            <IoFilmOutline size={56} />
            <p className='mt-3 text-lg font-semibold'>No reels yet</p>
            <p className='mt-1 text-sm opacity-70'>Share a post with one video and it shows up here.</p>
          </div>
        )}
        <div ref={more} className='h-1' />
      </div>
      {/* desktop: previous / next */}
      <div className='absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-3 md:flex'>
        <button onClick={() => step(-1)} aria-label='Previous reel' className='flex h-11 w-11 items-center justify-center rounded-full bg-px-raised shadow hover:bg-px-border'><IoChevronUp size={22} /></button>
        <button onClick={() => step(1)} aria-label='Next reel' className='flex h-11 w-11 items-center justify-center rounded-full bg-px-raised shadow hover:bg-px-border'><IoChevronDown size={22} /></button>
      </div>
    </div>
  )
}
