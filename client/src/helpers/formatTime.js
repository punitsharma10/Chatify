import moment from 'moment'

// time shown in the chat list: "3:45 pm", "Yesterday", "Monday", "12/10/2026"
export const formatListTime = (date) => {
  if (!date) return ''
  const m = moment(date)
  const now = moment()
  if (m.isSame(now, 'day')) return m.format('h:mm a')
  if (m.isSame(now.clone().subtract(1, 'day'), 'day')) return 'Yesterday'
  if (m.isAfter(now.clone().subtract(6, 'days').startOf('day'))) return m.format('dddd')
  return m.format('DD/MM/YYYY')
}

// date chip between messages: "Today", "Yesterday", "Monday", "12 October 2026"
export const formatDayLabel = (date) => {
  const m = moment(date)
  const now = moment()
  if (m.isSame(now, 'day')) return 'Today'
  if (m.isSame(now.clone().subtract(1, 'day'), 'day')) return 'Yesterday'
  if (m.isAfter(now.clone().subtract(6, 'days').startOf('day'))) return m.format('dddd')
  return m.format('D MMMM YYYY')
}

export const formatBubbleTime = (date) => moment(date).format('h:mm a')

// "last seen today at 9:30 pm" / "last seen yesterday at ..." / "last seen 12/10/2026 at ..."
export const formatLastSeen = (date) => {
  if (!date) return ''
  const m = moment(date)
  const now = moment()
  if (m.isSame(now, 'day')) return `last seen today at ${m.format('h:mm a')}`
  if (m.isSame(now.clone().subtract(1, 'day'), 'day')) return `last seen yesterday at ${m.format('h:mm a')}`
  return `last seen ${m.format('DD/MM/YYYY')} at ${m.format('h:mm a')}`
}

export const formatFullDate = (date) => (date ? moment(date).format('D MMM YYYY, h:mm a') : '')
