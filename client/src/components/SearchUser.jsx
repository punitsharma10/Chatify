import React, { useEffect, useState } from 'react'
import { IoSearchOutline, IoArrowBack, IoClose } from "react-icons/io5";
import Loading from './Loading';
import UserSearchCard from './UserSearchCard';
import { notifyError } from '../helpers/toast'
import axios from 'axios';

const SearchUser = ({ onClose }) => {
  const [searchUser, setSearchUser] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  // search as you type (short pause so we don't call the server on every keystroke)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/searchuser`, { search })
        if (!cancelled) setSearchUser(response.data.data)
      } catch (error) {
        if (!cancelled) notifyError(error?.response?.data?.message)
      }
      if (!cancelled) setLoading(false)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search])

  return (
    <div className='absolute inset-0 z-20 flex animate-slideIn flex-col bg-white'>
      {/* drawer header */}
      <header className='flex h-[59px] shrink-0 items-center bg-wa-teal px-4 text-white sm:px-6 lg:h-[108px] lg:items-end lg:pb-5'>
        <div className='flex items-center gap-7'>
          <button onClick={onClose} title='Back'>
            <IoArrowBack size={24} />
          </button>
          <h2 className='text-[19px] font-medium'>New chat</h2>
        </div>
      </header>

      {/* search input */}
      <div className='shrink-0 border-b border-wa-border px-3 py-2'>
        <div className='flex h-[38px] items-center gap-4 rounded-lg bg-wa-panel px-4 sm:h-[35px]'>
          <IoSearchOutline size={17} className='shrink-0 text-[#54656f]' />
          <input
            type='text'
            placeholder='Search name or email'
            className='w-full bg-transparent text-base text-wa-text outline-none placeholder:text-[#8696a0] sm:text-sm'
            onChange={(e) => setSearch(e.target.value)}
            value={search}
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch("")} className='text-[#54656f]'>
              <IoClose size={18} />
            </button>
          )}
        </div>
      </div>

      {/* results */}
      <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>
        <p className='px-5 pb-3 pt-5 text-sm uppercase tracking-wide text-wa-teal sm:px-8 sm:pt-6 sm:text-[15px]'>People on Chatify</p>

        {loading && (
          <div className='py-6'><Loading /></div>
        )}

        {searchUser.length === 0 && !loading && (
          <p className='px-8 py-6 text-center text-sm text-wa-muted'>No users found</p>
        )}

        {searchUser.length !== 0 && !loading && (
          searchUser.map((user) => (
            <UserSearchCard key={user._id} user={user} onClose={onClose} />
          ))
        )}
      </div>
    </div>
  )
}

export default SearchUser;
