import React, { useEffect, useState } from 'react'
import { IoLockClosed, IoLockOpenOutline, IoShieldCheckmarkOutline, IoClose } from 'react-icons/io5'
import Dialog from './Dialog'
import { securityCodeWith, markVerified, chatSecurity } from '../helpers/e2ee'
import { notify } from '../helpers/toast'

// yellow notice at the top of a chat, like WhatsApp
export const EncryptionNotice = ({ security, name, group, onOpen }) => {
  if (security.encrypted) {
    return (
      <button onClick={onOpen} className='mx-auto mb-3 mt-1 flex max-w-md items-start gap-2 rounded-lg bg-[#ffeecd] px-3 py-1.5 text-left text-[12.5px] leading-[18px] text-[#54656f] shadow-bubble dark:bg-[#182229] dark:text-[#ffd279]'>
        <IoLockClosed size={12} className='mt-[3px] shrink-0' />
        <span>Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. Click to learn more.</span>
      </button>
    )
  }
  if (!security.supported) {
    return (
      <div className='mx-auto mb-3 mt-1 flex max-w-md items-start gap-2 rounded-lg bg-wa-notice px-3 py-1.5 text-[12.5px] text-wa-icon shadow-bubble'>
        <IoLockOpenOutline size={13} className='mt-[3px] shrink-0' />
        <span>This browser can't use end-to-end encryption, so messages you send from it aren't encrypted.</span>
      </div>
    )
  }
  return (
    <button onClick={onOpen} className='mx-auto mb-3 mt-1 flex max-w-md items-start gap-2 rounded-lg bg-wa-notice px-3 py-1.5 text-left text-[12.5px] text-wa-icon shadow-bubble'>
      <IoLockOpenOutline size={13} className='mt-[3px] shrink-0' />
      <span>{group
        ? "Messages in this group aren't end-to-end encrypted yet because some members haven't opened the latest Chatify. They'll be encrypted automatically once everyone has."
        : `Messages to ${name || 'this contact'} aren't end-to-end encrypted yet because they haven't opened the latest Chatify. They'll be encrypted automatically once they do.`}</span>
    </button>
  )
}

export const CodeChangedNotice = ({ name, onOpen, onDismiss }) => (
  <div className='mx-auto mb-3 flex max-w-md items-start gap-2 rounded-lg bg-wa-notice px-3 py-1.5 text-[12.5px] text-wa-icon shadow-bubble'>
    <IoShieldCheckmarkOutline size={14} className='mt-[2px] shrink-0' />
    <button onClick={onOpen} className='flex-1 text-left'>Your security code with {name} changed, probably because they signed in on a new device. Click to verify it.</button>
    <button onClick={onDismiss} title='Dismiss' className='shrink-0 rounded-full p-0.5 hover:bg-black/10'><IoClose size={14} /></button>
  </div>
)

// "Encryption" row in Contact info / Group info
export const EncryptionRow = ({ peerId, name, group }) => {
  const [security, setSecurity] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    chatSecurity(peerId, { isGroup : group }).then((s) => live && setSecurity(s)).catch(() => {})
    return () => { live = false }
  }, [peerId, group, open])
  if (!security) return null
  const sub = security.encrypted
    ? (group ? 'Messages are end-to-end encrypted.' : `Messages are end-to-end encrypted. Click to verify.${security.verified ? ' ✓ Verified' : ''}`)
    : 'Not end-to-end encrypted yet.'
  return (
    <>
      <button onClick={() => setOpen(true)} className='flex w-full items-center gap-4 px-6 py-3 text-left hover:bg-wa-hover'>
        <span className='text-wa-icon'>{security.encrypted ? <IoLockClosed size={20} /> : <IoLockOpenOutline size={20} />}</span>
        <span className='min-w-0 flex-1'>
          <span className='block text-[15px] text-wa-text'>Encryption</span>
          <span className='block text-xs text-wa-muted'>{sub}</span>
        </span>
      </button>
      {open && <SecurityDialog peerId={peerId} name={name} group={group} security={security} onClose={() => setOpen(false)} />}
    </>
  )
}

const SecurityDialog = ({ peerId, name, group, security, onClose }) => {
  const [code, setCode] = useState(group ? '' : null)
  useEffect(() => {
    if (group || !security.encrypted) return
    securityCodeWith(peerId).then(setCode).catch(() => setCode(''))
  }, [peerId, group, security.encrypted])
  const verify = async () => {
    await markVerified(peerId, !security.verified)
    notify(security.verified ? 'Marked as not verified' : `${name} marked as verified`)
    onClose()
  }
  const actions = [{ label : 'Close', onClick : onClose }]
  if (!group && security.encrypted && code) actions.unshift({ label : security.verified ? 'Clear verification' : 'Mark as verified', onClick : verify })
  return (
    <Dialog title={group || !security.encrypted ? 'Encryption' : 'Verify security code'} onClose={onClose} actions={actions}>
      {!security.encrypted && (
        <p>{group
          ? "This group isn't end-to-end encrypted yet because some members haven't opened the latest Chatify. Messages will be encrypted automatically once everyone has."
          : `Messages with ${name} aren't end-to-end encrypted yet because they haven't opened the latest Chatify. They'll be encrypted automatically once they do.`}</p>
      )}
      {security.encrypted && group && (
        <p>Messages and calls in this group are end-to-end encrypted. They stay between the members of this group: not even Chatify can read or listen to them.</p>
      )}
      {security.encrypted && !group && (
        <>
          <p className='mb-3'>Messages and calls with {name} are end-to-end encrypted. To make sure nobody is in between, compare this code with the one on {name}'s screen. If they match, your chat is secure.</p>
          <div className='rounded-lg bg-wa-panel px-4 py-3 text-center font-mono text-[15px] leading-7 tracking-wide text-wa-strong' aria-label='Security code'>
            {code === null ? 'Calculating…' : code ? code.split(' ').reduce((rows, g, i) => { if (i % 4 === 0) rows.push([]); rows[rows.length - 1].push(g); return rows }, []).map((r, i) => <div key={i}>{r.join('  ')}</div>) : "Couldn't calculate the code"}
          </div>
          <p className='mt-3 text-xs text-wa-muted'>The code changes when either of you signs in on a new browser or device.{security.verified ? ' You marked this code as verified.' : ''}</p>
        </>
      )}
    </Dialog>
  )
}

// export lines for encrypted chats, written on the device after decryption
export const formatExportItems = (items) => items.map((it) => {
  if (!it.e2ee) return `${it.head}: ${it.body}`
  let body
  if (it.e2eeError) body = '<Encrypted message this device could not open>'
  else if (it.viewOnce) body = '<View once media omitted>'
  else if (it.poll) body = `POLL: ${it.poll.question}\n${(it.poll.options || []).map((o) => `OPTION: ${o}`).join('\n')}`
  else if (it.contact) body = `Contact card: ${it.contact.name}${it.contact.phone ? ` (${it.contact.phone})` : ''}`
  else if (it.location) body = `Location: https://www.openstreetmap.org/?mlat=${it.location.lat}&mlon=${it.location.lng}`
  else {
    const k = it.e2eeKind
    const media = k === 'image' ? '<Photo omitted>' : k === 'video' ? '<Video omitted>' : k === 'audio' ? '<Voice message omitted>' : k === 'sticker' ? '<Sticker omitted>' : k === 'file' ? `<Document: ${it.fileName || 'Document'}>` : ''
    body = [media, it.text].filter(Boolean).join(' ')
  }
  if (it.edited) body += ' <This message was edited>'
  return `${it.head}: ${body}`
}).join('\n')
