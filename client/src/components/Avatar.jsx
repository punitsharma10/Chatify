import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import DefaultAvatar from './DefaultAvatar';
import { HiUserGroup } from 'react-icons/hi';

const colors = ['#25d366', '#53bdeb', '#ff8f6b', '#a791ff', '#ffbc38', '#06cf9c', '#fc6d9b', '#7f66ff', '#02a698']

// same name always gets the same colour (instead of random on every render)
const colorFor = (name = '') => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

const Avatar = ({ userId, name, imageUrl, width, height, group = false }) => {
  const onlineUser = useSelector(state => state?.user?.onlineUser)
  // a photo that fails to load (deleted / bad link) falls back to initials
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [imageUrl])

  // "~Rahul" (not a saved contact) -> "Rahul"; a phone number has no initials, so it gets the default picture
  const cleanName = (name || '').replace(/^[~\s]+/, '')
  const isNumber = /^\+?[\d\s]+$/.test(cleanName)
  let avatarName = ""
  if (cleanName && !isNumber) {
    const splitName = cleanName.trim().split(" ").filter(Boolean)
    avatarName = splitName.length > 1 ? splitName[0][0] + splitName[1][0] : (splitName[0]?.[0] || "")
  }

  const isOnline = Boolean(userId) && onlineUser?.includes(userId)
  const dot = Math.max(10, Math.round(width * 0.24))

  return (
    <div className='relative shrink-0 rounded-full' style={{ width: width + "px", height: height + "px" }}>
      {imageUrl && !broken ? (
        <img
          src={imageUrl}
          alt={name}
          onError={() => setBroken(true)}
          className='h-full w-full rounded-full object-cover'
        />
      ) : group ? (
        <div className='flex h-full w-full items-center justify-center rounded-full bg-wa-raised text-white'>
          <HiUserGroup style={{ width : width * 0.58, height : height * 0.58 }} />
        </div>
      ) : avatarName ? (
        <div
          className='flex h-full w-full items-center justify-center rounded-full font-medium uppercase text-white'
          style={{ backgroundColor: colorFor(cleanName), fontSize: Math.max(12, width * 0.38) + "px" }}
        >
          {avatarName}
        </div>
      ) : (
        <div className='h-full w-full overflow-hidden rounded-full'>
          <DefaultAvatar />
        </div>
      )}

      {isOnline && (
        <span
          className='absolute bottom-0 right-0 z-10 rounded-full border-2 border-wa-surface bg-wa-badge'
          style={{ width: dot + "px", height: dot + "px" }}
          title='online'
        />
      )}
    </div>
  )
}

export default Avatar;
