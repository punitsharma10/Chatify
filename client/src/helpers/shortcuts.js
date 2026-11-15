// WhatsApp Web-style keyboard shortcuts. Ctrl+Alt combos avoid clashing with the browser's own shortcuts.
export const SHORTCUTS = [
  { keys : ['Ctrl', 'Alt', 'N'], label : 'New chat', action : 'search:drawer' },
  { keys : ['Ctrl', 'Alt', 'Shift', 'N'], label : 'New group', action : 'newgroup:drawer' },
  { keys : ['Ctrl', 'Alt', '/'], label : 'Search chats', action : 'search:focus' },
  { keys : ['Ctrl', 'Alt', 'Shift', 'F'], label : 'Search in chat', action : 'chat:search' },
  { keys : ['Alt', '↓'], label : 'Next chat', action : 'chat:next' },
  { keys : ['Alt', '↑'], label : 'Previous chat', action : 'chat:prev' },
  { keys : ['Ctrl', 'Alt', 'P'], label : 'Profile', action : 'profile:drawer' },
  { keys : ['Ctrl', 'Alt', ','], label : 'Settings', action : 'settings:drawer' },
  { keys : ['Ctrl', 'Alt', 'S'], label : 'Status', action : 'status:drawer' },
  { keys : ['Ctrl', 'Alt', 'Shift', 'M'], label : 'Mute / unmute chat', action : 'chat:mute' },
  { keys : ['Ctrl', 'Alt', 'E'], label : 'Archive chat', action : 'chat:archive' },
  { keys : ['Ctrl', 'Alt', 'Shift', 'U'], label : 'Mark as unread', action : 'chat:unread' },
  { keys : ['Ctrl', 'Alt', 'R'], label : 'Planner (reminders & scheduled)', action : 'planner:drawer' },
  { keys : ['Ctrl', '/'], label : 'Keyboard shortcuts', action : 'shortcuts:drawer' },
  { keys : ['Esc'], label : 'Close menus, panels and dialogs', action : null },
]

// which shortcut a key event is, or null
export const matchShortcut = (e) => {
  const ctrl = e.ctrlKey || e.metaKey
  if (ctrl && e.altKey) {
    if (e.code === 'KeyN') return e.shiftKey ? 'newgroup:drawer' : 'search:drawer'
    if (e.code === 'Slash') return 'search:focus'
    if (e.code === 'KeyF' && e.shiftKey) return 'chat:search'
    if (e.code === 'KeyP' && !e.shiftKey) return 'profile:drawer'
    if (e.code === 'Comma') return 'settings:drawer'
    if (e.code === 'KeyS' && !e.shiftKey) return 'status:drawer'
    if (e.code === 'KeyR' && !e.shiftKey) return 'planner:drawer'
    if (e.code === 'KeyM' && e.shiftKey) return 'chat:mute'
    if (e.code === 'KeyE' && !e.shiftKey) return 'chat:archive'
    if (e.code === 'KeyU' && e.shiftKey) return 'chat:unread'
  }
  if (ctrl && !e.altKey && e.code === 'Slash') return 'shortcuts:drawer'
  if (e.altKey && !ctrl && !e.shiftKey && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) return e.code === 'ArrowDown' ? 'chat:next' : 'chat:prev'
  return null
}
