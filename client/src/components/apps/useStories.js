import { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { socketCall } from '../../helpers/socketCall'

// Stories shown in one app ('pixify' | 'connectify'). It's the same story record that Chats calls a status,
// so a story shared to several apps shows in each of them and is viewed / deleted once.
// Returns { data: { mine, updates } | null, reload, unseen }
const useStories = (app) => {
  const socket = useSelector((s) => s.user.socketConnection)
  const [data, setData] = useState(null)

  const reload = useCallback(async () => {
    if (!socket) return
    const res = await socketCall(socket, 'status-list', { app })
    if (res.ok) setData({ mine : res.mine || [], updates : res.updates || [] })
  }, [socket, app])

  useEffect(() => {
    reload()
    if (!socket) return
    const onChange = () => reload()
    // reconnects (the server restarted, or the network came back) also refresh the list
    socket.on('connect', onChange)
    socket.on('status-changed', onChange)
    socket.on('status-viewed', onChange)
    return () => { socket.off('connect', onChange); socket.off('status-changed', onChange); socket.off('status-viewed', onChange) }
  }, [socket, reload])

  // unseen first, then seen; muted people last (like the Chats Status tab)
  const ordered = data ? [
    ...data.updates.filter((u) => !u.allViewed && !u.muted),
    ...data.updates.filter((u) => u.allViewed && !u.muted),
    ...data.updates.filter((u) => u.muted),
  ] : []

  return { data, ordered, reload, unseen : ordered.some((u) => !u.allViewed && !u.muted) }
}

export default useStories
