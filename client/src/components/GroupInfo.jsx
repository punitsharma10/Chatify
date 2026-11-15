import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { IoClose, IoTimerOutline, IoNotificationsOffOutline, IoTrashOutline, IoExitOutline, IoPencil, IoCheckmark, IoSettingsOutline, IoChevronForward, IoHeartOutline, IoHeartDislikeOutline, IoShareSocialOutline, IoFlagOutline } from 'react-icons/io5'
import { MdOutlineCleaningServices, MdOutlineGroupAdd } from 'react-icons/md'
import Avatar from './Avatar'
import Dialog from './Dialog'
import PopoverMenu from './PopoverMenu'
import { SharedContent, DISAPPEAR_OPTIONS, Row, ActionRow, Toggle } from './ContactInfo'
import { MemberPicker, GroupIconPicker } from './NewGroup'
import { EncryptionRow } from './Encryption'
import { socketCall } from '../helpers/socketCall'
import { notify, notifyError } from '../helpers/toast'
import { formatFullDate } from '../helpers/formatTime'
import { renderFormatted } from '../helpers/formatText'
import { usePeopleNames } from '../helpers/contacts'

const SHOW_MEMBERS = 10

// Right-hand panel for a group: icon, name, description, media, settings, members and admin tools
const GroupInfo = ({
  socket, group, conversation, onClose, onOpenMedia, onJump, onToggleMute, onSetDisappearing,
  onClear, onExit, onDelete, onMessageMember,
  favorite, onToggleFavorite, onExport, onReport
}) => {
  const me = useSelector((s) => s.user._id)
  const onlineUser = useSelector((s) => s.user.onlineUser)
  const names = usePeopleNames()
  const [editing, setEditing] = useState(null) // 'name' | 'description'
  const [draft, setDraft] = useState('')
  const [memberMenu, setMemberMenu] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [adding, setAdding] = useState(null) // selected people while the "Add members" dialog is open
  const [showAll, setShowAll] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const canEdit = group.isMember && (group.settings.editInfo === 'all' || group.isAdmin)
  const canAdd = group.isMember && (group.settings.addMembers === 'all' || group.isAdmin)
  const members = group.members || []
  const creatorPerson = group.people?.[String(group.createdBy)]
  const creator = creatorPerson ? names.name({ _id : group.createdBy, ...creatorPerson }) : ''

  useEffect(() => { if (!group.isMember) { setEditing(null); setSettingsOpen(false) } }, [group.isMember])

  const run = async (event, payload, done) => {
    const res = await socketCall(socket, event, { groupId : group._id, ...payload })
    if (!res.ok) { notifyError(res.error); return false }
    if (done) notify(done)
    return true
  }

  const startEdit = (field) => { setEditing(field); setDraft(field === 'name' ? group.name : group.description || '') }
  const saveEdit = async () => {
    const ok = await run('group-update', { [editing] : draft })
    if (ok) setEditing(null)
  }

  const addMembers = async () => {
    const res = await socketCall(socket, 'group-add-members', { groupId : group._id, userIds : adding.map((u) => u._id) })
    if (!res.ok) return notifyError(res.error)
    notify(res.added > 1 ? `${res.added} people added` : 'Added to the group')
    if (res.skipped?.length) notifyError(`${res.skipped.join(', ')} couldn't be added: their privacy settings only let their contacts add them to groups.`)
    setAdding(null)
  }

  const memberItems = (m) => {
    const n = names.name(m)
    return [
      { label : `Message ${n}`, onClick : () => onMessageMember(m._id) },
      { label : 'Add to contacts', hidden : names.isContact(m._id), onClick : async () => { const r = await socketCall(socket, 'add-contact', { userId : m._id }); r.ok ? notify('Added to your contacts') : notifyError(r.error) } },
      { label : 'Make group admin', hidden : !group.isAdmin || m.role === 'admin', onClick : () => run('group-set-admin', { userId : m._id, admin : true }, `${n} is now an admin`) },
      { label : 'Dismiss as admin', hidden : !group.isAdmin || m.role !== 'admin' || String(m._id) === String(group.createdBy), onClick : () => run('group-set-admin', { userId : m._id, admin : false }, `${n} is no longer an admin`) },
      {
        label : `Remove ${n}`, danger : true, hidden : !group.isAdmin || String(m._id) === String(group.createdBy),
        onClick : () => setConfirm({
          title : `Remove ${n} from "${group.name}" group?`,
          label : 'Remove',
          run : () => run('group-remove-member', { userId : m._id }, `${n} removed`)
        })
      },
    ]
  }

  const setSetting = (key, value) => run('group-settings', { settings : { [key] : value } })

  const visibleMembers = showAll ? members : members.slice(0, SHOW_MEMBERS)

  return (
    <div className='flex h-full flex-col bg-wa-panel'>
      <header className='flex h-[59px] shrink-0 items-center gap-4 bg-wa-panel px-4'>
        <button onClick={onClose} className='wa-icon-btn -ml-2' title='Close'><IoClose size={22} /></button>
        <h2 className='text-base text-wa-text'>Group info</h2>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto scrollbar'>
        {/* icon, name, member count */}
        <section className='flex flex-col items-center bg-wa-surface px-6 pb-6 pt-7 shadow-sm'>
          <GroupIconPicker value={group.avatar} size={160} disabled={!canEdit} onChange={(url) => run('group-update', { avatar : url }, 'Group icon updated')} />
          {canEdit && group.avatar && (
            <button onClick={() => run('group-update', { avatar : '' }, 'Group icon removed')} className='mt-2 text-xs text-wa-muted hover:text-red-600 hover:underline'>Remove icon</button>
          )}
          {editing === 'name' ? (
            <EditLine value={draft} onChange={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} max={100} />
          ) : (
            <div className='mt-4 flex max-w-full items-center gap-2'>
              <h3 className='truncate text-center text-2xl text-wa-text'>{group.name}</h3>
              {canEdit && <button onClick={() => startEdit('name')} className='shrink-0 text-wa-subtle hover:text-wa-text' title='Edit group name'><IoPencil size={18} /></button>}
            </div>
          )}
          <p className='mt-1 text-center text-[15px] text-wa-muted'>Group · {members.length} member{members.length === 1 ? '' : 's'}</p>
        </section>

        {!group.isMember && (
          <p className='mt-2.5 bg-[#fff3c4] px-6 py-3 text-center text-sm text-wa-icon shadow-sm'>You're no longer a member of this group.</p>
        )}

        {/* description */}
        <section className='mt-2.5 bg-wa-surface px-6 py-4 shadow-sm'>
          {editing === 'description' ? (
            <EditLine value={draft} onChange={setDraft} onSave={saveEdit} onCancel={() => setEditing(null)} max={512} multiline placeholder='Add group description' />
          ) : group.description ? (
            <div className='flex items-start gap-2'>
              <p className='min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px] text-wa-text'>{renderFormatted(group.description)}</p>
              {canEdit && <button onClick={() => startEdit('description')} className='shrink-0 text-wa-subtle hover:text-wa-text' title='Edit description'><IoPencil size={17} /></button>}
            </div>
          ) : canEdit ? (
            <button onClick={() => startEdit('description')} className='text-[15px] text-wa-green hover:underline'>Add group description</button>
          ) : (
            <p className='text-[15px] text-wa-muted'>No description</p>
          )}
          <p className='mt-2 text-xs text-wa-muted'>Created by {String(group.createdBy) === String(me) ? 'you' : creator || 'someone'}, {formatFullDate(group.createdAt)}</p>
        </section>

        <SharedContent socket={socket} chatId={group._id} refreshKey={conversation?.disappearAfter} onOpenMedia={onOpenMedia} onJump={onJump} />

        {/* chat settings */}
        <section className='mt-2.5 bg-wa-surface py-2 shadow-sm'>
          {group.isMember && <EncryptionRow peerId={String(group._id)} name={group.name} group />}
          <Row icon={<IoNotificationsOffOutline size={20} />} label='Mute notifications'>
            <Toggle on={!!conversation?.muted} onChange={onToggleMute} />
          </Row>
          <Row icon={<IoTimerOutline size={20} />} label='Disappearing messages' sub={canEdit ? 'New messages will disappear after the selected time' : 'Only admins can change this'}>
            <select
              value={conversation?.disappearAfter || 0}
              onChange={(e) => onSetDisappearing(Number(e.target.value))}
              disabled={!canEdit}
              className='rounded-md border border-wa-border bg-wa-surface px-2 py-1 text-sm text-wa-text outline-none focus:border-wa-green disabled:opacity-60'
            >
              {DISAPPEAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          {group.isAdmin && (
            <>
              <button onClick={() => setSettingsOpen((o) => !o)} className='flex w-full items-center gap-4 px-6 py-3 text-left hover:bg-wa-hover'>
                <span className='text-wa-icon'><IoSettingsOutline size={20} /></span>
                <span className='min-w-0 flex-1 text-[15px] text-wa-text'>Group settings</span>
                <IoChevronForward size={18} className={`text-wa-subtle transition-transform ${settingsOpen ? 'rotate-90' : ''}`} />
              </button>
              {settingsOpen && (
                <div className='border-t border-wa-border px-6 pb-2 pt-1'>
                  <SettingRow label='Edit group info' sub='Name, icon, description, disappearing messages and pinned messages' value={group.settings.editInfo} onChange={(v) => setSetting('editInfo', v)} />
                  <SettingRow label='Send messages' value={group.settings.sendMessages} onChange={(v) => setSetting('sendMessages', v)} />
                  <SettingRow label='Add other members' value={group.settings.addMembers} onChange={(v) => setSetting('addMembers', v)} />
                </div>
              )}
            </>
          )}
        </section>

        {/* members */}
        <section className='mt-2.5 bg-wa-surface pb-2 shadow-sm'>
          <p className='px-6 pb-2 pt-4 text-sm text-wa-muted'>{members.length} member{members.length === 1 ? '' : 's'}</p>
          {canAdd && (
            <button onClick={() => setAdding([])} className='flex w-full items-center gap-4 px-6 py-2.5 text-left hover:bg-wa-hover'>
              <span className='flex h-10 w-10 items-center justify-center rounded-full bg-wa-green text-white'><MdOutlineGroupAdd size={22} /></span>
              <span className='text-[16px] text-wa-text'>Add member</span>
            </button>
          )}
          {visibleMembers.map((m) => {
            const isMe = String(m._id) === String(me)
            const hint = isMe ? '' : names.hint(m)
            return (
              <button
                key={m._id}
                disabled={isMe}
                onClick={(e) => setMemberMenu({ member : m, anchor : e.currentTarget.getBoundingClientRect() })}
                className='flex w-full items-center gap-4 px-6 py-2.5 text-left hover:bg-wa-hover disabled:hover:bg-transparent'
              >
                <Avatar width={40} height={40} name={names.name(m)} imageUrl={m.profile_pic} userId={onlineUser.includes(String(m._id)) ? String(m._id) : undefined} />
                <span className='min-w-0 flex-1'>
                  <span className='flex items-baseline gap-2'>
                    <span className='truncate text-[16px] text-wa-text'>{isMe ? 'You' : names.name(m)}</span>
                    {hint && <span className='shrink-0 truncate text-[13px] text-wa-muted'>{hint}</span>}
                  </span>
                  <span className='block truncate text-[13px] text-wa-muted'>{m.about}</span>
                </span>
                {m.role === 'admin' && <span className='shrink-0 rounded bg-wa-chip px-1.5 py-0.5 text-[11px] text-[#008069]'>Group admin</span>}
              </button>
            )
          })}
          {members.length > SHOW_MEMBERS && (
            <button onClick={() => setShowAll((s) => !s)} className='w-full px-6 py-3 text-left text-sm font-medium text-wa-green hover:bg-wa-hover'>
              {showAll ? 'Show less' : `View all (${members.length - SHOW_MEMBERS} more)`}
            </button>
          )}
        </section>

        <section className='mt-2.5 bg-wa-surface pb-3 pt-2'>
          {onToggleFavorite && <ActionRow icon={favorite ? <IoHeartDislikeOutline size={20} /> : <IoHeartOutline size={20} />} label={favorite ? 'Remove from favourites' : 'Add to favourites'} onClick={onToggleFavorite} />}
          {onExport && <ActionRow icon={<IoShareSocialOutline size={20} />} label='Export chat' onClick={onExport} />}
          <ActionRow icon={<MdOutlineCleaningServices size={20} />} label='Clear chat' danger onClick={onClear} />
          {group.isMember
            ? <ActionRow icon={<IoExitOutline size={20} />} label='Exit group' danger onClick={onExit} />
            : <ActionRow icon={<IoTrashOutline size={20} />} label='Delete group' danger onClick={onDelete} />}
          {onReport && <ActionRow icon={<IoFlagOutline size={20} />} label='Report group' danger onClick={onReport} />}
        </section>
      </div>

      {memberMenu && <PopoverMenu anchor={memberMenu.anchor} items={memberItems(memberMenu.member)} onClose={() => setMemberMenu(null)} />}

      {confirm && (
        <Dialog
          title={confirm.title}
          onClose={() => setConfirm(null)}
          actions={[{ label : 'Cancel', onClick : () => setConfirm(null) }, { label : confirm.label, danger : true, onClick : () => { confirm.run(); setConfirm(null) } }]}
        />
      )}

      {adding && (
        <Dialog title='Add member' onClose={() => setAdding(null)} wide>
          <div className='-mx-6 flex h-[min(60dvh,520px)] flex-col'>
            <MemberPicker
              selected={adding}
              onChange={setAdding}
              exclude={members.map((m) => m._id)}
              max={Math.max(0, (group.maxMembers || 256) - members.length)}
            />
          </div>
          <div className='-mx-6 -mb-5 flex items-center gap-3 bg-wa-panel px-6 py-3'>
            <p className='min-w-0 flex-1 truncate text-sm text-wa-text'>
              {adding.length ? adding.map((u) => names.name(u)).join(', ') : <span className='text-wa-muted'>Select people to add</span>}
            </p>
            <button onClick={() => setAdding(null)} className='h-9 rounded-full border border-wa-line bg-wa-surface px-5 text-sm font-medium text-wa-teal hover:bg-wa-hover'>Cancel</button>
            <button onClick={addMembers} disabled={!adding.length} className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-green text-white shadow-menu hover:bg-wa-greenDark disabled:opacity-40' title='Add'>
              <IoCheckmark size={24} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

const EditLine = ({ value, onChange, onSave, onCancel, max, multiline = false, placeholder }) => {
  const Field = multiline ? 'textarea' : 'input'
  return (
    <div className='mt-4 w-full'>
      <div className='flex items-end gap-2 border-b-2 border-wa-green'>
        <Field
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); onSave() }
            if (e.key === 'Escape') onCancel()
          }}
          maxLength={max}
          rows={multiline ? 3 : undefined}
          placeholder={placeholder}
          className='w-full resize-none bg-transparent py-1.5 text-base text-wa-text outline-none placeholder:text-wa-subtle'
          autoFocus
        />
        <span className='pb-2 text-xs text-wa-muted'>{max - value.length}</span>
        <button onClick={onSave} className='pb-1.5 text-wa-green' title='Save'><IoCheckmark size={22} /></button>
        <button onClick={onCancel} className='pb-1.5 text-wa-subtle' title='Cancel'><IoClose size={20} /></button>
      </div>
    </div>
  )
}

const SettingRow = ({ label, sub, value, onChange }) => (
  <div className='flex items-center gap-3 py-2.5'>
    <div className='min-w-0 flex-1'>
      <p className='text-[14.5px] text-wa-text'>{label}</p>
      {sub && <p className='text-xs text-wa-muted'>{sub}</p>}
    </div>
    <select value={value} onChange={(e) => onChange(e.target.value)} className='rounded-md border border-wa-border bg-wa-surface px-2 py-1 text-sm text-wa-text outline-none focus:border-wa-green'>
      <option value='all'>All members</option>
      <option value='admins'>Only admins</option>
    </select>
  </div>
)

export default GroupInfo
