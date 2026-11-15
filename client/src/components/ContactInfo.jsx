import React, { useEffect, useState } from 'react'
import { IoClose, IoTimerOutline, IoNotificationsOffOutline, IoBan, IoTrashOutline, IoStar, IoDownloadOutline, IoPlay } from 'react-icons/io5'
import { MdBlock, MdOutlineCleaningServices } from 'react-icons/md'
import Avatar from './Avatar'
import Loading from './Loading'
import { socketCall } from '../helpers/socketCall'
import { thumbUrl, videoPoster, formatBytes, fileExtension, downloadMedia } from '../helpers/media'
import { formatLastSeen, formatListTime } from '../helpers/formatTime'
import { renderFormatted } from '../helpers/formatText'
import { formatPhone } from '../helpers/phone'
import { usePeopleNames } from '../helpers/contacts'
import { notify, notifyError } from '../helpers/toast'
import Dialog from './Dialog'
import { EncryptionRow } from './Encryption'
import { IoPersonAddOutline, IoPersonRemoveOutline, IoPencil, IoHeartOutline, IoHeartDislikeOutline, IoShareSocialOutline, IoFlagOutline } from 'react-icons/io5'

export const DISAPPEAR_OPTIONS = [
  { value : 0, label : 'Off' },
  { value : 86400, label : '24 hours' },
  { value : 604800, label : '7 days' },
  { value : 7776000, label : '90 days' },
]

// Right-hand panel: profile, shared media/docs/links, starred, chat settings and destructive actions
const ContactInfo = ({
  socket, peer, online, conversation, onClose, onOpenMedia, onJump,
  onToggleMute, onSetDisappearing, onToggleBlock, onClear, onDelete,
  favorite, onToggleFavorite, onExport, onReport
}) => {
  const status = online ? 'online' : peer.lastSeen ? formatLastSeen(peer.lastSeen) : ''
  const names = usePeopleNames()
  const saved = names.isContact(peer._id)
  const shownName = names.name(peer)
  const [nameDialog, setNameDialog] = useState(null) // text being edited
  const [removing, setRemoving] = useState(false)

  const saveContact = async () => {
    const res = await socketCall(socket, 'add-contact', { userId : peer._id, name : nameDialog })
    if (!res.ok) return notifyError(res.error)
    notify(saved ? 'Contact updated' : 'Added to your contacts')
    setNameDialog(null)
  }
  const removeContact = async () => {
    setRemoving(false)
    const res = await socketCall(socket, 'remove-contact', { userId : peer._id })
    if (!res.ok) return notifyError(res.error)
    notify('Removed from your contacts')
  }

  return (
    <div className='flex h-full flex-col bg-wa-panel'>
      <header className='flex h-[59px] shrink-0 items-center gap-4 bg-wa-panel px-4'>
        <button onClick={onClose} className='wa-icon-btn -ml-2' title='Close'><IoClose size={22} /></button>
        <h2 className='text-base text-wa-text'>Contact info</h2>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>
        <section className='flex flex-col items-center bg-wa-surface px-6 pb-6 pt-7 shadow-sm'>
          <Avatar width={160} height={160} name={shownName} imageUrl={peer.profile_pic} />
          <h3 className='mt-4 text-center text-2xl text-wa-text'>{shownName}{peer.self ? ' (You)' : ''}</h3>
          {!peer.self && !saved && <p className='mt-1 text-center text-sm text-wa-muted'>~{peer.profileName || peer.name}</p>}
          {peer.phone && (saved || peer.self) && <p className='mt-1 text-center text-[15px] text-wa-muted'>{formatPhone(peer.phone)}</p>}
          {peer.email && <p className='mt-1 text-center text-[15px] text-wa-muted'>{peer.email}</p>}
          {status && <p className='mt-1 text-center text-sm text-wa-muted'>{status}</p>}
          {!peer.self && (
            <div className='mt-4 flex flex-wrap justify-center gap-2'>
              {saved ? (
                <>
                  <button onClick={() => setNameDialog(shownName)} className='flex items-center gap-1.5 rounded-full border border-wa-border px-4 py-1.5 text-sm text-wa-teal hover:bg-wa-hover'><IoPencil size={15} /> Edit name</button>
                  <button onClick={() => setRemoving(true)} className='flex items-center gap-1.5 rounded-full border border-wa-border px-4 py-1.5 text-sm text-red-600 hover:bg-wa-hover'><IoPersonRemoveOutline size={16} /> Remove contact</button>
                </>
              ) : (
                <button onClick={() => setNameDialog(peer.profileName || peer.name || '')} className='flex items-center gap-1.5 rounded-full bg-wa-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-[#017561]'><IoPersonAddOutline size={16} /> Add to contacts</button>
              )}
            </div>
          )}
        </section>

        {peer.about && (
          <section className='mt-2.5 bg-wa-surface px-6 py-4 shadow-sm'>
            <p className='text-sm text-wa-muted'>About</p>
            <p className='mt-1 text-[15px] text-wa-text'>{peer.about}</p>
          </section>
        )}

        <SharedContent socket={socket} chatId={peer._id} refreshKey={conversation?.disappearAfter} onOpenMedia={onOpenMedia} onJump={onJump} />

        {/* settings */}
        {!peer.self && (
          <section className='mt-2.5 bg-wa-surface py-2 shadow-sm'>
            <EncryptionRow peerId={String(peer._id)} name={names.name(peer)} />
            <Row icon={<IoNotificationsOffOutline size={20} />} label='Mute notifications'>
              <Toggle on={!!conversation?.muted} onChange={onToggleMute} disabled={!conversation} />
            </Row>
            <Row icon={<IoTimerOutline size={20} />} label='Disappearing messages' sub='New messages will disappear after the selected time'>
              <select
                value={conversation?.disappearAfter || 0}
                onChange={(e) => onSetDisappearing(Number(e.target.value))}
                disabled={peer.blockedByMe}
                className='rounded-md border border-wa-border bg-wa-surface px-2 py-1 text-sm text-wa-text outline-none focus:border-wa-green'
              >
                {DISAPPEAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Row>
          </section>
        )}

        <section className='mt-2.5 bg-wa-surface pb-3 pt-2'>
          {onToggleFavorite && <ActionRow icon={favorite ? <IoHeartDislikeOutline size={20} /> : <IoHeartOutline size={20} />} label={favorite ? 'Remove from favourites' : 'Add to favourites'} onClick={onToggleFavorite} />}
          {onExport && <ActionRow icon={<IoShareSocialOutline size={20} />} label='Export chat' onClick={onExport} />}
          <ActionRow icon={<MdOutlineCleaningServices size={20} />} label='Clear chat' danger onClick={onClear} disabled={!conversation} />
          {!peer.self && (
            <ActionRow icon={peer.blockedByMe ? <MdBlock size={20} /> : <IoBan size={20} />} label={peer.blockedByMe ? `Unblock ${peer.name}` : `Block ${peer.name}`} danger={!peer.blockedByMe} onClick={onToggleBlock} />
          )}
          {onReport && !peer.self && <ActionRow icon={<IoFlagOutline size={20} />} label={`Report ${peer.name}`} danger onClick={onReport} />}
          <ActionRow icon={<IoTrashOutline size={20} />} label='Delete chat' danger onClick={onDelete} disabled={!conversation} />
        </section>
      </div>

      {nameDialog !== null && (
        <Dialog
          title={saved ? 'Edit contact' : 'Add to contacts'}
          onClose={() => setNameDialog(null)}
          actions={[{ label : 'Cancel', onClick : () => setNameDialog(null) }, { label : 'Save', primary : true, onClick : saveContact }]}
        >
          <p className='mb-3'>Save {peer.phone ? formatPhone(peer.phone) : peer.email || 'this person'} as:</p>
          <input
            value={nameDialog}
            onChange={(e) => setNameDialog(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveContact()}
            maxLength={50}
            placeholder={peer.profileName || 'Name'}
            className='wa-input'
            autoFocus
          />
          <p className='mt-2 text-xs'>Only you see this name. Leave it as is to use their profile name.</p>
        </Dialog>
      )}

      {removing && (
        <Dialog
          title={`Remove ${shownName} from your contacts?`}
          onClose={() => setRemoving(false)}
          actions={[{ label : 'Cancel', onClick : () => setRemoving(false) }, { label : 'Remove', danger : true, onClick : removeContact }]}
        >
          Your chat stays. If your privacy is set to "My contacts", they will no longer see your photo, about or last seen.
        </Dialog>
      )}
    </div>
  )
}

// Media / Docs / Links / Starred tabs of a chat (used by Contact info and Group info)
export const SharedContent = ({ socket, chatId, refreshKey, onOpenMedia, onJump }) => {
  const [tab, setTab] = useState('media')
  const [shared, setShared] = useState(null)
  const [starredMessages, setStarred] = useState(null)

  useEffect(() => {
    let alive = true
    setShared(null)
    socketCall(socket, 'get-shared', { peerId : chatId }).then((res) => {
      if (alive) setShared(res.ok ? res : { media : [], docs : [], links : [] })
    })
    return () => { alive = false }
  }, [socket, chatId, refreshKey])

  useEffect(() => {
    if (tab !== 'starred') return
    let alive = true
    socketCall(socket, 'get-starred').then((res) => {
      if (alive) setStarred(res.ok ? res.messages.filter((x) => String(x.peer?._id) === String(chatId)).map((x) => x.message) : [])
    })
    return () => { alive = false }
  }, [socket, chatId, tab])

  const links = (shared?.links || []).flatMap((m) => (m.text.match(/https?:\/\/\S+/gi) || []).map((url, i) => ({ url, m, key : `${m._id}-${i}` })))

  return (
    <section className='mt-2.5 bg-wa-surface shadow-sm'>
      <div className='flex border-b border-wa-border'>
        {[['media', 'Media'], ['docs', 'Docs'], ['links', 'Links'], ['starred', 'Starred']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-3 text-sm transition-colors ${tab === k ? 'border-b-2 border-wa-green font-medium text-wa-green' : 'text-wa-muted hover:bg-wa-hover'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className='min-h-[120px] p-3'>
        {!shared && tab !== 'starred' && <div className='py-6'><Loading /></div>}

        {shared && tab === 'media' && (
          shared.media.length ? (
            <div className='grid grid-cols-3 gap-1.5'>
              {shared.media.map((m) => (
                <button key={m._id} onClick={() => onOpenMedia(m, shared.media)} className='relative aspect-square overflow-hidden rounded-md bg-wa-raised'>
                  {m.videoUrl && m.videoUrl.startsWith('blob:')
                    ? <video src={m.videoUrl} muted playsInline preload='metadata' className='h-full w-full object-cover' />
                    : <img src={m.imageUrl ? thumbUrl(m.imageUrl, 240) : videoPoster(m.videoUrl)} alt='' loading='lazy' className='h-full w-full object-cover' />}
                  {m.videoUrl && <span className='absolute inset-0 flex items-center justify-center'><span className='rounded-full bg-black/50 p-1.5 text-white'><IoPlay size={14} /></span></span>}
                </button>
              ))}
            </div>
          ) : <Empty text='No media shared yet' />
        )}

        {shared && tab === 'docs' && (
          shared.docs.length ? shared.docs.map((m) => (
            <div key={m._id} className='flex items-center gap-3 rounded-md px-1 py-2 hover:bg-wa-hover'>
              <span className='flex h-10 w-9 shrink-0 items-center justify-center rounded bg-[#e2564b] text-[10px] font-bold text-white'>{fileExtension(m.fileName).slice(0, 4)}</span>
              <button onClick={() => onJump(m)} className='min-w-0 flex-1 text-left'>
                <p className='truncate text-sm text-wa-text'>{m.fileName}</p>
                <p className='text-xs text-wa-muted'>{formatBytes(m.fileSize)} · {formatListTime(m.createdAt)}</p>
              </button>
              <button onClick={() => downloadMedia(m.fileUrl, m.fileName)} className='wa-icon-btn' title='Download'><IoDownloadOutline size={18} /></button>
            </div>
          )) : <Empty text='No documents shared yet' />
        )}

        {shared && tab === 'links' && (
          links.length ? links.map(({ url, m, key }) => (
            <div key={key} className='border-b border-wa-border px-1 py-2.5 last:border-0'>
              <a href={url} target='_blank' rel='noopener noreferrer' className='block truncate text-sm text-wa-link hover:underline'>{url}</a>
              <button onClick={() => onJump(m)} className='mt-0.5 text-xs text-wa-muted hover:underline'>{formatListTime(m.createdAt)} · Show in chat</button>
            </div>
          )) : <Empty text='No links shared yet' />
        )}

        {tab === 'starred' && !starredMessages && <div className='py-6'><Loading /></div>}
        {tab === 'starred' && starredMessages && (
          starredMessages.length ? starredMessages.map((m) => (
            <button key={m._id} onClick={() => onJump(m)} className='block w-full border-b border-wa-border px-1 py-2.5 text-left last:border-0 hover:bg-wa-hover'>
              <p className='flex items-center gap-1 text-xs text-wa-muted'><IoStar size={11} /> {formatListTime(m.createdAt)}</p>
              <p className='mt-0.5 line-clamp-2 text-sm text-wa-text'>
                {m.text ? renderFormatted(m.text) : m.imageUrl ? '📷 Photo' : m.videoUrl ? '🎥 Video' : `📄 ${m.fileName}`}
              </p>
            </button>
          )) : <Empty text='No starred messages' />
        )}
      </div>
    </section>
  )
}

const Empty = ({ text }) => <p className='py-8 text-center text-sm text-wa-muted'>{text}</p>

export const Row = ({ icon, label, sub, children }) => (
  <div className='flex items-center gap-4 px-6 py-3'>
    <span className='text-wa-icon'>{icon}</span>
    <div className='min-w-0 flex-1'>
      <p className='text-[15px] text-wa-text'>{label}</p>
      {sub && <p className='text-xs text-wa-muted'>{sub}</p>}
    </div>
    {children}
  </div>
)

export const ActionRow = ({ icon, label, danger, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} className={`flex w-full items-center gap-4 px-6 py-3.5 text-left text-[15px] hover:bg-wa-hover disabled:opacity-40 ${danger ? 'text-red-600' : 'text-wa-text'}`}>
    {icon} {label}
  </button>
)

export const Toggle = ({ on, onChange, disabled }) => (
  <button
    type='button'
    role='switch'
    aria-checked={on}
    disabled={disabled}
    onClick={() => onChange(!on)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-wa-green' : 'bg-[#c4cbd0]'}`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-wa-surface shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
)

export default ContactInfo
