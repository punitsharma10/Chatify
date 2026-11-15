import React, { useId } from 'react'

// Original marks for the three Chatify apps (not based on any other company's logo).

// Chats: a speech bubble in Chatify green
export const ChatsMark = ({ size = 28, className = '' }) => (
  <svg width={size} height={size} viewBox='0 0 32 32' className={className} aria-hidden='true'>
    <rect width='32' height='32' rx='9' fill='#00a884' />
    <path d='M16 7.5c-5 0-9 3.4-9 7.7 0 2.3 1.2 4.4 3.1 5.8l-.8 3.5 3.6-2c1 .3 2 .4 3.1.4 5 0 9-3.4 9-7.7s-4-7.7-9-7.7Z' fill='#fff' />
    <circle cx='12.2' cy='15.3' r='1.3' fill='#00a884' /><circle cx='16' cy='15.3' r='1.3' fill='#00a884' /><circle cx='19.8' cy='15.3' r='1.3' fill='#00a884' />
  </svg>
)

// Pixify: a sunset-gradient tile with a four-point sparkle over a photo frame
export const PixifyMark = ({ size = 28, className = '' }) => {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox='0 0 32 32' className={className} aria-hidden='true'>
      <defs>
        <linearGradient id={`px${id}`} x1='0' y1='32' x2='32' y2='0' gradientUnits='userSpaceOnUse'>
          <stop offset='0' stopColor='#ff9a3c' /><stop offset='.5' stopColor='#ff3d77' /><stop offset='1' stopColor='#8a3ffc' />
        </linearGradient>
      </defs>
      <rect width='32' height='32' rx='9' fill={`url(#px${id})`} />
      <rect x='7' y='9' width='18' height='15' rx='3.5' fill='none' stroke='#fff' strokeWidth='2.2' />
      <path d='m9.5 21.5 4.6-5 3.3 3.4 2.2-2.2 3 3.8' fill='none' stroke='#fff' strokeWidth='2' strokeLinejoin='round' strokeLinecap='round' />
      <path d='M23.5 4.5c.4 1.9 1.1 2.6 3 3-1.9.4-2.6 1.1-3 3-.4-1.9-1.1-2.6-3-3 1.9-.4 2.6-1.1 3-3Z' fill='#fff' />
    </svg>
  )
}

// Connectify: a blue disc with two linked rings
export const ConnectifyMark = ({ size = 28, className = '' }) => (
  <svg width={size} height={size} viewBox='0 0 32 32' className={className} aria-hidden='true'>
    <circle cx='16' cy='16' r='16' fill='#1d6ff2' />
    <circle cx='12.6' cy='16' r='5.6' fill='none' stroke='#fff' strokeWidth='2.4' />
    <circle cx='19.4' cy='16' r='5.6' fill='none' stroke='#fff' strokeWidth='2.4' opacity='.85' />
  </svg>
)

export const AppMark = ({ app, ...props }) => (app === 'pixify' ? <PixifyMark {...props} /> : app === 'connectify' ? <ConnectifyMark {...props} /> : <ChatsMark {...props} />)

// "Pixify" wordmark in a script face (like a photo app's title), in the text colour
export const PixifyWordmark = ({ className = '' }) => (
  <span className={`select-none font-[cursive] text-[26px] font-semibold leading-none tracking-tight ${className}`} style={{ fontFamily : '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive' }}>
    Pixify
  </span>
)

// "connectify" wordmark: bold, rounded, blue
export const ConnectifyWordmark = ({ className = '' }) => (
  <span className={`select-none text-[28px] font-extrabold leading-none tracking-tight text-cx-blue ${className}`} style={{ fontFamily : '"Segoe UI", Helvetica, Arial, sans-serif' }}>
    connectify
  </span>
)
