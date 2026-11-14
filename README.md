# Chatify

A full-stack, real-time chat app inspired by WhatsApp Web: 1:1 and group messaging, voice and video calls, and email/phone sign-in with OTP verification.

## Tech Stack

**Frontend**
- React 18 (Create React App)
- Redux Toolkit + React Redux for state
- React Router v6
- Tailwind CSS + React Bootstrap
- Socket.IO Client for real-time updates
- Axios, Moment.js, React Hot Toast, React Icons, Lottie

**Backend**
- Node.js 24 + Express
- Socket.IO for real-time messaging, presence and call signaling
- MongoDB Atlas + Mongoose

**Auth & Security**
- JWT stored in HTTP-only cookies
- bcrypt.js password hashing
- CORS allow-list

**OTP & Notifications**
- Email OTP: Nodemailer over Gmail SMTP
- Mobile OTP (SMS): textbee (Android SMS gateway), with Twilio as an alternative

**Voice & Video Calls**
- WebRTC (peer-to-peer audio/video, mesh topology for group calls)
- Socket.IO as the signaling channel
- STUN: Google public servers
- TURN: Cloudflare Realtime TURN, so calls connect on mobile networks behind carrier NAT

**Media**
- Cloudinary for image, video and file uploads

**DevOps**
- GitHub Actions CI/CD: tests and production build run on every push, deploy only when they pass
- Render: backend web service + frontend static site

## Key Features

- Real-time 1:1 and group chats
- Typing indicators, online/last seen, delivered and read receipts
- Reply, forward, edit, delete for me / for everyone
- Emoji reactions, starred and pinned messages, message search
- Images, videos, files, emoji and stickers
- Disappearing messages
- Groups with admins, member management and permission settings
- 1:1 and group voice/video calls with call history
- Contacts, message requests, blocking and privacy settings
- Archive, pin and mute chats
- Sign up with email or phone, OTP verification and password reset
- Responsive WhatsApp Web–style UI for desktop and mobile

## Project Structure

```
client/   React frontend
server/   Express + Socket.IO backend (controllers, models, routes, socket handlers, tests)
```
