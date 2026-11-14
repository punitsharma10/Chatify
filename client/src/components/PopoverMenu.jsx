import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

const isPhone = () => window.matchMedia('(max-width: 639px)').matches

// Context menu anchored to a rect (desktop) or shown as a bottom sheet (phones).
// items: [{ label, icon, onClick, danger, hidden }]; header: optional node (e.g. reaction bar)
const PopoverMenu = ({ anchor, items, header, onClose, align = 'right' }) => {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const phone = isPhone()

  // latest onClose without re-subscribing listeners on every render
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    // Mobile browsers fire "resize" when the address bar collapses or the keyboard opens;
    // only a real width change (e.g. rotating the phone) should close the menu.
    const startWidth = window.innerWidth
    const onResize = () => { if (Math.abs(window.innerWidth - startWidth) > 40) closeRef.current() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // keep the menu inside the viewport
  useLayoutEffect(() => {
    if (phone || !ref.current || !anchor) return
    const { width, height } = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'right' ? anchor.right - width : anchor.left
    left = Math.min(Math.max(8, left), vw - width - 8)
    let top = anchor.bottom + 4
    if (top + height > vh - 8) top = Math.max(8, anchor.top - height - 4)
    setPos({ left, top })
  }, [anchor, phone, align])

  const visible = items.filter((i) => !i.hidden)

  return (
    <div className='fixed inset-0 z-50' onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      {phone && <div className='absolute inset-0 bg-black/30' />}
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className={phone
          ? 'absolute inset-x-0 bottom-0 animate-pop rounded-t-2xl bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-card'
          : 'absolute w-56 animate-pop rounded-md bg-white py-2 shadow-menu'}
        style={phone ? undefined : { left : pos?.left ?? -9999, top : pos?.top ?? -9999 }}
      >
        {phone && <div className='mx-auto mb-2 h-1 w-10 rounded-full bg-[#d1d7db]' />}
        {header}
        {visible.map((item) => (
          <button
            key={item.label}
            onClick={() => { onClose(); item.onClick() }}
            className={`flex w-full items-center gap-4 px-6 text-left text-[15px] hover:bg-wa-panel sm:gap-3 sm:text-[14.5px] ${phone ? 'py-3.5' : 'py-2.5'} ${item.danger ? 'text-red-600' : 'text-[#3b4a54]'}`}
          >
            {item.icon && <span className='w-5 shrink-0 text-[#54656f]'>{item.icon}</span>}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default PopoverMenu
