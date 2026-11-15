import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { IoCheckmarkCircle, IoCloseCircle } from 'react-icons/io5'

const API = process.env.REACT_APP_BACKEND_URL

// same rules as the server (server/helpers/username.js); the server has the final say
export const normalizeUsername = (v) => String(v || '').trim().replace(/^@/, '').toLowerCase()
export const localUsernameProblem = (name) => {
  if (!name) return ''
  if (name.length < 3) return 'Usernames need at least 3 characters.'
  if (name.length > 30) return 'Usernames can have at most 30 characters.'
  if (!/^[a-z0-9._]+$/.test(name)) return 'Usernames can only use letters, numbers, dots and underscores.'
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) return "Usernames can't start or end with a dot, or have two dots in a row."
  if (/^[0-9._]+$/.test(name)) return 'Usernames need at least one letter.'
  return ''
}

// "@ username" input that checks availability as you type.
// onChange(value, state) where state = 'idle' | 'checking' | 'ok' | 'bad'
// `current` is the username you already have (counts as available); `nameHint` makes better suggestions.
const UsernameField = ({ value, onChange, current = '', nameHint = '', autoFocus = false, tone = 'wa', label = 'Username' }) => {
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const seq = useRef(0)

  useEffect(() => {
    const name = normalizeUsername(value)
    const id = ++seq.current
    setSuggestions([])
    const report = (s, m = '') => { if (id !== seq.current) return; setState(s); setMessage(m); onChange?.(value, s) }
    if (!name) return report('idle')
    if (current && name === current) return report('ok')
    const problem = localUsernameProblem(name)
    if (problem) return report('bad', problem)
    report('checking')
    const t = setTimeout(async () => {
      try {
        const res = await axios.post(`${API}/api/username/check`, { username : name, name : nameHint }, { withCredentials : true })
        if (id !== seq.current) return
        if (res.data.available) report('ok', `@${name} is available`)
        else { report('bad', res.data.problem || 'This username is taken.'); setSuggestions(res.data.suggestions || []) }
      } catch {
        report('idle')
      }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, current])

  const colors = tone === 'px'
    ? { box : 'border-px-border bg-px-raised/60 text-px-text focus-within:border-px-muted', label : 'text-px-muted', muted : 'text-px-muted', chip : 'bg-px-raised text-px-text hover:bg-px-border' }
    : { box : 'border-wa-border bg-transparent text-wa-text focus-within:border-wa-green', label : 'text-wa-teal', muted : 'text-wa-muted', chip : 'bg-wa-panel text-wa-text hover:bg-wa-hover' }

  return (
    <div>
      <label htmlFor='username' className={`text-sm ${colors.label}`}>{label}</label>
      <div className={`mt-1 flex items-center gap-1 rounded-md border px-3 ${colors.box}`}>
        <span className={colors.muted}>@</span>
        <input
          id='username'
          value={value}
          autoFocus={autoFocus}
          autoComplete='off'
          autoCapitalize='none'
          spellCheck={false}
          maxLength={31}
          onChange={(e) => onChange?.(e.target.value.replace(/\s/g, '').toLowerCase(), state)}
          placeholder='your.name'
          className='h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-[15px]'
        />
        {state === 'checking' && <span className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50' />}
        {state === 'ok' && <IoCheckmarkCircle className='text-[#00a884]' size={20} aria-label='Available' />}
        {state === 'bad' && <IoCloseCircle className='text-[#ed4956]' size={20} aria-label='Not available' />}
      </div>
      {message && <p role={state === 'bad' ? 'alert' : undefined} className={`mt-1 text-xs ${state === 'bad' ? 'text-[#ed4956]' : colors.muted}`}>{message}</p>}
      {suggestions.length > 0 && (
        <div className='mt-2 flex flex-wrap items-center gap-1.5'>
          <span className={`text-xs ${colors.muted}`}>Try:</span>
          {suggestions.map((s) => (
            <button key={s} type='button' onClick={() => onChange?.(s, 'checking')} className={`rounded-full px-2.5 py-1 text-xs ${colors.chip}`}>@{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default UsernameField
