import { rawCall } from './rawCall'
import { handlesEvent, prepareOutgoing, decryptDeep, contextForAck, forgetChat } from './e2ee'

const KEYS_CHANGED = 'E2EE_KEYS_CHANGED'

// Emit a socket event and wait for the server's acknowledgement.
// Messages are end-to-end encrypted on the way out and decrypted on the way back (see helpers/e2ee).
// Always resolves to { ok, ...data } or { ok:false, error } (including on timeout).
export const socketCall = async (socket, event, payload, timeout = 15000) => {
  if (!handlesEvent(event)) {
    const res = await rawCall(socket, event, payload, timeout)
    if (res?.ok) await decryptDeep(res, contextForAck(event, payload))
    return res
  }
  let prepared = await prepareOutgoing(event, payload)
  if (prepared.error) return { ok : false, error : prepared.error }
  let res = await rawCall(socket, event, prepared.payload, timeout)
  // someone added or removed a device a moment ago: fetch the new keys and encrypt again once
  if (res && !res.ok && res.error === KEYS_CHANGED) {
    forgetChat(payload?.receiver)
    prepared = await prepareOutgoing(event, payload, { fresh : true })
    if (prepared.error) return { ok : false, error : prepared.error }
    res = await rawCall(socket, event, prepared.payload, timeout)
    if (res && !res.ok && res.error === KEYS_CHANGED) res = { ok : false, error : "Couldn't encrypt this message because someone's devices just changed. Please try again." }
  }
  if (res?.ok) await decryptDeep(res, contextForAck(event, payload))
  return res
}

export const newClientId = () =>
  (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
