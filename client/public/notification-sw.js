/* Chatify notification service worker.
   Shows notifications on browsers that require a service worker (Android Chrome)
   and opens the right chat when a notification is clicked. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type : 'window', includeUncontrolled : true })
    const existing = windows.find((w) => new URL(w.url).origin === self.location.origin)
    if (existing) {
      await existing.focus()
      existing.postMessage({ type : 'open-chat', url })
      return
    }
    await self.clients.openWindow(url)
  })())
})
