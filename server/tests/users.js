// Creates a verified user through the real OTP flow. The test server runs without SMTP,
// so it prints codes to its log (process.env.OTP_LOG) — we read the code from there.
const fs = require('fs')
const API = process.env.TEST_API || 'http://localhost:5055'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const post = async (url, body, token) => {
  const res = await fetch(API + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}
const readCode = async (email, purpose) => {
  for (let i = 0; i < 40; i++) {
    const log = fs.readFileSync(process.env.OTP_LOG, 'utf8')
    const marker = `${purpose} code for ${email}: `
    const at = log.lastIndexOf(marker)
    if (at !== -1) return log.slice(at + marker.length, at + marker.length + 6)
    await sleep(100)
  }
  throw new Error('code not found in log for ' + email)
}
const makeUser = async (name, uid, profile_pic = '') => {
  const email = `${name.toLowerCase()}_${uid}@test.local`
  await post('/api/otp/send', { email, purpose: 'register' })
  const otp = await readCode(email, 'register')
  const v = await post('/api/otp/verify', { email, purpose: 'register', otp })
  await post('/api/register', { name, email, password: 'secret123', confirmPassword: 'secret123', profile_pic, verifyToken: v.body.token })
  const e = await post('/api/email', { email })
  const p = await post('/api/password', { userId: e.body.data._id, password: 'secret123' })
  return { id: e.body.data._id, token: p.body.token, name, email }
}
module.exports = { post, readCode, makeUser, sleep }
