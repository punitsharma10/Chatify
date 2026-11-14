const express = require('express')
const { Server } = require('socket.io')
const http  = require('http')
const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken')
const UserModel = require('../models/user.model')
const presence = require('./presence')
const { corsOrigin } = require('../helpers/allowedOrigins')
const registerChatHandlers = require('./chatHandlers')

const app = express()

/***socket connection */
const server = http.createServer(app)
const io = new Server(server,{
    cors : {
        origin : corsOrigin,
        credentials : true
    },
    // detect dropped connections quickly so presence doesn't go stale
    pingInterval : 20000,
    pingTimeout : 15000
})

// every online user gets the list of online users they are allowed to see (privacy + blocks)
const broadcastOnline = () => {
    for (const id of presence.onlineIds()) {
        io.to(id).emit('onlineUser', presence.visibleOnlineFor(id))
    }
}

/*** authenticate every socket before it connects; identity always comes from the token, never from the client payload */
io.use(async(socket, next)=>{
    try {
        const user = await getUserDetailsFromToken(socket.handshake.auth?.token)
        if(!user || user.logout || !user._id){
            return next(new Error('unauthorized'))
        }
        socket.data.userId = user._id.toString()
        socket.data.user = user
        // new client identifies itself so the server can keep the old event format for older clients
        socket.data.v2 = socket.handshake.auth?.client === 'v2'
        next()
    } catch (error) {
        next(new Error('unauthorized'))
    }
})

io.on('connection',(socket)=>{
    const userId = socket.data.userId

    //create a room per user (all their tabs/devices join it)
    socket.join(userId)

    const cameOnline = presence.add(socket.data.user)
    if(cameOnline){
        broadcastOnline()
    }else{
        socket.emit('onlineUser', presence.visibleOnlineFor(userId))
    }

    registerChatHandlers(io, socket, { broadcastOnline })

    //disconnect
    socket.on('disconnect',async()=>{
        const wentOffline = presence.remove(userId)
        if(wentOffline){
            try {
                await UserModel.updateOne({ _id : userId }, { $set : { lastSeen : new Date() } })
            } catch (error) {
                console.log('lastSeen update failed', error.message)
            }
            broadcastOnline()
        }
    })
})

module.exports = {
    app,
    server,
    io,
    broadcastOnline
}
