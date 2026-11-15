import * as C from './crypto'

const deviceFor = async (id) => {
  const k = await C.generateDeviceKeys()
  return { id, ecdh : k.ecdh, sign : k.sign, ecdhPub : k.ecdhPub, signPub : k.signPub }
}

describe('end-to-end encryption primitives', () => {
  let alice, bob, eve
  beforeAll(async () => {
    alice = await deviceFor('alice-device-1')
    bob = await deviceFor('bob-device-1')
    eve = await deviceFor('eve-device-1')
  })
  const forBob = () => [{ u : 'a'.repeat(24), d : alice.id, ecdh : alice.ecdhPub }, { u : 'b'.repeat(24), d : bob.id, ecdh : bob.ecdhPub }]
  const sealHello = () => C.seal({ text : 'hello 👋' }, { from : 'a'.repeat(24), to : 'b'.repeat(24), cid : 'c1', device : alice }, forBob())

  test('private keys are not extractable', async () => {
    await expect(window.crypto.subtle.exportKey('pkcs8', alice.ecdh.privateKey)).rejects.toBeTruthy()
    await expect(window.crypto.subtle.exportKey('pkcs8', alice.sign.privateKey)).rejects.toBeTruthy()
  })

  test('recipient and sender can open; ciphertext hides the text', async () => {
    const env = await sealHello()
    expect(env.ct).not.toContain('hello')
    await C.verify(env, alice.signPub)
    expect((await C.open(env, 'b'.repeat(24), bob)).text).toBe('hello 👋')
    expect((await C.open(env, 'a'.repeat(24), alice)).text).toBe('hello 👋')
  })

  test('someone without a wrapped key cannot open it', async () => {
    const env = await sealHello()
    await expect(C.open(env, 'e'.repeat(24), eve)).rejects.toMatchObject({ code : 'no-key' })
    // even if they relabel Bob's key entry as theirs
    const stolen = { ...env, keys : env.keys.map((k) => ({ ...k, u : 'e'.repeat(24), d : eve.id })) }
    await expect(C.open(stolen, 'e'.repeat(24), eve)).rejects.toMatchObject({ code : 'bad-key' })
  })

  test('changed ciphertext, header or signature is detected', async () => {
    const env = await sealHello()
    const flip = (s) => (s[5] === 'A' ? s.slice(0, 5) + 'B' + s.slice(6) : s.slice(0, 5) + 'A' + s.slice(6))
    await expect(C.verify({ ...env, ct : flip(env.ct) }, alice.signPub)).rejects.toMatchObject({ code : 'bad-signature' })
    await expect(C.verify({ ...env, to : 'c'.repeat(24) }, alice.signPub)).rejects.toMatchObject({ code : 'bad-signature' })
    await expect(C.open({ ...env, ct : flip(env.ct) }, 'b'.repeat(24), bob)).rejects.toMatchObject({ code : 'bad-ciphertext' })
    await expect(C.open({ ...env, cid : 'other' }, 'b'.repeat(24), bob)).rejects.toMatchObject({ code : 'bad-ciphertext' })
  })

  test("a message signed by another device doesn't verify as Alice's", async () => {
    const forged = await C.seal({ text : 'pay Eve' }, { from : 'a'.repeat(24), to : 'b'.repeat(24), cid : 'x', device : eve }, forBob())
    await expect(C.verify(forged, alice.signPub)).rejects.toMatchObject({ code : 'bad-signature' })
  })

  test('history sync: a key re-wrapped for a new device opens the message', async () => {
    const env = await sealHello()
    const bob2 = await deviceFor('bob-device-2')
    const mine = env.keys.find((k) => k.d === bob.id)
    const w = await C.rewrap(mine, bob, 'b'.repeat(24), bob2.id, bob2.ecdhPub)
    const withNew = { ...env, keys : [...env.keys, { u : 'b'.repeat(24), d : bob2.id, ...w }] }
    expect((await C.open(withNew, 'b'.repeat(24), bob2)).text).toBe('hello 👋')
  })

  test('files: encrypt, verify hash, decrypt; altered files are refused', async () => {
    const data = new TextEncoder().encode('%PNG fake picture bytes')
    const enc = await C.encryptBytes(data)
    expect(Buffer.from(enc.ct).includes(Buffer.from('PNG'))).toBe(false)
    const back = new Uint8Array(await C.decryptBytes(enc.ct, enc))
    expect(new TextDecoder().decode(back)).toBe('%PNG fake picture bytes')
    const bad = new Uint8Array(enc.ct); bad[0] ^= 1
    await expect(C.decryptBytes(bad, enc)).rejects.toMatchObject({ code : 'bad-media' })
  })

  test('security code: 60 digits, same on both sides, changes with a new device', async () => {
    const A = [{ ecdh : alice.ecdhPub, sign : alice.signPub }], B = [{ ecdh : bob.ecdhPub, sign : bob.signPub }]
    const one = await C.securityCode('a'.repeat(24), A, 'b'.repeat(24), B)
    const two = await C.securityCode('b'.repeat(24), B, 'a'.repeat(24), A)
    expect(one.replace(/\s/g, '')).toMatch(/^\d{60}$/)
    expect(one).toBe(two)
    const changed = await C.securityCode('a'.repeat(24), A, 'b'.repeat(24), [...B, { ecdh : eve.ecdhPub, sign : eve.signPub }])
    expect(changed).not.toBe(one)
  })
})
