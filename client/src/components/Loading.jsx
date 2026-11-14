import React from 'react'

const Loading = () => {
  return (
    <div className='flex justify-center' role="status">
      <span className='h-8 w-8 animate-spin rounded-full border-[3px] border-wa-green/25 border-t-wa-green' />
      <span className="sr-only">Loading...</span>
    </div>
  )
}

export default Loading;
