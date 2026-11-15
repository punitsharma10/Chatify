import React from 'react'
import { IoMailOutline, IoCallOutline } from 'react-icons/io5'
import { COUNTRIES } from '../helpers/phone'

// "Email | Phone" switch + the matching input. value = { channel : 'email' | 'sms', email, country, number }
export const emptyIdentifier = (channel = 'email', email = '') => ({ channel, email, country : '+91', number : '' })

const IdentifierInput = ({ value, onChange, autoFocus = true, idPrefix = 'id' }) => {
  const set = (patch) => onChange({ ...value, ...patch })

  return (
    <div>
      <div role='tablist' className='mb-5 inline-flex rounded-full bg-wa-panel p-1'>
        {[['email', 'Email', <IoMailOutline key='m' size={16} />], ['sms', 'Phone', <IoCallOutline key='p' size={16} />]].map(([key, label, icon]) => (
          <button
            key={key}
            type='button'
            role='tab'
            aria-selected={value.channel === key}
            onClick={() => set({ channel : key })}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors ${value.channel === key ? 'bg-wa-surface font-medium text-wa-teal shadow-sm' : 'text-wa-muted hover:text-wa-text'}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {value.channel === 'email' ? (
        <div>
          <label htmlFor={`${idPrefix}-email`} className='text-sm text-wa-green'>Email</label>
          <input
            id={`${idPrefix}-email`}
            type='email'
            autoComplete='email'
            className='wa-input'
            placeholder='you@example.com'
            value={value.email}
            onChange={(e) => set({ email : e.target.value })}
            autoFocus={autoFocus}
            required
          />
        </div>
      ) : (
        <div>
          <label htmlFor={`${idPrefix}-phone`} className='text-sm text-wa-green'>Phone number</label>
          <div className='flex items-end gap-3'>
            <select
              aria-label='Country code'
              value={value.country}
              onChange={(e) => set({ country : e.target.value })}
              className='w-[104px] shrink-0 border-0 border-b-2 border-wa-border bg-transparent py-2 text-base text-wa-text outline-none focus:border-wa-green sm:text-[15px]'
            >
              {COUNTRIES.map((c) => <option key={c.code + c.name} value={c.code}>{c.flag} {c.code}</option>)}
            </select>
            <input
              id={`${idPrefix}-phone`}
              type='tel'
              inputMode='tel'
              autoComplete='tel-national'
              className='wa-input'
              placeholder='98765 43210'
              value={value.number}
              onChange={(e) => set({ number : e.target.value.replace(/[^\d\s-]/g, '') })}
              autoFocus={autoFocus}
              required
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default IdentifierInput
