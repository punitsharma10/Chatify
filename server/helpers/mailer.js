const nodemailer = require('nodemailer')

// Free email sending with your own Gmail account (about 500 emails/day) via an App Password.
// .env:
//   SMTP_USER=yourname@gmail.com
//   SMTP_PASS=your16charapppassword
//   (optional) SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  MAIL_FROM="Chatify <yourname@gmail.com>"
//
// If SMTP isn't configured and NODE_ENV isn't "production", codes are printed in the server terminal
// so you can develop without email set up.
//
// Hosting on Render's free plan: Render blocks outgoing SMTP (ports 25/465/587), so Gmail SMTP fails there.
// Use Brevo's HTTPS email API instead (free: 300 emails/day, no card):
//   BREVO_API_KEY=xkeysib-...           (Brevo -> SMTP & API -> API keys)
//   MAIL_FROM_EMAIL=yourname@gmail.com  (a sender you verified in Brevo -> Senders)
//   (optional) MAIL_FROM_NAME=Chatify
// When BREVO_API_KEY is set it is used instead of SMTP.

let transporter = null

const useBrevo = () => Boolean(process.env.BREVO_API_KEY?.trim())
const isConfigured = () => useBrevo() || Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim())

// "Chatify <me@x.com>" -> { name, email }
const sender = () => {
    const from = process.env.MAIL_FROM?.trim() || ''
    const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
    return {
        name : process.env.MAIL_FROM_NAME?.trim() || (m && m[1].trim()) || 'Chatify',
        email : process.env.MAIL_FROM_EMAIL?.trim() || (m && m[2].trim()) || process.env.SMTP_USER?.trim() || ''
    }
}

const sendWithBrevo = async ({ to, subject, text, html }) => {
    const from = sender()
    if (!from.email) throw new Error('Set MAIL_FROM_EMAIL to the sender address you verified in Brevo')
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method : 'POST',
        headers : { 'api-key' : process.env.BREVO_API_KEY.trim(), 'Content-Type' : 'application/json', Accept : 'application/json' },
        body : JSON.stringify({ sender : from, to : [{ email : to }], subject, textContent : text, htmlContent : html }),
        signal : AbortSignal.timeout(15000)
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Brevo responded ${res.status}: ${detail.slice(0, 200)}`)
    }
}

const getTransporter = () => {
    if (transporter) return transporter
    const port = Number(process.env.SMTP_PORT) || 465
    transporter = nodemailer.createTransport({
        host : process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
        port,
        secure : port === 465,
        // fail fast when the host blocks SMTP (e.g. Render free plan) instead of hanging for minutes
        connectionTimeout : 10000,
        greetingTimeout : 10000,
        auth : {
            user : process.env.SMTP_USER.trim(),
            pass : process.env.SMTP_PASS.replace(/\s+/g, '')   // Google shows app passwords with spaces
        }
    })
    return transporter
}

const COPY = {
    register : {
        subject : 'Your Chatify verification code',
        title : 'Verify your email',
        line : 'Use this code to finish creating your Chatify account.'
    },
    reset : {
        subject : 'Your Chatify password reset code',
        title : 'Reset your password',
        line : 'Use this code to reset your Chatify password.'
    }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', "'" : '&#39;' }[c]))

const buildHtml = (code, { title, line }, minutes) => `
<div style="background:#f0f2f5;padding:32px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">
    <div style="background:#00a884;color:#ffffff;padding:18px 24px;font-size:16px;font-weight:600;letter-spacing:.5px">CHATIFY</div>
    <div style="padding:28px 24px;color:#111b21">
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:500">${escapeHtml(title)}</h1>
      <p style="margin:0 0 24px;color:#667781;font-size:14px">${escapeHtml(line)}</p>
      <div style="font-size:34px;font-weight:600;letter-spacing:10px;color:#008069;text-align:center;background:#f0f2f5;border-radius:8px;padding:16px 0">${escapeHtml(code)}</div>
      <p style="margin:24px 0 0;color:#667781;font-size:13px">This code expires in ${minutes} minutes. If you didn't request it, you can ignore this email.</p>
    </div>
  </div>
  <p style="text-align:center;color:#8696a0;font-size:12px;margin-top:16px">© ${new Date().getFullYear()} Chatify · Made with LOVE by Punit</p>
</div>`

// returns { dev : true } when the code was only printed to the console
const sendOtpEmail = async (to, code, purpose, minutes) => {
    const copy = COPY[purpose]
    if (!isConfigured()) {
        if (process.env.NODE_ENV === 'production') throw new Error('Email sending is not configured')
        console.log(`\n[dev] Email not configured — ${purpose} code for ${to}: ${code}\n`)
        return { dev : true }
    }
    const mail = {
        to,
        subject : copy.subject,
        text : `${copy.title}\n\n${copy.line}\n\nYour code: ${code}\n\nThis code expires in ${minutes} minutes. If you didn't request it, ignore this email.`,
        html : buildHtml(code, copy, minutes)
    }
    if (useBrevo()) {
        await sendWithBrevo(mail)
    } else {
        await getTransporter().sendMail({ from : process.env.MAIL_FROM?.trim() || `Chatify <${process.env.SMTP_USER.trim()}>`, ...mail })
    }
    return { dev : false }
}

module.exports = { sendOtpEmail, isConfigured }
