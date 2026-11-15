import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useSelector } from 'react-redux'
import { formatPhone } from './phone'

// How a person is shown, WhatsApp style:
//  - saved contact -> the name you saved (or their profile name if you didn't type one)
//  - not saved     -> their phone number, or "~Profile name" if they have no number
export const displayName = (p, contacts = {}, myId) => {
  if (!p) return ''
  if (p.isGroup) return p.name || ''
  const id = String(p._id || '')
  if (p.self || (myId && id === String(myId))) return p.profileName || p.name || ''
  const saved = contacts[id]
  if (saved) return saved.name || p.profileName || p.name || ''
  if (p.phone) return formatPhone(p.phone)
  return `~${p.profileName || p.name || ''}`
}

// "~Rahul" shown next to the number of someone you haven't saved
export const profileHint = (p, contacts = {}, myId) => {
  if (!p || p.isGroup || p.self || String(p._id) === String(myId) || contacts[String(p._id)]) return ''
  return p.phone ? `~${p.profileName || p.name || ''}` : ''
}

export const useContacts = () => {
  const list = useSelector((s) => s.user.contacts)
  return useMemo(() => Object.fromEntries((list || []).map((c) => [String(c.userId), c])), [list])
}

// returns { name(person), hint(person), isContact(id) }
export const usePeopleNames = () => {
  const contacts = useContacts()
  const me = useSelector((s) => s.user._id)
  const name = useCallback((p) => displayName(p, contacts, me), [contacts, me])
  const hint = useCallback((p) => profileHint(p, contacts, me), [contacts, me])
  const isContact = useCallback((id) => !!contacts[String(id)], [contacts])
  return { name, hint, isContact }
}

// my saved contacts with their (privacy-filtered) profiles, from the same API as "New chat"
export const useContactList = () => {
  const saved = useSelector((s) => s.user.contacts)
  const [list, setList] = useState(null)
  useEffect(() => {
    let alive = true
    axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/searchuser`, { search : '' }, { withCredentials : true })
      .then((res) => { if (alive) setList((res.data.data || []).filter((u) => u.isContact)) })
      .catch(() => { if (alive) setList([]) })
    return () => { alive = false }
  }, [saved])
  return list
}
