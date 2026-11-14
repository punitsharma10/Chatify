import React from 'react'
import toast from 'react-hot-toast'

// WhatsApp-style snackbars: short sentence-case text, optional green action ("Undo").
// Server messages are translated into friendly copy.
const FRIENDLY = {
  'user not exit' : 'No account found with this email address.',
  'wrong password' : 'Incorrect password. Please try again.',
  'User Already Registered' : 'An account with this email already exists.',
  'User Created Successfully' : 'Account created. Log in to continue.',
  'User Update Successfully' : 'Profile updated',
  'session out' : 'Your session expired. Please log in again.',
}

export const friendly = (msg, fallback = 'Something went wrong. Please try again.') => {
  if (!msg || typeof msg !== 'string') return fallback
  return FRIENDLY[msg] || msg
}

export const notify = (text) => toast(friendly(text, ''), { id : text })
export const notifyError = (text) => toast(friendly(text), { id : `err-${text}` })

// snackbar with an action button, e.g. notifyAction('Chat archived', 'Undo', fn)
export const notifyAction = (text, label, onAction, duration = 5000) =>
  toast((t) => (
    <span className='flex w-full items-center justify-between gap-6'>
      <span>{text}</span>
      <button
        className='shrink-0 text-sm font-medium text-[#21c063] hover:text-[#25d366]'
        onClick={() => { toast.dismiss(t.id); onAction() }}
      >
        {label}
      </button>
    </span>
  ), { duration })
