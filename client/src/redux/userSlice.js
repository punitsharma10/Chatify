import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  _id : "",
  name : "",
  email : "",
  phone : "",
  profile_pic : "",
  about : "",
  privacy : {},
  blocked : [],
  contacts : [], // [{ userId, name }] people I saved
  hasChatLock : false, // a chat lock secret code is set
  token : "",
  onlineUser : [],
  socketConnection : null,
  connected : false
}

export const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser : (state,action)=>{
        state._id = action.payload._id
        state.name = action.payload.name
        state.email = action.payload.email || ""
        state.phone = action.payload.phone || ""
        state.profile_pic = action.payload.profile_pic
        state.about = action.payload.about || ""
        state.privacy = action.payload.privacy || {}
        state.blocked = (action.payload.blocked || []).map(String)
        if (action.payload.hasChatLock !== undefined) state.hasChatLock = !!action.payload.hasChatLock
        if (action.payload.contacts) state.contacts = action.payload.contacts.map((c) => ({ userId : String(c.userId), name : c.name || '' }))
    },
    setContacts : (state,action)=>{
        state.contacts = action.payload
    },
    setHasChatLock : (state,action)=>{
        state.hasChatLock = !!action.payload
    },
    setBlocked : (state,action)=>{
        state.blocked = action.payload
    },
    setToken : (state,action)=>{
        state.token = action.payload
    },
    logout : (state)=>{
        state._id = ""
        state.name = ""
        state.email = ""
        state.phone = ""
        state.profile_pic = ""
        state.about = ""
        state.privacy = {}
        state.blocked = []
        state.contacts = []
        state.hasChatLock = false
        state.token = ""
        state.socketConnection = null
        state.connected = false
    },
    setOnlineUser : (state,action)=>{
      state.onlineUser = action.payload
    },
    setSocketConnection : (state,action)=>{
      state.socketConnection = action.payload
    },
    setConnected : (state,action)=>{
      state.connected = action.payload
    }
  },
})

// Action creators are generated for each case reducer function
export const { setUser, setHasChatLock, setBlocked, setContacts, setToken ,logout, setOnlineUser,setSocketConnection, setConnected } = userSlice.actions

export default userSlice.reducer
