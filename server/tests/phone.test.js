// Phone-number registration / login / reset against the real server (:5055, test DB, codes from its log)
const { post, readCode, sleep } = require('./users')
const uid = Date.now().toString().slice(-7)
let passed = 0, failed = 0
const out = []
const check = (n, c, extra = '') => { c ? passed++ : failed++; out.push(`${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : extra}`) }

const registerPhone = async (phone, name) => {
  await post('/api/otp/send', { phone, purpose: 'register' })
  const otp = await readCode(phone, 'register')
  const v = await post('/api/otp/verify', { phone, purpose: 'register', otp })
  return post('/api/register', { name, phone, password: 'secret123', confirmPassword: 'secret123', verifyToken: v.body.token })
}

;(async () => {
  const phone1 = `+91987${uid}`
  const phone2 = `+91986${uid}`

  const bad = await post('/api/otp/send', { phone: '12345', purpose: 'register' })
  check('invalid phone number rejected', bad.status === 400 && /phone/.test(bad.body.message))

  const s = await post('/api/otp/send', { phone: phone1.replace('+91', '+91 ').replace(/(\d{5})$/, '-$1'), purpose: 'register' })
  check('SMS code sent (formatted input is normalised)', s.status === 200 && s.body.channel === 'sms' && s.body.devMode === true, JSON.stringify(s.body))
  const code = await readCode(phone1, 'register')
  const wrong = await post('/api/otp/verify', { phone: phone1, purpose: 'register', otp: code === '000000' ? '111111' : '000000' })
  check('wrong SMS code shows the incorrect OTP message', wrong.status === 400 && wrong.body.message.startsWith('Incorrect OTP. Please enter the correct OTP.'))
  const v = await post('/api/otp/verify', { phone: phone1, purpose: 'register', otp: code })
  check('correct SMS code verifies the phone', v.status === 200 && v.body.token)
  const asEmail = await post('/api/register', { name: 'X', email: `x_${uid}@test.local`, password: 'secret123', confirmPassword: 'secret123', verifyToken: v.body.token })
  check("a phone token can't register an email account", asEmail.status === 400)
  const reg = await post('/api/register', { name: 'Phone One', phone: phone1, password: 'secret123', confirmPassword: 'secret123', verifyToken: v.body.token })
  check('register with phone number (no email)', reg.status === 201 && reg.body.data.phone === phone1 && !reg.body.data.email, JSON.stringify(reg.body))

  const reg2 = await registerPhone(phone2, 'Phone Two')
  check('a second phone-only account can exist (email index allows missing email)', reg2.status === 201, JSON.stringify(reg2.body))

  const dup = await post('/api/otp/send', { phone: phone1, purpose: 'register' })
  check('cannot register the same phone twice', dup.status === 400 && /already exists/.test(dup.body.message))

  const login1 = await post('/api/email', { phone: phone1 })
  check('login step 1 finds the account by phone', login1.status === 200 && login1.body.data.phone === phone1)
  const unknown = await post('/api/email', { phone: '+919000000001' })
  check('unknown phone gives a clear message', unknown.status === 400 && /phone/.test(unknown.body.message))
  const pw = await post('/api/password', { userId: login1.body.data._id, password: 'secret123' })
  check('log in with phone + password', pw.body.success === true)

  const search = await post('/api/searchuser', { search: phone2.slice(-6) }, pw.body.token)
  check('people can be found by phone number in New chat', search.status === 200 && search.body.data.some((u) => u.phone === phone2))

  // forgot password by SMS
  const rs = await post('/api/otp/send', { phone: phone1, purpose: 'reset' })
  check('reset code sent by SMS', rs.status === 200)
  const rcode = await readCode(phone1, 'reset')
  const rv = await post('/api/otp/verify', { phone: phone1, purpose: 'reset', otp: rcode })
  await sleep(1100)
  const reset = await post('/api/reset-password', { phone: phone1, password: 'newpass456', confirmPassword: 'newpass456', verifyToken: rv.body.token })
  check('reset password with phone', reset.status === 200)
  const oldPw = await post('/api/password', { userId: login1.body.data._id, password: 'secret123' })
  const newPw = await post('/api/password', { userId: login1.body.data._id, password: 'newpass456' })
  check('old password stops working, new one works', oldPw.status === 400 && newPw.body.success === true)

  console.log(out.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error('CRASH', e); console.log(out.join('\n')); process.exit(2) })
