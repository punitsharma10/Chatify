import React, { createContext, useContext, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { GoHome, GoHomeFill } from 'react-icons/go'
import { IoSearchOutline, IoSearch, IoCompassOutline, IoCompass, IoHeartOutline, IoHeart, IoAddCircleOutline, IoPaperPlaneOutline, IoPaperPlane, IoFilmOutline, IoFilm, IoChevronDown, IoCheckmark, IoImagesOutline, IoAperture } from 'react-icons/io5'
import Avatar from '../Avatar'
import AppSwitcher from '../apps/AppSwitcher'
import UsernamePrompt from '../apps/UsernamePrompt'
import { PixifyMark, PixifyWordmark, AppMark } from '../apps/AppLogos'
import { useStoryComposer } from '../apps/stories'
import { useSocialUnread } from '../../helpers/social'
import { APPS } from '../../helpers/apps'
import { useSendToChat } from '../social/common'
import CreatePost from './CreatePost'
import { ShareSheet } from './direct/DirectModals'

// what every Pixify screen can reach: create a post / story, send a post to Chats, refresh after changes
const PixifyCtx = createContext(null)
export const usePixify = () => useContext(PixifyCtx)

const NavItem = ({ icon, activeIcon, label, active, onClick, badge, narrow }) => (
  <button onClick={onClick} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
    className={`group flex w-full items-center gap-4 rounded-lg p-3 text-[15px] transition-colors hover:bg-px-hover ${active ? 'font-bold' : ''}`}>
    <span className='relative transition-transform group-hover:scale-105'>
      {active && activeIcon ? activeIcon : icon}
      {badge > 0 && <span className='absolute -right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff3040] px-1 text-[11px] font-semibold text-white'>{badge > 99 ? '99+' : badge}</span>}
    </span>
    <span className={narrow ? 'hidden' : 'hidden xl:inline'}>{label}</span>
  </button>
)

// phone: "Pixify ▾" opens the app switcher
const AppMenu = ({ onClose }) => {
  const navigate = useNavigate()
  return (
    <div className='fixed inset-0 z-50' onClick={onClose}>
      <div className='absolute left-3 top-12 w-56 animate-pop overflow-hidden rounded-xl border border-px-border bg-px-bg py-1 text-px-text shadow-xl' onClick={(e) => e.stopPropagation()}>
        {APPS.map((a) => (
          <button key={a.id} onClick={() => { onClose(); navigate(a.path) }} className='flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] hover:bg-px-hover'>
            <AppMark app={a.id} size={24} /><span className='flex-1'>{a.name}</span>{a.id === 'pixify' && <IoCheckmark size={18} />}
          </button>
        ))}
      </div>
    </div>
  )
}

const CreateMenu = ({ onPost, onStory, onClose }) => (
  <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center' onClick={onClose}>
    <div className='w-full max-w-[320px] animate-pop overflow-hidden rounded-t-2xl bg-px-bg text-px-text sm:rounded-xl' onClick={(e) => e.stopPropagation()}>
      <p className='border-b border-px-border py-3 text-center font-semibold'>Create</p>
      <button onClick={() => { onClose(); onPost() }} className='flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-px-hover'><IoImagesOutline size={24} /> Post</button>
      <button onClick={() => { onClose(); onStory() }} className='flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-px-hover'><IoAperture size={24} /> Story</button>
    </div>
  </div>
)

const PixifyLayout = () => {
  const user = useSelector((s) => s.user)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const unread = useSocialUnread()
  const [creating, setCreating] = useState(false)
  const [createMenu, setCreateMenu] = useState(false)
  const [appMenu, setAppMenu] = useState(false)
  const [version, setVersion] = useState(0) // bumped after posting so feeds reload
  const [storiesVersion, setStoriesVersion] = useState(0)
  const story = useStoryComposer('pixify', { onPosted : () => setStoriesVersion((v) => v + 1), tone : 'px' })
  const send = useSendToChat()
  const [sharing, setSharing] = useState(null) // { post } | { profile }

  useEffect(() => { document.documentElement.classList.add('pixify-app'); return () => document.documentElement.classList.remove('pixify-app') }, [])

  const at = (p) => (p === '/pixify' ? pathname === '/pixify' || pathname === '/pixify/' : pathname.startsWith(p))
  const me = `/pixify/u/${user.username || user._id}`
  // Messages: the nav shrinks to icons and, on phones, the conversation gets the whole screen
  const direct = pathname.startsWith('/pixify/direct')
  const dmBadge = unread.dm
  const ctx = {
    openCreate : () => setCreateMenu(true),
    openPostComposer : () => setCreating(true),
    openStory : story.openPicker,
    // paper plane: Instagram-style share sheet (Pixify Direct, copy link, or Chats)
    sendToChat : (post) => setSharing({ post }),
    shareProfile : (profile) => setSharing({ profile }),
    version, storiesVersion,
    bump : () => setVersion((v) => v + 1),
  }

  return (
    <PixifyCtx.Provider value={ctx}>
      <div className='flex h-dvh flex-col bg-px-bg text-px-text md:flex-row'>
        {/* desktop / tablet: left navigation (icons only until xl) */}
        <nav aria-label='Pixify' className={`hidden w-[72px] shrink-0 flex-col justify-between border-r border-px-border px-3 pb-5 pt-6 md:flex ${direct ? '' : 'xl:w-[244px]'}`}>
          <div className='flex flex-col gap-1'>
            <button onClick={() => navigate('/pixify')} className='mb-6 flex h-10 items-center px-3' title='Pixify'>
              <span className={direct ? '' : 'xl:hidden'}><PixifyMark size={26} /></span>
              <span className={direct ? 'hidden' : 'hidden xl:inline'}><PixifyWordmark /></span>
            </button>
            <NavItem active={at('/pixify')} icon={<GoHome size={26} />} activeIcon={<GoHomeFill size={26} />} label='Home' narrow={direct} onClick={() => navigate('/pixify')} />
            <NavItem active={at('/pixify/search')} icon={<IoSearchOutline size={26} />} activeIcon={<IoSearch size={26} />} label='Search' narrow={direct} onClick={() => navigate('/pixify/search')} />
            <NavItem active={at('/pixify/explore')} icon={<IoCompassOutline size={26} />} activeIcon={<IoCompass size={26} />} label='Explore' narrow={direct} onClick={() => navigate('/pixify/explore')} />
            <NavItem active={at('/pixify/reels')} icon={<IoFilmOutline size={26} />} activeIcon={<IoFilm size={26} />} label='Reels' narrow={direct} onClick={() => navigate('/pixify/reels')} />
            <NavItem active={direct} narrow={direct} icon={<IoPaperPlaneOutline size={25} />} activeIcon={<IoPaperPlane size={25} />} label='Messages' badge={dmBadge} onClick={() => navigate('/pixify/direct')} />
            <NavItem active={at('/pixify/notifications')} icon={<IoHeartOutline size={26} />} activeIcon={<IoHeart size={26} />} label='Notifications' narrow={direct} badge={unread.pixify} onClick={() => navigate('/pixify/notifications')} />
            <NavItem icon={<IoAddCircleOutline size={26} />} label='Create' narrow={direct} onClick={ctx.openCreate} />
            <NavItem active={at(me)} icon={<span className={`inline-flex rounded-full ${at(me) ? 'ring-2 ring-px-text ring-offset-1 ring-offset-px-bg' : ''}`}><Avatar width={26} height={26} name={user.name} imageUrl={user.profile_pic} /></span>} label='Profile' narrow={direct} onClick={() => navigate(me)} />
          </div>
          <div className='flex flex-col items-center gap-2 xl:items-start'>
            <p className={`hidden px-3 text-xs font-semibold uppercase tracking-wide text-px-muted ${direct ? '' : 'xl:block'}`}>Your apps</p>
            <AppSwitcher variant='rail' className={direct ? '' : 'xl:flex-row xl:px-2'} />
          </div>
        </nav>

        {/* phone: top bar */}
        <header className={`flex h-[52px] shrink-0 items-center justify-between border-b border-px-border px-4 md:hidden ${direct ? 'hidden' : ''}`}>
          <button onClick={() => setAppMenu(true)} className='flex items-center gap-1' aria-label='Switch app'>
            <PixifyWordmark /><IoChevronDown size={16} className='mt-1' />
          </button>
          <div className='flex items-center gap-5'>
            <button onClick={() => navigate('/pixify/notifications')} title='Notifications' className='relative'>
              <IoHeartOutline size={26} />
              {unread.pixify > 0 && <span className='absolute -right-0.5 top-0 h-2.5 w-2.5 rounded-full bg-[#ff3040] ring-2 ring-px-bg' />}
            </button>
            <button onClick={() => navigate('/pixify/direct')} title='Messages' aria-label='Messages' className='relative'>
              <IoPaperPlaneOutline size={24} />
              {dmBadge > 0 && <span className='absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff3040] px-1 text-[11px] font-semibold text-white'>{dmBadge > 9 ? '9+' : dmBadge}</span>}
            </button>
          </div>
        </header>

        <main className={`min-h-0 flex-1 ${direct ? 'overflow-hidden' : 'overflow-y-auto'}`} id='pixify-main'>
          <Outlet />
        </main>

        {/* phone: Pixify tabs */}
        <nav aria-label='Pixify tabs' className={`flex h-12 shrink-0 items-center justify-around border-t border-px-border bg-px-bg pb-[env(safe-area-inset-bottom)] md:hidden ${direct ? 'hidden' : ''}`}>
          <button onClick={() => navigate('/pixify')} aria-label='Home'>{at('/pixify') ? <GoHomeFill size={26} /> : <GoHome size={26} />}</button>
          <button onClick={() => navigate('/pixify/search')} aria-label='Search'>{at('/pixify/search') || at('/pixify/explore') ? <IoSearch size={26} /> : <IoSearchOutline size={26} />}</button>
          <button onClick={ctx.openCreate} aria-label='Create'><IoAddCircleOutline size={28} /></button>
          <button onClick={() => navigate('/pixify/reels')} aria-label='Reels'>{at('/pixify/reels') ? <IoFilm size={26} /> : <IoFilmOutline size={26} />}</button>
          <button onClick={() => navigate(me)} aria-label='Profile' className={`rounded-full ${at(me) ? 'ring-2 ring-px-text ring-offset-1 ring-offset-px-bg' : ''}`}><Avatar width={26} height={26} name={user.name} imageUrl={user.profile_pic} /></button>
        </nav>

        {appMenu && <AppMenu onClose={() => setAppMenu(false)} />}
        {createMenu && <CreateMenu onClose={() => setCreateMenu(false)} onPost={() => setCreating(true)} onStory={story.openPicker} />}
        {creating && <CreatePost onClose={() => setCreating(false)} onPosted={(post) => { setCreating(false); setVersion((v) => v + 1); navigate(`/pixify/p/${post._id}`) }} />}
        {story.element}
        {send.element}
        {sharing && <ShareSheet {...sharing} onClose={() => setSharing(null)} onChats={send.open} />}
        {user._id && !user.username && <UsernamePrompt />}
      </div>
    </PixifyCtx.Provider>
  )
}

export default PixifyLayout
