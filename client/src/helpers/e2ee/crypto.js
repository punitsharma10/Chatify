// Chatify end-to-end encryption: cryptographic primitives (browser WebCrypto only, no libraries).
//
//   • Each device has two P-256 key pairs: ECDH (encryption) and ECDSA (signatures).
//     Private keys are created NON-EXTRACTABLE and never leave the device.
//   • A message body is encrypted once with a fresh random AES-256-GCM key. The message header
//     (sender, device, chat, client id, time) is the GCM associated data, so it can't be swapped.
//   • That key is wrapped for every recipient device: ephemeral ECDH P-256 → HKDF-SHA-256 → AES-256-GCM.
//   • The sender's device signs header + ciphertext with ECDSA P-256 / SHA-256, so nobody — the server
//     included — can forge or alter a message without the recipient noticing.
//   • Media files are encrypted on the device (AES-256-GCM, random key) before upload; the key and a
//     SHA-256 of the ciphertext travel inside the encrypted message.

const subtle = () => window.crypto.subtle
const te = new TextEncoder()
const td = new TextDecoder()

export const VERSION = 1
const ECDH = { name : 'ECDH', namedCurve : 'P-256' }
const ECDSA = { name : 'ECDSA', namedCurve : 'P-256' }
const SIGN_ALG = { name : 'ECDSA', hash : 'SHA-256' }

export class E2EEError extends Error {
  constructor (code, message) { super(message || code); this.code = code }
}

/* ---------- encoding ---------- */

export const b64 = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s) => {
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export const randomBytes = (n) => window.crypto.getRandomValues(new Uint8Array(n))
export const randomId = () => b64(randomBytes(18)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const sha256 = async (data) => new Uint8Array(await subtle().digest('SHA-256', typeof data === 'string' ? te.encode(data) : data))

/* ---------- device keys ---------- */

export const generateDeviceKeys = async () => {
  const [ecdh, sign] = await Promise.all([
    subtle().generateKey(ECDH, false, ['deriveBits']),
    subtle().generateKey(ECDSA, false, ['sign', 'verify'])
  ])
  const [ecdhPub, signPub] = await Promise.all([
    subtle().exportKey('raw', ecdh.publicKey),
    subtle().exportKey('raw', sign.publicKey)
  ])
  return { ecdh, sign, ecdhPub : b64(ecdhPub), signPub : b64(signPub) }
}

const importedEcdh = new Map()
const importedSign = new Map()
const importEcdhPub = (pub) => {
  if (!importedEcdh.has(pub)) importedEcdh.set(pub, subtle().importKey('raw', unb64(pub), ECDH, true, []))
  return importedEcdh.get(pub)
}
const importSignPub = (pub) => {
  if (!importedSign.has(pub)) importedSign.set(pub, subtle().importKey('raw', unb64(pub), ECDSA, true, ['verify']))
  return importedSign.get(pub)
}

/* ---------- key wrapping (ECIES) ---------- */

const SALT = te.encode('chatify-e2ee-v1-salt')
const wrapInfo = (u, d, epk) => te.encode(`chatify-e2ee-v1|wrap|${u}|${d}|${epk}`)

const wrappingKey = async (sharedBits, info) => {
  const ikm = await subtle().importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey({ name : 'HKDF', hash : 'SHA-256', salt : SALT, info }, ikm, { name : 'AES-GCM', length : 256 }, false, ['encrypt', 'decrypt'])
}

// wrap a raw 32-byte message key for one device: { u, d, epk, iv, wk }
export const wrapFor = async (rawKey, u, d, ecdhPub) => {
  const eph = await subtle().generateKey(ECDH, true, ['deriveBits'])
  const epk = b64(await subtle().exportKey('raw', eph.publicKey))
  const shared = await subtle().deriveBits({ name : 'ECDH', public : await importEcdhPub(ecdhPub) }, eph.privateKey, 256)
  const info = wrapInfo(u, d, epk)
  const kek = await wrappingKey(shared, info)
  const iv = randomBytes(12)
  const wk = await subtle().encrypt({ name : 'AES-GCM', iv, additionalData : info }, kek, rawKey)
  return { u : String(u), d, epk, iv : b64(iv), wk : b64(wk) }
}

// recover the raw message key from my entry
export const unwrap = async (entry, myEcdhPrivate) => {
  const shared = await subtle().deriveBits({ name : 'ECDH', public : await importEcdhPub(entry.epk) }, myEcdhPrivate, 256)
  const info = wrapInfo(entry.u, entry.d, entry.epk)
  const kek = await wrappingKey(shared, info)
  try {
    return new Uint8Array(await subtle().decrypt({ name : 'AES-GCM', iv : unb64(entry.iv), additionalData : info }, kek, unb64(entry.wk)))
  } catch {
    throw new E2EEError('bad-key', 'This message key could not be opened')
  }
}

/* ---------- messages ---------- */

export const headerOf = (env) => JSON.stringify(['chatify-e2ee-v1', String(env.from), env.dev, String(env.to), env.cid || '', env.t])
const signedData = (env) => te.encode(`${headerOf(env)}|${env.iv}|${env.ct}`)

// encrypt `body` (any JSON) for `recipients` [{ u, d, ecdh }]; `device` = { id, sign: CryptoKeyPair }
export const seal = async (body, { from, to, cid, device }, recipients) => {
  const rawKey = randomBytes(32)
  const key = await subtle().importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
  const env = { v : VERSION, from : String(from), dev : device.id, to : String(to), cid : cid || '', t : Date.now() }
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name : 'AES-GCM', iv, additionalData : te.encode(headerOf(env)) }, key, te.encode(JSON.stringify(body)))
  env.iv = b64(iv)
  env.ct = b64(ct)
  env.sig = b64(await subtle().sign(SIGN_ALG, device.sign.privateKey, signedData(env)))
  env.keys = await Promise.all(recipients.map((r) => wrapFor(rawKey, r.u, r.d, r.ecdh)))
  return env
}

export const verify = async (env, senderSignPub) => {
  const ok = await subtle().verify(SIGN_ALG, await importSignPub(senderSignPub), unb64(env.sig), signedData(env))
  if (!ok) throw new E2EEError('bad-signature', 'This message failed its authenticity check')
}

// decrypt an envelope with my device (signature must be checked with verify() first)
export const open = async (env, me, device) => {
  const entry = (env.keys || []).find((k) => String(k.u) === String(me) && k.d === device.id)
  if (!entry) throw new E2EEError('no-key', 'This device has no key for this message')
  const rawKey = await unwrap(entry, device.ecdh.privateKey)
  const key = await subtle().importKey('raw', rawKey, 'AES-GCM', false, ['decrypt'])
  try {
    const plain = await subtle().decrypt({ name : 'AES-GCM', iv : unb64(env.iv), additionalData : te.encode(headerOf(env)) }, key, unb64(env.ct))
    return JSON.parse(td.decode(plain))
  } catch {
    throw new E2EEError('bad-ciphertext', 'This message was altered or is corrupted')
  }
}

// re-wrap my key entry of a message for another of my devices (history sync)
export const rewrap = async (entry, device, u, d, ecdhPub) => {
  const rawKey = await unwrap(entry, device.ecdh.privateKey)
  const { epk, iv, wk } = await wrapFor(rawKey, u, d, ecdhPub)
  return { epk, iv, wk }
}

/* ---------- media ---------- */

export const encryptBytes = async (data) => {
  const raw = randomBytes(32)
  const key = await subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
  const iv = randomBytes(12)
  const ct = new Uint8Array(await subtle().encrypt({ name : 'AES-GCM', iv }, key, data))
  return { ct, key : b64(raw), iv : b64(iv), sha : b64(await sha256(ct)) }
}

export const decryptBytes = async (ct, { key, iv, sha }) => {
  const bytes = new Uint8Array(ct)
  if (sha && b64(await sha256(bytes)) !== sha) throw new E2EEError('bad-media', 'This file was altered or is corrupted')
  const k = await subtle().importKey('raw', unb64(key), 'AES-GCM', false, ['decrypt'])
  try {
    return await subtle().decrypt({ name : 'AES-GCM', iv : unb64(iv) }, k, bytes)
  } catch {
    throw new E2EEError('bad-media', 'This file was altered or is corrupted')
  }
}

/* ---------- security code (WhatsApp-style safety number) ---------- */

// 30 digits that identify one person's set of device keys
const sideDigits = async (userId, devices) => {
  const keys = devices.map((d) => `${d.ecdh}.${d.sign}`).sort().join(',')
  let h = await sha256(`chatify-security-code-v1|${userId}|${keys}`)
  for (let i = 0; i < 1024; i++) h = await sha256(new Uint8Array([...h, ...te.encode(keys)]))
  let out = ''
  for (let i = 0; i < 6; i++) {
    const n = h.slice(i * 5, i * 5 + 5).reduce((acc, b) => acc * 256 + b, 0)
    out += String(n % 100000).padStart(5, '0')
  }
  return out
}

// the same 60 digits on both phones/browsers (the two halves are ordered by user id)
export const securityCode = async (a, aDevices, b, bDevices) => {
  const [da, db] = await Promise.all([sideDigits(String(a), aDevices), sideDigits(String(b), bDevices)])
  const digits = String(a) < String(b) ? da + db : db + da
  return digits.match(/.{5}/g).join(' ')
}
