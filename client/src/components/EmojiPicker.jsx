import React, { useEffect, useMemo, useRef, useState } from 'react'
import { IoSearchOutline, IoClose, IoTimeOutline, IoAdd } from 'react-icons/io5'
import { STICKER_PACKS, stickerUrl, stickerThumb } from '../helpers/stickers'

// WhatsApp-style emoji & sticker panel.
//  - Emoji: every standard emoji (search, recent, skin tones, flags), loaded on first open
//  - Stickers: animated sticker packs + "Create" a sticker from your own picture (only when onSticker is given)

const CATEGORIES = [
  { id : 'recent', label : 'Recent', icon : <IoTimeOutline size={18} /> },
  { id : 'people', label : 'Smileys & people', icon : '😀', groups : ['Smileys & Emotion', 'People & Body'] },
  { id : 'nature', label : 'Animals & nature', icon : '🐻', groups : ['Animals & Nature'] },
  { id : 'food', label : 'Food & drink', icon : '🍔', groups : ['Food & Drink'] },
  { id : 'activity', label : 'Activity', icon : '⚽', groups : ['Activities'] },
  { id : 'travel', label : 'Travel & places', icon : '🚗', groups : ['Travel & Places'] },
  { id : 'objects', label : 'Objects', icon : '💡', groups : ['Objects'] },
  { id : 'symbols', label : 'Symbols', icon : '🔣', groups : ['Symbols'] },
  { id : 'flags', label : 'Flags', icon : '🏳️', groups : ['Flags'] },
]

// newer emojis show as empty boxes on many phones / PCs, so stop at Emoji 15.0 (like WhatsApp's set)
const MAX_EMOJI_VERSION = 15.0
const TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿']
const TONE_SAMPLE = '✋'

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ } }
const RECENT_KEY = 'chatify-recent-emojis'
const TONE_KEY = 'chatify-emoji-tone'
const RECENT_STICKERS_KEY = 'chatify-recent-stickers'
export const MY_STICKERS_KEY = 'chatify-my-stickers'

// 👍 + 🏽 -> 👍🏽 (the tone goes after the first character; a following "emoji style" marker is dropped)
const withTone = (emoji, tone) => {
  if (!tone) return emoji
  const chars = [...emoji]
  const rest = chars.slice(1)
  if (rest[0] === '️') rest.shift()
  return chars[0] + tone + rest.join('')
}

let emojiData = null // shared after the first load
const loadEmojis = async () => {
  if (emojiData) return emojiData
  const mod = await import('unicode-emoji-json/data-by-group.json')
  const groups = mod.default || mod
  const byGroup = Object.fromEntries(groups.map((g) => [g.name, g.emojis.filter((e) => parseFloat(e.emoji_version) <= MAX_EMOJI_VERSION)]))
  emojiData = CATEGORIES.filter((c) => c.groups).map((c) => ({ ...c, emojis : c.groups.flatMap((g) => byGroup[g] || []) }))
  return emojiData
}

const useOutsideClose = (ref, onClose) => {
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [ref, onClose])
}

const EmojiPicker = ({ onSelect, onClose, className = '', onSticker, onCreateSticker }) => {
  const ref = useRef(null)
  const [tab, setTab] = useState('emoji')
  useOutsideClose(ref, onClose)

  return (
    <div ref={ref} className={`z-40 flex h-[min(420px,60dvh)] w-[min(360px,calc(100vw-16px))] animate-pop flex-col overflow-hidden rounded-xl bg-wa-surface shadow-menu ${className}`}>
      {tab === 'emoji' ? <EmojiTab onSelect={onSelect} /> : <StickerTab onSticker={onSticker} onCreateSticker={onCreateSticker} />}
      {onSticker && (
        <div className='flex shrink-0 justify-center gap-2 border-t border-wa-border bg-wa-panel py-1.5'>
          {[['emoji', 'Emoji'], ['stickers', 'Stickers']].map(([k, l]) => (
            <button key={k} type='button' onClick={() => setTab(k)} className={`rounded-full px-4 py-1 text-sm ${tab === k ? 'bg-wa-surface font-medium text-wa-teal shadow-sm' : 'text-wa-muted hover:text-wa-text'}`}>{l}</button>
          ))}
        </div>
      )}
    </div>
  )
}

const EmojiTab = ({ onSelect }) => {
  const [data, setData] = useState(emojiData)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState(() => load(RECENT_KEY, []))
  const [tone, setTone] = useState(() => load(TONE_KEY, ''))
  const [toneOpen, setToneOpen] = useState(false)
  const [active, setActive] = useState(recent.length ? 'recent' : 'people')
  const scroller = useRef(null)

  useEffect(() => {
    let alive = true
    if (!data) loadEmojis().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [data])

  const pick = (emoji) => {
    onSelect(emoji)
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 32)
    setRecent(next)
    save(RECENT_KEY, next)
  }

  const shown = (e) => (e.skin_tone_support ? withTone(e.emoji, tone) : e.emoji)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !data) return null
    const words = q.split(/\s+/)
    return data.flatMap((c) => c.emojis).filter((e) => words.every((w) => e.name.includes(w) || e.slug.includes(w))).slice(0, 160)
  }, [query, data])

  const jump = (id) => {
    setActive(id)
    const el = scroller.current?.querySelector(`[data-section="${id}"]`)
    if (el && scroller.current) scroller.current.scrollTo({ top : el.offsetTop - 4 })
  }

  // highlight the category being scrolled through
  const onScroll = () => {
    const box = scroller.current
    if (!box) return
    const sections = [...box.querySelectorAll('[data-section]')]
    const current = sections.filter((s) => s.offsetTop - box.scrollTop <= 24).pop()
    if (current) setActive(current.dataset.section)
  }

  const Cell = ({ emoji, title }) => (
    <button type='button' title={title} onClick={() => pick(emoji)} className='flex h-10 w-full items-center justify-center rounded-md text-[26px] leading-none hover:bg-wa-panel'>
      {emoji}
    </button>
  )

  return (
    <>
      <div className='flex shrink-0 items-center gap-1 border-b border-wa-border px-1'>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type='button'
            title={c.label}
            onClick={() => { setQuery(''); jump(c.id) }}
            className={`flex h-10 flex-1 items-center justify-center border-b-2 text-lg transition-colors ${active === c.id && !query ? 'border-wa-green text-wa-green' : 'border-transparent text-wa-subtle grayscale hover:grayscale-0'}`}
          >
            {c.icon}
          </button>
        ))}
      </div>

      <div className='flex shrink-0 items-center gap-2 px-3 py-2'>
        <div className='flex h-8 flex-1 items-center gap-2 rounded-lg bg-wa-panel px-3'>
          <IoSearchOutline size={15} className='text-wa-icon' />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Search emoji' className='w-full bg-transparent text-sm text-wa-text outline-none placeholder:text-wa-subtle' />
          {query && <button type='button' onClick={() => setQuery('')} className='text-wa-icon'><IoClose size={15} /></button>}
        </div>
        <div className='relative'>
          <button type='button' onClick={() => setToneOpen((o) => !o)} className='flex h-8 w-8 items-center justify-center rounded-md text-xl hover:bg-wa-panel' title='Skin tone'>{withTone(TONE_SAMPLE, tone)}</button>
          {toneOpen && (
            <div className='absolute right-0 top-9 z-10 flex gap-0.5 rounded-lg bg-wa-surface p-1 shadow-menu'>
              {TONES.map((t) => (
                <button key={t || 'default'} type='button' onClick={() => { setTone(t); save(TONE_KEY, t); setToneOpen(false) }} className={`flex h-8 w-8 items-center justify-center rounded-md text-xl hover:bg-wa-panel ${t === tone ? 'bg-wa-panel' : ''}`}>
                  {withTone(TONE_SAMPLE, t)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={scroller} onScroll={onScroll} className='relative min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar'>
        {!data && <p className='py-10 text-center text-sm text-wa-muted'>Loading emoji…</p>}

        {results && (
          results.length
            ? <div className='grid grid-cols-8 gap-0.5'>{results.map((e) => <Cell key={e.slug} emoji={shown(e)} title={e.name} />)}</div>
            : <p className='py-10 text-center text-sm text-wa-muted'>No emoji found</p>
        )}

        {!results && data && (
          <>
            <section data-section='recent'>
              <h4 className='px-1 pb-1 pt-2 text-xs font-medium text-wa-muted'>Recent</h4>
              {recent.length
                ? <div className='grid grid-cols-8 gap-0.5'>{recent.map((e) => <Cell key={e} emoji={e} />)}</div>
                : <p className='px-1 pb-2 text-xs text-wa-subtle'>Emoji you use will show up here</p>}
            </section>
            {data.map((c) => (
              <section key={c.id} data-section={c.id} style={{ contentVisibility : 'auto', containIntrinsicSize : `auto ${Math.ceil(c.emojis.length / 8) * 42 + 30}px` }}>
                <h4 className='px-1 pb-1 pt-3 text-xs font-medium text-wa-muted'>{c.label}</h4>
                <div className='grid grid-cols-8 gap-0.5'>{c.emojis.map((e) => <Cell key={e.slug} emoji={shown(e)} title={e.name} />)}</div>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  )
}

// one sticker cell: light still image, animates on hover
const Sticker = ({ code, url, title, onClick }) => {
  const [hover, setHover] = useState(false)
  const src = url || (hover ? stickerUrl(code) : stickerThumb(code))
  return (
    <button type='button' title={title} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className='flex aspect-square items-center justify-center rounded-lg p-1.5 hover:bg-wa-panel'>
      <img src={src} alt={title || 'sticker'} loading='lazy' draggable={false} className='h-full w-full object-contain' />
    </button>
  )
}

const StickerTab = ({ onSticker, onCreateSticker }) => {
  const [recent, setRecent] = useState(() => load(RECENT_STICKERS_KEY, []))
  const [mine, setMine] = useState(() => load(MY_STICKERS_KEY, []))
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState(recent.length ? 'recent' : STICKER_PACKS[0].id)
  const fileRef = useRef(null)
  const scroller = useRef(null)

  const send = (url) => {
    onSticker(url)
    const next = [url, ...recent.filter((u) => u !== url)].slice(0, 16)
    setRecent(next)
    save(RECENT_STICKERS_KEY, next)
  }

  const create = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onCreateSticker) return
    setCreating(true)
    const url = await onCreateSticker(file)
    setCreating(false)
    if (!url) return
    const next = [url, ...mine.filter((u) => u !== url)].slice(0, 40)
    setMine(next)
    save(MY_STICKERS_KEY, next)
    send(url)
  }

  const jump = (id) => {
    setActive(id)
    const el = scroller.current?.querySelector(`[data-section="${id}"]`)
    if (el && scroller.current) scroller.current.scrollTo({ top : el.offsetTop - 4 })
  }

  const notoCode = (url) => url.match(/notoemoji\/latest\/([0-9a-f_]+)\//)?.[1]

  return (
    <>
      <div className='flex shrink-0 items-center gap-1 border-b border-wa-border px-1'>
        <button type='button' title='Recent' onClick={() => jump('recent')} className={`flex h-10 flex-1 items-center justify-center border-b-2 ${active === 'recent' ? 'border-wa-green text-wa-green' : 'border-transparent text-wa-subtle'}`}><IoTimeOutline size={18} /></button>
        <button type='button' title='My stickers' onClick={() => jump('mine')} className={`flex h-10 flex-1 items-center justify-center border-b-2 text-wa-subtle ${active === 'mine' ? 'border-wa-green text-wa-green' : 'border-transparent'}`}><IoAdd size={20} /></button>
        {STICKER_PACKS.map((p) => (
          <button key={p.id} type='button' title={p.name} onClick={() => jump(p.id)} className={`flex h-10 flex-1 items-center justify-center border-b-2 text-lg ${active === p.id ? 'border-wa-green' : 'border-transparent grayscale hover:grayscale-0'}`}>{p.icon}</button>
        ))}
      </div>

      <div ref={scroller} className='relative min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar'>
        <section data-section='recent'>
          <h4 className='px-1 pb-1 pt-2 text-xs font-medium text-wa-muted'>Recent</h4>
          {recent.length
            ? <div className='grid grid-cols-4 gap-1'>{recent.map((u) => <Sticker key={u} code={notoCode(u)} url={notoCode(u) ? undefined : u} onClick={() => send(u)} />)}</div>
            : <p className='px-1 pb-2 text-xs text-wa-subtle'>Stickers you send will show up here</p>}
        </section>

        <section data-section='mine'>
          <h4 className='px-1 pb-1 pt-3 text-xs font-medium text-wa-muted'>My stickers</h4>
          <div className='grid grid-cols-4 gap-1'>
            {onCreateSticker && (
              <button type='button' onClick={() => fileRef.current?.click()} disabled={creating} className='flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#c4cbd0] text-xs text-wa-muted hover:border-wa-green hover:text-wa-green' title='Create a sticker from a picture'>
                {creating ? <span className='h-6 w-6 animate-spin rounded-full border-2 border-wa-green/30 border-t-wa-green' /> : <><IoAdd size={22} />Create</>}
              </button>
            )}
            {mine.map((u) => <Sticker key={u} url={u} onClick={() => send(u)} />)}
          </div>
          <input ref={fileRef} type='file' accept='image/*' className='hidden' onChange={create} />
        </section>

        {STICKER_PACKS.map((p) => (
          <section key={p.id} data-section={p.id}>
            <h4 className='px-1 pb-1 pt-3 text-xs font-medium text-wa-muted'>{p.name}</h4>
            <div className='grid grid-cols-4 gap-1'>
              {p.stickers.map((s) => <Sticker key={s.code} code={s.code} title={s.emoji} onClick={() => send(stickerUrl(s.code))} />)}
            </div>
          </section>
        ))}
        <p className='px-1 pt-3 text-center text-[10px] text-wa-subtle'>Animated stickers: Noto Emoji by Google, CC BY 4.0</p>
      </div>
    </>
  )
}

export default EmojiPicker
