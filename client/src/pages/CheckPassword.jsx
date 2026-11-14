import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios'
import { notifyError } from '../helpers/toast';
import { IoArrowBack, IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";
import Avatar from '../components/Avatar';
import { useDispatch } from 'react-redux';
import { setToken } from '../redux/userSlice';
import AuthAside from '../components/AuthAside';
import { contactLine } from '../helpers/phone';

const CheckPasswordPage = () => {
  const [data, setData] = useState({ password: "", userId: "" })
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()

  // opened directly (no account picked on the previous step) -> back to step 1
  useEffect(() => {
    if (!location?.state?.name) {
      navigate('/email')
    }
  }, [location?.state?.name, navigate])

  const handleOnChange = (e) => {
    const { name, value } = e.target
    setData((preve) => ({ ...preve, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    const URL = `${process.env.REACT_APP_BACKEND_URL}/api/password`

    try {
      const response = await axios({
        method: 'post',
        url: URL,
        data: {
          userId: location?.state?._id,
          password: data.password
        },
        withCredentials: true
      })


      if (response.data.success) {
        dispatch(setToken(response?.data?.token))
        localStorage.setItem('token', response?.data?.token)
        setData({ password: "" })
        navigate('/')
      }
    } catch (error) {
      notifyError(error?.response?.data?.message)
    }
  }

  return (
    <div className='grid md:grid-cols-[1.15fr,1fr]'>
      <div className='p-6 sm:p-10 lg:p-12'>
        <Link to="/email" className='inline-flex items-center gap-2 text-sm text-wa-muted hover:text-wa-text'>
          <IoArrowBack size={18} /> Use a different email or number
        </Link>

        <div className='mt-6 flex items-center gap-4'>
          <Avatar
            width={64}
            height={64}
            name={location?.state?.name}
            imageUrl={location?.state?.profile_pic}
          />
          <div className='min-w-0'>
            <h1 className='truncate text-2xl font-light text-wa-text'>Hi, {location?.state?.name}</h1>
            <p className='truncate text-sm text-wa-muted'>{contactLine(location?.state)}</p>
          </div>
        </div>

        <form className='mt-10 grid gap-8' onSubmit={handleSubmit}>
          <div>
            <label htmlFor='password' className='text-sm text-wa-green'>Password</label>
            <div className='relative'>
              <input
                type={showPassword ? 'text' : 'password'}
                id='password'
                name='password'
                placeholder='Enter your password'
                className='wa-input pr-10'
                value={data.password}
                onChange={handleOnChange}
                required
                autoFocus
              />
              <button
                type='button'
                onClick={() => setShowPassword(s => !s)}
                className='absolute right-1 top-1/2 -translate-y-1/2 p-1 text-wa-muted hover:text-wa-text'
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <IoEyeOffOutline size={20} /> : <IoEyeOutline size={20} />}
              </button>
            </div>
          </div>

          <div className='flex flex-col-reverse items-stretch gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left'>
            <Link to={"/forgotpassword"} state={{ identifier: location?.state?.email ? { channel: "email", target: location.state.email } : location?.state?.phone ? { channel: "sms", target: location.state.phone } : undefined }} className='text-sm font-medium text-wa-green hover:underline'>Forgot password?</Link>
            <button className='wa-btn'>Log in</button>
          </div>
        </form>
      </div>

      <AuthAside />
    </div>
  )
}

export default CheckPasswordPage;
