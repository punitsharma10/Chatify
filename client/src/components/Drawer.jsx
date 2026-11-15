import React from 'react'
import { IoArrowBack } from 'react-icons/io5'

// slide-in panel over the chat list (New chat / Profile / Starred / Settings)
const Drawer = ({ title, onClose, children, className = 'bg-wa-surface' }) => (
  <div className={`absolute inset-0 z-20 flex animate-slideIn flex-col ${className}`}>
    <header className='flex h-[59px] shrink-0 items-center bg-wa-teal px-4 text-white dark:bg-wa-panel dark:text-wa-text sm:px-6 md:h-16 md:bg-wa-surface md:text-wa-strong md:dark:bg-wa-surface md:dark:text-wa-strong'>
      <div className='flex items-center gap-7'>
        <button onClick={onClose} title='Back'>
          <IoArrowBack size={24} />
        </button>
        <h2 className='text-[19px] font-medium md:text-[22px] md:font-bold'>{title}</h2>
      </div>
    </header>
    <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>{children}</div>
  </div>
)

export default Drawer
