import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import axios from 'axios'
import { notify, notifyError } from '../helpers/toast'
import { IoLockClosedOutline, IoNotificationsOutline, IoImageOutline, IoBan } from 'react-icons/io5'
import Drawer from './Drawer'
import MadeBy from './MadeBy'
import Avatar from './Avatar'
import { Toggle } from './ContactInfo'
import { setBlocked, setUser } from '../redux/userSlice'
import { socketCall } from '../helpers/socketCall'
import { WALLPAPERS, setWallpaper, useWallpaper, notificationPermission, requestNotifications, useSoundsEnabled, setSoundsEnabled, playNotificationSound } from '../helpers/preferences'

const PRIVACY_ROWS = [
  { key : 'lastSeen', label : 'Last seen' },
  { key : 'online', label : 'Online' },
  { key : 'profilePhoto', label : 'Profile photo' },
  { key : 'about', label : 'About' },
]

const SettingsDrawer = ({ onClose }) => {
  const user = useSelector((s) => s.user)
  const socket = user.socketConnection
  const dispatch = useDispatch()
  const wallpaper = useWallpaper()
  const [blockedUsers, setBlockedUsers] = useState(null)
  const [permission, setPermission] = useState(notificationPermission())
  const sounds = useSoundsEnabled()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    socketCall(socket, 'get-blocked').then((res) => setBlockedUsers(res.ok ? res.users : []))
  }, [socket, user.blocked])

  const savePrivacy = async (patch) => {
    setSaving(true)
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/updateuser`, { privacy : patch }, { withCredentials : true })
      if (res.data.success) {
        dispatch(setUser(res.data.data))
        notify('Privacy settings updated')
      }
    } catch (error) {
      notifyError(error?.response?.data?.message || "Couldn't save settings")
    }
    setSaving(false)
  }

  const unblock = async (id) => {
    const res = await socketCall(socket, 'block-user', { userId : id, block : false })
    if (res.ok) {
      dispatch(setBlocked(res.blocked))
      notify('Contact unblocked')
    } else notifyError(res.error)
  }

  const privacy = user.privacy || {}

  return (
    <Drawer title='Settings' onClose={onClose} className='bg-wa-panel'>
      <Section icon={<IoLockClosedOutline size={18} />} title='Privacy'>
        <p className='px-6 pb-2 text-xs text-wa-muted'>Choose who can see your info. If you hide your last seen or online status you can still see other people's.</p>
        {PRIVACY_ROWS.map((row) => (
          <div key={row.key} className='flex items-center justify-between gap-4 px-6 py-2.5'>
            <span className='text-[15px] text-wa-text'>{row.label}</span>
            <select
              value={privacy[row.key] || 'everyone'}
              disabled={saving}
              onChange={(e) => savePrivacy({ [row.key] : e.target.value })}
              className='rounded-md border border-wa-border bg-white px-2 py-1 text-sm text-wa-text outline-none focus:border-wa-green'
            >
              <option value='everyone'>Everyone</option>
              <option value='nobody'>Nobody</option>
            </select>
          </div>
        ))}
        <div className='flex items-center justify-between gap-4 px-6 py-3'>
          <div>
            <p className='text-[15px] text-wa-text'>Read receipts</p>
            <p className='text-xs text-wa-muted'>If turned off, you won't send or receive read receipts (blue ticks).</p>
          </div>
          <Toggle on={privacy.readReceipts !== false} disabled={saving} onChange={(v) => savePrivacy({ readReceipts : v })} />
        </div>
      </Section>

      <Section icon={<IoBan size={18} />} title={`Blocked contacts${blockedUsers?.length ? ` (${blockedUsers.length})` : ''}`}>
        {blockedUsers && blockedUsers.length === 0 && <p className='px-6 pb-3 text-sm text-wa-muted'>No blocked contacts</p>}
        {(blockedUsers || []).map((u) => (
          <div key={u._id} className='flex items-center gap-3 px-6 py-2'>
            <Avatar width={36} height={36} name={u.name} imageUrl={u.profile_pic} />
            <span className='min-w-0 flex-1 truncate text-[15px] text-wa-text'>{u.name}</span>
            <button onClick={() => unblock(u._id)} className='rounded-full border border-wa-border px-3 py-1 text-xs font-medium text-wa-green hover:bg-wa-hover'>Unblock</button>
          </div>
        ))}
      </Section>

      <Section icon={<IoNotificationsOutline size={18} />} title='Notifications'>
        <div className='flex items-center justify-between gap-4 px-6 pb-3'>
          <p className='text-sm text-wa-muted'>
            {permission === 'granted' && 'Desktop notifications are on. Muted chats stay silent.'}
            {permission === 'default' && 'Get notified about new messages while Chatify is in the background.'}
            {permission === 'denied' && 'Notifications are blocked in your browser settings.'}
            {permission === 'unsupported' && "This browser doesn't support notifications."}
          </p>
          {permission === 'default' && (
            <button onClick={async () => setPermission(await requestNotifications())} className='wa-btn shrink-0 px-4 py-2'>Turn on</button>
          )}
        </div>
        <div className='flex items-center justify-between gap-4 px-6 pb-4'>
          <div>
            <p className='text-[15px] text-wa-text'>Sounds</p>
            <p className='text-xs text-wa-muted'>Play a sound for new messages. Saved on this device.</p>
          </div>
          <Toggle on={sounds} onChange={(v) => { setSoundsEnabled(v); if (v) playNotificationSound() }} />
        </div>
      </Section>

      <Section icon={<IoImageOutline size={18} />} title='Chat wallpaper'>
        <div className='grid grid-cols-4 gap-3 px-6 pb-4'>
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWallpaper(w.id)}
              className={`flex flex-col items-center gap-1 text-xs ${wallpaper.id === w.id ? 'font-medium text-wa-green' : 'text-wa-muted'}`}
            >
              <span className={`h-14 w-full rounded-lg border-2 ${w.className || ''} ${wallpaper.id === w.id ? 'border-wa-green' : 'border-wa-border'}`} style={w.style} />
              {w.label}
            </button>
          ))}
        </div>
        <p className='px-6 pb-3 text-xs text-wa-muted'>Saved on this device only.</p>
      </Section>

      <MadeBy className='px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4' />
    </Drawer>
  )
}

const Section = ({ icon, title, children }) => (
  <section className='mb-2.5 bg-white pt-3 shadow-sm'>
    <h3 className='flex items-center gap-2 px-6 pb-2 text-sm font-medium text-wa-teal'>{icon}{title}</h3>
    {children}
  </section>
)

export default SettingsDrawer
