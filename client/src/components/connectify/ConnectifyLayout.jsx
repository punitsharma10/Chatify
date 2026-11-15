import React, { createContext, useContext, useState } from 'react'
import { useSelector } from 'react-redux'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { IoSearchOutline, IoHome, IoHomeOutline, IoPeople, IoPeopleOutline, IoNotifications, IoNotificationsOutline, IoChatbubbleEllipses, IoMenu, IoBookmark, IoTimeOutline, IoNewspaperOutline } from 'react-icons/io5'
import Avatar from '../Avatar'
import AppSwitcher from '../apps/AppSwitcher'
import UsernamePrompt from '../apps/UsernamePrompt'
import { ConnectifyMark, ConnectifyWordmark, ChatsMark, PixifyMark } from '../apps/AppLogos'
import { useContactList } from '../../helpers/contacts'
import { useSocialUnread } from '../../helpers/social'
import { notify } from '../../helpers/toast'
import { useSendToChat } from '../social/common'
import Composer from './Composer'

const CxCtx = createContext(null)
export const useConnectify = () => useContext(CxCtx)

export const Card = ({ className = '', children, ...rest }) => <div className={`rounded-lg bg-cx-card shadow-[0_1px_2px_rgba(0,0,0,.2)] ${className}`} {...rest}>{children}</div>

const Badge = ({ n }) => (n > 0 ? <span className='absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#e41e3f] px-1 text-[11px] font-bold text-white'>{n > 99 ? '99+' : n}</span> : null)

const TopTab = ({ icon, activeIcon, label, active, onClick, badge }) => (
  <button onClick={onClick} title={label} aria-label={label} aria-current={active ? 'page' : undefined}
    className={`relative flex h-full flex-1 items-center justify-center md:w-[112px] md:flex-none ${active ? 'text-cx-blue' : 'text-cx-muted'}`}>
    <span className={`relative flex h-[calc(100%-8px)] w-full items-center justify-center rounded-lg ${active ? '' : 'hover:bg-cx-hover'}`}>
      {active ? activeIcon : icon}
      {badge > 0 && <span className='absolute right-[calc(50%-22px)] top-1'><Badge n={badge} /></span>}
    </span>
    {active && <span className='absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-cx-blue' />}
  </button>
)

export const SideLink = ({ icon, label, onClick, active }) => (
  <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[15px] font-medium ${active ? 'bg-cx-hover' : 'hover:bg-cx-hover'}`}>
    <span className='flex h-9 w-9 shrink-0 items-center justify-center'>{icon}</span>
    <span className='truncate'>{label}</span>
  </button>
)

const ConnectifyLayout = () => {
  const user = useSelector((s) => s.user)
  const onlineUser = useSelector((s) => s.user.onlineUser)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const unread = useSocialUnread()
  const contacts = useContactList()
  const send = useSendToChat()
  const [composer, setComposer] = useState(null) // null | { sharedPost?, withPhotos? }
  const [version, setVersion] = useState(0)

  const at = (p) => (p === '/connectify' ? pathname === '/connectify' || pathname === '/connectify/' : pathname.startsWith(p))
  const meLink = `/connectify/u/${user.username || user._id}`
  const ctx = {
    openComposer : (opts = {}) => setComposer(opts),
    sendToChat : send.open,
    version,
    bump : () => setVersion((v) => v + 1),
  }
  const soon = (what) => () => notify(`${what} is coming soon to Connectify`)

  return (
    <CxCtx.Provider value={ctx}>
      <div className='flex h-dvh flex-col bg-cx-bg text-cx-text'>
        {/* top bar */}
        <header className='relative z-10 flex h-14 shrink-0 items-center justify-between bg-cx-card px-3 shadow-[0_1px_2px_rgba(0,0,0,.15)] sm:px-4'>
          <div className='flex min-w-0 items-center gap-2'>
            <button onClick={() => navigate('/connectify')} title='Connectify home' className='shrink-0'>
              <span className='sm:hidden'><ConnectifyWordmark className='text-[26px]' /></span>
              <span className='hidden sm:inline'><ConnectifyMark size={40} /></span>
            </button>
            <button onClick={() => navigate('/connectify/search')} className='hidden h-10 items-center gap-2 rounded-full bg-cx-input px-3 text-[15px] text-cx-muted sm:flex xl:w-[240px]'>
              <IoSearchOutline size={18} /><span className='hidden xl:inline'>Search Connectify</span>
            </button>
          </div>

          <nav aria-label='Connectify' className='absolute left-1/2 hidden h-full -translate-x-1/2 md:flex'>
            <TopTab active={at('/connectify')} icon={<IoHomeOutline size={26} />} activeIcon={<IoHome size={26} />} label='Home' onClick={() => navigate('/connectify')} />
            <TopTab active={at('/connectify/friends')} icon={<IoPeopleOutline size={27} />} activeIcon={<IoPeople size={27} />} label='Friends' badge={unread.friendRequests} onClick={() => navigate('/connectify/friends')} />
            <TopTab active={at('/connectify/saved')} icon={<IoNewspaperOutline size={25} />} activeIcon={<IoNewspaperOutline size={25} />} label='Your posts' onClick={() => navigate(meLink)} />
          </nav>

          <div className='flex items-center gap-2'>
            <AppSwitcher variant='row' className='hidden lg:flex' />
            <button onClick={() => navigate('/connectify/search')} title='Search' className='flex h-10 w-10 items-center justify-center rounded-full bg-cx-input hover:brightness-95 sm:hidden'><IoSearchOutline size={20} /></button>
            <button onClick={() => navigate('/')} title='Messages (Chats)' className='flex h-10 w-10 items-center justify-center rounded-full bg-cx-input hover:brightness-95'><IoChatbubbleEllipses size={20} /></button>
            <button onClick={() => navigate('/connectify/notifications')} title='Notifications' className={`relative hidden h-10 w-10 items-center justify-center rounded-full hover:brightness-95 md:flex ${at('/connectify/notifications') ? 'bg-cx-blue/15 text-cx-blue' : 'bg-cx-input'}`}>
              <IoNotifications size={20} /><Badge n={unread.connectify} />
            </button>
            <button onClick={() => navigate(meLink)} title={user.name} className='hidden rounded-full md:block'><Avatar width={40} height={40} name={user.name} imageUrl={user.profile_pic} /></button>
          </div>
        </header>

        {/* phone: tab row like the mobile app */}
        <nav aria-label='Connectify tabs' className='flex h-12 shrink-0 items-stretch border-b border-cx-border bg-cx-card md:hidden'>
          <TopTab active={at('/connectify')} icon={<IoHomeOutline size={24} />} activeIcon={<IoHome size={24} />} label='Home' onClick={() => navigate('/connectify')} />
          <TopTab active={at('/connectify/friends')} icon={<IoPeopleOutline size={25} />} activeIcon={<IoPeople size={25} />} label='Friends' badge={unread.friendRequests} onClick={() => navigate('/connectify/friends')} />
          <TopTab active={at('/connectify/notifications')} icon={<IoNotificationsOutline size={24} />} activeIcon={<IoNotifications size={24} />} label='Notifications' badge={unread.connectify} onClick={() => navigate('/connectify/notifications')} />
          <TopTab active={at(meLink)} icon={<Avatar width={26} height={26} name={user.name} imageUrl={user.profile_pic} />} activeIcon={<span className='rounded-full ring-2 ring-cx-blue'><Avatar width={26} height={26} name={user.name} imageUrl={user.profile_pic} /></span>} label='Profile' onClick={() => navigate(meLink)} />
          <TopTab active={at('/connectify/menu')} icon={<IoMenu size={26} />} activeIcon={<IoMenu size={26} />} label='Menu' onClick={() => navigate('/connectify/menu')} />
        </nav>

        <div className='flex min-h-0 flex-1'>
          {/* left shortcuts (wide screens) */}
          <aside className='hidden w-[300px] shrink-0 overflow-y-auto px-2 pt-4 xl:block'>
            <SideLink icon={<Avatar width={36} height={36} name={user.name} imageUrl={user.profile_pic} />} label={user.name} onClick={() => navigate(meLink)} />
            <SideLink icon={<IoPeople size={28} className='text-cx-blue' />} label='Friends' onClick={() => navigate('/connectify/friends')} active={at('/connectify/friends')} />
            <SideLink icon={<IoTimeOutline size={28} className='text-cx-blue' />} label='Memories' onClick={soon('Memories')} />
            <SideLink icon={<IoBookmark size={26} className='text-[#c03fd6]' />} label='Saved' onClick={soon('Saved')} />
            <div className='mx-2 my-3 border-t border-cx-border' />
            <p className='px-2 pb-1 text-[17px] font-semibold text-cx-muted'>Your apps</p>
            <SideLink icon={<ChatsMark size={30} />} label='Chats' onClick={() => navigate('/')} />
            <SideLink icon={<PixifyMark size={30} />} label='Pixify' onClick={() => navigate('/pixify')} />
            <p className='px-2 pt-4 text-xs text-cx-muted'>Connectify · part of Chatify © {new Date().getFullYear()}</p>
          </aside>

          <main className='min-h-0 flex-1 overflow-y-auto' id='connectify-main'>
            <Outlet />
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

        {composer && <Composer {...composer} onClose={() => setComposer(null)} onPosted={() => { setComposer(null); setVersion((v) => v + 1) }} />}
        {send.element}
        {user._id && !user.username && <UsernamePrompt app='connectify' />}
      </div>
    </CxCtx.Provider>
  )
}

export default ConnectifyLayout
