import React, { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { IoArrowBack, IoChevronForward } from 'react-icons/io5'
import Avatar from '../Avatar'
import { api, shortAgo } from '../../helpers/social'
import { notifyError } from '../../helpers/toast'
import { MediaThumb } from '../social/common'
import { FollowButton } from './PixifyHome'

const TEXT = {
  like : 'liked your post.',
  comment : 'commented:',
  reply : 'replied to your comment:',
  comment_like : 'liked your comment:',
  mention : 'mentioned you:',
  follow : 'started following you.',
  follow_request : 'requested to follow you.',
  follow_accept : 'accepted your follow request.',
}

const group = (date) => {
  const days = (Date.now() - new Date(date)) / 864e5
  return days < 1 ? 'Today' : days < 7 ? 'This week' : days < 30 ? 'This month' : 'Earlier'
}

const Requests = ({ onBack, onChange }) => {
  const [list, setList] = useState(null)
  useEffect(() => { api.get('/follow-requests').then((r) => setList(r.requests)).catch(() => setList([])) }, [])
  const answer = async (p, accept) => {
    try { await api.post(`/follow-requests/${p._id}`, { accept }); setList((l) => l.filter((x) => x._id !== p._id)); onChange() } catch (e) { notifyError(e.message) }
  }
  return (
    <div>
      <button onClick={onBack} className='mb-2 flex items-center gap-2 py-2 font-semibold'><IoArrowBack size={20} /> Follow requests</button>
      {list === null && <span className='mx-auto my-6 block h-6 w-6 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
      {list?.length === 0 && <p className='py-10 text-center text-sm text-px-muted'>No pending requests</p>}
      {list?.map((p) => (
        <div key={p._id} className='flex items-center gap-3 py-2'>
          <Link to={`/pixify/u/${p.username || p._id}`} className='flex min-w-0 flex-1 items-center gap-3'>
            <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
            <span className='min-w-0'><span className='block truncate text-sm font-semibold'>{p.username}</span><span className='block truncate text-sm text-px-muted'>{p.name}</span></span>
          </Link>
          <button onClick={() => answer(p, true)} className='h-8 rounded-lg bg-px-blue px-4 text-sm font-semibold text-white'>Confirm</button>
          <button onClick={() => answer(p, false)} className='h-8 rounded-lg bg-px-raised px-4 text-sm font-semibold'>Delete</button>
        </div>
      ))}
    </div>
  )
}

const PixifyNotifications = () => {
  const navigate = useNavigate()
  const socket = useSelector((s) => s.user.socketConnection)
  const [data, setData] = useState(null)
  const [showRequests, setShowRequests] = useState(false)

  const load = useCallback(() => {
    api.get('/notifications?app=pixify').then((r) => {
      setData(r)
      if (r.notifications.some((n) => !n.read)) api.post('/notifications/read', { app : 'pixify' }).catch(() => {})
    }).catch((e) => { setData({ notifications : [], followRequests : 0 }); notifyError(e.message) })
  }, [])

  useEffect(() => {
    load()
    if (!socket) return
    const on = (e) => { if (e?.app === 'pixify' && !e.read) load() }
    socket.on('social-notification', on)
    return () => socket.off('social-notification', on)
  }, [socket, load])

  const groups = {}
  for (const n of (data?.notifications || []).filter((x) => x.type !== 'follow_request')) (groups[group(n.createdAt)] = groups[group(n.createdAt)] || []).push(n)

  return (
    <div className='mx-auto max-w-[600px] px-4 py-4 md:py-8'>
      <div className='mb-4 flex items-center gap-3'>
        <button onClick={() => navigate(-1)} className='md:hidden' title='Back'><IoArrowBack size={22} /></button>
        <h1 className='text-2xl font-bold'>Notifications</h1>
      </div>
      {showRequests ? <Requests onBack={() => setShowRequests(false)} onChange={load} /> : (
        <>
          {data?.followRequests > 0 && (
            <button onClick={() => setShowRequests(true)} className='mb-3 flex w-full items-center gap-3 rounded-lg py-2 text-left hover:bg-px-hover'>
              <span className='relative flex h-11 w-11 items-center justify-center rounded-full bg-px-raised text-lg'>👤<span className='absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff3040] px-1 text-[11px] font-bold text-white'>{data.followRequests}</span></span>
              <span className='flex-1'><span className='block text-sm font-semibold'>Follow requests</span><span className='block text-sm text-px-muted'>Approve or ignore requests</span></span>
              <IoChevronForward className='text-px-muted' />
            </button>
          )}
          {data === null && <span className='mx-auto my-10 block h-7 w-7 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
          {data && !Object.keys(groups).length && !data.followRequests && (
            <div className='py-16 text-center'>
              <p className='text-4xl'>♡</p>
              <p className='mt-3 font-semibold'>Activity on your posts</p>
              <p className='mt-1 text-sm text-px-muted'>When someone likes or comments on one of your posts, you'll see it here.</p>
            </div>
          )}
          {Object.entries(groups).map(([title, items]) => (
            <section key={title} className='border-b border-px-border pb-3 pt-2 last:border-0'>
              <h2 className='mb-1 font-bold'>{title}</h2>
              {items.map((n) => (
                <div key={n._id} className={`flex items-center gap-3 rounded-lg py-2 ${n.read ? '' : 'bg-px-blue/5'}`}>
                  <Link to={`/pixify/u/${n.actor.username || n.actor._id}`} className='shrink-0'><Avatar width={44} height={44} name={n.actor.name} imageUrl={n.actor.profile_pic} /></Link>
                  <button onClick={() => (n.post ? navigate(`/pixify/p/${n.post._id}`) : navigate(`/pixify/u/${n.actor.username || n.actor._id}`))} className='min-w-0 flex-1 text-left text-sm'>
                    <span className='font-semibold'>{n.actor.username || n.actor.name}</span> {TEXT[n.type] || ''} {n.text && ['comment', 'reply', 'mention', 'comment_like'].includes(n.type) && <span className='break-words'>{n.text.slice(0, 120)}</span>}
                    <span className='ml-1 text-px-muted'>{shortAgo(n.createdAt)}</span>
                  </button>
                  {n.post?.thumb
                    ? <Link to={`/pixify/p/${n.post._id}`} className='shrink-0'><MediaThumb media={n.post.thumb} className='h-11 w-11 rounded' /></Link>
                    : ['follow', 'follow_accept'].includes(n.type) && <FollowButton person={n.actor} initial={n.followStatus} />}
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  )
}

export default PixifyNotifications
