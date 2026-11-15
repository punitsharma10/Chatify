import moment from 'moment'

// preset times for "Schedule message" and "Remind me" (always in the future)
const at = (m) => m.toDate().toISOString()
export const quickTimes = (kind) => {
  const now = moment()
  const tonight = now.clone().hour(21).minute(0).second(0)
  const tomorrow = now.clone().add(1, 'day').hour(9).minute(0).second(0)
  const list = kind === 'reminder'
    ? [['In 20 minutes', now.clone().add(20, 'minutes')], ['In 1 hour', now.clone().add(1, 'hour')], ['In 3 hours', now.clone().add(3, 'hours')]]
    : [['In 1 hour', now.clone().add(1, 'hour')]]
  if (tonight.isAfter(now.clone().add(10, 'minutes'))) list.push(['Tonight, 9:00 pm', tonight])
  list.push([`Tomorrow, 9:00 am`, tomorrow])
  list.push(['Next Monday, 9:00 am', now.clone().day(8).hour(9).minute(0).second(0)])
  return list.map(([label, m]) => ({ label, value : at(m) }))
}
