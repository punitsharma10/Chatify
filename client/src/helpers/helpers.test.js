import { render, screen } from '@testing-library/react'
import { matchShortcut } from './shortcuts'
import { messagePreview, renderFormatted, plainPreview } from './formatText'
import { getDraft, setDraft } from './drafts'
import { quickTimes } from './quickTimes'

const key = (code, mods = {}) => ({ code, ctrlKey : false, metaKey : false, altKey : false, shiftKey : false, ...mods })

test('keyboard shortcuts', () => {
  expect(matchShortcut(key('KeyN', { ctrlKey : true, altKey : true }))).toBe('search:drawer')
  expect(matchShortcut(key('KeyN', { ctrlKey : true, altKey : true, shiftKey : true }))).toBe('newgroup:drawer')
  expect(matchShortcut(key('Slash', { ctrlKey : true }))).toBe('shortcuts:drawer')
  expect(matchShortcut(key('ArrowDown', { altKey : true }))).toBe('chat:next')
  expect(matchShortcut(key('KeyR', { ctrlKey : true, altKey : true }))).toBe('planner:drawer')
  expect(matchShortcut(key('KeyN'))).toBeNull() // plain typing is never a shortcut
})

test('previews of new message types', () => {
  expect(messagePreview({ poll : { question : 'Lunch?' } })).toBe('📊 Lunch?')
  expect(messagePreview({ contact : { name : 'Cara' } })).toBe('👤 Cara')
  expect(messagePreview({ location : { lat : 1, lng : 2 } })).toBe('📍 Location')
  expect(messagePreview({ viewOnce : 'image' })).toBe('📷 Photo (view once)')
  expect(plainPreview('*bold* and _it_')).toBe('bold and it')
})

test('mentions are highlighted, text stays escaped', () => {
  render(<p>{renderFormatted('hi @Cara <b>x</b>', '', ['@Cara'])}</p>)
  expect(screen.getByText('@Cara')).toHaveClass('text-wa-teal')
  expect(screen.getByText(/<b>x<\/b>/)).toBeInTheDocument()
})

test('drafts are saved per chat and cleared when empty', () => {
  setDraft('abc', 'hello')
  expect(getDraft('abc')).toBe('hello')
  setDraft('abc', '   ')
  expect(getDraft('abc')).toBe('')
})

test('quick times are always in the future', () => {
  for (const kind of ['reminder', 'schedule']) {
    for (const t of quickTimes(kind)) expect(new Date(t.value).getTime()).toBeGreaterThan(Date.now())
  }
})
