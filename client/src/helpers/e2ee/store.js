// IndexedDB storage for end-to-end encryption, on this device only:
//   device — this browser's key pairs per account (private keys are non-extractable CryptoKeys)
//   pins   — the security code last seen for each contact (to warn when it changes) + "verified" mark
//   plain  — decrypted text of messages seen on this device, so search and export work (like WhatsApp's local database)
const DB = 'chatify-e2ee'
let dbPromise = null

const openDb = () => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('device')) db.createObjectStore('device', { keyPath : 'userId' })
      if (!db.objectStoreNames.contains('pins')) db.createObjectStore('pins', { keyPath : 'k' })
      if (!db.objectStoreNames.contains('plain')) {
        const s = db.createObjectStore('plain', { keyPath : 'k' })
        s.createIndex('me', 'me')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

const run = async (store, mode, fn) => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const s = tx.objectStore(store)
    let out
    const r = fn(s)
    if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const getDevice = (userId) => run('device', 'readonly', (s) => s.get(String(userId)))
export const putDevice = (record) => run('device', 'readwrite', (s) => s.put(record))

export const getPin = (me, peer) => run('pins', 'readonly', (s) => s.get(`${me}:${peer}`))
export const putPin = (me, peer, value) => run('pins', 'readwrite', (s) => s.put({ k : `${me}:${peer}`, ...value }))

export const putPlain = (me, items) => run('plain', 'readwrite', (s) => {
  for (const it of items) s.put({ k : `${me}:${it.id}`, me : String(me), ...it })
})

export const allPlain = (me) => run('plain', 'readonly', (s) => s.index('me').getAll(String(me)))

// logging out removes the readable copies kept on this device (keys stay so this browser can read its messages again)
export const clearPlain = async (me) => {
  const rows = await allPlain(me).catch(() => [])
  if (!rows?.length) return
  await run('plain', 'readwrite', (s) => { for (const r of rows) s.delete(r.k) })
}
