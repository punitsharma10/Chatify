import React from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { APPS, appFromPath } from '../../helpers/apps'
import { AppMark } from './AppLogos'
import { useSocialUnread } from '../../helpers/social'

// unread chats (same rule as the tab title in pages/Home.jsx), shown on the Chats icon from the other apps
const useUnreadChats = () => useSelector((s) => s.chat.conversations.filter((c) =>
  !(c.muted && (!c.mutedUntil || new Date(c.mutedUntil) > new Date())) && !c.request && !c.locked && (c.unseenMsg > 0 || c.markedUnread)).length)

const Badge = ({ n }) => (n > 0
  ? <span className='absolute -right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff3040] px-1 text-[11px] font-semibold text-white ring-2 ring-white dark:ring-black'>{n > 99 ? '99+' : n}</span>
  : null)

// Switch between Chats, Pixify and Connectify. Same login, so this only changes the screen.
//   variant 'rail'   vertical icons (desktop side rails)
//   variant 'row'    horizontal icons (Connectify's top bar)
//   variant 'bar'    phone bottom bar with labels
//   only             limit to some apps, e.g. ['pixify', 'connectify'] in the Chats rail
const AppSwitcher = ({ variant = 'rail', className = '', only }) => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const current = appFromPath(pathname)
  const unread = useUnreadChats()
  const social = useSocialUnread()
  // badge per app: unread chats, or new Pixify / Connectify notifications (+ friend requests)
  const badgeOf = (id) => (id === 'chats' ? unread : id === 'pixify' ? social.pixify + social.dm : social.connectify + social.friendRequests)
  const apps = only ? APPS.filter((a) => only.includes(a.id)) : APPS

  if (variant === 'bar') {
    return (
      <nav aria-label='Apps' className={`flex h-14 shrink-0 items-stretch border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-black ${className}`}>
        {apps.map((a) => (
          <button key={a.id} onClick={() => navigate(a.path)} aria-current={current === a.id ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${current === a.id ? 'font-semibold text-black dark:text-white' : 'text-neutral-500'}`}>
            <span className={`relative transition-transform ${current === a.id ? 'scale-110' : 'opacity-70 grayscale-[35%]'}`}>
              <AppMark app={a.id} size={24} />
              {current !== a.id && <Badge n={badgeOf(a.id)} />}
            </span>
            {a.name}
          </button>
        ))}
      </nav>
    )
  }

  return (
    <div role='group' aria-label='Apps' className={`flex ${variant === 'row' ? 'flex-row gap-1.5' : 'flex-col gap-2'} items-center ${className}`}>
      {apps.map((a) => (
        <button key={a.id} onClick={() => navigate(a.path)} title={`${a.name}: ${a.hint}`} aria-label={a.name} aria-current={current === a.id ? 'page' : undefined}
          className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition ${current === a.id ? 'bg-black/[.07] dark:bg-white/10' : 'opacity-80 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10'}`}>
          <AppMark app={a.id} size={26} />
          {current !== a.id && <Badge n={badgeOf(a.id)} />}
        </button>
      ))}
    </div>
  )
}

export default AppSwitcher
