// SMS sending for phone verification codes. Pick a provider in server/.env:
//
//   SMS_PROVIDER=textbee     free: sends from your own Android phone + SIM (textbee.dev, 300 SMS/month, 50/day)
//     TEXTBEE_API_KEY=...
//     TEXTBEE_DEVICE_ID=...   (optional: which of your phones to use)
//
//   SMS_PROVIDER=twilio      free trial credit; trial accounts can only text numbers you've verified
//     TWILIO_ACCOUNT_SID=AC...
//     TWILIO_AUTH_TOKEN=...
//     TWILIO_FROM=+1...       (your Twilio phone number)
//
//   (empty)                  development: the code is printed in the server terminal
//
// SMS_DAILY_LIMIT (default 45) protects free quotas; it counts sends since the server started.

const provider = () => (process.env.SMS_PROVIDER || '').trim().toLowerCase()

const isConfigured = () => {
    const p = provider()
    if (p === 'textbee') return Boolean(process.env.TEXTBEE_API_KEY?.trim())
    if (p === 'twilio') return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_FROM?.trim())
    return false
}

let day = new Date().toDateString()
let sentToday = 0
const underDailyLimit = () => {
    const today = new Date().toDateString()
    if (today !== day) { day = today; sentToday = 0 }
    return sentToday < (Number(process.env.SMS_DAILY_LIMIT) || 45)
}

const sendViaTextbee = async (to, text) => {
    const body = { recipients : [to], message : text }
    const deviceId = process.env.TEXTBEE_DEVICE_ID?.trim()
    if (deviceId) body.deviceId = deviceId
    // dual-SIM phones: choose the SIM that has an SMS plan (see the subscription ids in the textbee app/API)
    const sim = Number(process.env.TEXTBEE_SIM_SUBSCRIPTION_ID)
    if (Number.isInteger(sim) && sim > 0) body.simSubscriptionId = sim
    const res = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
        method : 'POST',
        headers : { 'Content-Type' : 'application/json', 'x-api-key' : process.env.TEXTBEE_API_KEY.trim() },
        body : JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`textbee responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
    if (deviceId) reportTextbeeResult(deviceId, to)
}

// textbee accepts the message immediately; the phone sends it a few seconds later and can still fail
// (no SMS balance, weak signal, wrong SIM). Check back and print the outcome in the server terminal.
const mask = (n) => `${n.slice(0, 5)}*****${n.slice(-2)}`
const reportTextbeeResult = (deviceId, to) => {
    const check = async (attempt) => {
        try {
            const res = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(deviceId)}/messages?limit=10`, {
                headers : { 'x-api-key' : process.env.TEXTBEE_API_KEY.trim() }
            })
            const { data = [] } = await res.json()
            const msg = data.find((m) => m.recipient === to && m.type === 'SENT')
            const status = msg?.status
            if (status === 'failed') {
                const simName = msg.simUsed ? `${msg.simUsed.displayName} ${msg.simUsed.carrierName} (subscription id ${msg.simUsed.subscriptionId})` : 'unknown SIM'
                if (msg.sentAt) {
                    // the SIM sent it; only the network's delivery receipt was negative (e.g. CARRIER_NO_ROUTE).
                    // Seen in testing: such messages can still arrive, so don't report a hard failure.
                    console.warn(`[sms] code sent to ${mask(to)} via ${msg.simUsed?.displayName || 'phone'}, but the delivery receipt said ${msg.errorName || 'failed'} (it may still arrive)`)
                } else {
                    console.error(`[sms] phone could not send the code to ${mask(to)} using ${simName}: ${msg.errorName || ''} ${msg.errorMessage || ''}`.trim())
                }
                return
            }
            if (status === 'sent' || status === 'delivered') {
                console.log(`[sms] code ${status} to ${mask(to)} via ${msg.simUsed?.displayName || 'phone'}`)
                return
            }
            if (attempt < 5) setTimeout(() => check(attempt + 1), 6000)
            else console.warn(`[sms] still waiting for the phone to send the code to ${mask(to)} (status: ${status || 'unknown'}). Is the phone online?`)
        } catch (error) {
            console.warn('[sms] could not check delivery status:', error.message)
        }
    }
    setTimeout(() => check(1), 8000)
}

const sendViaTwilio = async (to, text) => {
    const sid = process.env.TWILIO_ACCOUNT_SID.trim()
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN.trim()}`).toString('base64')
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method : 'POST',
        headers : { Authorization : `Basic ${auth}`, 'Content-Type' : 'application/x-www-form-urlencoded' },
        body : new URLSearchParams({ To : to, From : process.env.TWILIO_FROM.trim(), Body : text })
    })
    if (!res.ok) throw new Error(`twilio responded ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

// returns { dev : true } when the code was only printed to the console
const sendOtpSms = async (to, code, purpose, minutes) => {
    // SMS_MESSAGE_STYLE=code-only sends just the 6 digits (personal/learning use from a personal SIM).
    // Default: a full sentence, which DLT-registered providers expect.
    const text = (process.env.SMS_MESSAGE_STYLE || '').trim().toLowerCase() === 'code-only'
        ? code
        : `${code} is your Chatify ${purpose === 'reset' ? 'password reset' : 'verification'} code. It expires in ${minutes} minutes. Don't share it with anyone.`

    if (!isConfigured()) {
        if (process.env.NODE_ENV === 'production') throw new Error('SMS sending is not configured')
        console.log(`\n[dev] SMS not configured — ${purpose} code for ${to}: ${code}\n`)
        return { dev : true }
    }
    if (!underDailyLimit()) {
        const err = new Error('Daily SMS limit reached')
        err.userMessage = "We can't send more text messages today. Please use email instead or try again tomorrow."
        throw err
    }

    if (provider() === 'textbee') await sendViaTextbee(to, text)
    else await sendViaTwilio(to, text)
    sentToday += 1
    return { dev : false }
}

module.exports = { sendOtpSms, isConfigured }
