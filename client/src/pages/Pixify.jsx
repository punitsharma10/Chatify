import React from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { GoHomeFill } from 'react-icons/go'
import { IoSearchOutline, IoCompassOutline, IoHeartOutline, IoAddCircleOutline, IoPaperPlaneOutline, IoFilmOutline, IoAdd, IoCameraOutline } from 'react-icons/io5'
import Avatar from '../components/Avatar'
import AppSwitcher from '../components/apps/AppSwitcher'
import UsernamePrompt from '../components/apps/UsernamePrompt'
import useStories from '../components/apps/useStories'
import { StoryPreview, useStoryComposer, useStoryViewer, usePersonLabel } from '../components/apps/stories'
import { PixifyMark, PixifyWordmark } from '../components/apps/AppLogos'
import { useContactList } from '../helpers/contacts'
import { notify } from '../helpers/toast'

const soon = (what) => () => notify(`${what} is coming soon to Pixify`)

// Pixify story ring: warm gradient when there's something new, grey when everything was seen
const Ring = ({ seen, size = 66, children }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-full p-[2.5px] ${seen ? 'bg-px-border' : 'bg-gradient-to-tr from-[#ffb03a] via-[#ff3d77] to-[#a33ffc]'}`} style={{ width : size, height : size }}>
    <span className='flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[2.5px] border-px-bg bg-px-bg'>{children}</span>
  </span>
)

const NavItem = ({ icon, label, active, onClick, badge }) => (
  <button onClick={onClick} title={label} aria-current={active ? 'page' : undefined}
    className={`group flex w-full items-center gap-4 rounded-lg p-3 text-[15px] transition-colors hover:bg-px-hover ${active ? 'font-bold' : ''}`}>
    <span className='relative transition-transform group-hover:scale-105'>{icon}{badge}</span>
    <span className='hidden xl:inline'>{label}</span>
  </button>
)

const Pixify = () => {
  const user = useSelector((s) => s.user)
  const navigate = useNavigate()
  const { data, ordered, reload } = useStories('pixify')
  const composer = useStoryComposer('pixify', { onPosted : reload, tone : 'px' })
  const viewer = useStoryViewer('pixify', reload)
  const label = usePersonLabel('pixify')
  const contacts = useContactList()


  const mine = data?.mine || []
  const me = { _id : user._id, name : user.name, username : user.username, profile_pic : user.profile_pic, self : true }
  const openMine = () => (mine.length ? viewer.open([{ user : me, statuses : mine }], 0, { mine : true }) : composer.openPicker())
  const needsUsername = user._id && !user.username

  return (
    <div className='flex h-dvh flex-col bg-px-bg text-px-text md:flex-row'>
      {/* desktop / tablet: Instagram-style left navigation (icons only until xl) */}
      <nav aria-label='Pixify' className='hidden w-[72px] shrink-0 flex-col justify-between border-r border-px-border px-3 pb-5 pt-6 md:flex xl:w-[244px]'>
        <div className='flex flex-col gap-1'>
          <button onClick={() => navigate('/pixify')} className='mb-6 flex h-10 items-center px-3' title='Pixify'>
            <span className='xl:hidden'><PixifyMark size={26} /></span>
            <span className='hidden xl:inline'><PixifyWordmark /></span>
          </button>
          <NavItem active icon={<GoHomeFill size={26} />} label='Home' onClick={() => navigate('/pixify')} />
          <NavItem icon={<IoSearchOutline size={26} />} label='Search' onClick={soon('Search')} />
          <NavItem icon={<IoCompassOutline size={26} />} label='Explore' onClick={soon('Explore')} />
          <NavItem icon={<IoFilmOutline size={26} />} label='Reels' onClick={soon('Reels')} />
          <NavItem icon={<IoPaperPlaneOutline size={25} />} label='Messages' onClick={() => navigate('/')} />
          <NavItem icon={<IoHeartOutline size={26} />} label='Notifications' onClick={soon('Notifications')} />
          <NavItem icon={<IoAddCircleOutline size={26} />} label='Create' onClick={composer.openPicker} />
          <NavItem icon={<Avatar width={26} height={26} name={user.name} imageUrl={user.profile_pic} />} label='Profile' onClick={soon('Your Pixify profile')} />
        </div>
        <div className='flex flex-col items-center gap-2 xl:items-start'>
          <p className='hidden px-3 text-xs font-semibold uppercase tracking-wide text-px-muted xl:block'>Your apps</p>
          <AppSwitcher variant='rail' className='xl:flex-row xl:px-2' />
        </div>
      </nav>

      {/* phone: top bar */}
      <header className='flex h-[52px] shrink-0 items-center justify-between border-b border-px-border px-4 md:hidden'>
        <PixifyWordmark />
        <div className='flex items-center gap-4'>
          <button onClick={composer.openPicker} title='Create story'><IoAddCircleOutline size={26} /></button>
          <button onClick={soon('Notifications')} title='Notifications'><IoHeartOutline size={26} /></button>
          <button onClick={() => navigate('/')} title='Messages'><IoPaperPlaneOutline size={24} /></button>
        </div>
      </header>

      <main className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex max-w-[935px] justify-center gap-16 px-0 md:pt-6 lg:px-4'>
          {/* feed column */}
          <div className='w-full max-w-[630px]'>
            {/* stories bar */}
            <section aria-label='Stories' className='flex gap-4 overflow-x-auto px-4 py-3 scrollbar-none md:px-2'>
              <button onClick={openMine} className='flex w-[66px] shrink-0 flex-col items-center gap-1.5' title={mine.length ? 'View your story' : 'Add to your story'}>
                <span className='relative'>
                  {mine.length
                    ? <Ring seen><StoryPreview status={mine[mine.length - 1]} className='h-full w-full rounded-full' /></Ring>
                    : <span className='flex h-[66px] w-[66px] items-center justify-center'><Avatar width={58} height={58} name={user.name} imageUrl={user.profile_pic} /></span>}
                  <span onClick={(e) => { e.stopPropagation(); composer.openPicker() }} role='button' aria-label='Add to your story'
                    className='absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-px-bg bg-px-blue text-white'>
                    <IoAdd size={15} />
                  </span>
                </span>
                <span className='w-full truncate text-center text-xs text-px-muted'>Your story</span>
              </button>

              {!data && [0, 1, 2, 3, 4].map((i) => (
                <span key={i} className='flex w-[66px] shrink-0 flex-col items-center gap-1.5'>
                  <span className='h-[66px] w-[66px] animate-pulse rounded-full bg-px-raised' />
                  <span className='h-2.5 w-12 animate-pulse rounded bg-px-raised' />
                </span>
              ))}

              {ordered.map((g, i) => (
                <button key={g.user._id} onClick={() => viewer.open(ordered, i)} className={`flex w-[66px] shrink-0 flex-col items-center gap-1.5 ${g.muted ? 'opacity-50' : ''}`} title={label(g.user)}>
                  <Ring seen={g.allViewed}><Avatar width={56} height={56} name={g.user.name} imageUrl={g.user.profile_pic} /></Ring>
                  <span className={`w-full truncate text-center text-xs ${g.allViewed ? 'text-px-muted' : ''}`}>{label(g.user)}</span>
                </button>
              ))}
            </section>

            {/* feed: posts arrive in the next update */}
            <section className='mx-auto mt-4 flex max-w-[470px] flex-col items-center border-t border-px-border px-6 pb-24 pt-12 text-center md:border-t-0'>
              <span className='flex h-24 w-24 items-center justify-center rounded-full border-2 border-px-text'>
                <IoCameraOutline size={48} />
              </span>
              <h2 className='mt-5 text-[28px] font-extrabold leading-tight'>Welcome to Pixify</h2>
              <p className='mt-2 text-sm text-px-muted'>
                Photo posts, likes, comments and follows are coming in the next update.
                For now, share a story, and it can go to Chats and Connectify too.
              </p>
              <button onClick={composer.openPicker} className='mt-5 rounded-lg bg-px-blue px-5 py-2 text-sm font-semibold text-white hover:brightness-95'>Share a story</button>
              {data && !ordered.length && (
                <p className='mt-6 text-xs text-px-muted'>Stories from people who saved you as a contact show up above.</p>
              )}
            </section>
          </div>

          {/* right column (wide screens): me + people I know */}
          <aside className='hidden w-[320px] shrink-0 pt-6 lg:block'>
            <div className='flex items-center gap-3'>
              <Avatar width={44} height={44} name={user.name} imageUrl={user.profile_pic} />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-semibold'>{user.username || 'Choose a username'}</p>
                <p className='truncate text-sm text-px-muted'>{user.name}</p>
              </div>
              <button onClick={() => navigate('/connectify')} className='text-xs font-semibold text-px-blue hover:text-px-text'>Switch app</button>
            </div>

            <div className='mt-6 flex items-center justify-between'>
              <p className='text-sm font-semibold text-px-muted'>People you know</p>
            </div>
            <div className='mt-2 flex flex-col'>
              {contacts === null && <span className='my-4 h-5 w-5 animate-spin rounded-full border-2 border-px-border border-t-px-muted' />}
              {contacts?.length === 0 && <p className='py-2 text-xs text-px-muted'>Save contacts in Chats to see them here.</p>}
              {contacts?.slice(0, 6).map((p) => (
                <div key={p._id} className='flex items-center gap-3 py-2'>
                  <Avatar width={44} height={44} name={p.name} imageUrl={p.profile_pic} />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-semibold'>{p.username || p.name}</p>
                    <p className='truncate text-xs text-px-muted'>{p.username ? p.name : 'In your contacts'}</p>
                  </div>
                  <button onClick={() => navigate('/' + p._id)} className='text-xs font-semibold text-px-blue hover:text-px-text'>Message</button>
                </div>
              ))}
            </div>
            <p className='mt-8 text-[11px] uppercase text-px-muted/70'>© {new Date().getFullYear()} Pixify · part of Chatify</p>
          </aside>
        </div>
      </main>

      <AppSwitcher variant='bar' className='md:hidden' />

      {composer.element}
      {viewer.element}
      {needsUsername && <UsernamePrompt />}
    </div>
  )
}

export default Pixify
