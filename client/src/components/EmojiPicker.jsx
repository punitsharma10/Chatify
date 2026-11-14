import React, { useEffect, useRef, useState } from 'react'

// Lightweight emoji picker (no extra dependency).
const CATEGORIES = [
  { id : 'smileys', icon : '😀', emojis : '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 💀 👻 👽 🤖 💩 😺 😸 😹 😻 😼 😽 🙀 😿 😾'.split(' ') },
  { id : 'gestures', icon : '👍', emojis : '👋 🤚 🖐 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🧠 👀 👁 👄 💋 🫶 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧏'.split(' ') },
  { id : 'hearts', icon : '❤️', emojis : '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 🎉 🎊 🎈 🎁 🏆 🥇 🎯'.split(' ') },
  { id : 'nature', icon : '🌸', emojis : '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦉 🐝 🦋 🐌 🐢 🐍 🐙 🐬 🐳 🌸 🌹 🌺 🌻 🌼 🌷 🌱 🌲 🌴 🍀 🍁 🌍 🌙 ☀️ ⛅ 🌧 ⛈ ❄️ 🌈 ☔'.split(' ') },
  { id : 'food', icon : '🍕', emojis : '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🍜 🍝 🍣 🍱 🍛 🍚 🍰 🎂 🍩 🍪 🍫 🍬 🍦 ☕ 🍵 🧃 🥤 🍺 🍷 🥂'.split(' ') },
  { id : 'activity', icon : '⚽', emojis : '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🎮 🕹 🎲 🧩 🎨 🎬 🎤 🎧 🎸 🎹 🥁 🎻 📚 ✏️ 💻 📱 📷 🎥 💡 🚗 ✈️ 🚀 🏠 🏖 ⏰ 📅 ✅ ❌ ⚠️ ❓ ❗'.split(' ') },
]

const EmojiPicker = ({ onSelect, onClose, className = '' }) => {
  const [cat, setCat] = useState(CATEGORIES[0].id)
  const ref = useRef(null)

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
  }, [onClose])

  const current = CATEGORIES.find((c) => c.id === cat)

  return (
    <div ref={ref} className={`z-40 w-[min(340px,calc(100vw-16px))] animate-pop overflow-hidden rounded-xl bg-white shadow-menu ${className}`}>
      <div className='flex border-b border-wa-border'>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type='button'
            onClick={() => setCat(c.id)}
            className={`flex-1 py-2 text-lg transition-colors ${cat === c.id ? 'border-b-2 border-wa-green bg-wa-hover' : 'opacity-60 hover:opacity-100'}`}
            title={c.id}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className='grid h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2 scrollbar'>
        {current.emojis.filter(Boolean).map((e, i) => (
          <button
            key={`${e}-${i}`}
            type='button'
            onClick={() => onSelect(e)}
            className='flex h-9 items-center justify-center rounded-md text-[22px] hover:bg-wa-panel'
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

export default EmojiPicker
