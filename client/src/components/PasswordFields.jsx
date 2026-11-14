import React, { useState } from 'react'
import { IoEyeOutline, IoEyeOffOutline } from 'react-icons/io5'

// password + confirm password with show/hide and inline validation
export const passwordProblem = (password, confirm) => {
  if (password.length < 6) return 'Password must be at least 6 characters.'
  if (confirm && password !== confirm) return "Passwords don't match."
  return ''
}

const PasswordFields = ({ password, confirm, onPassword, onConfirm, labels = ['Password', 'Confirm password'], showErrors, autoFocus = false }) => {
  const [show, setShow] = useState(false)
  const tooShort = password.length > 0 && password.length < 6
  const mismatch = confirm.length > 0 && password !== confirm

  const field = (id, label, value, onChange, error, autoFocus) => (
    <div>
      <label htmlFor={id} className='text-sm text-wa-green'>{label}</label>
      <div className='relative'>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className={`wa-input pr-10 ${error ? '!border-red-500' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete='new-password'
          autoFocus={autoFocus}
          required
        />
        <button
          type='button'
          onClick={() => setShow((s) => !s)}
          className='absolute right-1 top-1/2 -translate-y-1/2 p-1 text-wa-muted hover:text-wa-text'
          title={show ? 'Hide password' : 'Show password'}
        >
          {show ? <IoEyeOffOutline size={20} /> : <IoEyeOutline size={20} />}
        </button>
      </div>
      {error && <p className='mt-1.5 text-xs text-red-600'>{error}</p>}
    </div>
  )

  return (
    <>
      {field('pw-new', labels[0], password, onPassword, (tooShort || (showErrors && password.length < 6)) ? 'Use at least 6 characters.' : '', autoFocus)}
      {field('pw-confirm', labels[1], confirm, onConfirm, mismatch ? "Passwords don't match." : '')}
    </>
  )
}

export default PasswordFields
