import { createSlice } from '@reduxjs/toolkit'

// chat list + typing state shared by the sidebar and the open conversation
const initialState = {
  conversations : [],
  loaded : false,
  typing : {} // userId -> true while that user is typing to me
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
      const { userId, isTyping } = action.payload
      if (isTyping) state.typing[userId] = true
      else delete state.typing[userId]
    },
    resetChat : () => initialState
  }
})

export const { setConversations, setTyping, resetChat } = chatSlice.actions
export default chatSlice.reducer
