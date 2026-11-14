// Emit a socket event and wait for the server's acknowledgement.
// Always resolves to { ok, ...data } or { ok:false, error } (including on timeout).
export const socketCall = (socket, event, payload, timeout = 15000) =>
  new Promise((resolve) => {
    if (!socket) return resolve({ ok : false, error : 'Not connected' })
    socket.timeout(timeout).emit(event, payload, (err, res) => {
      if (err) return resolve({ ok : false, error : 'No response from server. Check your connection.', timeout : true })
      resolve(res || { ok : false, error : 'Something went wrong' })
    })
  })

export const newClientId = () =>
  (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
