import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { IoArrowBack, IoMailOutline, IoShieldCheckmarkOutline } from 'react-icons/io5'
import IdentifierInput, { emptyIdentifier } from './IdentifierInput'
import { toE164, isValidE164, formatPhone } from '../helpers/phone'

const API = process.env.REACT_APP_BACKEND_URL

// Six single-digit boxes (WhatsApp style). Supports typing, backspace, arrows and pasting the whole code.
export const OtpInput = ({ value, onChange, disabled, invalid, length : LENGTH = 6 }) => {
  const refs = useRef([])
  const digits = Array.from({ length : LENGTH }, (_, i) => value[i] || '')

  const setAt = (i, d) => {
    const next = digits.slice()
    next[i] = d
    onChange(next.join('').slice(0, LENGTH))
  }

  const fill = (text, start = 0) => {
    const clean = text.replace(/\D/g, '').slice(0, LENGTH - start)
    if (!clean) return
    const next = digits.slice()
    clean.split('').forEach((d, k) => { next[start + k] = d })
    onChange(next.join(''))
    refs.current[Math.min(start + clean.length, LENGTH - 1)]?.focus()
  }

  return (
    <div className='flex justify-center gap-2 sm:gap-3' onPaste={(e) => { e.preventDefault(); fill(e.clipboardData.getData('text')) }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          value={d}
          disabled={disabled}
          inputMode='numeric'
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          aria-label={`Digit ${i + 1}`}
          autoFocus={i === 0}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (v.length > 1) return fill(v, i)   // autofill / paste into one box
            setAt(i, v)
            if (v && i < LENGTH - 1) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) { setAt(i - 1, ''); refs.current[i - 1]?.focus() }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < LENGTH - 1) refs.current[i + 1]?.focus()
          }}
          className={`h-12 w-10 rounded-none border-0 border-b-2 bg-transparent text-center text-2xl text-wa-text outline-none transition-colors sm:h-14 sm:w-12 ${
            invalid ? 'border-red-500 text-red-600' : d ? 'border-wa-green' : 'border-[#d1d7db] focus:border-wa-green'
          }`}
        />
      ))}
    </div>
  )
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// turns the form value into { channel, target, body } for the API, or { error }
const resolveIdentifier = (ident) => {
  if (ident.channel === 'sms') {
    const target = toE164(ident.country, ident.number)
    if (!isValidE164(target)) return { error : 'Please enter a valid phone number.' }
    return { channel : 'sms', target, body : { phone : target } }
  }
  const target = ident.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) return { error : 'Please enter a valid email address.' }
  return { channel : 'email', target, body : { email : target } }
}

// Steps 1-2 of registration / password reset: enter email or phone -> enter the code.
// Calls onVerified({ channel, target }, token) once the code is correct.
const EmailOtpStep = ({ purpose, title, subtitle, initial, onVerified, footer }) => {
  const [step, setStep] = useState('enter')
  const [ident, setIdent] = useState(() => {
    if (initial?.channel === 'sms' && initial.target) {
      const base = emptyIdentifier('sms')
      return { ...base, number : initial.target.replace(base.country, '') }
    }
    return emptyIdentifier('email', initial?.target || '')
  })
  const [sentTo, setSentTo] = useState(null) // resolved { channel, target, body }
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [devMode, setDevMode] = useState(false)
  const [LENGTH, setLength] = useState(6) // digits in the code (the server decides; SMS may be shorter)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const sendCode = async (e) => {
    e?.preventDefault()
    setError('')
    const resolved = step === 'code' && sentTo ? sentTo : resolveIdentifier(ident)
    if (resolved.error) return setError(resolved.error)
    setBusy(true)
    try {
      const res = await axios.post(`${API}/api/otp/send`, { ...resolved.body, purpose })
      setSentTo(resolved)
      setStep('code')
      setCode('')
      setResendIn(res.data.resendIn || 60)
      setDevMode(!!res.data.devMode)
      setLength(res.data.codeLength || 6)
    } catch (err) {
      const data = err?.response?.data
      if (data?.retryIn) { setSentTo(resolved); setStep('code'); setResendIn(data.retryIn) }
      setError(data?.message || "Couldn't send the code. Check your connection and try again.")
    }
    setBusy(false)
  }

  const verify = async (value) => {
    setError('')
    setBusy(true)
    try {
      const res = await axios.post(`${API}/api/otp/verify`, { ...sentTo.body, purpose, otp : value })
      onVerified({ channel : sentTo.channel, target : sentTo.target }, res.data.token)
    } catch (err) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.')
      setCode('')
    }
    setBusy(false)
  }

  // submit automatically once all 6 digits are entered
  const onCode = (v) => {
    setCode(v)
    if (error) setError('')
    if (v.length === LENGTH && !busy) verify(v)
  }

  if (step === 'enter') {
    return (
      <form onSubmit={sendCode} noValidate>
        <div className='flex h-14 w-14 items-center justify-center rounded-full bg-wa-green/10 text-wa-green'>
          <IoMailOutline size={28} />
        </div>
        <h1 className='mt-6 text-2xl font-light text-wa-text sm:text-[28px]'>{title}</h1>
        <p className='mt-1 text-sm text-wa-muted'>{subtitle}</p>

        <div className='mt-8'>
          <IdentifierInput value={ident} onChange={(v) => { setIdent(v); setError('') }} idPrefix='otp' />
          {error && <p role='alert' className='mt-2 text-sm text-red-600'>{error}</p>}
        </div>

        <div className='mt-8 flex flex-col-reverse items-stretch gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left'>
          {footer}
          <button className='wa-btn' disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        </div>
      </form>
    )
  }

  const isSms = sentTo?.channel === 'sms'
  const shown = isSms ? formatPhone(sentTo.target) : sentTo?.target

  return (
    <div>
      <button type='button' onClick={() => { setStep('enter'); setError(''); setCode('') }} className='inline-flex items-center gap-2 text-sm text-wa-muted hover:text-wa-text'>
        <IoArrowBack size={18} /> {isSms ? 'Wrong number?' : 'Wrong email?'}
      </button>

      <div className='mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-wa-green/10 text-wa-green'>
        <IoShieldCheckmarkOutline size={28} />
      </div>
      <h1 className='mt-6 text-2xl font-light text-wa-text sm:text-[28px]'>Enter the {LENGTH}-digit code</h1>
      <p className='mt-1 text-sm text-wa-muted'>
        We sent a code {isSms ? 'by SMS ' : ''}to <span className='font-medium text-wa-text'>{shown}</span>. It expires in 10 minutes.
      </p>

      {devMode && (
        <p className='mt-4 rounded-md bg-[#fff6dc] px-3 py-2 text-xs text-[#7a5b00]'>
          Developer mode: {isSms ? 'SMS' : 'email'} isn't set up on the server yet, so the code is printed in the server terminal.
        </p>
      )}

      <div className='mt-8'>
        <OtpInput value={code} onChange={onCode} disabled={busy} invalid={!!error} length={LENGTH} />
        <p role='alert' className={`mt-4 min-h-[20px] text-center text-sm ${error ? 'text-red-600' : 'text-wa-muted'}`}>
          {error || (busy ? 'Checking…' : '')}
        </p>
      </div>

      <div className='mt-4 flex flex-col-reverse items-stretch gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left'>
        <p className='text-sm text-wa-muted'>
          Didn't get it?{' '}
          {resendIn > 0 ? (
            <span>Resend code in {mmss(resendIn)}</span>
          ) : (
            <button type='button' onClick={sendCode} disabled={busy} className='font-medium text-wa-green hover:underline'>Resend code</button>
          )}
        </p>
        <button type='button' className='wa-btn' disabled={busy || code.length !== LENGTH} onClick={() => verify(code)}>Verify</button>
      </div>
      <p className='mt-6 text-xs text-wa-muted'>
        {isSms ? 'SMS can take a minute to arrive. Make sure the number and country code are correct.' : "Can't find it? Check your spam or promotions folder."}
      </p>
    </div>
  )
}

export default EmailOtpStep
