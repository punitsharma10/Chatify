import React from 'react'

// Author credit: "© 2026 Chatify Made with LOVE by Punit"
const MadeBy = ({ className = '' }) => (
  <p className={`text-center text-[13px] text-wa-muted ${className}`}>
    © {new Date().getFullYear()} <span className='font-semibold text-wa-text'>Chatify</span> Made with{' '}
    <span className='font-semibold tracking-wide text-[#f43f5e]'>LOVE</span> by{' '}
    <span className='font-semibold text-[#027eb5]'>Punit</span>
  </p>
)

export default MadeBy
