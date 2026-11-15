// Emit a socket event and wait for the server's acknowledgement, without any end-to-end encryption step.
// Always resolves to { ok, ...data } or { ok:false, error } (including on timeout).
export const rawCall = (socket, event, payload, timeout = 15000) =>
  new Promise((resolve) => {
    if (!socket) return resolve({ ok : false, error : 'Not connected' })
    socket.timeout(timeout).emit(event, payload, (err, res) => {
      if (err) return resolve({ ok : false, error : 'No response from server. Check your connection.', timeout : true })
      resolve(res || { ok : false, error : 'Something went wrong' })
    })
  })
