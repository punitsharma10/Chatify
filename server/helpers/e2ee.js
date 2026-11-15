// End-to-end encryption, server side.
//
// The server never sees plaintext or private keys. It only:
//   • keeps a directory of each user's device PUBLIC keys (ECDH for encryption, ECDSA for signatures),
//   • checks the SHAPE of encrypted envelopes (sizes, who the wrapped keys are for),
//   • hands every viewer only the wrapped keys meant for their own devices.
//
// Envelope (v1), created on the sender's device:
//   { v:1, from, dev, to, cid, t, iv, ct, sig, keys:[{ u, d, epk, iv, wk }] }
//   from/dev = sender user + device, to = person or group it was sent to, cid = client id, t = client time,
//   iv/ct    = AES-256-GCM encrypted JSON body (authenticated with the header as AAD),
//   sig      = ECDSA P-256 signature of the header + ciphertext by the sender's device,
//   keys     = the message key wrapped (ECDH P-256 ephemeral-static + HKDF-SHA256 + AES-GCM) for each device.

const B64 = /^[A-Za-z0-9+/_=-]+$/
const ID = /^[a-f0-9]{24}$/
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/

const MAX_CT = 160 * 1024          // encrypted body (text up to 4096 chars + media / poll / link preview details)
const MAX_KEYS = 2048              // wrapped keys per message (256 members × several devices)
const MAX_DEVICES = 10             // active devices per account
const KINDS = ['text', 'link', 'image', 'video', 'file', 'audio', 'sticker', 'poll', 'contact', 'location', 'status', 'preview']

const str = (v, max, re = B64) => typeof v === 'string' && v.length > 0 && v.length <= max && re.test(v)

const validKey = (k) => k && typeof k === 'object'
    && ID.test(String(k.u)) && str(k.d, 64, DEVICE_ID) && str(k.epk, 200) && str(k.iv, 32) && str(k.wk, 200)

// structural check of an envelope sent by `me`; returns a clean copy or null
const cleanEnvelope = (env, me) => {
    if (!env || typeof env !== 'object' || env.v !== 1) return null
    if (String(env.from) !== String(me)) return null
    if (!str(env.dev, 64, DEVICE_ID) || !str(env.iv, 32) || !str(env.ct, MAX_CT) || !str(env.sig, 200)) return null
    if (typeof env.to !== 'string' || !ID.test(env.to)) return null
    if (env.cid !== undefined && (typeof env.cid !== 'string' || env.cid.length > 64)) return null
    if (!Number.isFinite(env.t)) return null
    if (!Array.isArray(env.keys) || !env.keys.length || env.keys.length > MAX_KEYS || !env.keys.every(validKey)) return null
    const seen = new Set()
    for (const k of env.keys) {
        const key = `${k.u}:${k.d}`
        if (seen.has(key)) return null
        seen.add(key)
    }
    return {
        v : 1, from : String(env.from), dev : env.dev, to : env.to, cid : env.cid || '', t : env.t,
        iv : env.iv, ct : env.ct, sig : env.sig,
        keys : env.keys.map((k) => ({ u : String(k.u), d : k.d, epk : k.epk, iv : k.iv, wk : k.wk }))
    }
}

// what one viewer receives: the envelope with only the wrapped keys for their own devices
const viewEnvelope = (env, viewerId) => {
    if (!env || typeof env !== 'object') return undefined
    const { keys, ...rest } = env
    return { ...rest, keys : (keys || []).filter((k) => String(k.u) === String(viewerId)) }
}

const activeDevices = (user) => (user?.devices || []).filter((d) => !d.removedAt)

// public part of a device for other users
const publicDevice = (d) => ({ id : d.id, ecdh : d.ecdh, sign : d.sign, name : d.name || '', createdAt : d.createdAt, ...(d.removedAt ? { removedAt : d.removedAt } : {}) })

// every active device of every recipient must have a wrapped key (so nobody gets a message they can't open).
// Users without devices (they haven't opened an encryption-capable Chatify yet) can't be encrypted to.
const missingDevices = (env, users) => {
    const have = new Set(env.keys.map((k) => `${k.u}:${k.d}`))
    const missing = []
    for (const u of users) {
        for (const d of activeDevices(u)) if (!have.has(`${u._id}:${d.id}`)) missing.push(`${u._id}:${d.id}`)
    }
    return missing
}

// keys may only be for the chat's people (recipients + the sender's own devices)
const keysOnlyFor = (env, userIds) => {
    const allowed = new Set(userIds.map(String))
    return env.keys.every((k) => allowed.has(String(k.u)))
}

module.exports = { cleanEnvelope, viewEnvelope, activeDevices, publicDevice, missingDevices, keysOnlyFor, validKey, KINDS, MAX_DEVICES, DEVICE_ID, B64 }
