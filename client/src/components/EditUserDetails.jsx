import React, { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import uploadFile from '../helpers/uploadFile'
import axios from 'axios'
import { notify, notifyError } from '../helpers/toast'
import { useDispatch } from 'react-redux'
import { setUser } from '../redux/userSlice'
import { IoArrowBack, IoCamera } from "react-icons/io5";
import { formatPhone } from '../helpers/phone'
import UsernameField, { normalizeUsername } from './apps/UsernameField'

const EditUserDetails = ({ onClose, user }) => {
  const [data, setData] = useState({
    name: user?.name,
    profile_pic: user?.profile_pic,
    about: user?.about || ''
  })
  const [uploading, setUploading] = useState(false)
  // @username shared by Chats, Pixify and Connectify
  const [username, setUsername] = useState(user?.username || '')
  const [usernameState, setUsernameState] = useState('idle')
  const uploadPhotoRef = useRef()
  const dispatch = useDispatch()

  // load the current values when the drawer opens. Deliberately keyed on the user id only:
  // re-running on every user update (e.g. someone coming online) would wipe what you're typing.
  useEffect(() => {
    setData((preve) => ({ ...preve, name: user?.name, profile_pic: user?.profile_pic, about: user?.about || '' }))
    setUsername(user?.username || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id])

  const handleOnChange = (e) => {
    const { name, value } = e.target
    setData((preve) => ({ ...preve, [name]: value }))
  }

  const handleOpenUploadPhoto = (e) => {
    e.preventDefault()
    e.stopPropagation()
    uploadPhotoRef.current.click()
  }

  const handleUploadPhoto = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return notifyError('Choose a photo')

    setUploading(true)
    try {
      const uploadPhoto = await uploadFile(file)
      if (!uploadPhoto?.url) throw new Error('upload failed')
      setData((preve) => ({ ...preve, profile_pic: uploadPhoto.url }))
    } catch {
      notifyError("Couldn't upload the photo. Check your connection and try again.")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newUsername = normalizeUsername(username);
    const usernameChanged = newUsername !== (user?.username || '');
    if (usernameChanged && newUsername && usernameState !== 'ok') return notifyError('Choose an available username first');
    try {
      const URL = `${process.env.REACT_APP_BACKEND_URL}/api/updateuser`;
      const payload = {
        name: data.name,
        profile_pic: data.profile_pic,
        about: data.about,
        ...(usernameChanged && newUsername ? { username: newUsername } : {}),
      };
      const response = await axios.post(URL, payload, { withCredentials: true });

      notify(response?.data?.message);
      if (response.data.success) {
        dispatch(setUser(response.data.data));
        onClose();
      }
    } catch (error) {
      console.log(error);
      notifyError(error?.response?.data?.message || "Couldn't update your profile");
    }
  };

  return (
    <div className='absolute inset-0 z-20 flex animate-slideIn flex-col bg-wa-panel'>
      {/* drawer header */}
      <header className='flex h-[59px] shrink-0 items-center bg-wa-teal px-4 text-white dark:bg-wa-panel dark:text-wa-text sm:px-6 md:h-16 md:bg-wa-surface md:text-wa-strong md:dark:bg-wa-surface md:dark:text-wa-strong'>
        <div className='flex items-center gap-7'>
          <button onClick={onClose} title='Back'>
            <IoArrowBack size={24} />
          </button>
          <h2 className='text-[19px] font-medium md:text-[22px] md:font-bold'>Profile</h2>
        </div>
      </header>

      <form className='min-h-0 flex-1 overflow-y-auto scrollbar' onSubmit={handleSubmit}>
        {/* big avatar with change overlay */}
        <div className='relative flex justify-center pb-10 pt-6 sm:pt-7'>
          <button type='button' onClick={handleOpenUploadPhoto} className='group relative rounded-full'>
            <Avatar
              width={180}
              height={180}
              imageUrl={data?.profile_pic}
              name={data?.name}
            />
            {/* always-visible camera badge for touch screens (no hover there) */}
            <span className='absolute bottom-2 right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-wa-green text-white shadow-menu lg:hidden'>
              <IoCamera size={20} />
            </span>
            <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center rounded-full bg-black/40 text-xs uppercase leading-snug text-white transition-opacity ${uploading ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"}`}>
              {uploading ? (
                <span className='h-8 w-8 animate-spin rounded-full border-2 border-wa-surface border-t-transparent' />
              ) : (
                <>
                  <IoCamera size={26} />
                  <span className='mt-2'>Change<br />profile photo</span>
                </>
              )}
            </div>
          </button>
          {data?.profile_pic && !uploading && (
            <button type='button' onClick={() => setData((preve) => ({ ...preve, profile_pic: '' }))} className='absolute mt-[188px] text-sm font-medium text-red-600 hover:underline'>
              Remove photo
            </button>
          )}
          <input
            type='file'
            id='profile_pic'
            accept='image/*'
            className='hidden'
            onChange={handleUploadPhoto}
            ref={uploadPhotoRef}
          />
        </div>

        {/* name */}
        <div className='bg-wa-surface px-5 py-4 sm:px-7 shadow-sm'>
          <label htmlFor='name' className='text-sm text-wa-teal'>Your name</label>
          <input
            className='wa-input mt-1'
            type='text'
            name='name'
            id='name'
            value={data.name || ""}
            onChange={handleOnChange}
          />
        </div>
        <p className='px-5 py-4 sm:px-7 text-sm leading-5 text-wa-muted'>
          This is the name and photo people see when you chat with them.
        </p>

        {/* about */}
        <div className='bg-wa-surface px-5 py-4 shadow-sm sm:px-7'>
          <label htmlFor='about' className='text-sm text-wa-teal'>About</label>
          <input
            className='wa-input mt-1'
            type='text'
            name='about'
            id='about'
            maxLength={140}
            value={data.about || ""}
            onChange={handleOnChange}
          />
          <p className='mt-1 text-right text-xs text-wa-muted'>{(data.about || '').length}/140</p>
        </div>

        {/* @username */}
        <div className='mt-2.5 bg-wa-surface px-5 py-4 shadow-sm sm:px-7'>
          <UsernameField value={username} current={user?.username || ''} nameHint={data.name} onChange={(v, st) => { setUsername(v); setUsernameState(st) }} />
          <p className='mt-2 text-xs text-wa-muted'>One username for Chatify, Pixify and Connectify. People can find you by typing your exact @username.</p>
        </div>

        {/* phone (read only) */}
        {user?.phone && (
          <div className='mb-2.5 bg-wa-surface px-5 py-4 sm:px-7 shadow-sm'>
            <p className='text-sm text-wa-teal'>Phone</p>
            <p className='mt-2 text-[15px] text-wa-text'>{formatPhone(user.phone)}</p>
          </div>
        )}

        {/* email (read only) */}
        {user?.email && (
          <div className='bg-wa-surface px-5 py-4 sm:px-7 shadow-sm'>
            <p className='text-sm text-wa-teal'>Email</p>
            <p className='mt-2 text-[15px] text-wa-text'>{user.email}</p>
          </div>
        )}

        <div className='flex justify-end gap-3 px-5 py-6 sm:px-7'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full border border-wa-border bg-wa-surface px-6 py-2.5 text-sm font-medium text-wa-green hover:bg-wa-hover'
          >
            Cancel
          </button>
          <button type='submit' className='wa-btn' disabled={uploading}>Save</button>
        </div>
      </form>
    </div>
  )
}

export default React.memo(EditUserDetails)
