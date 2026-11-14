import React from 'react'
import { IoArrowBack } from 'react-icons/io5'

// slide-in panel over the chat list (New chat / Profile / Starred / Settings)
const Drawer = ({ title, onClose, children, className = 'bg-white' }) => (
  <div className={`absolute inset-0 z-20 flex animate-slideIn flex-col ${className}`}>
    <header className='flex h-[59px] shrink-0 items-center bg-wa-teal px-4 text-white sm:px-6 lg:h-[108px] lg:items-end lg:pb-5'>
      <div className='flex items-center gap-7'>
        <button onClick={onClose} title='Back'>
          <IoArrowBack size={24} />
        </button>
        <h2 className='text-[19px] font-medium'>{title}</h2>
      </div>
    </header>
    <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>{children}</div>
  </div>
)

export default Drawer
