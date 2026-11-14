// Email OTP: registration + forgot password, against the real server (:5055, test DB, codes read from its log)
const { post, readCode, sleep } = require('./users')
const API = 'http://localhost:5055'
const uid = 'o' + Date.now().toString(36)
let passed = 0, failed = 0
const out = []
const check = (n, c, extra = '') => { c ? passed++ : failed++; out.push(`${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : extra}`) }

;(async () => {
  const email = `newuser_${uid}@test.local`

  // ---------- registration ----------
  const direct = await post('/api/register', { name: 'Eve', email: `eve_${uid}@test.local`, password: 'secret123', confirmPassword: 'secret123' })
  check('cannot register without verifying the email', direct.status === 400 && direct.body.code === 'not_verified')

  const bad = await post('/api/otp/send', { email: 'not-an-email', purpose: 'register' })
  check('invalid email rejected', bad.status === 400)

  const s1 = await post('/api/otp/send', { email, purpose: 'register' })
  check('code sent (dev mode prints it to the server log)', s1.status === 200 && s1.body.devMode === true, JSON.stringify(s1.body))
  const code = await readCode(email, 'register')
  check('code is 6 digits', /^\d{6}$/.test(code))

  const again = await post('/api/otp/send', { email, purpose: 'register' })
  check('resend blocked for 60 seconds', again.status === 429 && again.body.retryIn > 0)

  const wrongCode = code === '000000' ? '111111' : '000000'
  const w1 = await post('/api/otp/verify', { email, purpose: 'register', otp: wrongCode })
  check('wrong OTP shows "Incorrect OTP. Please enter the correct OTP."', w1.status === 400 && w1.body.message.startsWith('Incorrect OTP. Please enter the correct OTP.') && w1.body.attemptsLeft === 4, JSON.stringify(w1.body))

  const v = await post('/api/otp/verify', { email, purpose: 'register', otp: code })
  check('correct OTP returns a verification token', v.status === 200 && v.body.token?.length === 64)
  const reuseCode = await post('/api/otp/verify', { email, purpose: 'register', otp: code })
  check('a code can only be used once', reuseCode.status === 400)

  const mism = await post('/api/register', { name: 'New', email, password: 'secret123', confirmPassword: 'secret999', verifyToken: v.body.token })
  check("password and confirm must match", mism.status === 400 && /match/.test(mism.body.message))
  const short = await post('/api/register', { name: 'New', email, password: '123', confirmPassword: '123', verifyToken: v.body.token })
  check('password must be at least 6 characters', short.status === 400)
  const otherEmail = await post('/api/register', { name: 'New', email: `other_${uid}@test.local`, password: 'secret123', confirmPassword: 'secret123', verifyToken: v.body.token })
  check("token can't be used for a different email", otherEmail.status === 400 && otherEmail.body.code === 'not_verified')

  const reg = await post('/api/register', { name: 'New User', email: email.toUpperCase(), password: 'secret123', confirmPassword: 'secret123', verifyToken: v.body.token })
  check('register succeeds with verified email', reg.status === 201 && reg.body.success, JSON.stringify(reg.body))
  check('register response does not leak the password hash', reg.status === 201 && !('password' in reg.body.data))
  const reuse = await post('/api/register', { name: 'Dup', email, password: 'secret123', confirmPassword: 'secret123', verifyToken: v.body.token })
  check('verification token works only once', reuse.status === 400)

  const exists = await post('/api/otp/send', { email, purpose: 'register' })
  check('cannot request a register code for an existing account', exists.status === 400 && /already exists/.test(exists.body.message))

  const loginMixed = await post('/api/email', { email: email.replace('newuser', 'NewUser') })
  check('login email is case-insensitive', loginMixed.status === 200)
  const login = await post('/api/password', { userId: loginMixed.body.data._id, password: 'secret123' })
  check('can log in with the new account', login.body.success === true)
  const oldToken = login.body.token

  // ---------- lockout after 5 wrong codes ----------
  const lockEmail = `lock_${uid}@test.local`
  await post('/api/otp/send', { email: lockEmail, purpose: 'register' })
  const lockCode = await readCode(lockEmail, 'register')
  const wrong = lockCode === '123456' ? '654321' : '123456'
  let last
  for (let i = 0; i < 5; i++) last = await post('/api/otp/verify', { email: lockEmail, purpose: 'register', otp: wrong })
  check('5 wrong codes lock the code', last.status === 429)
  const afterLock = await post('/api/otp/verify', { email: lockEmail, purpose: 'register', otp: lockCode })
  check('even the right code is refused after lockout (must request a new one)', afterLock.status === 429)

  // ---------- forgot password ----------
  const unknown = await post('/api/otp/send', { email: `ghost_${uid}@test.local`, purpose: 'reset' })
  check('reset code refused for unknown email', unknown.status === 400)
  const r1 = await post('/api/otp/send', { email, purpose: 'reset' })
  check('reset code sent', r1.status === 200)
  const rcode = await readCode(email, 'reset')
  const noToken = await post('/api/reset-password', { email, password: 'newpass456', confirmPassword: 'newpass456', verifyToken: 'x'.repeat(64) })
  check('reset refused without a valid verification', noToken.status === 400 && noToken.body.code === 'not_verified')
  const rv = await post('/api/otp/verify', { email, purpose: 'reset', otp: rcode })
  const regToken = await post('/api/register', { name: 'X', email, password: 'secret123', confirmPassword: 'secret123', verifyToken: rv.body.token })
  check("a reset token can't be used to register", regToken.status === 400)
  await sleep(1100)
  const reset = await post('/api/reset-password', { email, password: 'newpass456', confirmPassword: 'newpass456', verifyToken: rv.body.token })
  check('password reset succeeds', reset.status === 200 && reset.body.success, JSON.stringify(reset.body))
  const oldPw = await post('/api/password', { userId: loginMixed.body.data._id, password: 'secret123' })
  check('old password no longer works', oldPw.status === 400)
  const newPw = await post('/api/password', { userId: loginMixed.body.data._id, password: 'newpass456' })
  check('new password works', newPw.body.success === true)
  const oldSession = await (await fetch(API + '/api/userdetails', { headers: { Authorization: 'Bearer ' + oldToken } })).json()
  check('reset signs out sessions that used the old password', oldSession.data?.logout === true)
  const newSession = await (await fetch(API + '/api/userdetails', { headers: { Authorization: 'Bearer ' + newPw.body.token } })).json()
  check('new session works', newSession.data?.email === email)

  console.log(out.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('CRASH', e); console.log(out.join('\n')); process.exit(2) })
