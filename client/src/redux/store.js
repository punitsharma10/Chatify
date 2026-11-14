import { configureStore } from '@reduxjs/toolkit'
import userReducer from './userSlice'
import chatReducer from './chatSlice'

export const store = configureStore({
  reducer: {
    user : userReducer,
    chat : chatReducer
  },
  // the socket.io connection object is kept in the store, which is not serializable
  middleware : (getDefault) => getDefault({ serializableCheck : false, immutableCheck : false })
})
