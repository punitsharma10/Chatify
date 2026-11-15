import React from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { IoSearchOutline, IoHome, IoPeopleOutline, IoTvOutline, IoStorefrontOutline, IoNotificationsOutline, IoChatbubbleEllipsesOutline, IoBookmarkOutline, IoTimeOutline, IoImages, IoHappyOutline, IoVideocam, IoAdd, IoPeople, IoNewspaperOutline } from 'react-icons/io5'
import Avatar from '../components/Avatar'
import AppSwitcher from '../components/apps/AppSwitcher'
import useStories from '../components/apps/useStories'
import { StoryPreview, useStoryComposer, useStoryViewer, usePersonLabel } from '../components/apps/stories'
import { ConnectifyMark, ConnectifyWordmark, ChatsMark, PixifyMark } from '../components/apps/AppLogos'
import { useContactList } from '../helpers/contacts'
import { notify } from '../helpers/toast'

const soon = (what) => () => notify(`${what} is coming soon to Connectify`)

const Card = ({ className = '', children }) => <div className={`rounded-lg bg-cx-card shadow-[0_1px_2px_rgba(0,0,0,.2)] ${className}`}>{children}</div>

const TopTab = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
    className={`relative flex h-full w-[112px] items-center justify-center ${active ? 'text-cx-blue' : 'text-cx-muted'}`}>
    <span className={`flex h-[calc(100%-8px)] w-full items-center justify-center rounded-lg ${active ? '' : 'hover:bg-cx-hover'}`}>{icon}</span>
    {active && <span className='absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-cx-blue' />}
  </button>
)

const SideLink = ({ icon, label, onClick }) => (
  <button onClick={onClick} className='flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[15px] font-medium hover:bg-cx-hover'>
    <span className='flex h-9 w-9 shrink-0 items-center justify-center'>{icon}</span>
    <span className='truncate'>{label}</span>
  </button>
)

const Connectify = () => {
  const user = useSelector((s) => s.user)
  const onlineUser = useSelector((s) => s.user.onlineUser)
  const navigate = useNavigate()
  const { data, ordered, reload } = useStories('connectify')
  const composer = useStoryComposer('connectify', { onPosted : reload, tone : 'cx' })
  const viewer = useStoryViewer('connectify', reload)
  const label = usePersonLabel('connectify')
  const contacts = useContactList()
  const firstName = (user.name || '').trim().split(/\s+/)[0]


  const mine = data?.mine || []
  const me = { _id : user._id, name : user.name, username : user.username, profile_pic : user.profile_pic, self : true }

  return (
    <div className='flex h-dvh flex-col bg-cx-bg text-cx-text'>
      {/* top bar */}
      <header className='relative z-10 flex h-14 shrink-0 items-center justify-between bg-cx-card px-3 shadow-[0_1px_2px_rgba(0,0,0,.15)] sm:px-4'>
        <div className='flex min-w-0 items-center gap-2'>
          <button onClick={() => navigate('/connectify')} title='Connectify home' className='shrink-0'>
            <span className='sm:hidden'><ConnectifyWordmark className='text-[26px]' /></span>
            <span className='hidden sm:inline'><ConnectifyMark size={40} /></span>
          </button>
          <button onClick={soon('Search')} className='hidden h-10 items-center gap-2 rounded-full bg-cx-input px-3 text-[15px] text-cx-muted sm:flex xl:w-[240px]'>
            <IoSearchOutline size={18} /><span className='hidden xl:inline'>Search Connectify</span>
          </button>
        </div>

        <nav aria-label='Connectify' className='absolute left-1/2 hidden h-full -translate-x-1/2 md:flex'>
          <TopTab active icon={<IoHome size={26} />} label='Home' onClick={() => navigate('/connectify')} />
          <TopTab icon={<IoPeopleOutline size={27} />} label='Friends' onClick={soon('Friends')} />
          <TopTab icon={<IoTvOutline size={26} />} label='Video' onClick={soon('Video')} />
          <TopTab icon={<IoStorefrontOutline size={25} />} label='Marketplace' onClick={soon('Marketplace')} />
        </nav>

        <div className='flex items-center gap-2'>
          <AppSwitcher variant='row' className='hidden md:flex' />
          <button onClick={() => navigate('/')} title='Messages' className='flex h-10 w-10 items-center justify-center rounded-full bg-cx-input hover:brightness-95 md:hidden'><IoChatbubbleEllipsesOutline size={20} /></button>
          <button onClick={soon('Notifications')} title='Notifications' className='flex h-10 w-10 items-center justify-center rounded-full bg-cx-input hover:brightness-95'><IoNotificationsOutline size={20} /></button>
          <button onClick={soon('Your Connectify profile')} title={user.name} className='rounded-full'><Avatar width={40} height={40} name={user.name} imageUrl={user.profile_pic} /></button>
        </div>
      </header>

      <div className='flex min-h-0 flex-1'>
        {/* left shortcuts (wide screens) */}
        <aside className='hidden w-[300px] shrink-0 overflow-y-auto px-2 pt-4 xl:block'>
          <SideLink icon={<Avatar width={36} height={36} name={user.name} imageUrl={user.profile_pic} />} label={user.name} onClick={soon('Your Connectify profile')} />
          <SideLink icon={<IoPeople size={28} className='text-cx-blue' />} label='Friends' onClick={soon('Friends')} />
          <SideLink icon={<IoTimeOutline size={28} className='text-cx-blue' />} label='Memories' onClick={soon('Memories')} />
          <SideLink icon={<IoBookmarkOutline size={26} className='text-[#c03fd6]' />} label='Saved' onClick={soon('Saved')} />
          <SideLink icon={<IoNewspaperOutline size={26} className='text-cx-blue' />} label='Feeds' onClick={soon('Feeds')} />
          <div className='mx-2 my-3 border-t border-cx-border' />
          <p className='px-2 pb-1 text-[17px] font-semibold text-cx-muted'>Your apps</p>
          <SideLink icon={<ChatsMark size={30} />} label='Chats' onClick={() => navigate('/')} />
          <SideLink icon={<PixifyMark size={30} />} label='Pixify' onClick={() => navigate('/pixify')} />
          <p className='px-2 pt-4 text-xs text-cx-muted'>Connectify · part of Chatify © {new Date().getFullYear()}</p>
        </aside>

        {/* feed */}
        <main className='min-h-0 flex-1 overflow-y-auto'>
          <div className='mx-auto w-full max-w-[590px] px-0 py-4 sm:px-4'>
            {/* stories: tall cards */}
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
            </section>

            {/* "What's on your mind?" (posting arrives in the next update) */}
            <Card className='mt-4 px-4 pb-2 pt-3'>
              <div className='flex items-center gap-2'>
                <Avatar width={40} height={40} name={user.name} imageUrl={user.profile_pic} />
                <button onClick={soon('Posting')} className='h-10 flex-1 rounded-full bg-cx-input px-3 text-left text-[17px] text-cx-muted hover:brightness-95'>
                  What's on your mind, {firstName}?
                </button>
              </div>
              <div className='mt-3 grid grid-cols-3 border-t border-cx-border pt-1'>
                <button onClick={soon('Live video')} className='flex items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoVideocam size={22} className='text-[#f02849]' /><span className='hidden sm:inline'>Live video</span></button>
                <button onClick={composer.openPicker} className='flex items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoImages size={21} className='text-[#45bd62]' /><span className='hidden sm:inline'>Photo story</span></button>
                <button onClick={soon('Feelings')} className='flex items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-cx-muted hover:bg-cx-hover'><IoHappyOutline size={22} className='text-[#f7b928]' /><span className='hidden sm:inline'>Feeling</span></button>
              </div>
            </Card>

            <Card className='mt-4 flex flex-col items-center px-6 py-10 text-center'>
              <ConnectifyMark size={56} />
              <h2 className='mt-4 text-xl font-bold'>Welcome to Connectify, {firstName}!</h2>
              <p className='mt-2 max-w-sm text-[15px] text-cx-muted'>
                Posts, reactions, comments and friend requests are coming in the next update.
                Stories already work, and you can share them to Chats and Pixify too.
              </p>
              <button onClick={composer.openPicker} className='mt-5 rounded-md bg-cx-blue px-4 py-2 text-[15px] font-semibold text-white hover:brightness-95'>Create a story</button>
              {data && !ordered.length && <p className='mt-5 text-xs text-cx-muted'>Stories from people who saved you as a contact show up at the top.</p>}
            </Card>
          </div>
        </main>

        {/* contacts (wide screens): click to chat in Chats */}
        <aside className='hidden w-[300px] shrink-0 overflow-y-auto px-2 pt-4 lg:block'>
          <p className='px-2 pb-2 text-[17px] font-semibold text-cx-muted'>Contacts</p>
          {contacts === null && <span className='mx-2 my-3 block h-5 w-5 animate-spin rounded-full border-2 border-cx-border border-t-cx-muted' />}
          {contacts?.length === 0 && <p className='px-2 text-sm text-cx-muted'>Save contacts in Chats to see them here.</p>}
          {contacts?.map((p) => (
            <button key={p._id} onClick={() => navigate('/' + p._id)} title={`Message ${p.name}`} className='flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-cx-hover'>
              <span className='relative'>
                <Avatar width={36} height={36} name={p.name} imageUrl={p.profile_pic} />
                {onlineUser?.includes(String(p._id)) && <span className='absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-cx-bg bg-[#31a24c]' />}
              </span>
              <span className='truncate text-[15px] font-medium'>{p.name}</span>
            </button>
          ))}
        </aside>
      </div>

      <AppSwitcher variant='bar' className='md:hidden' />

      {composer.element}
      {viewer.element}
    </div>
  )
}

export default Connectify
