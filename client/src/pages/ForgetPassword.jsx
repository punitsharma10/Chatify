import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { IoLockClosedOutline } from "react-icons/io5";
import { notify, notifyError } from '../helpers/toast';
import AuthAside from '../components/AuthAside';
import EmailOtpStep from '../components/EmailOtpStep';
import PasswordFields, { passwordProblem } from '../components/PasswordFields';
import { formatPhone } from '../helpers/phone';

const API = process.env.REACT_APP_BACKEND_URL;

// Forgot password: 1) email  2) 6-digit code  3) new password + confirm
const ForgotPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [verified, setVerified] = useState(null); // { channel, target, token }
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    setError('');
    const problem = passwordProblem(password, confirm) || (password !== confirm ? "Passwords don't match." : '');
    if (problem) return setError(problem);
    setSaving(true);
    try {
      await axios.post(`${API}/api/reset-password`, { [verified.channel === 'sms' ? 'phone' : 'email']: verified.target, password, confirmPassword: confirm, verifyToken: verified.token });
      notify('Password updated. Log in with your new password.');
      navigate('/email');
    } catch (err) {
      const body = err?.response?.data;
      if (body?.code === 'not_verified') {
        notifyError('Your verification expired. Please verify again.');
        setVerified(null);
      } else {
        setError(body?.message || "Couldn't update your password. Please try again.");
      }
    }
    setSaving(false);
  };

  return (
    <div className='grid md:grid-cols-[1.15fr,1fr]'>
      <div className='p-6 sm:p-10 lg:p-12'>
        {!verified ? (
          <EmailOtpStep
            purpose='reset'
            title='Forgot your password?'
            subtitle="Enter the email or phone number on your account and we'll send you a 6-digit code to reset it."
            initial={location.state?.identifier}
            onVerified={(id, token) => setVerified({ ...id, token })}
            footer={
              <p className='text-sm text-wa-muted'>
                Remembered it? <Link to='/email' className='font-medium text-wa-green hover:underline'>Back to login</Link>
              </p>
            }
          />
        ) : (
          <form onSubmit={submit} noValidate>
            <div className='flex h-14 w-14 items-center justify-center rounded-full bg-wa-green/10 text-wa-green'>
              <IoLockClosedOutline size={28} />
            </div>
            <h1 className='mt-6 text-2xl font-light text-wa-text sm:text-[28px]'>Set a new password</h1>
            <p className='mt-1 text-sm text-wa-muted'>For <span className='font-medium text-wa-text'>{verified.channel === 'sms' ? formatPhone(verified.target) : verified.target}</span>. You'll be logged out of other devices.</p>

            <div className='mt-8 grid gap-6'>
              <PasswordFields
                password={password}
                confirm={confirm}
                onPassword={setPassword}
                onConfirm={setConfirm}
                labels={['New password', 'Confirm new password']}
                showErrors={tried}
                autoFocus
              />
              {error && <p role='alert' className='-mt-2 text-sm text-red-600'>{error}</p>}
            </div>

            <div className='mt-8 flex flex-col-reverse items-stretch gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left'>
              <Link to='/email' className='text-sm font-medium text-wa-green hover:underline'>Back to login</Link>
              <button className='wa-btn' disabled={saving}>{saving ? 'Saving…' : 'Reset password'}</button>
            </div>
          </form>
        )}
      </div>
      <AuthAside />
    </div>
  );
}

export default ForgotPassword;
