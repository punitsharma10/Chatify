import React from 'react'

// WhatsApp-style formatting rendered as React elements (never as HTML, so it is XSS-safe):
// *bold*  _italic_  ~strikethrough~  ```monospace```  and clickable links.
const LINK = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/gi
const FORMAT = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const highlight = (text, term, key) => {
  if (!term) return text
  const parts = text.split(new RegExp(`(${escapeRegex(term)})`, 'ig'))
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase()
      ? <mark key={`${key}-h${i}`} className='rounded-sm bg-[#ffe066] px-0.5 text-inherit'>{p}</mark>
      : p
  )
}

const formatPart = (text, term, key) =>
  text.split(FORMAT).map((part, i) => {
    const k = `${key}-${i}`
    if (part.startsWith('```') && part.endsWith('```') && part.length > 6) {
      return <code key={k} className='rounded bg-black/5 px-1 font-mono text-[13px]'>{highlight(part.slice(3, -3), term, k)}</code>
    }
    if (part.length > 2) {
      const inner = part.slice(1, -1)
      if (part[0] === '*' && part.endsWith('*')) return <strong key={k}>{highlight(inner, term, k)}</strong>
      if (part[0] === '_' && part.endsWith('_')) return <em key={k}>{highlight(inner, term, k)}</em>
      if (part[0] === '~' && part.endsWith('~')) return <s key={k}>{highlight(inner, term, k)}</s>
    }
    return <React.Fragment key={k}>{highlight(part, term, k)}</React.Fragment>
  })

// "@Name" of mentioned people, shown in green like WhatsApp
const withMentions = (text, mentions, term, key) => {
  if (!mentions?.length) return formatPart(text, term, key)
  const re = new RegExp(`(${mentions.map((m) => escapeRegex(m)).sort((a, b) => b.length - a.length).join('|')})`, 'g')
  return text.split(re).map((part, i) => (mentions.includes(part)
    ? <span key={`${key}-m${i}`} className='font-medium text-wa-teal'>{highlight(part, term, `${key}-m${i}`)}</span>
    : <React.Fragment key={`${key}-p${i}`}>{formatPart(part, term, `${key}-p${i}`)}</React.Fragment>))
}

// mentions: ['@Alice', ...] to highlight
export const renderFormatted = (text = '', term = '', mentions = null) =>
  text.split(LINK).map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a key={`l${i}`} href={part} target='_blank' rel='noopener noreferrer' className='break-all text-wa-link hover:underline' onClick={(e) => e.stopPropagation()}>
          {highlight(part, term, `l${i}`)}
        </a>
      )
    }
    return <React.Fragment key={`t${i}`}>{withMentions(part, mentions, term, `t${i}`)}</React.Fragment>
  })

// plain-text preview for chat list / reply quotes (strip formatting markers)
// short description of any message (chat list, notifications, pinned bar, …)
export const messagePreview = (m) => {
  if (!m) return ''
  if (m.poll) return `📊 ${m.poll.question}`
  if (m.contact) return `👤 ${m.contact.name}`
  if (m.location) return `📍 ${m.location.name || 'Location'}`
  if (m.viewOnce) return m.viewOnce === 'video' ? '🎥 Video (view once)' : '📷 Photo (view once)'
  // a Pixify / Connectify post sent with "Send to chat"
  const shared = typeof m.text === 'string' && m.text.trim().match(/^https?:\/\/[^/\s]+\/(pixify|connectify)\/p\/[a-f0-9]{24}\/?$/i)
  if (shared) return shared[1].toLowerCase() === 'pixify' ? '🖼️ Pixify post' : '📰 Connectify post'
  if (m.text) return plainPreview(m.text)
  if (m.imageUrl) return '📷 Photo'
  if (m.videoUrl) return '🎥 Video'
  if (m.stickerUrl) return '🩷 Sticker'
  if (m.audioUrl) {
    const s = Math.round(m.audioDuration || 0)
    return `🎤 Voice message${s ? ` (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})` : ''}`
  }
  if (m.fileName) return `📄 ${m.fileName}`
  return 'Message'
}

export const plainPreview = (text = '') => text.replace(/```/g, '').replace(/(^|\s)[*_~]([^*_~\n]+)[*_~](?=\s|$)/g, '$1$2')
