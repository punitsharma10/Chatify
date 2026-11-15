import React, { useState } from 'react'
import axios from 'axios'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { setUser } from '../../redux/userSlice'
import { notify, notifyError } from '../../helpers/toast'
import Avatar from '../Avatar'
import UsernameField, { normalizeUsername } from './UsernameField'
import { PixifyMark, PixifyWordmark, ConnectifyMark, ConnectifyWordmark } from './AppLogos'

// Shown the first time someone opens Pixify without an @username. The same name is used in all three apps.
const UsernamePrompt = ({ app = 'pixify' }) => {
  const user = useSelector((s) => s.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [value, setValue] = useState(() => normalizeUsername(user.name).replace(/[^a-z0-9._]/g, '').replace(/^\.+|\.+$/g, '').slice(0, 30))
  const [state, setState] = useState('idle')
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (state !== 'ok' || saving) return
    setSaving(true)
    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/updateuser`, { username : normalizeUsername(value) }, { withCredentials : true })
      if (res.data.success) {
        dispatch(setUser(res.data.data))
        notify(`Welcome to ${app === 'pixify' ? 'Pixify' : 'Connectify'}, @${res.data.data.username}!`)
      }
    } catch (error) {
      notifyError(error?.response?.data?.message || "Couldn't save your username. Please try again.")
      setState('bad')
    }
    setSaving(false)
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4' role='dialog' aria-modal='true' aria-labelledby='px-username-title'>
      <form onSubmit={save} className='w-full max-w-[380px] animate-pop rounded-2xl border border-px-border bg-px-bg px-8 pb-6 pt-8 text-center text-px-text'>
        <div className='flex items-center justify-center gap-2'>{app === 'pixify' ? <><PixifyMark size={34} /><PixifyWordmark /></> : <><ConnectifyMark size={34} /><ConnectifyWordmark /></>}</div>
        <div className='mt-6 flex justify-center'><Avatar width={84} height={84} name={user.name} imageUrl={user.profile_pic} /></div>
        <h2 id='px-username-title' className='mt-4 text-[17px] font-semibold'>Choose your username</h2>
        <p className='mt-1 text-sm text-px-muted'>People find and mention you with it. It's the same in Chatify, Pixify and Connectify, and you can change it later in your profile.</p>
        <div className='mt-5 text-left'>
          <UsernameField tone='px' value={value} nameHint={user.name} autoFocus onChange={(v, s) => { setValue(v); setState(s) }} />
        </div>
        <button disabled={state !== 'ok' || saving} className='mt-5 h-9 w-full rounded-lg bg-px-blue text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50'>
          {saving ? 'Saving…' : 'Continue'}
        </button>
        <button type='button' onClick={() => navigate('/')} className='mt-3 text-sm font-semibold text-px-blue'>Back to Chatify</button>
      </form>
    </div>
  )
}

export default UsernamePrompt
