import React from 'react'
import Avatar from './Avatar'
import { Link } from 'react-router-dom'
import { contactLine } from '../helpers/phone'

const UserSearchCard = ({ user, onClose }) => {
  return (
    <Link to={"/" + user?._id} onClick={onClose} className='flex items-center gap-3 pl-3 pr-4 transition-colors hover:bg-wa-hover'>
      <Avatar
        width={49}
        height={49}
        name={user?.name}
        userId={user?._id}
        imageUrl={user?.profile_pic}
      />
      <div className='min-w-0 flex-1 border-b border-wa-border py-3'>
        <div className='truncate text-[17px] text-wa-text'>{user?.name}</div>
        <p className='truncate text-sm text-wa-muted'>{contactLine(user)}</p>
      </div>
    </Link>
  )
}

export default UserSearchCard;
