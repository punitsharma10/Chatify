import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { IoEllipsisHorizontal, IoChatbubbleOutline, IoShareSocialOutline, IoPaperPlaneOutline, IoThumbsUpOutline, IoSend } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, longAgo, compact } from '../../helpers/social'
import { notify, notifyError } from '../../helpers/toast'
import { RichText, ActionSheet, PeopleModal, copyPostLink, REACTIONS, reactionOf, ReactionIcon, AutoVideo, Modal, MediaCarousel } from '../social/common'
import { thumbUrl } from '../../helpers/media'
import { useConnectify, Card } from './ConnectifyLayout'
import { audienceOf, AUDIENCES } from './Composer'

const userLink = (p) => `/connectify/u/${p.username || p._id}`

// 1 photo: full width; 2: side by side; 3+: one big + grid, "+N" on the last tile
const MediaGrid = ({ media, onOpen }) => {
  const n = media.length
  const tile = (m, i, cls) => (
    <button key={i} onClick={() => onOpen(i)} className={`relative overflow-hidden bg-black ${cls}`}>
      {m.kind === 'video'
        ? <AutoVideo src={m.url} className='h-full w-full' fit='object-cover' onClick={() => onOpen(i)} />
        : <img src={thumbUrl(m.url, n === 1 ? 1080 : 600)} alt='' loading='lazy' className='h-full w-full object-cover' />}
      {i === 4 && n > 5 && <span className='absolute inset-0 flex items-center justify-center bg-black/50 text-3xl font-bold text-white'>+{n - 5}</span>}
    </button>
  )
  if (n === 1) {
    const m = media[0]
    const ratio = m.width && m.height ? Math.min(1.91, Math.max(0.6, m.width / m.height)) : 1
    return <div style={{ aspectRatio : String(ratio) }} className='w-full'>{tile(m, 0, 'h-full w-full')}</div>
  }
  if (n === 2) return <div className='grid aspect-[2/1] grid-cols-2 gap-0.5'>{media.map((m, i) => tile(m, i, 'h-full w-full'))}</div>
  if (n === 3) return <div className='grid aspect-square grid-cols-2 grid-rows-2 gap-0.5'>{tile(media[0], 0, 'row-span-2 h-full w-full')}{tile(media[1], 1, 'h-full w-full')}{tile(media[2], 2, 'h-full w-full')}</div>
  if (n === 4) return <div className='grid aspect-square grid-cols-2 grid-rows-2 gap-0.5'>{media.slice(0, 4).map((m, i) => tile(m, i, 'h-full w-full'))}</div>
  return (
    <div className='grid aspect-square grid-cols-6 grid-rows-[3fr_2fr] gap-0.5'>
      {tile(media[0], 0, 'col-span-3 h-full w-full')}{tile(media[1], 1, 'col-span-3 h-full w-full')}
      {media.slice(2, 5).map((m, i) => tile(m, i + 2, 'col-span-2 h-full w-full'))}
    </div>
  )
}

const TextBody = ({ post, big }) => (post.background
  ? <div className='flex min-h-[300px] items-center justify-center px-8 py-10 text-center text-[28px] font-bold leading-snug text-white' style={{ background : post.background }}><RichText text={post.text} app='connectify' /></div>
  : post.text ? <div className={`px-4 pb-3 ${big && post.text.length < 85 && !post.media?.length && !post.sharedPost ? 'text-2xl' : 'text-[15px]'}`}><RichText text={post.text} app='connectify' limit={420} linkClass='font-semibold text-cx-blue' /></div> : null)

// a shared post inside another post (and in the Share dialog)
export const SharedPreview = ({ post, onOpenMedia }) => {
  if (!post || post.unavailable) {
    return <div className='rounded-lg border border-cx-border px-4 py-3'><p className='font-semibold'>This content isn't available right now</p><p className='text-sm text-cx-muted'>It may have been deleted, or its audience changed.</p></div>
  }
  return (
    <div className='overflow-hidden rounded-lg border border-cx-border'>
      {post.media?.length > 0 && <MediaGrid media={post.media} onOpen={(i) => onOpenMedia?.(post, i)} />}
      <div className='flex items-center gap-2 px-4 pt-3'>
        <Link to={userLink(post.author)}><Avatar width={32} height={32} name={post.author.name} imageUrl={post.author.profile_pic} /></Link>
        <div className='text-sm'>
          <Link to={userLink(post.author)} className='font-semibold hover:underline'>{post.author.name}</Link>
          <p className='text-xs text-cx-muted'>{longAgo(post.createdAt)}</p>
        </div>
      </div>
      <div className='pt-2'>{post.background ? <TextBody post={post} /> : post.text && <div className='px-4 pb-3 text-[15px]'><RichText text={post.text} app='connectify' limit={250} /></div>}</div>
    </div>
  )
}

/* ---------- reactions ---------- */

const ReactButton = ({ mine, onReact }) => {
  const [open, setOpen] = useState(false)
  const timer = useRef(null)
  const r = mine ? reactionOf(mine) : null
  const hold = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 450) }
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 350) }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div className='relative flex-1' onMouseEnter={hold} onMouseLeave={leave}>
      {open && (
        <div className='absolute -top-14 left-0 z-20 flex animate-pop gap-1 rounded-full bg-cx-card px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,.25)]' onMouseEnter={() => clearTimeout(timer.current)}>
          {REACTIONS.map((x) => (
            <button key={x.id} onClick={() => { setOpen(false); onReact(x.id) }} title={x.label} className='text-[30px] leading-none transition-transform hover:-translate-y-1 hover:scale-125'>{x.emoji}</button>
          ))}
        </div>
      )}
      <button onClick={() => { setOpen(false); onReact(mine ? null : 'like') }}
        onTouchStart={hold} onTouchEnd={() => clearTimeout(timer.current)} onContextMenu={(e) => { e.preventDefault(); setOpen(true) }}
        className='flex h-9 w-full items-center justify-center gap-2 rounded-md text-[15px] font-semibold hover:bg-cx-hover' style={{ color : r?.color }}>
        {r ? <span className='text-lg leading-none'>{r.emoji}</span> : <IoThumbsUpOutline size={20} className='text-cx-muted' />}
        <span className={r ? '' : 'text-cx-muted'}>{r ? r.label : 'Like'}</span>
      </button>
    </div>
  )
}

/* ---------- comments ---------- */

const CommentRow = ({ c, onReply, onDelete, onLike, reply }) => {
  const [menu, setMenu] = useState(false)
  return (
    <div className={`group flex gap-2 ${reply ? 'ml-10' : ''} py-1`}>
      <Link to={userLink(c.author)} className='shrink-0'><Avatar width={reply ? 24 : 32} height={reply ? 24 : 32} name={c.author.name} imageUrl={c.author.profile_pic} /></Link>
      <div className='min-w-0'>
        <div className='flex items-center gap-1'>
          <div className='relative rounded-2xl bg-cx-input px-3 py-2'>
            <Link to={userLink(c.author)} className='block text-[13px] font-semibold hover:underline'>{c.author.name}{c.byAuthor && <span className='ml-1 rounded bg-cx-blue/15 px-1 text-[11px] font-semibold text-cx-blue'>Author</span>}</Link>
            <RichText text={c.text} app='connectify' className='text-[15px]' linkClass='font-semibold text-cx-blue' />
            {c.likeCount > 0 && <span className='absolute -bottom-2 -right-3 flex items-center gap-0.5 rounded-full bg-cx-card px-1 text-xs text-cx-muted shadow'>👍{c.likeCount > 1 ? c.likeCount : ''}</span>}
          </div>
          {c.canDelete && <button onClick={() => setMenu(true)} className='invisible flex h-8 w-8 items-center justify-center rounded-full text-cx-muted hover:bg-cx-hover group-hover:visible' title='Options'><IoEllipsisHorizontal /></button>}
        </div>
        <div className='flex gap-3 px-3 pt-1 text-xs font-semibold text-cx-muted'>
          <span className='font-normal'>{longAgo(c.createdAt)}</span>
          <button onClick={() => onLike(c)} className={c.liked ? 'text-cx-blue' : 'hover:underline'}>Like</button>
          {onReply && <button onClick={() => onReply(c)} className='hover:underline'>Reply</button>}
        </div>
      </div>
      {menu && <ActionSheet tone='cx' onClose={() => setMenu(false)} items={[{ label : 'Delete', danger : true, onClick : () => onDelete(c) }]} />}
    </div>
  )
}

const Comments = ({ post, onCount, autoFocus }) => {
  const me = useSelector((s) => s.user)
  const [list, setList] = useState(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const input = useRef(null)
  useEffect(() => { api.get(`/posts/${post._id}/comments`).then((r) => setList(r.comments)).catch(() => setList([])) }, [post._id])
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])

  const send = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    try {
      const r = await api.post(`/posts/${post._id}/comments`, { text : t, ...(replyTo ? { parent : replyTo._id } : {}) })
      setList((l) => [...(l || []), r.comment])
      setReplyTo(null)
      onCount(1)
    } catch (err) { setText(t); notifyError(err.message) }
  }
  const del = async (c) => {
    try { const r = await api.del(`/comments/${c._id}`); setList((l) => l.filter((x) => !r.removed.includes(x._id))); onCount(-r.removed.length) } catch (e) { notifyError(e.message) }
  }
  const like = async (c) => {
    const want = !c.liked
    setList((l) => l.map((x) => (x._id === c._id ? { ...x, liked : want, likeCount : x.likeCount + (want ? 1 : -1) } : x)))
    try { await api.post(`/comments/${c._id}/like`, { like : want }) } catch (e) { notifyError(e.message) }
  }
  const reply = (c) => { setReplyTo(c); setText(c.author.username ? `@${c.author.username} ` : ''); input.current?.focus() }

  return (
    <div className='border-t border-cx-border px-4 pb-3 pt-2'>
      {list === null && <span className='my-3 block h-5 w-5 animate-spin rounded-full border-2 border-cx-border border-t-cx-muted' />}
      {(list || []).filter((c) => !c.parent).map((c) => (
        <div key={c._id}>
          <CommentRow c={c} onReply={post.commentsOff ? null : reply} onDelete={del} onLike={like} />
          {list.filter((r) => r.parent === c._id).map((r) => <CommentRow key={r._id} c={r} reply onReply={post.commentsOff ? null : () => reply(c)} onDelete={del} onLike={like} />)}
        </div>
      ))}
      {post.commentsOff ? <p className='py-2 text-center text-sm text-cx-muted'>Comments are turned off for this post.</p> : (
        <form onSubmit={send} className='mt-1 flex items-center gap-2'>
          <Avatar width={32} height={32} name={me.name} imageUrl={me.profile_pic} />
          <div className='flex min-w-0 flex-1 items-center rounded-full bg-cx-input pr-1'>
            <input ref={input} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setReplyTo(null) }} maxLength={2200}
              placeholder={replyTo ? `Reply to ${replyTo.author.name}…` : 'Write a comment…'} aria-label='Write a comment'
              className='h-9 min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-cx-muted' />
            <button disabled={!text.trim()} title='Comment' className='flex h-8 w-8 items-center justify-center rounded-full text-cx-blue disabled:text-cx-muted'><IoSend size={16} /></button>
          </div>
        </form>
      )}
    </div>
  )
}

/* ---------- the post ---------- */

export const CxPostCard = ({ post : initial, onDeleted, expanded = false }) => {
  const navigate = useNavigate()
  const { sendToChat, openComposer } = useConnectify()
  const [post, setPost] = useState(initial)
  useEffect(() => setPost(initial), [initial])
  const [showComments, setShowComments] = useState(expanded)
  const [focusComment, setFocusComment] = useState(0) // bumped to focus the comment box
  const [menu, setMenu] = useState(false)
  const [shareMenu, setShareMenu] = useState(false)
  const [audienceMenu, setAudienceMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [people, setPeople] = useState(undefined)
  const [viewer, setViewer] = useState(null) // { media, index }

  const react = async (type) => {
    const before = { myReaction : post.myReaction, reactionCount : post.reactionCount, reactionCounts : post.reactionCounts, topReactions : post.topReactions }
    setPost((p) => ({ ...p, myReaction : type, reactionCount : p.reactionCount + (type && !p.myReaction ? 1 : !type && p.myReaction ? -1 : 0) }))
    try { const r = await api.post(`/posts/${post._id}/react`, { type }); setPost((p) => ({ ...p, ...r })) } catch (e) { setPost((p) => ({ ...p, ...before })); notifyError(e.message) }
  }
  const update = async (body) => {
    try { const r = await api.patch(`/posts/${post._id}`, body); setPost((p) => ({ ...p, ...r.post })); return true } catch (e) { notifyError(e.message); return false }
  }
  const remove = async () => {
    try { await api.del(`/posts/${post._id}`); notify('Post deleted'); onDeleted?.(post) } catch (e) { notifyError(e.message) }
  }
  const openPeople = () => { setPeople(null); api.get(`/posts/${post._id}/reactions`).then((r) => setPeople(r.people)).catch(() => setPeople([])) }
  const A = audienceOf(post.audience)
  const shareable = post.audience === 'public' && !(post.sharedPost?.unavailable)
  const target = post.sharedPost && !post.sharedPost.unavailable ? post.sharedPost : post

  return (
    <Card className='mb-4 overflow-visible'>
      <header className='flex items-start gap-2 px-4 pb-3 pt-3'>
        <Link to={userLink(post.author)}><Avatar width={40} height={40} name={post.author.name} imageUrl={post.author.profile_pic} /></Link>
        <div className='min-w-0 flex-1'>
          <p className='text-[15px] leading-5'>
            <Link to={userLink(post.author)} className='font-semibold hover:underline'>{post.author.name}</Link>
            {post.sharedPost && <span className='text-cx-muted'> shared a post</span>}
          </p>
          <p className='flex items-center gap-1 text-[13px] text-cx-muted'>
            <Link to={`/connectify/p/${post._id}`} className='hover:underline'>{longAgo(post.createdAt)}</Link>{post.editedAt && <span>· Edited</span>} · <A.Icon size={12} title={A.label} />
          </p>
        </div>
        <button onClick={() => setMenu(true)} title='Options' className='flex h-9 w-9 items-center justify-center rounded-full text-cx-muted hover:bg-cx-hover'><IoEllipsisHorizontal size={20} /></button>
      </header>

      <TextBody post={post} big />
      {post.media?.length > 0 && <MediaGrid media={post.media} onOpen={(index) => setViewer({ media : post.media, index })} />}
      {post.sharedPost && <div className='px-4 pb-1'><SharedPreview post={post.sharedPost} onOpenMedia={(p, index) => setViewer({ media : p.media, index })} /></div>}

      {/* counts */}
      {(post.reactionCount > 0 || post.commentCount > 0 || post.shareCount > 0) && (
        <div className='mx-4 flex items-center gap-2 py-2.5 text-[15px] text-cx-muted'>
          {post.reactionCount > 0 && (
            <button onClick={openPeople} className='flex items-center gap-1.5 hover:underline'>
              <span className='flex -space-x-1'>{post.topReactions.map((t) => <ReactionIcon key={t} type={t} size={19} />)}</span>
              {post.myReaction && post.reactionCount > 1 ? `You and ${compact(post.reactionCount - 1)} other${post.reactionCount > 2 ? 's' : ''}` : post.myReaction ? 'You' : post.reactedBy ? `${post.reactedBy.name}${post.reactionCount > 1 ? ` and ${compact(post.reactionCount - 1)} other${post.reactionCount > 2 ? 's' : ''}` : ''}` : compact(post.reactionCount)}
            </button>
          )}
          <span className='ml-auto flex gap-3'>
            {post.commentCount > 0 && <button onClick={() => setShowComments((s) => !s)} className='hover:underline'>{compact(post.commentCount)} comment{post.commentCount > 1 ? 's' : ''}</button>}
            {post.shareCount > 0 && <span>{compact(post.shareCount)} share{post.shareCount > 1 ? 's' : ''}</span>}
          </span>
        </div>
      )}

      {/* actions */}
      <div className='mx-3 flex gap-1 border-t border-cx-border py-1'>
        <ReactButton mine={post.myReaction} onReact={react} />
        <button onClick={() => { setShowComments(true); setFocusComment((n) => n + 1) }} className='flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoChatbubbleOutline size={20} />Comment</button>
        <button onClick={() => sendToChat(target)} className='flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoPaperPlaneOutline size={19} />Send</button>
        <button onClick={() => setShareMenu(true)} className='flex h-9 flex-1 items-center justify-center gap-2 rounded-md text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoShareSocialOutline size={19} />Share</button>
      </div>

      {showComments && <Comments post={post} autoFocus={focusComment} onCount={(d) => setPost((p) => ({ ...p, commentCount : Math.max(0, p.commentCount + d) }))} />}

      {menu && (
        <ActionSheet tone='cx' onClose={() => setMenu(false)} items={[
          { label : 'Edit post', hidden : !post.mine, onClick : () => setEditing(true) },
          { label : 'Edit audience', hidden : !post.mine, onClick : () => setAudienceMenu(true) },
          { label : post.commentsOff ? 'Turn on commenting' : 'Turn off commenting', hidden : !post.mine, onClick : () => update({ commentsOff : !post.commentsOff }) },
          { label : 'Open post', hidden : expanded, onClick : () => navigate(`/connectify/p/${post._id}`) },
          { label : 'Copy link', onClick : () => copyPostLink(post) },
          { label : 'Move to trash', danger : true, hidden : !post.mine, onClick : () => setConfirmDelete(true) },
        ]} />
      )}
      {confirmDelete && <ActionSheet tone='cx' title='Delete this post? You can’t undo this.' onClose={() => setConfirmDelete(false)} items={[{ label : 'Delete', danger : true, onClick : remove }]} />}
      {audienceMenu && (
        <ActionSheet tone='cx' title='Who can see this post?' onClose={() => setAudienceMenu(false)}
          items={AUDIENCES.map((a) => ({ label : `${a.label}${post.audience === a.id ? ' ✓' : ''}`, bold : post.audience === a.id, onClick : () => update({ audience : a.id }) }))} />
      )}
      {shareMenu && (
        <ActionSheet tone='cx' title='Share' onClose={() => setShareMenu(false)} items={[
          { label : 'Share to Feed', hidden : !shareable, onClick : () => openComposer({ sharedPost : target }) },
          { label : 'Send in Chats', onClick : () => sendToChat(target) },
          { label : 'Copy link', onClick : () => copyPostLink(target) },
        ]} />
      )}
      {editing && <EditPost post={post} onClose={() => setEditing(false)} onSave={async (text) => { if (await update({ text })) setEditing(false) }} />}
      {people !== undefined && <PeopleModal tone='cx' app='connectify' title='Reactions' people={people} onClose={() => setPeople(undefined)} />}
      {viewer && (
        <Modal onClose={() => setViewer(null)} label='Photos' className='w-full max-w-[1100px]'>
          <MediaCarousel media={viewer.media.slice(viewer.index).concat(viewer.media.slice(0, viewer.index))} aspect={16 / 10} fit='object-contain' />
        </Modal>
      )}
    </Card>
  )
}

const EditPost = ({ post, onClose, onSave }) => {
  const [text, setText] = useState(post.text)
  return (
    <Modal onClose={onClose} closeButton={false} label='Edit post' className='w-full max-w-[500px] overflow-hidden rounded-lg bg-cx-card text-cx-text'>
      <header className='flex h-[60px] items-center justify-center border-b border-cx-border text-xl font-bold'>Edit post</header>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={post.background ? 130 : 5000} rows={6} className='w-full resize-none bg-transparent p-4 text-[15px] outline-none' />
      <div className='flex justify-end gap-2 border-t border-cx-border p-3'>
        <button onClick={onClose} className='h-9 rounded-md px-4 font-semibold text-cx-blue hover:bg-cx-hover'>Cancel</button>
        <button onClick={() => onSave(text)} className='h-9 rounded-md bg-cx-blue px-6 font-semibold text-white'>Save</button>
      </div>
    </Modal>
  )
}
