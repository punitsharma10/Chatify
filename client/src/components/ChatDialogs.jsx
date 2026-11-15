import React, { useMemo, useState } from 'react'
import { IoClose, IoSearchOutline } from 'react-icons/io5'
import Dialog from './Dialog'
import Avatar from './Avatar'
import { Toggle } from './ContactInfo'
import { usePeopleNames, useContactList } from '../helpers/contacts'

/* ---------- create poll ---------- */

const MAX_OPTIONS = 12

export const PollDialog = ({ onClose, onSend }) => {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multiple, setMultiple] = useState(true)
  const [sending, setSending] = useState(false)

  const filled = options.map((o) => o.trim()).filter(Boolean)
  const duplicate = new Set(filled.map((o) => o.toLowerCase())).size !== filled.length
  const ready = question.trim() && filled.length >= 2 && !duplicate

  const setOption = (i, value) => setOptions((prev) => {
    const next = prev.map((o, j) => (j === i ? value : o))
    // like WhatsApp: a new empty option appears once the last one is filled
    if (i === next.length - 1 && value.trim() && next.length < MAX_OPTIONS) next.push('')
    return next
  })
  const removeOption = (i) => setOptions((prev) => (prev.length > 2 ? prev.filter((_, j) => j !== i) : prev.map((o, j) => (j === i ? '' : o))))

  const send = async () => {
    if (!ready) return
    setSending(true)
    const ok = await onSend({ question : question.trim(), options : filled, multiple })
    setSending(false)
    if (ok !== false) onClose()
  }

  return (
    <Dialog
      title='Create poll'
      onClose={onClose}
      actions={[{ label : 'Cancel', onClick : onClose }, { label : sending ? 'Sending…' : 'Send', primary : true, disabled : !ready || sending, onClick : send }]}
    >
      <label className='block text-[13px] font-medium text-wa-teal' htmlFor='poll-q'>Question</label>
      <input id='poll-q' autoFocus value={question} maxLength={255} onChange={(e) => setQuestion(e.target.value)} placeholder='Ask question' className='wa-input mb-4' />
      <p className='text-[13px] font-medium text-wa-teal'>Options</p>
      <div className='max-h-[40dvh] overflow-y-auto scrollbar'>
        {options.map((o, i) => (
          <div key={i} className='flex items-center gap-2'>
            <input value={o} maxLength={100} onChange={(e) => setOption(i, e.target.value)} placeholder={i < 2 ? `Option ${i + 1}` : '+ Add'} aria-label={`Option ${i + 1}`} className='wa-input' />
            {o && <button type='button' onClick={() => removeOption(i)} className='shrink-0 text-wa-subtle hover:text-wa-icon' title='Remove option'><IoClose size={18} /></button>}
          </div>
        ))}
      </div>
      {duplicate && <p className='mt-2 text-xs text-red-600'>Options must be different.</p>}
      <div className='mt-4 flex items-center justify-between gap-4'>
        <span className='text-[15px] text-wa-text'>Allow multiple answers</span>
        <Toggle on={multiple} onChange={setMultiple} />
      </div>
    </Dialog>
  )
}

/* ---------- pick a contact to share ---------- */

export const ContactPickerDialog = ({ onClose, onPick, excludeId }) => {
  const contacts = useContactList()
  const names = usePeopleNames()
  const [query, setQuery] = useState('')

  const people = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (contacts || [])
      .filter((p) => String(p._id) !== String(excludeId))
      .filter((p) => !q || names.name(p).toLowerCase().includes(q))
  }, [contacts, query, names, excludeId])

  return (
    <Dialog title='Share contact' onClose={onClose} actions={[{ label : 'Cancel', onClick : onClose }]}>
      <div className='mb-2 flex h-9 items-center gap-3 rounded-lg bg-wa-panel px-3'>
        <IoSearchOutline size={16} className='text-wa-icon' />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Search contacts' className='w-full bg-transparent text-sm text-wa-text outline-none placeholder:text-wa-subtle' />
      </div>
      <div className='max-h-[50dvh] overflow-y-auto scrollbar'>
        {!contacts && <div className='mx-auto my-6 h-6 w-6 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' />}
        {contacts && people.length === 0 && <p className='py-6 text-center text-sm text-wa-muted'>{contacts.length ? 'No contacts found' : 'Save someone as a contact to share them.'}</p>}
        {people.map((p) => (
          <button key={p._id} onClick={() => onPick(p)} className='flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-wa-hover'>
            <Avatar width={40} height={40} name={names.name(p)} imageUrl={p.profile_pic} />
            <span className='min-w-0 flex-1'>
              <span className='block truncate text-[15px] text-wa-text'>{names.name(p)}</span>
              {p.about && <span className='block truncate text-xs text-wa-muted'>{p.about}</span>}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}

/* ---------- mute notifications for… ---------- */

export const MUTE_CHOICES = [
  { seconds : 8 * 60 * 60, label : '8 hours' },
  { seconds : 7 * 24 * 60 * 60, label : '1 week' },
  { seconds : 0, label : 'Always' },
]

export const MuteDialog = ({ name, onClose, onMute }) => {
  const [choice, setChoice] = useState(8 * 60 * 60)
  return (
    <Dialog
      title='Mute notifications'
      onClose={onClose}
      actions={[{ label : 'Cancel', onClick : onClose }, { label : 'Mute', primary : true, onClick : () => { onMute(choice); onClose() } }]}
    >
      <p className='mb-3'>Other members won't see that you muted {name ? <b className='font-medium text-wa-text'>{name}</b> : 'this chat'}. You'll still be notified if you're mentioned.</p>
      {MUTE_CHOICES.map((c) => (
        <label key={c.seconds} className='flex cursor-pointer items-center gap-4 py-2.5 text-[15px] text-wa-text'>
          <input type='radio' name='mute' checked={choice === c.seconds} onChange={() => setChoice(c.seconds)} className='h-[18px] w-[18px] accent-[#00a884]' />
          {c.label}
        </label>
      ))}
    </Dialog>
  )
}

/* ---------- report ---------- */

export const ReportDialog = ({ name, group, onClose, onReport }) => {
  const [block, setBlock] = useState(!group)
  const [exit, setExit] = useState(!!group)
  const [reason, setReason] = useState('')
  return (
    <Dialog
      title={`Report ${name}?`}
      onClose={onClose}
      actions={[{ label : 'Cancel', onClick : onClose }, { label : 'Report', danger : true, onClick : () => { onReport({ reason, block : !group && block, exit : group && exit }); onClose() } }]}
    >
      <p>The last 5 messages from this {group ? 'group' : 'contact'} will be included in the report. {group ? 'No one in the group' : 'This contact'} will be notified.</p>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} placeholder='Tell us what happened (optional)' className='mt-3 w-full resize-none rounded-md border border-wa-border bg-wa-surface p-2 text-sm text-wa-text outline-none focus:border-wa-green' />
      <label className='mt-3 flex cursor-pointer items-center gap-3 text-[15px] text-wa-text'>
        {group
          ? <><input type='checkbox' checked={exit} onChange={(e) => setExit(e.target.checked)} className='h-4 w-4 accent-[#00a884]' /> Exit group</>
          : <><input type='checkbox' checked={block} onChange={(e) => setBlock(e.target.checked)} className='h-4 w-4 accent-[#00a884]' /> Block contact</>}
      </label>
    </Dialog>
  )
}

/* ---------- @mention suggestions above the composer ---------- */

export const MentionList = ({ people, onPick }) => (
  <div className='absolute bottom-full left-2 right-2 z-30 mb-1 max-h-60 overflow-y-auto rounded-lg bg-wa-surface py-1 shadow-menu scrollbar sm:left-14 sm:right-auto sm:w-80'>
    {people.map((p, i) => (
      <button
        key={p._id}
        type='button'
        onMouseDown={(e) => { e.preventDefault(); onPick(p) }}
        className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-wa-hover ${p.active ? 'bg-wa-hover' : ''}`}
        data-index={i}
      >
        <Avatar width={32} height={32} name={p.label} imageUrl={p.profile_pic} />
        <span className='min-w-0 flex-1 truncate text-sm text-wa-text'>{p.label}</span>
      </button>
    ))}
  </div>
)

