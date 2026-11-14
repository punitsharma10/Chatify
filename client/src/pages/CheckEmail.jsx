import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { friendly } from '../helpers/toast';
import { IoLogInOutline } from "react-icons/io5";
import AuthAside from '../components/AuthAside';
import IdentifierInput, { emptyIdentifier } from '../components/IdentifierInput';
import { toE164, isValidE164 } from '../helpers/phone';

// Login step 1: email or phone number
const CheckEmail = () => {
  const [ident, setIdent] = useState(() => emptyIdentifier())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setError('')

    let body
    if (ident.channel === 'sms') {
      const phone = toE164(ident.country, ident.number)
      if (!isValidE164(phone)) return setError('Please enter a valid phone number.')
      body = { phone }
    } else {
      if (!ident.email.trim()) return setError('Please enter your email address.')
      body = { email: ident.email.trim() }
    }

    setBusy(true)
    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/email`, body)
      if (response.data.success) {
        navigate('/password', { state: response?.data?.data })
      }
    } catch (err) {
      setError(friendly(err?.response?.data?.message))
    }
    setBusy(false)
  }

  return (
    <div className='grid md:grid-cols-[1.15fr,1fr]'>
      <div className='p-6 sm:p-10 lg:p-12'>
        <div className='flex h-14 w-14 items-center justify-center rounded-full bg-wa-green/10 text-wa-green'>
          <IoLogInOutline size={28} />
        </div>
        <h1 className='mt-6 text-2xl sm:text-[28px] font-light text-wa-text'>Log in to Chatify</h1>
        <p className='mt-1 text-sm text-wa-muted'>Use the email address or phone number you registered with.</p>

        <form className='mt-8 grid gap-8' onSubmit={handleSubmit} noValidate>
          <div>
            <IdentifierInput value={ident} onChange={(v) => { setIdent(v); setError('') }} idPrefix='login' />
            {error && <p role='alert' className='mt-2 text-sm text-red-600'>{error}</p>}
          </div>

          <div className='flex flex-col-reverse items-stretch gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left'>
            <p className='text-sm text-wa-muted'>
              New to Chatify?{" "}
              <Link to={"/register"} className='font-medium text-wa-green hover:underline'>Create account</Link>
            </p>
            <button className='wa-btn' disabled={busy}>{busy ? 'Checking…' : 'Next'}</button>
          </div>
        </form>
      </div>

      <AuthAside />
    </div>
  )
}

export default CheckEmail;
