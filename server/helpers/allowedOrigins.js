// Frontend addresses allowed to call this API (HTTP + Socket.IO).
// FRONTEND_URL can hold several, separated by commas, e.g.
//   FRONTEND_URL=https://chatify.vercel.app,http://localhost:3000
const allowedOrigins = () =>
    (process.env.FRONTEND_URL || '')
        .split(',')
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean)

// shared by express cors() and Socket.IO
const corsOrigin = (origin, callback) => {
    // requests without an Origin header (curl, health checks, server-to-server) are allowed
    if (!origin) return callback(null, true)
    if (allowedOrigins().includes(origin.replace(/\/+$/, ''))) return callback(null, true)
    return callback(new Error(`Origin ${origin} is not allowed by CORS`))
}

module.exports = { allowedOrigins, corsOrigin }
