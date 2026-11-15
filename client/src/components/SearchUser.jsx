import React, { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { IoSearchOutline, IoArrowBack, IoClose } from "react-icons/io5";
import { HiUserGroup } from 'react-icons/hi';
import Loading from './Loading';
import UserSearchCard from './UserSearchCard';
import { notify, notifyError } from '../helpers/toast'
import { socketCall } from '../helpers/socketCall'
import axios from 'axios';

// "New chat": your contacts, plus anyone you look up by their full phone number or email
const SearchUser = ({ onClose, onNewGroup }) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const contactList = useSelector((s) => s.user.contacts)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  const load = useCallback(async (q, isCancelled = () => false) => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/searchuser`, { search : q })
      if (!isCancelled()) setResults(response.data.data || [])
    } catch (error) {
      if (!isCancelled()) notifyError(error?.response?.data?.message)
    }
    if (!isCancelled()) setLoading(false)
  }, [])

  // search as you type (short pause so we don't call the server on every keystroke); re-run when contacts change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => load(search, () => cancelled), 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search, load, contactList])

  const addContact = async (user) => {
    const res = await socketCall(socket, 'add-contact', { userId : user._id })
    if (!res.ok) return notifyError(res.error)
    notify('Added to your contacts')
  }

  const contacts = results.filter((u) => u.isContact)
  const others = results.filter((u) => !u.isContact)
  const q = search.trim()

  return (
    <div className='absolute inset-0 z-20 flex animate-slideIn flex-col bg-wa-surface'>
      {/* drawer header */}
      <header className='flex h-[59px] shrink-0 items-center bg-wa-teal px-4 text-white dark:bg-wa-panel dark:text-wa-text sm:px-6 md:h-16 md:bg-wa-surface md:text-wa-strong md:dark:bg-wa-surface md:dark:text-wa-strong'>
        <div className='flex items-center gap-7'>
          <button onClick={onClose} title='Back'>
            <IoArrowBack size={24} />
          </button>
          <h2 className='text-[19px] font-medium md:text-[22px] md:font-bold'>New chat</h2>
        </div>
      </header>

      {/* search input */}
      <div className='shrink-0 border-b border-wa-border px-3 py-2'>
        <div className='flex h-[38px] items-center gap-4 rounded-lg bg-wa-panel px-4 sm:h-[35px]'>
          <IoSearchOutline size={17} className='shrink-0 text-wa-icon' />
          <input
            type='text'
            placeholder='Search contacts, or type a full number / email'
            className='w-full bg-transparent text-base text-wa-text outline-none placeholder:text-wa-subtle sm:text-sm'
            onChange={(e) => setSearch(e.target.value)}
            value={search}
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch("")} className='text-wa-icon'>
              <IoClose size={18} />
            </button>
          )}
        </div>
      </div>

      {/* results */}
      <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>
        {onNewGroup && !q && (
          <button onClick={onNewGroup} className='flex w-full items-center gap-3 pl-3 pr-4 text-left transition-colors hover:bg-wa-hover'>
            <span className='flex h-[49px] w-[49px] shrink-0 items-center justify-center rounded-full bg-wa-green text-white'><HiUserGroup size={24} /></span>
            <span className='min-w-0 flex-1 border-b border-wa-border py-4 text-[17px] text-wa-text'>New group</span>
          </button>
        )}

        {loading && <div className='py-6'><Loading /></div>}

        {!loading && contacts.length > 0 && (
          <>
            <p className='px-5 pb-3 pt-5 text-sm uppercase tracking-wide text-wa-teal sm:px-8 sm:text-[15px]'>Contacts on Chatify</p>
            {contacts.map((user) => <UserSearchCard key={user._id} user={user} onClose={onClose} />)}
          </>
        )}

        {!loading && others.length > 0 && (
          <>
            <p className='px-5 pb-3 pt-5 text-sm uppercase tracking-wide text-wa-teal sm:px-8 sm:text-[15px]'>Not in your contacts</p>
            {others.map((user) => <UserSearchCard key={user._id} user={user} onClose={onClose} onAdd={user.self ? undefined : () => addContact(user)} />)}
          </>
        )}

        {!loading && results.length === 0 && (
          <div className='px-8 py-8 text-center'>
            <p className='text-sm text-wa-text'>{q ? 'No contact or account found' : 'No contacts yet'}</p>
            <p className='mt-2 text-sm leading-5 text-wa-muted'>
              To find someone new, type their <b className='font-medium text-wa-text'>full phone number</b> (e.g. +91 98765 43210) or their <b className='font-medium text-wa-text'>full email</b>.
              Chatify never shows a list of everyone, so only people who already know your number or email can find you.
            </p>
          </div>
        )}

        {!loading && results.length > 0 && !q && (
          <p className='px-8 py-6 text-center text-xs leading-5 text-wa-muted'>Looking for someone else? Type their full phone number or email above.</p>
        )}
      </div>
    </div>
  )
}

export default SearchUser;
