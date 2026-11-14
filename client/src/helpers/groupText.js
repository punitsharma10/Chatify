// Text for the grey notices inside group chats ("Alice added Bob and Carol"), WhatsApp wording.
// Names come from the notice itself (a snapshot), so they still read right after people leave.

const DISAPPEAR_LABELS = { 86400 : '24 hours', 604800 : '7 days', 7776000 : '90 days' }

const joinNames = (names) => {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export const systemText = (msg, myId) => {
  const s = msg?.system
  if (!s) return ''
  const me = String(myId)
  const actor = String(s.actor?.id) === me ? 'You' : (s.actor?.name || 'Someone')
  const targets = joinNames((s.targets || []).map((t) => (String(t.id) === me ? 'you' : t.name)))

  switch (s.action) {
    case 'create': return `${actor} created group "${s.value}"`
    case 'add': return `${actor} added ${targets}`
    case 'remove': return `${actor} removed ${targets}`
    case 'leave': return `${actor} left`
    case 'subject': return `${actor} changed the group name to "${s.value}"`
    case 'description': return s.value === 'removed' ? `${actor} deleted the group description` : `${actor} changed the group description`
    case 'icon': return s.value === 'removed' ? `${actor} deleted this group's icon` : `${actor} changed this group's icon`
    case 'disappear': {
      const label = DISAPPEAR_LABELS[Number(s.value)]
      return label
        ? `${actor} turned on disappearing messages. New messages will disappear from this chat ${label} after they're sent.`
        : `${actor} turned off disappearing messages.`
    }
    case 'settings': {
      const [key, value] = String(s.value || '').split(':')
      const who = value === 'admins' ? 'only admins' : 'all members'
      if (key === 'sendMessages') return `${actor} changed this group's settings to allow ${who} to send messages to this group`
      if (key === 'editInfo') return `${actor} changed this group's settings to allow ${who} to edit this group's info`
      return `${actor} changed this group's settings`
    }
    default: return `${actor} updated the group`
  }
}

// WhatsApp-style name colours for group members (the same person always gets the same colour)
const NAME_COLORS = ['#e542a3', '#1f7aec', '#fc9775', '#6bcbef', '#35cd96', '#ba5a0a', '#a62c71', '#7f66ff', '#029d00', '#d3396d', '#00a5f4', '#ff7f00']
export const nameColor = (id = '') => {
  let h = 0
  const str = String(id)
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}
