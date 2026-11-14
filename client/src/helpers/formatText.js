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

export const renderFormatted = (text = '', term = '') =>
  text.split(LINK).map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a key={`l${i}`} href={part} target='_blank' rel='noopener noreferrer' className='break-all text-[#027eb5] hover:underline' onClick={(e) => e.stopPropagation()}>
          {highlight(part, term, `l${i}`)}
        </a>
      )
    }
    return <React.Fragment key={`t${i}`}>{formatPart(part, term, `t${i}`)}</React.Fragment>
  })

// plain-text preview for chat list / reply quotes (strip formatting markers)
export const plainPreview = (text = '') => text.replace(/```/g, '').replace(/(^|\s)[*_~]([^*_~\n]+)[*_~](?=\s|$)/g, '$1$2')
