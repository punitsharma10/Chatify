import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { IoArrowBack, IoArrowForward, IoCamera, IoCheckmark, IoClose, IoSearchOutline } from 'react-icons/io5'
import { BsCheck2 } from 'react-icons/bs'
import Avatar from './Avatar'
import Loading from './Loading'
import uploadFile from '../helpers/uploadFile'
import { socketCall } from '../helpers/socketCall'
import { notify, notifyError } from '../helpers/toast'
import { contactLine } from '../helpers/phone'
import { usePeopleNames } from '../helpers/contacts'

export const MAX_GROUP_MEMBERS = 256

// Search + pick people (used for "New group" and "Add members"). Selected people show as chips on top.
export const MemberPicker = ({ selected, onChange, exclude = [], max = MAX_GROUP_MEMBERS - 1, autoFocus = true }) => {
  const me = useSelector((s) => s.user._id)
  const conversations = useSelector((s) => s.chat.conversations)
  const names = usePeopleNames()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/searchuser`, { search })
        if (!cancelled) setResults(res.data.data || [])
      } catch (error) {
        if (!cancelled) notifyError(error?.response?.data?.message)
      }
      if (!cancelled) setLoading(false)
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search])

  const hidden = useMemo(() => new Set([String(me), ...exclude.map(String)]), [me, exclude])
  const pickedIds = useMemo(() => new Set(selected.map((u) => String(u._id))), [selected])

  // people you already chat with first (WhatsApp shows "Frequently contacted"), then everyone else
  const recent = useMemo(() => {
    if (search.trim()) return []
    return conversations
      .filter((c) => !c.isGroup && !c.request && c.userDetails && !c.userDetails.self && !c.userDetails.blockedByMe && !hidden.has(String(c.userDetails._id)))
      .map((c) => c.userDetails)
  }, [conversations, hidden, search])
  const recentIds = new Set(recent.map((u) => String(u._id)))
  const listed = results.filter((u) => !u.self && !hidden.has(String(u._id)) && !recentIds.has(String(u._id)))
  const savedPeople = listed.filter((u) => u.isContact)
  const strangers = listed.filter((u) => !u.isContact)

  const toggle = (user) => {
    const id = String(user._id)
    if (pickedIds.has(id)) return onChange(selected.filter((u) => String(u._id) !== id))
    if (user.blockedByMe) return notifyError(`Unblock ${names.name(user)} to add them to a group`)
    if (selected.length >= max) return notifyError(`You can add up to ${max} ${max === 1 ? 'person' : 'people'}`)
    onChange([...selected, user])
  }

  const row = (u) => {
    const on = pickedIds.has(String(u._id))
    const hint = names.hint(u)
    return (
      <button key={u._id} onClick={() => toggle(u)} className='flex w-full items-center gap-3 pl-3 pr-4 text-left transition-colors hover:bg-wa-hover'>
        <span className='relative'>
          <Avatar width={46} height={46} name={names.name(u)} imageUrl={u.profile_pic} userId={u._id} />
          {on && <span className='absolute -bottom-0.5 -right-0.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border-2 border-wa-surface bg-wa-green text-white'><BsCheck2 size={12} /></span>}
        </span>
        <span className='min-w-0 flex-1 border-b border-wa-border py-3'>
          <span className='flex items-baseline gap-2'>
            <span className='truncate text-[16px] text-wa-text'>{names.name(u)}</span>
            {hint && <span className='shrink-0 truncate text-[13px] text-wa-muted'>{hint}</span>}
          </span>
          <span className='block truncate text-[13px] text-wa-muted'>{u.about || contactLine(u)}</span>
        </span>
      </button>
    )
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='shrink-0 border-b border-wa-border px-4 pb-2 pt-3 sm:px-6'>
        {selected.length > 0 && (
          <div className='mb-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto scrollbar'>
            {selected.map((u) => (
              <span key={u._id} className='flex max-w-[200px] items-center gap-1.5 rounded-full bg-wa-panel py-0.5 pl-0.5 pr-2 text-sm text-wa-text'>
                <Avatar width={24} height={24} name={names.name(u)} imageUrl={u.profile_pic} />
                <span className='truncate'>{names.name(u)}</span>
                <button onClick={() => toggle(u)} className='shrink-0 text-wa-subtle hover:text-wa-text' title={`Remove ${names.name(u)}`}><IoClose size={16} /></button>
              </span>
            ))}
          </div>
        )}
        <div className='flex items-center gap-3 border-b-2 border-wa-green pb-1'>
          <IoSearchOutline size={17} className='shrink-0 text-wa-icon' />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search contacts, or type a full number / email'
            className='w-full bg-transparent py-1 text-base text-wa-text outline-none placeholder:text-wa-subtle sm:text-[15px]'
            autoFocus={autoFocus}
          />
        </div>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>
        {recent.length > 0 && <p className='px-5 pb-2 pt-4 text-sm text-wa-teal sm:px-7'>Recent chats</p>}
        {recent.map(row)}
        {loading && <div className='py-6'><Loading /></div>}
        {!loading && savedPeople.length > 0 && <p className='px-5 pb-2 pt-4 text-sm text-wa-teal sm:px-7'>{search.trim() ? 'Search results' : 'Contacts'}</p>}
        {!loading && savedPeople.map(row)}
        {!loading && strangers.length > 0 && <p className='px-5 pb-2 pt-4 text-sm text-wa-teal sm:px-7'>Not in your contacts</p>}
        {!loading && strangers.map(row)}
        {!loading && listed.length === 0 && (
          <p className='px-8 py-6 text-center text-sm leading-5 text-wa-muted'>
            {search.trim() ? 'No contact or account found. ' : recent.length ? '' : 'No contacts yet. '}
            To add someone new, type their full phone number or email.
          </p>
        )}
      </div>
    </div>
  )
}

// Round photo button: pick and upload a group icon
export const GroupIconPicker = ({ value, onChange, size = 200, disabled = false }) => {
  const input = useRef(null)
  const [uploading, setUploading] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return notifyError('Choose an image for the group icon')
    setUploading(true)
    try {
      const up = await uploadFile(file)
      if (!up?.url) throw new Error('upload failed')
      onChange(up.url)
    } catch {
      notifyError("Couldn't upload the photo. Try again.")
    }
    setUploading(false)
  }

  return (
    <button type='button' disabled={disabled || uploading} onClick={() => input.current?.click()} className='group relative shrink-0 overflow-hidden rounded-full' style={{ width : size, height : size }} title={disabled ? undefined : 'Change group icon'}>
      <Avatar width={size} height={size} imageUrl={value} group />
      {!disabled && (
        <span className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 text-center text-xs uppercase leading-snug text-white transition-opacity ${uploading || !value ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {uploading ? <span className='h-8 w-8 animate-spin rounded-full border-2 border-wa-surface border-t-transparent' /> : <><IoCamera size={size > 120 ? 26 : 20} /><span className='mt-1.5 px-4'>{value ? 'Change group icon' : 'Add group icon'}</span></>}
        </span>
      )}
      <input ref={input} type='file' accept='image/*' className='hidden' onChange={pick} />
    </button>
  )
}

// "New group" drawer: 1) add members  2) name + icon, then create
const NewGroup = ({ onClose }) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const navigate = useNavigate()
  const names = usePeopleNames()
  const [step, setStep] = useState(1)
  const [members, setMembers] = useState([])
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!name.trim()) return notifyError('Enter a group name')
    setCreating(true)
    const res = await socketCall(socket, 'create-group', { name, avatar, memberIds : members.map((u) => u._id) })
    setCreating(false)
    if (!res.ok) return notifyError(res.error)
    notify(`Group "${name.trim()}" created`)
    if (res.skipped?.length) notifyError(`${res.skipped.join(', ')} couldn't be added: their privacy settings only let their contacts add them to groups.`)
    onClose()
    navigate('/' + res.groupId)
  }

  return (
    <div className='absolute inset-0 z-20 flex animate-slideIn flex-col bg-wa-surface'>
      <header className='flex h-[59px] shrink-0 items-center bg-wa-teal px-4 text-white dark:bg-wa-panel dark:text-wa-text sm:px-6 md:h-16 md:bg-wa-surface md:text-wa-strong md:dark:bg-wa-surface md:dark:text-wa-strong'>
        <div className='flex items-center gap-7'>
          <button onClick={step === 1 ? onClose : () => setStep(1)} title='Back'><IoArrowBack size={24} /></button>
          <h2 className='text-[19px] font-medium md:text-[22px] md:font-bold'>{step === 1 ? 'Add group members' : 'New group'}</h2>
        </div>
      </header>

      {step === 1 ? (
        <>
          <MemberPicker selected={members} onChange={setMembers} />
          {members.length > 0 && (
            <div className='flex shrink-0 justify-center bg-wa-panel py-5'>
              <button onClick={() => setStep(2)} className='flex h-[52px] w-[52px] items-center justify-center rounded-full bg-wa-green text-white shadow-menu transition-colors hover:bg-wa-greenDark' title='Next'>
                <IoArrowForward size={24} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className='min-h-0 flex-1 overflow-y-auto bg-wa-panel scrollbar'>
          <div className='flex justify-center py-7'>
            <GroupIconPicker value={avatar} onChange={setAvatar} size={180} />
          </div>
          <div className='bg-wa-surface px-5 py-5 shadow-sm sm:px-7'>
            <div className='flex items-end gap-2 border-b-2 border-wa-green'>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                maxLength={100}
                placeholder='Group name'
                className='w-full bg-transparent py-1.5 text-base text-wa-text outline-none placeholder:text-wa-subtle sm:text-[16px]'
                autoFocus
              />
              <span className='pb-2 text-xs text-wa-muted'>{100 - name.length}</span>
            </div>
          </div>
          <p className='px-5 py-4 text-sm text-wa-muted sm:px-7'>
            {members.length + 1} members: You, {members.map((u) => names.name(u)).join(', ')}
          </p>
          <div className='flex justify-center py-4'>
            <button onClick={create} disabled={!name.trim() || creating} className='flex h-[52px] w-[52px] items-center justify-center rounded-full bg-wa-green text-white shadow-menu transition-colors hover:bg-wa-greenDark disabled:opacity-40' title='Create group'>
              {creating ? <span className='h-5 w-5 animate-spin rounded-full border-2 border-wa-surface border-t-transparent' /> : <IoCheckmark size={26} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default NewGroup
