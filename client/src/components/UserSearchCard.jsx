import React from 'react'
import Avatar from './Avatar'
import { Link } from 'react-router-dom'
import { IoPersonAddOutline } from 'react-icons/io5'
import { contactLine } from '../helpers/phone'
import { usePeopleNames } from '../helpers/contacts'

const UserSearchCard = ({ user, onClose, onAdd }) => {
  const names = usePeopleNames()
  const hint = names.hint(user)
  return (
    <div className='flex items-center pr-3 transition-colors hover:bg-wa-hover'>
      <Link to={"/" + user?._id} onClick={onClose} className='flex min-w-0 flex-1 items-center gap-3 pl-3'>
        <Avatar
          width={49}
          height={49}
          name={names.name(user)}
          userId={user?._id}
          imageUrl={user?.profile_pic}
        />
        <div className='min-w-0 flex-1 border-b border-wa-border py-3'>
          <div className='flex items-baseline gap-2'>
            <span className='truncate text-[17px] text-wa-text'>{names.name(user)}{user?.self ? ' (You)' : ''}</span>
            {hint && <span className='shrink-0 truncate text-[13px] text-wa-muted'>{hint}</span>}
          </div>
          <p className='truncate text-sm text-wa-muted'>{user?.username && <span className='text-wa-text/80'>@{user.username}{(user?.about || contactLine(user)) ? ' · ' : ''}</span>}{user?.about || contactLine(user)}</p>
        </div>
      </Link>
      {onAdd && (
        <button onClick={onAdd} className='ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-green hover:bg-wa-green/10' title='Add to contacts'>
          <IoPersonAddOutline size={20} />
        </button>
      )}
    </div>
  )
}

export default UserSearchCard;
