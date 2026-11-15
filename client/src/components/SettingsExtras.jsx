import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import axios from 'axios'
import moment from 'moment'
import { IoDesktopOutline, IoPhonePortraitOutline } from 'react-icons/io5'
import Dialog from './Dialog'
import Avatar from './Avatar'
import { socketCall } from '../helpers/socketCall'
import { notify, notifyError } from '../helpers/toast'
import { usePeopleNames, useContactList } from '../helpers/contacts'

const API = process.env.REACT_APP_BACKEND_URL

/* ---------- status privacy ---------- */

// "My contacts" / "My contacts except…" / "Only share with…", with a contact picker for the last two
export const StatusPrivacy = ({ privacy, saving, onSave }) => {
  const contacts = useContactList()
  const names = usePeopleNames()
  const [picker, setPicker] = useState(null) // 'except' | 'only'
  const [picked, setPicked] = useState([])

  const mode = privacy.status || 'contacts'
  const listKey = mode === 'except' ? 'statusExcept' : 'statusOnly'
  const count = (privacy[listKey] || []).length

  const people = useMemo(() => [...(contacts || [])].sort((a, b) => names.name(a).localeCompare(names.name(b))), [contacts, names])

  const choose = (value) => {
    if (value === 'contacts') return onSave({ status : 'contacts' })
    setPicked((privacy[value === 'except' ? 'statusExcept' : 'statusOnly'] || []).map(String))
    setPicker(value)
  }

  const save = () => {
    onSave({ status : picker, [picker === 'except' ? 'statusExcept' : 'statusOnly'] : picked })
    setPicker(null)
  }

  return (
    <>
      <div className='flex items-center justify-between gap-4 px-6 py-2.5'>
        <div className='min-w-0'>
          <p className='text-[15px] text-wa-text'>Status</p>
          <p className='text-xs text-wa-muted'>
            {mode === 'contacts' ? 'My contacts' : mode === 'except' ? `My contacts except ${count}` : `Only shared with ${count}`}
            {mode !== 'contacts' && <button onClick={() => choose(mode)} className='ml-2 font-medium text-wa-green hover:underline'>Change</button>}
          </p>
        </div>
        <select value={mode} disabled={saving} onChange={(e) => choose(e.target.value)} aria-label='Who can see my status' className='rounded-md border border-wa-border bg-wa-surface px-2 py-1 text-sm text-wa-text outline-none focus:border-wa-green'>
          <option value='contacts'>My contacts</option>
          <option value='except'>My contacts except…</option>
          <option value='only'>Only share with…</option>
        </select>
      </div>
      {picker && (
        <Dialog
          title={picker === 'except' ? 'Hide status from…' : 'Share status with…'}
          onClose={() => setPicker(null)}
          actions={[{ label : 'Cancel', onClick : () => setPicker(null) }, { label : 'Done', primary : true, disabled : picker === 'only' && !picked.length, onClick : save }]}
        >
          <p className='mb-2 text-xs'>Changes apply to status updates you post from now on.</p>
          <div className='max-h-[50dvh] overflow-y-auto scrollbar'>
            {people.length === 0 && <p className='py-6 text-center text-sm'>You haven't saved any contacts yet.</p>}
            {people.map((p) => {
              const on = picked.includes(String(p._id))
              return (
                <label key={p._id} className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-wa-hover'>
                  <input type='checkbox' checked={on} onChange={() => setPicked((x) => (on ? x.filter((i) => i !== String(p._id)) : [...x, String(p._id)]))} className='h-4 w-4 accent-[#00a884]' />
                  <Avatar width={36} height={36} name={names.name(p)} imageUrl={p.profile_pic} />
                  <span className='min-w-0 flex-1 truncate text-[15px] text-wa-text'>{names.name(p)}</span>
                </label>
              )
            })}
          </div>
        </Dialog>
      )}
    </>
  )
}

/* ---------- chat lock ---------- */

export const ChatLockSettings = () => {
  const socket = useSelector((s) => s.user.socketConnection)
  const hasCode = useSelector((s) => s.user.hasChatLock)
  const [dialog, setDialog] = useState(null) // 'set' | 'change' | 'remove'
  const [current, setCurrent] = useState('')
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const close = () => { setDialog(null); setCurrent(''); setCode(''); setConfirm(''); setError('') }

  const submit = async () => {
    if (dialog === 'remove') {
      const res = await socketCall(socket, 'chat-lock-remove', { code : current })
      if (!res.ok) return setError(res.error)
      notify('Secret code removed. Locked chats were unlocked.')
      return close()
    }
    if (code !== confirm) return setError("Codes don't match")
    const res = await socketCall(socket, 'chat-lock-set', { code, current })
    if (!res.ok) return setError(res.error)
    notify(dialog === 'set' ? 'Secret code set. Lock chats from the chat menu.' : 'Secret code changed')
    close()
  }

  const ready = dialog === 'remove' ? current.length >= 4 : code.length >= 4 && confirm.length >= 4 && (dialog === 'set' || current.length >= 4)

  return (
    <>
      <p className='px-6 pb-2 text-xs text-wa-muted'>Locked chats are hidden from your chat list and search, and open with a secret code. Their notifications don't show who wrote or what.</p>
      <div className='flex flex-wrap gap-2 px-6 pb-4'>
        {!hasCode && <button onClick={() => setDialog('set')} className='wa-btn px-4 py-2'>Set secret code</button>}
        {hasCode && <button onClick={() => setDialog('change')} className='rounded-full border border-wa-line px-4 py-2 text-sm font-medium text-wa-teal hover:bg-wa-hover'>Change secret code</button>}
        {hasCode && <button onClick={() => setDialog('remove')} className='rounded-full border border-wa-line px-4 py-2 text-sm font-medium text-red-600 hover:bg-wa-hover'>Remove secret code</button>}
      </div>
      {dialog && (
        <Dialog
          title={dialog === 'set' ? 'Set secret code' : dialog === 'change' ? 'Change secret code' : 'Remove secret code?'}
          onClose={close}
          actions={[{ label : 'Cancel', onClick : close }, { label : dialog === 'remove' ? 'Remove' : 'Save', primary : dialog !== 'remove', danger : dialog === 'remove', disabled : !ready, onClick : submit }]}
        >
          {dialog === 'remove' && <p className='mb-3'>All locked chats will move back to your chat list.</p>}
          {dialog !== 'set' && <input type='password' autoFocus value={current} onChange={(e) => { setCurrent(e.target.value); setError('') }} placeholder='Current secret code' aria-label='Current secret code' className='wa-input mb-3' />}
          {dialog !== 'remove' && (
            <>
              <input type='password' autoFocus={dialog === 'set'} value={code} onChange={(e) => { setCode(e.target.value); setError('') }} placeholder='New secret code (4–16 characters)' aria-label='New secret code' maxLength={16} className='wa-input mb-3' />
              <input type='password' value={confirm} onChange={(e) => { setConfirm(e.target.value); setError('') }} onKeyDown={(e) => e.key === 'Enter' && ready && submit()} placeholder='Confirm secret code' aria-label='Confirm secret code' maxLength={16} className='wa-input' />
            </>
          )}
          {error && <p className='mt-2 text-sm text-red-600'>{error}</p>}
        </Dialog>
      )}
    </>
  )
}

/* ---------- linked devices ---------- */

export const LinkedDevices = () => {
  const [sessions, setSessions] = useState(null)
  const [confirm, setConfirm] = useState(null) // session or 'others'

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/sessions`, { withCredentials : true })
      setSessions(res.data.data || [])
    } catch {
      setSessions([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const logout = async (target) => {
    setConfirm(null)
    try {
      const res = await axios.post(`${API}/api/sessions/logout`, target === 'others' ? { others : true } : { id : target._id }, { withCredentials : true })
      notify(res.data.loggedOut === 1 ? 'Device logged out' : `${res.data.loggedOut} devices logged out`)
      load()
    } catch (error) {
      notifyError(error?.response?.data?.message || "Couldn't log out the device")
    }
  }

  const others = (sessions || []).filter((s) => !s.current)

  return (
    <>
      <p className='px-6 pb-2 text-xs text-wa-muted'>Browsers where you're logged in to Chatify. Log out any device you don't recognise.</p>
      {!sessions && <div className='mx-auto my-3 h-5 w-5 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' />}
      {(sessions || []).map((s) => (
        <div key={s._id} className='flex items-center gap-3 px-6 py-2.5'>
          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wa-panel text-wa-icon'>
            {/Android|iOS/.test(s.device) ? <IoPhonePortraitOutline size={19} /> : <IoDesktopOutline size={19} />}
          </span>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-[15px] text-wa-text'>{s.device}</p>
            <p className='text-xs text-wa-muted'>{s.current ? <span className='font-medium text-wa-green'>This device</span> : `Last active ${moment(s.lastActiveAt).fromNow()}`}</p>
          </div>
          {!s.current && <button onClick={() => setConfirm(s)} className='rounded-full border border-wa-border px-3 py-1 text-xs font-medium text-red-600 hover:bg-wa-hover'>Log out</button>}
        </div>
      ))}
      {others.length > 1 && (
        <div className='px-6 pb-3 pt-1'>
          <button onClick={() => setConfirm('others')} className='text-sm font-medium text-red-600 hover:underline'>Log out all other devices</button>
        </div>
      )}
      {confirm && (
        <Dialog
          title={confirm === 'others' ? 'Log out all other devices?' : `Log out ${confirm.device}?`}
          onClose={() => setConfirm(null)}
          actions={[{ label : 'Cancel', onClick : () => setConfirm(null) }, { label : 'Log out', danger : true, onClick : () => logout(confirm) }]}
        >
          {confirm === 'others' ? 'Every other browser will be logged out right away.' : 'That browser will be logged out right away.'}
        </Dialog>
      )}
    </>
  )
}

/* ---------- delete my account ---------- */

export const DeleteAccount = ({ onDeleted }) => {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => { setOpen(false); setPassword(''); setError('') }
  const submit = async () => {
    setBusy(true)
    try {
      await axios.post(`${API}/api/delete-account`, { password }, { withCredentials : true })
      close()
      onDeleted()
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't delete your account. Try again.")
    }
    setBusy(false)
  }

  return (
    <>
      <p className='px-6 pb-2 text-xs text-wa-muted'>Deleting your account erases your profile, removes you from all groups, deletes your status updates and logs out every device. Messages people already received stay with them.</p>
      <div className='px-6 pb-4'>
        <button onClick={() => setOpen(true)} className='rounded-full border border-wa-line px-4 py-2 text-sm font-medium text-red-600 hover:bg-wa-hover'>Delete my account</button>
      </div>
      {open && (
        <Dialog
          title='Delete your account?'
          onClose={close}
          actions={[{ label : 'Cancel', onClick : close }, { label : busy ? 'Deleting…' : 'Delete account', danger : true, disabled : !password || busy, onClick : submit }]}
        >
          <p className='mb-3'>This can't be undone. Enter your password to confirm.</p>
          <input type='password' autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} onKeyDown={(e) => e.key === 'Enter' && password && !busy && submit()} placeholder='Password' aria-label='Password' className='wa-input' />
          {error && <p className='mt-2 text-sm text-red-600'>{friendlyError(error)}</p>}
        </Dialog>
      )}
    </>
  )
}

const friendlyError = (msg) => (msg === 'Incorrect password' ? 'Incorrect password. Please try again.' : msg)
