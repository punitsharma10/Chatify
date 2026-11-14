import React, { useEffect } from 'react'

// WhatsApp-style modal: light overlay, centered white card, teal pill buttons.
// Two actions -> side by side (last one filled). Three or more -> stacked on the right (like "Delete message?").
const Dialog = ({ title, children, onClose, actions = [], wide = false }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stacked = actions.length > 2

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-white/80 p-5 animate-[fadeIn_.15s_ease-out]' onClick={onClose}>
      <div
        role='dialog'
        aria-modal='true'
        className={`w-full animate-pop rounded-[3px] bg-white px-6 pb-5 pt-[22px] shadow-[0_17px_50px_0_rgba(11,20,26,.19),0_12px_15px_0_rgba(11,20,26,.24)] ${wide ? 'max-w-[520px]' : 'max-w-[460px]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className='mb-3 text-[20px] leading-7 text-[#3b4a54]'>{title}</h2>}
        {children && <div className='text-[14.2px] leading-5 text-wa-muted'>{children}</div>}
        {actions.length > 0 && (
          <div className={`mt-7 flex gap-2.5 ${stacked ? 'flex-col items-end' : 'flex-wrap justify-end'}`}>
            {(stacked ? [...actions].reverse() : actions).map((a, i) => {
              const filled = !stacked && (a.primary || a.danger || i === actions.length - 1) && actions.length > 1
              return (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  disabled={a.disabled}
                  className={`h-9 rounded-full px-6 text-sm font-medium transition-colors disabled:opacity-50 ${
                    filled
                      ? 'bg-wa-teal text-white shadow-sm hover:bg-[#017561]'
                      : 'border border-[#d1d7db] bg-white text-wa-teal hover:bg-wa-hover'
                  }`}
                >
                  {a.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dialog
