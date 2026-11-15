import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import moment from 'moment'
import { IoAlarmOutline, IoTimeOutline, IoCheckmark, IoTrashOutline, IoSend } from 'react-icons/io5'
import Drawer from './Drawer'
import Dialog from './Dialog'
import Avatar from './Avatar'
import { socketCall } from '../helpers/socketCall'
import { notify, notifyError } from '../helpers/toast'
import { usePeopleNames } from '../helpers/contacts'
import { quickTimes } from '../helpers/quickTimes'

/* ---------- picking a time ---------- */

const localInput = (iso) => moment(iso).format('YYYY-MM-DDTHH:mm')

// "Schedule message" / "Remind me": quick choices + any date and time
export const TimeDialog = ({ title, intro, kind, confirmLabel, onClose, onPick }) => {
  const options = useMemo(() => quickTimes(kind), [kind])
  const [choice, setChoice] = useState(options[0].value)
  const [custom, setCustom] = useState(localInput(moment().add(1, 'hour').toISOString()))
  const value = choice === 'custom' ? new Date(custom).toISOString() : choice
  const valid = choice !== 'custom' || (custom && new Date(custom) > new Date())
  return (
    <Dialog title={title} onClose={onClose} actions={[{ label : 'Cancel', onClick : onClose }, { label : confirmLabel, primary : true, disabled : !valid, onClick : () => onPick(value) }]}>
      {intro && <div className='mb-3 line-clamp-3 rounded-lg bg-wa-chat p-2.5 text-sm text-wa-text'>{intro}</div>}
      {options.map((o) => (
        <label key={o.label} className='flex cursor-pointer items-center justify-between gap-3 py-2 text-[15px] text-wa-text'>
          <span className='flex items-center gap-3'>
            <input type='radio' name='when' checked={choice === o.value} onChange={() => setChoice(o.value)} className='h-[18px] w-[18px] accent-[#00a884]' />
            {o.label}
          </span>
          <span className='text-xs text-wa-muted'>{moment(o.value).format('ddd D MMM, h:mm a')}</span>
        </label>
      ))}
      <label className='flex cursor-pointer items-center gap-3 py-2 text-[15px] text-wa-text'>
        <input type='radio' name='when' checked={choice === 'custom'} onChange={() => setChoice('custom')} className='h-[18px] w-[18px] accent-[#00a884]' />
        Pick date & time
      </label>
      {choice === 'custom' && (
        <input type='datetime-local' value={custom} min={localInput(new Date().toISOString())} onChange={(e) => setCustom(e.target.value)} aria-label='Date and time' className='ml-8 rounded-md border border-wa-border bg-wa-surface px-2 py-1.5 text-sm text-wa-text outline-none focus:border-wa-green' />
      )}
      {!valid && <p className='ml-8 mt-1 text-xs text-red-600'>Choose a time in the future</p>}
    </Dialog>
  )
}

/* ---------- Planner drawer: reminders + scheduled messages ---------- */

const Planner = ({ onClose, initialTab = 'reminders' }) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const conversations = useSelector((s) => s.chat.conversations)
  const names = usePeopleNames()
  const navigate = useNavigate()
  const [tab, setTab] = useState(initialTab)
  const [reminders, setReminders] = useState(null)
  const [scheduled, setScheduled] = useState(null)
  const [reschedule, setReschedule] = useState(null)

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([socketCall(socket, 'reminder-list'), socketCall(socket, 'scheduled-list')])
    setReminders(r.ok ? r.reminders : [])
    setScheduled(s.ok ? s.scheduled : [])
  }, [socket])

  useEffect(() => {
    load()
    if (!socket) return
    socket.on('reminders-changed', load)
    socket.on('reminder-due', load)
    socket.on('scheduled-changed', load)
    return () => { socket.off('reminders-changed', load); socket.off('reminder-due', load); socket.off('scheduled-changed', load) }
  }, [socket, load])

  const chatOf = (id) => conversations.find((c) => String(c.userDetails?._id) === String(id))?.userDetails
  const act = async (event, payload, message) => {
    const res = await socketCall(socket, event, payload)
    if (!res.ok) return notifyError(res.error)
    if (message) notify(message)
    load()
  }

  const due = (reminders || []).filter((r) => r.firedAt)
  const upcoming = (reminders || []).filter((r) => !r.firedAt)

  const ReminderRow = ({ r }) => {
    const chat = chatOf(r.chatId)
    return (
      <div className={`flex items-start gap-3 px-4 py-3 ${r.firedAt ? 'bg-wa-chip/60' : ''}`}>
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${r.firedAt ? 'bg-wa-green text-white' : 'bg-wa-panel text-wa-icon'}`}><IoAlarmOutline size={18} /></span>
        <button onClick={() => { navigate('/' + r.chatId, { state : { jumpTo : { _id : r.messageId, createdAt : r.messageAt } } }); onClose() }} className='min-w-0 flex-1 text-left'>
          <span className='block truncate text-[13px] font-medium text-wa-teal'>{chat ? names.name(chat) : 'Chat'}</span>
          <span className='line-clamp-2 text-[14.5px] text-wa-text'>{r.preview}</span>
          <span className='block text-xs text-wa-muted'>{r.firedAt ? `Due ${moment(r.remindAt).fromNow()}` : moment(r.remindAt).calendar()}</span>
        </button>
        <button onClick={() => act('reminder-done', { id : r._id }, 'Reminder done')} className='wa-icon-btn shrink-0' title='Done'><IoCheckmark size={20} /></button>
      </div>
    )
  }

  return (
    <Drawer title='Planner' onClose={onClose}>
      <div className='flex border-b border-wa-border'>
        {[['reminders', `Reminders${due.length ? ` (${due.length})` : ''}`], ['scheduled', 'Scheduled']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex-1 border-b-[3px] py-3 text-sm font-medium ${tab === key ? 'border-wa-green text-wa-teal' : 'border-transparent text-wa-muted'}`}>{label}</button>
        ))}
      </div>

      {tab === 'reminders' && (
        <>
          {!reminders && <Spinner />}
          {reminders && !reminders.length && (
            <Empty icon={<IoAlarmOutline size={28} />} title='No reminders' text='Right-click (or long-press) a message and choose "Remind me" to get nudged about it later.' />
          )}
          {due.length > 0 && <h4 className='px-5 pb-1 pt-4 text-[13px] font-medium uppercase text-wa-teal'>Due</h4>}
          {due.map((r) => <ReminderRow key={r._id} r={r} />)}
          {upcoming.length > 0 && <h4 className='px-5 pb-1 pt-4 text-[13px] font-medium uppercase text-wa-teal'>Upcoming</h4>}
          {upcoming.map((r) => <ReminderRow key={r._id} r={r} />)}
        </>
      )}

      {tab === 'scheduled' && (
        <>
          {!scheduled && <Spinner />}
          {scheduled && !scheduled.length && (
            <Empty icon={<IoTimeOutline size={28} />} title='No scheduled messages' text='Type a message, then right-click the send button (or use + → Schedule message) to send it later.' />
          )}
          {(scheduled || []).map((s) => {
            const chat = chatOf(s.receiver)
            return (
              <div key={s._id} className='flex items-start gap-3 px-4 py-3'>
                <Avatar width={36} height={36} name={chat ? names.name(chat) : ''} imageUrl={chat?.profile_pic} group={!!chat?.isGroup} />
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-[13px] font-medium text-wa-teal'>{chat ? names.name(chat) : 'Chat'}</p>
                  <p className='line-clamp-3 whitespace-pre-wrap break-words text-[14.5px] text-wa-text'>{s.text}</p>
                  <p className={`text-xs ${s.status === 'failed' ? 'text-red-600' : 'text-wa-muted'}`}>
                    {s.status === 'failed' ? `Not sent: ${s.error}` : `${s.silent ? '🔕 ' : ''}Sends ${moment(s.sendAt).calendar()}`}
                  </p>
                  <div className='mt-1 flex gap-3 text-[13px] font-medium'>
                    <button onClick={() => act('scheduled-update', { id : s._id, now : true }, 'Sending now')} className='flex items-center gap-1 text-wa-teal hover:underline'><IoSend size={13} /> Send now</button>
                    <button onClick={() => setReschedule(s)} className='text-wa-teal hover:underline'>Change time</button>
                  </div>
                </div>
                <button onClick={() => act('scheduled-cancel', { id : s._id }, 'Scheduled message cancelled')} className='wa-icon-btn shrink-0' title='Cancel'><IoTrashOutline size={18} /></button>
              </div>
            )
          })}
        </>
      )}

      {reschedule && (
        <TimeDialog title='Change time' kind='schedule' intro={reschedule.text} confirmLabel='Save' onClose={() => setReschedule(null)}
          onPick={(value) => { act('scheduled-update', { id : reschedule._id, sendAt : value }, 'Time changed'); setReschedule(null) }} />
      )}
    </Drawer>
  )
}

const Spinner = () => <div className='mx-auto my-8 h-6 w-6 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' />
const Empty = ({ icon, title, text }) => (
  <div className='px-8 pt-12 text-center'>
    <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-wa-panel text-wa-green'>{icon}</span>
    <p className='mt-4 text-[15px] text-wa-text'>{title}</p>
    <p className='mt-1 text-sm text-wa-muted'>{text}</p>
  </div>
)

export default Planner
