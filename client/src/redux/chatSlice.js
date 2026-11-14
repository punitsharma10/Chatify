import { createSlice } from '@reduxjs/toolkit'

// chat list + typing state shared by the sidebar and the open conversation
const initialState = {
  conversations : [],
  loaded : false,
  typing : {} // chat id -> true (1:1) or the typer's name (group) while someone is typing
}

export const chatSlice = createSlice({
  name : 'chat',
  initialState,
  reducers : {
    setConversations : (state, action) => {
      state.conversations = action.payload
      state.loaded = true
    },
    setTyping : (state, action) => {
      const { userId, isTyping, name } = action.payload
      if (isTyping) state.typing[userId] = name || true
      else delete state.typing[userId]
    },
    // one chat-list row changed (groups send single rows instead of the whole list)
    upsertConversation : (state, action) => {
      const item = action.payload
      const i = state.conversations.findIndex((c) => String(c._id) === String(item._id))
      if (i === -1) state.conversations.push(item)
      else state.conversations[i] = item
      state.conversations.sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
        return new Date(b.lastActivity) - new Date(a.lastActivity)
      })
    },
    removeConversation : (state, action) => {
      state.conversations = state.conversations.filter((c) => String(c._id) !== String(action.payload))
    },
    resetChat : () => initialState
  }
})

export const { setConversations, setTyping, upsertConversation, removeConversation, resetChat } = chatSlice.actions
export default chatSlice.reducer
