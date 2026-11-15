import React from 'react'
import Dialog from './Dialog'
import { SHORTCUTS } from '../helpers/shortcuts'

const ShortcutsDialog = ({ onClose }) => (
  <Dialog title='Keyboard shortcuts' wide onClose={onClose} actions={[{ label : 'OK', onClick : onClose }]}>
    <div className='grid max-h-[60dvh] gap-x-8 gap-y-3 overflow-y-auto scrollbar sm:grid-cols-2'>
      {SHORTCUTS.map((s) => (
        <div key={s.label} className='flex items-center justify-between gap-3'>
          <span className='text-[14px] text-wa-text'>{s.label}</span>
          <span className='flex shrink-0 gap-1'>
            {s.keys.map((k) => <kbd key={k} className='rounded border border-wa-line bg-wa-panel px-1.5 py-0.5 font-sans text-[11.5px] text-wa-strong'>{k}</kbd>)}
          </span>
        </div>
      ))}
    </div>
  </Dialog>
)

export default ShortcutsDialog
