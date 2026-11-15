import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { IoHeartOutline, IoHeart, IoChatbubbleOutline, IoPaperPlaneOutline, IoBookmarkOutline, IoBookmark, IoEllipsisHorizontal, IoPerson } from 'react-icons/io5'
import { BsPinAngleFill } from 'react-icons/bs'
import Avatar from '../Avatar'
import { api, shortAgo, compact } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { MediaCarousel, RichText, ActionSheet, PeopleModal, copyPostLink, pixifyAspect, Modal } from '../social/common'
import { ReportSheet } from '../social/extras'
import { usePixify } from './PixifyLayout'

const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂']

// "Goa, India" under the username
const PlaceLine = ({ post }) => (post.location
  ? <Link to={`/pixify/places/${encodeURIComponent(post.location)}`} className='block truncate text-xs hover:opacity-60'>{post.location}</Link>
  : null)

// person icon on the photo: shows who's tagged
export const TaggedBadge = ({ post }) => {
  const [open, setOpen] = useState(false)
  if (!post.tagged?.length) return null
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true) }} title='Tagged people' className='absolute bottom-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white'><IoPerson size={14} /></button>
      {open && <PeopleModal title='Tagged' app='pixify' people={post.tagged} onClose={() => setOpen(false)} />}
    </>
  )
}

const userLink = (p) => `/pixify/u/${p.username || p._id}`
export const handleOf = (p) => p?.username || p?.name || ''

// "ana and bea" / "ana and 2 others" for collab posts (accepted collaborators only)
export const AuthorNames = ({ post, className = 'font-semibold hover:opacity-60' }) => {
  const [open, setOpen] = useState(false)
  const collabs = (post.collaborators || []).filter((c) => c.status === 'accepted')
  if (!collabs.length) return <Link to={userLink(post.author)} className={className}>{handleOf(post.author)}</Link>
  return (
    <>
      <Link to={userLink(post.author)} className={className}>{handleOf(post.author)}</Link>
      <span> and </span>
      {collabs.length === 1
        ? <Link to={userLink(collabs[0])} className={className}>{handleOf(collabs[0])}</Link>
        : <button onClick={() => setOpen(true)} className={className}>{collabs.length} others</button>}
      {open && <PeopleModal title='Collaborators' app='pixify' people={[post.author, ...collabs]} onClose={() => setOpen(false)} />}
    </>
  )
}

// shown to someone invited to collaborate on a post
export const CollabInvite = ({ actions }) => {
  const { post, setPost } = actions
  if (post.myCollab !== 'pending') return null
  const answer = async (accept) => {
    try { const r = await api.post(`/posts/${post._id}/collab`, { accept }); setPost((p) => ({ ...p, ...r.post, myCollab : accept ? 'accepted' : undefined })); notify(accept ? 'You are now a collaborator. It shows on your profile.' : 'Invite declined') } catch (e) { notifyError(e.message) }
  }
  return (
    <div className='flex items-center gap-3 border-b border-px-border bg-px-raised px-4 py-3 text-sm'>
      <span className='min-w-0 flex-1'><b>{handleOf(post.author)}</b> invited you to collaborate. The post will appear on your profile and be shared with your followers.</span>
      <button onClick={() => answer(false)} className='h-8 shrink-0 rounded-lg bg-px-bg px-3 font-semibold ring-1 ring-px-border'>Decline</button>
      <button onClick={() => answer(true)} className='h-8 shrink-0 rounded-lg bg-px-blue px-3 font-semibold text-white'>Accept</button>
    </div>
  )
}

// "View insights" for your own post
const InsightsSheet = ({ post, onClose }) => {
  const [data, setData] = useState(null)
  useEffect(() => { api.get(`/posts/${post._id}/insights`).then((r) => setData(r.insights)).catch((e) => { notifyError(e.message); onClose() }) }, [post._id, onClose])
  const Stat = ({ label, value }) => <div className='flex flex-col items-center rounded-lg bg-px-raised py-3'><span className='text-xl font-bold'>{compact(value || 0)}</span><span className='text-xs text-px-muted'>{label}</span></div>
  return (
    <Modal onClose={onClose} label='Post insights' className='w-[min(420px,94vw)] overflow-hidden rounded-xl bg-px-bg text-px-text'>
      <div className='border-b border-px-border py-3 text-center font-semibold'>Post insights</div>
      {!data ? <span className='mx-auto my-10 block h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' /> : (
        <div className='p-4'>
          <p className='text-center text-sm text-px-muted'>Accounts reached</p>
          <p className='mb-4 text-center text-3xl font-bold'>{compact(data.accountsReached)}</p>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
            <Stat label='Likes' value={data.likes} />
            <Stat label='Comments' value={data.comments} />
            <Stat label='Saves' value={data.saves} />
            <Stat label='Shares' value={data.shares} />
            {data.plays !== undefined && <Stat label='Plays' value={data.plays} />}
          </div>
          <p className='mt-4 text-center text-xs text-px-muted'>Accounts reached counts the people who liked or commented. Only you can see insights.</p>
        </div>
      )}
    </Modal>
  )
}

// like / save / delete / edit for one post, shared by the feed card and the post page
export const usePostActions = (initial, { onDeleted } = {}) => {
  const [post, setPost] = useState(initial)
  useEffect(() => setPost(initial), [initial])
  const [heart, setHeart] = useState(0) // double-tap heart animation

  const like = async (force) => {
    const want = force ?? !post.myReaction
    if (want === !!post.myReaction) return
    setPost((p) => ({ ...p, myReaction : want ? 'like' : null, reactionCount : p.reactionCount + (want ? 1 : -1) }))
    try {
      const r = await api.post(`/posts/${post._id}/react`, { type : want ? 'like' : null })
      setPost((p) => ({ ...p, ...r }))
    } catch (e) {
      setPost((p) => ({ ...p, myReaction : want ? null : 'like', reactionCount : p.reactionCount + (want ? -1 : 1) }))
      notifyError(e.message)
    }
  }
  const doubleTap = () => { setHeart((h) => h + 1); like(true) }

  const save = async () => {
    const want = !post.saved
    setPost((p) => ({ ...p, saved : want }))
    try { await api.post(`/posts/${post._id}/save`, { save : want }); if (want) notify('Saved') } catch (e) { setPost((p) => ({ ...p, saved : !want })); notifyError(e.message) }
  }

  const remove = async () => {
    try { await api.del(`/posts/${post._id}`); notify('Post deleted'); onDeleted?.(post) } catch (e) { notifyError(e.message) }
  }

  const update = async (body) => {
    try { const r = await api.patch(`/posts/${post._id}`, body); setPost((p) => ({ ...p, ...r.post })); return true } catch (e) { notifyError(e.message); return false }
  }

  return { post, setPost, like, doubleTap, heart, save, remove, update }
}

// big heart that pops on double tap
export const HeartBurst = ({ k }) => (k ? (
  <span key={k} className='pointer-events-none absolute inset-0 flex items-center justify-center'>
    <IoHeart className='animate-[heartpop_.9s_ease-out_forwards] text-white drop-shadow-lg' size={110} />
  </span>
) : null)

export const PostMenu = ({ actions, onClose, onEdit, goToPost = true, onHidden }) => {
  const { post, remove, update, setPost } = actions
  const navigate = useNavigate()
  const { sendToChat } = usePixify()
  const [confirm, setConfirm] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [unfollowed, setUnfollowed] = useState(false)
  const [favorite, setFavorite] = useState(!!post.favoriteAuthor)
  const [insightsOpen, setInsightsOpen] = useState(false)
  if (insightsOpen) return <InsightsSheet post={post} onClose={onClose} />
  if (confirm) {
    return <ActionSheet title='Delete post?' onClose={onClose} items={[{ label : 'Delete', danger : true, onClick : remove }]} />
  }
  if (reporting) return <ReportSheet app='pixify' target={{ post : post._id }} onClose={onClose} />
  const tool = async (url, body, okText) => {
    try { const r = await api.post(url, body); if (r.post) setPost((p) => ({ ...p, ...r.post })); if (okText) notify(okText); return r } catch (e) { notifyError(e.message) }
  }
  return (
    <ActionSheet onClose={onClose} items={[
      { label : 'Report', danger : true, hidden : post.mine, keepOpen : true, onClick : () => setReporting(true) },
      { label : 'Delete', danger : true, hidden : !post.mine, keepOpen : true, onClick : () => setConfirm(true) },
      { label : post.archived ? 'Show on profile' : 'Archive', hidden : !post.mine, onClick : async () => { await tool(`/posts/${post._id}/archive`, { archive : !post.archived }, post.archived ? 'Shown on your profile' : 'Archived. Only you can see it.'); if (!post.archived) onHidden?.(post) } },
      { label : post.pinned ? 'Unpin from profile' : 'Pin to your profile', hidden : !post.mine || post.archived, onClick : () => tool(`/posts/${post._id}/pin`, { pin : !post.pinned }, post.pinned ? 'Unpinned' : 'Pinned to your profile') },
      { label : post.hideLikes ? 'Unhide like count' : 'Hide like count', hidden : !post.mine, onClick : () => update({ hideLikes : !post.hideLikes }) },
      { label : 'View insights', hidden : !post.mine || post.scheduledFor, keepOpen : true, onClick : () => setInsightsOpen(true) },
      { label : 'Edit', hidden : !post.mine, onClick : onEdit },
      { label : 'Remove me as collaborator', danger : true, hidden : post.myCollab !== 'accepted', onClick : async () => { try { const r = await api.post(`/posts/${post._id}/collab`, { leave : true }); setPost((p) => ({ ...p, ...r.post, myCollab : undefined })); notify('Removed from your profile'); onHidden?.(post) } catch (e) { notifyError(e.message) } } },
      { label : post.commentsOff ? 'Turn on commenting' : 'Turn off commenting', hidden : !post.mine, onClick : () => update({ commentsOff : !post.commentsOff }) },
      { label : 'Unfollow', danger : true, hidden : post.mine || unfollowed, onClick : async () => { try { await api.post(`/follow/${post.author._id}`, { follow : false }); setUnfollowed(true); notify(`Unfollowed ${handleOf(post.author)}`) } catch (e) { notifyError(e.message) } } },
      { label : favorite ? 'Remove from favorites' : 'Add to favorites', hidden : post.mine, onClick : async () => { const r = await tool(`/favorites/${post.author._id}`, { favorite : !favorite }, favorite ? `Removed ${handleOf(post.author)} from Favorites` : `Added ${handleOf(post.author)} to Favorites`); if (r) setFavorite(!favorite) } },
      { label : 'Mute', hidden : post.mine, onClick : async () => { await tool(`/mute/${post.author._id}`, { mute : true }, `Muted ${handleOf(post.author)}. Their posts won't show in your feed.`); onHidden?.(post, 'author') } },
      { label : 'Not interested', hidden : post.mine || !onHidden, onClick : async () => { await tool(`/posts/${post._id}/hide`, { hide : true }, "You'll see fewer posts like this"); onHidden?.(post) } },
      { label : 'Go to post', hidden : !goToPost, onClick : () => navigate(`/pixify/p/${post._id}`) },
      { label : 'Share to...', onClick : () => sendToChat(post) },
      { label : 'Copy link', onClick : () => copyPostLink(post) },
      { label : 'About this account', hidden : post.mine, onClick : () => navigate(userLink(post.author)) },
    ]} />
  )
}

export const EditCaption = ({ actions, onClose }) => {
  const [text, setText] = useState(actions.post.text)
  const [location, setLocation] = useState(actions.post.location || '')
  return (
    <div className='fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4' onClick={onClose}>
      <div className='w-full max-w-md animate-pop rounded-xl bg-px-bg text-px-text' onClick={(e) => e.stopPropagation()}>
        <header className='flex h-12 items-center justify-between border-b border-px-border px-4'>
          <button onClick={onClose} className='text-sm'>Cancel</button>
          <span className='font-semibold'>Edit info</span>
          <button onClick={async () => { if (await actions.update({ text, location })) onClose() }} className='text-sm font-semibold text-px-blue'>Done</button>
        </header>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={2200} rows={6} className='w-full resize-none bg-transparent p-4 text-[15px] outline-none' />
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} placeholder='Add location' className='w-full border-t border-px-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-px-muted' />
      </div>
    </div>
  )
}

export const ActionBar = ({ actions, onComment, size = 26 }) => {
  const { post, like, save } = actions
  const { sendToChat } = usePixify()
  return (
    <div className='flex items-center gap-4 py-1'>
      <button onClick={() => like()} title={post.myReaction ? 'Unlike' : 'Like'} className='transition-transform active:scale-90'>
        {post.myReaction ? <IoHeart size={size} className='animate-[likepop_.3s_ease-out] text-[#ff3040]' /> : <IoHeartOutline size={size} className='hover:opacity-60' />}
      </button>
      {!post.commentsOff && <button onClick={onComment} title='Comment' className='hover:opacity-60'><IoChatbubbleOutline size={size - 1} className='-scale-x-100' /></button>}
      <button onClick={() => sendToChat(post)} title='Share' className='hover:opacity-60'><IoPaperPlaneOutline size={size - 2} /></button>
      <button onClick={save} title={post.saved ? 'Remove from saved' : 'Save'} className='ml-auto hover:opacity-60'>{post.saved ? <IoBookmark size={size - 2} /> : <IoBookmarkOutline size={size - 2} />}</button>
    </div>
  )
}

export const Likes = ({ post }) => {
  const [people, setPeople] = useState(undefined)
  const open = () => { setPeople(null); api.get(`/posts/${post._id}/reactions`).then((r) => setPeople(r.people)).catch(() => setPeople([])) }
  if (!post.reactionCount) return <p className='text-sm'>Be the first to <span className='font-semibold'>like this</span></p>
  // the author chose to hide the count: names only
  if (post.hideLikes && !post.mine) {
    return <p className='text-sm'>Liked by {post.reactedBy ? <span className='font-semibold'>{handleOf(post.reactedBy)}</span> : null}{post.reactedBy ? ' and ' : ''}<span className='font-semibold'>others</span></p>
  }
  return (
    <>
      <button onClick={open} className='text-left text-sm font-semibold'>
        {post.reactedBy
          ? <>Liked by {handleOf(post.reactedBy)}{post.reactionCount > 1 ? <> and {compact(post.reactionCount - 1)} other{post.reactionCount > 2 ? 's' : ''}</> : null}</>
          : <>{compact(post.reactionCount)} like{post.reactionCount === 1 ? '' : 's'}</>}
      </button>
      {people !== undefined && <PeopleModal title='Likes' app='pixify' people={people} onClose={() => setPeople(undefined)} />}
    </>
  )
}

// feed card
export const PostCard = ({ post : initial, onDeleted, onHidden }) => {
  const navigate = useNavigate()
  const actions = usePostActions(initial, { onDeleted })
  const { post, doubleTap, heart } = actions
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const [myComments, setMyComments] = useState([])
  const input = useRef(null)

  const sendComment = async (e) => {
    e.preventDefault()
    const text = comment.trim()
    if (!text) return
    setComment('')
    try {
      const r = await api.post(`/posts/${post._id}/comments`, { text })
      setMyComments((c) => [...c, r.comment])
      actions.setPost((p) => ({ ...p, commentCount : p.commentCount + 1 }))
    } catch (err) { setComment(text); notifyError(err.message) }
  }

  return (
    <article className='border-b border-px-border pb-4 sm:mb-3'>
      <header className='flex items-center gap-3 px-3 py-2.5 sm:px-0'>
        <Link to={userLink(post.author)}><Avatar width={32} height={32} name={post.author.name} imageUrl={post.author.profile_pic} /></Link>
        <div className='min-w-0 flex-1 text-sm'>
          <p className='truncate'>
            <AuthorNames post={post} />
            <span className='text-px-muted'> • {shortAgo(post.createdAt)}</span>
          </p>
          <PlaceLine post={post} />
        </div>
        <button onClick={() => setMenu(true)} title='More options' className='p-1 hover:opacity-60'><IoEllipsisHorizontal size={20} /></button>
      </header>
      <div className='relative overflow-hidden sm:rounded'>
        <MediaCarousel media={post.media} aspect={pixifyAspect(post)} onDoubleClick={doubleTap} />
        <HeartBurst k={heart} />
        <TaggedBadge post={post} />
      </div>
      <div className='px-3 sm:px-0'>
        <ActionBar actions={actions} onComment={() => input.current?.focus()} />
        <Likes post={post} />
        {post.text && (
          <p className='mt-1 text-sm'>
            <Link to={userLink(post.author)} className='mr-1 font-semibold'>{handleOf(post.author)}</Link>
            <RichText text={post.text} app='pixify' limit={125} linkClass='text-[#00376b] dark:text-[#e0f1ff]' />
          </p>
        )}
        {post.commentCount > myComments.length && (
          <button onClick={() => navigate(`/pixify/p/${post._id}`)} className='mt-1 block text-sm text-px-muted'>
            View {post.commentCount - myComments.length > 1 ? `all ${compact(post.commentCount)} comments` : '1 comment'}
          </button>
        )}
        {myComments.map((c) => <p key={c._id} className='mt-0.5 text-sm'><span className='mr-1 font-semibold'>{handleOf(c.author)}</span><RichText text={c.text} app='pixify' /></p>)}
        {!post.commentsOff && (
          <form onSubmit={sendComment} className='mt-1 flex items-center'>
            <input ref={input} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2200} placeholder='Add a comment…' aria-label='Add a comment'
              className='min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-px-muted' />
            {comment.trim() && <button className='text-sm font-semibold text-px-blue hover:text-px-text'>Post</button>}
          </form>
        )}
      </div>
      {menu && <PostMenu actions={actions} onClose={() => setMenu(false)} onEdit={() => setEditing(true)} onHidden={onHidden} />}
      {editing && <EditCaption actions={actions} onClose={() => setEditing(false)} />}
    </article>
  )
}

/* ---------------- full post (page) ---------------- */

const Comment = ({ c, onReply, onDelete, onLike, onPin }) => (
  <div className='group flex gap-3 py-2'>
    <Link to={userLink(c.author)} className='shrink-0'><Avatar width={32} height={32} name={c.author.name} imageUrl={c.author.profile_pic} /></Link>
    <div className='min-w-0 flex-1 text-sm'>
      {c.pinned && <p className='mb-0.5 flex items-center gap-1 text-xs text-px-muted'><BsPinAngleFill size={11} /> Pinned</p>}
      <p><Link to={userLink(c.author)} className='mr-1 font-semibold'>{handleOf(c.author)}</Link>{c.byAuthor && <span className='mr-1 text-xs text-px-muted'>· Author</span>}<RichText text={c.text} app='pixify' linkClass='text-[#00376b] dark:text-[#e0f1ff]' /></p>
      <p className='mt-1 flex gap-3 text-xs text-px-muted'>
        <span>{shortAgo(c.createdAt)}</span>
        {c.likeCount > 0 && <span className='font-semibold'>{c.likeCount} like{c.likeCount > 1 ? 's' : ''}</span>}
        {onReply && <button onClick={() => onReply(c)} className='font-semibold'>Reply</button>}
        {c.canPin && onPin && <button onClick={() => onPin(c)} className='hidden font-semibold group-hover:inline max-md:inline'>{c.pinned ? 'Unpin' : 'Pin'}</button>}
        {c.canDelete && <button onClick={() => onDelete(c)} className='hidden font-semibold group-hover:inline max-md:inline'>Delete</button>}
        {c.hiddenByWords && <span title='Hidden from others because of your hidden words'>· Hidden</span>}
      </p>
    </div>
    <button onClick={() => onLike(c)} title={c.liked ? 'Unlike' : 'Like'} className='mt-1 shrink-0 self-start'>
      {c.liked ? <IoHeart size={13} className='text-[#ff3040]' /> : <IoHeartOutline size={13} className='text-px-muted hover:opacity-60' />}
    </button>
  </div>
)

export const PostView = ({ post : initial, onDeleted }) => {
  const me = useSelector((s) => s.user)
  const actions = usePostActions(initial, { onDeleted })
  const { post, doubleTap, heart } = actions
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [open, setOpen] = useState({}) // expanded reply threads
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const input = useRef(null)

  useEffect(() => {
    api.get(`/posts/${post._id}/comments`).then((r) => setComments(r.comments)).catch((e) => { setComments([]); notifyError(e.message) })
  }, [post._id])

  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    try {
      const r = await api.post(`/posts/${post._id}/comments`, { text : t, ...(replyTo ? { parent : replyTo._id } : {}) })
      setComments((c) => [...(c || []), r.comment])
      if (r.comment.parent) setOpen((o) => ({ ...o, [r.comment.parent]: true }))
      actions.setPost((p) => ({ ...p, commentCount : p.commentCount + 1 }))
      setReplyTo(null)
    } catch (err) { setText(t); notifyError(err.message) }
  }
  // replies stay under the top comment; the @mention is the person you're answering
  const reply = (c, to = c) => { setReplyTo(c); setText(`@${handleOf(to.author)} `); input.current?.focus() }
  const del = async (c) => {
    try {
      const r = await api.del(`/comments/${c._id}`)
      setComments((list) => list.filter((x) => !r.removed.includes(x._id)))
      actions.setPost((p) => ({ ...p, commentCount : Math.max(0, p.commentCount - r.removed.length) }))
    } catch (e) { notifyError(e.message) }
  }
  const likeComment = async (c) => {
    const like = !c.liked
    setComments((list) => list.map((x) => (x._id === c._id ? { ...x, liked : like, likeCount : x.likeCount + (like ? 1 : -1) } : x)))
    try { await api.post(`/comments/${c._id}/like`, { like }) } catch (e) { notifyError(e.message) }
  }

  const pinComment = async (c) => {
    const pin = !c.pinned
    try {
      await api.post(`/comments/${c._id}/pin`, { pin })
      setComments((list) => {
        const next = list.map((x) => ({ ...x, pinned : pin && x._id === c._id }))
        return [...next.filter((x) => x.pinned), ...next.filter((x) => !x.pinned)]
      })
      notify(pin ? 'Comment pinned' : 'Comment unpinned')
    } catch (e) { notifyError(e.message) }
  }

  const top = (comments || []).filter((c) => !c.parent)
  const repliesOf = (id) => (comments || []).filter((c) => c.parent === id)

  return (
    <>
    <CollabInvite actions={actions} />
    <div className='flex w-full flex-col bg-px-bg md:h-[min(88dvh,820px)] md:flex-row md:border md:border-px-border'>
      <header className='flex items-center gap-3 border-b border-px-border px-4 py-3 md:hidden'>
        <Link to={userLink(post.author)}><Avatar width={32} height={32} name={post.author.name} imageUrl={post.author.profile_pic} /></Link>
        <div className='min-w-0 flex-1 text-sm'><p className='truncate'><AuthorNames post={post} className='font-semibold' /></p><PlaceLine post={post} /></div>
        <button onClick={() => setMenu(true)} title='More options'><IoEllipsisHorizontal size={20} /></button>
      </header>
      <div className='relative flex min-w-0 items-center justify-center bg-black md:flex-[1.4]'>
        <MediaCarousel media={post.media} aspect={pixifyAspect(post)} fit='object-contain' onDoubleClick={doubleTap} className='md:h-full md:!aspect-auto' />
        <HeartBurst k={heart} />
        <TaggedBadge post={post} />
      </div>
      <div className='flex min-h-0 w-full flex-col md:w-[400px] md:max-w-[45%] md:border-l md:border-px-border'>
        <header className='hidden items-center gap-3 border-b border-px-border px-4 py-3 md:flex'>
          <Link to={userLink(post.author)}><Avatar width={32} height={32} name={post.author.name} imageUrl={post.author.profile_pic} /></Link>
          <div className='min-w-0 flex-1 text-sm'><p className='truncate'><AuthorNames post={post} /></p><PlaceLine post={post} /></div>
          <button onClick={() => setMenu(true)} title='More options'><IoEllipsisHorizontal size={20} /></button>
        </header>
        <div className='order-2 min-h-0 flex-1 overflow-y-auto px-4 py-2 md:order-none'>
          {post.text && (
            <div className='flex gap-3 py-2'>
              <Avatar width={32} height={32} name={post.author.name} imageUrl={post.author.profile_pic} />
              <div className='min-w-0 flex-1 text-sm [overflow-wrap:anywhere]'>
                <p><Link to={userLink(post.author)} className='mr-1 font-semibold'>{handleOf(post.author)}</Link><RichText text={post.text} app='pixify' linkClass='text-[#00376b] dark:text-[#e0f1ff]' /></p>
                <p className='mt-1 text-xs text-px-muted'>{shortAgo(post.createdAt)}{post.editedAt ? ' · Edited' : ''}</p>
              </div>
            </div>
          )}
          {comments === null && <span className='mx-auto my-6 block h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
          {comments?.length === 0 && !post.commentsOff && <div className='py-10 text-center'><p className='text-xl font-bold'>No comments yet.</p><p className='mt-1 text-sm text-px-muted'>Start the conversation.</p></div>}
          {top.map((c) => (
            <div key={c._id}>
              <Comment c={c} onReply={post.commentsOff ? null : reply} onDelete={del} onLike={likeComment} onPin={pinComment} />
              {repliesOf(c._id).length > 0 && (
                <div className='ml-11'>
                  <button onClick={() => setOpen((o) => ({ ...o, [c._id]: !o[c._id] }))} className='flex items-center gap-3 py-1 text-xs font-semibold text-px-muted'>
                    <span className='h-px w-6 bg-px-muted' />{open[c._id] ? 'Hide replies' : `View replies (${repliesOf(c._id).length})`}
                  </button>
                  {open[c._id] && repliesOf(c._id).map((r) => <Comment key={r._id} c={r} onReply={post.commentsOff ? null : () => reply(c, r)} onDelete={del} onLike={likeComment} />)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className='order-1 border-px-border px-4 md:order-none md:border-t'>
          <ActionBar actions={actions} onComment={() => input.current?.focus()} size={24} />
          <Likes post={post} />
          <p className='mb-2 mt-1 text-[11px] uppercase tracking-wide text-px-muted'>{new Date(post.createdAt).toLocaleDateString(undefined, { month : 'long', day : 'numeric', year : 'numeric' })}</p>
        </div>
        {post.commentsOff
          ? <p className='order-3 border-t border-px-border px-4 py-3 text-center text-sm text-px-muted'>Commenting has been turned off.</p>
          : (
            <>
            <div className='order-3 flex justify-between border-t border-px-border px-4 pt-2 text-2xl'>
              {QUICK_EMOJIS.map((e) => <button key={e} type='button' onClick={() => { setText((t) => t + e); input.current?.focus() }} className='transition-transform hover:scale-125'>{e}</button>)}
            </div>
            <form onSubmit={send} className='order-3 flex items-center gap-3 px-4 py-2'>
              <Avatar width={28} height={28} name={me.name} imageUrl={me.profile_pic} />
              <input ref={input} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setReplyTo(null) }} maxLength={2200}
                placeholder={replyTo ? `Reply to ${handleOf(replyTo.author)}…` : 'Add a comment…'} aria-label='Add a comment'
                className='min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-px-muted' />
              <button disabled={!text.trim()} className='text-sm font-semibold text-px-blue disabled:opacity-40'>Post</button>
            </form>
            </>
          )}
      </div>
      {menu && <PostMenu actions={actions} goToPost={false} onClose={() => setMenu(false)} onEdit={() => setEditing(true)} onHidden={onDeleted} />}
      {editing && <EditCaption actions={actions} onClose={() => setEditing(false)} />}
    </div>
    </>
  )
}
