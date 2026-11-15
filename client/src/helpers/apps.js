// The three apps inside Chatify. One login, one account; switching only changes the screen.
export const APPS = [
  { id : 'chats', name : 'Chats', path : '/', hint : 'Messages, groups and calls' },
  { id : 'pixify', name : 'Pixify', path : '/pixify', hint : 'Photos, stories and reels' },
  { id : 'connectify', name : 'Connectify', path : '/connectify', hint : 'Friends, posts and groups' },
]

export const appName = (id) => APPS.find((a) => a.id === id)?.name || id

// which app a URL belongs to
export const appFromPath = (pathname = '/') => {
  if (pathname === '/pixify' || pathname.startsWith('/pixify/')) return 'pixify'
  if (pathname === '/connectify' || pathname.startsWith('/connectify/')) return 'connectify'
  return 'chats'
}

// the apps a story is posted to when it's created in `app` (you can tick the others in the composer)
export const defaultStoryApps = (app) => [app]

// Stories shown in Pixify / Connectify are visible to the server, so they can't be end-to-end encrypted
export const isSharedOutsideChats = (apps = []) => apps.some((a) => a !== 'chats')
