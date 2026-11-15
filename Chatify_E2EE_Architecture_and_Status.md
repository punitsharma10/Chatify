# Chatify – End-to-End Encryption: Architecture, Implementation and Final Status

_Date: 15 November 2026 · Scope: `client/` (React) and `server/` (Express + Socket.IO + MongoDB) · All testing was done locally (local MongoDB, local servers, fake Cloudinary). Production was not touched._

---

## 1. Final status (summary)

| | |
|---|---|
| **Status** | **Implemented and tested.** New messages are end-to-end encrypted on the device before they leave it. The server, the database and Cloudinary only ever see ciphertext. |
| **What is encrypted** | Text, captions, photos, videos, documents, voice messages, custom stickers' messages, polls (question + options), contact cards, locations, link previews, edits, replies' quoted text, forwards, scheduled messages, reminder previews and status updates (text and media). 1:1 chats **and** groups. |
| **How** | Browser WebCrypto only — no paid service, no new npm packages, no external accounts. ECDH P-256 + HKDF-SHA-256 + AES-256-GCM for confidentiality, ECDSA P-256 signatures for authenticity. |
| **Multi-device** | Every browser is its own device with its own keys. Messages are encrypted for every device of every participant (including your own other devices). A new device can receive your message history from an old device ("Share" prompt). |
| **Verification** | WhatsApp-style 60-digit security code per contact, "Mark as verified", and a notice when a contact's security code changes. |
| **Tamper detection** | A changed, forged or re-labelled message is refused and shown as "This message couldn't be verified". |
| **Tests** | Backend **472/472** (63 new E2EE tests) · client unit **14/14** (8 new crypto tests) · browser E2EE suite **45/45** · full browser regression with encryption on (see §9) · strict production build: compiles. |
| **Not in this version** | Signal-style Double Ratchet (per-message forward secrecy), Sender Keys for big groups, encrypted cloud backup, call-fingerprint verification. See the roadmap (§8). |

---

## 2. What "end-to-end" protects — and what it can't

**Protects against**
- Anyone with access to the **MongoDB database** (admins, backups, a leak): only ciphertext and public keys are stored.
- The **Chatify server process** itself while running: it relays and stores envelopes it cannot open, and cannot forge or alter them (signatures + authenticated encryption).
- **Cloudinary**: files are encrypted before upload; Cloudinary stores random bytes.
- **Network observers** (on top of HTTPS/WSS).

**Does not protect against** (same as every E2EE messenger)
- A compromised device or browser (malware, someone using your unlocked computer).
- **Metadata**: who talks to whom and when, group membership, message type (photo / text / poll…), reaction emojis, poll vote positions, @mention targets. The server needs these to route, count and notify.
- **Web-app trust**: Chatify is a web app, so the JavaScript that does the encryption is downloaded from the Chatify server. A malicious server could ship modified code. WhatsApp Web has the same issue and mitigates it with the "Code Verify" browser extension; see the roadmap.
- Key substitution by a malicious server ("man in the middle") is **detectable, not prevented**: compare security codes (§4.6). This is the same trust model as WhatsApp's.

---

## 3. Architecture overview

```
 Sender device (browser)                     Chatify server                         Recipient devices
 ────────────────────────                    ──────────────                         ─────────────────
 1. keys: ECDH + ECDSA (P-256),             public-key directory                   own keys in IndexedDB
    private keys non-extractable,  ──────▶  users.devices[] (public only)
    stored in IndexedDB
 2. fetch recipients' device keys  ◀──────  e2ee-chat-devices (members + my devices)
 3. body JSON ─AES-256-GCM(k)─▶ ct
    header = from|device|to|cid|time (AAD)
    sig = ECDSA(header|iv|ct)
    k wrapped per device:
    ECDH(ephemeral, device) → HKDF → AES-GCM
 4. send envelope ────────────────────────▶ checks shape, sender, that every       5. receive envelope with ONLY
                                            active device has a key; stores        their own wrapped keys
                                            {e2ee, e2eeKind}; text = ''      ────▶ 6. verify signature (sender's
                                                                                       device key), unwrap k, decrypt,
                                                                                       check sender + chat match
 Files: encrypt (AES-256-GCM, random key) ─▶ Cloudinary (ciphertext) ◀─ download, check SHA-256, decrypt → blob URL
```

### 3.1 Keys (per device)
- Created on first login in a browser (`helpers/e2ee/crypto.js → generateDeviceKeys`): one **ECDH P-256** pair (encryption) and one **ECDSA P-256** pair (signatures).
- Private keys are created **non-extractable** and kept in **IndexedDB** (`helpers/e2ee/store.js`). They can't be read by JavaScript, exported or sent anywhere.
- Only the public halves are published: `e2ee-register` → `users.devices[] = { id, ecdh, sign, name, createdAt, lastSeen, removedAt? }`.
- A device id is bound to its keys forever (the server refuses the same id with different keys).
- Logging out keeps the keys in that browser (so it can read its messages again after logging back in) but deletes the local readable search copies. **"Log out" from Linked devices** on another device retires that browser's keys (`removedAt`): nobody encrypts to it any more. Retired public keys are kept so old signatures can still be verified.
- Max 10 active devices per account (oldest unused are retired).

### 3.2 Message envelope (v1)
```json
{ "v": 1, "from": "<userId>", "dev": "<deviceId>", "to": "<peerId | groupId>",
  "cid": "<clientId>", "t": 1763190000000,
  "iv": "<12-byte IV>", "ct": "<AES-256-GCM ciphertext of the JSON body>",
  "sig": "<ECDSA P-256/SHA-256 over header|iv|ct>",
  "keys": [ { "u": "<userId>", "d": "<deviceId>", "epk": "<ephemeral public key>",
              "iv": "…", "wk": "<wrapped message key>" } ] }
```
- **Body** (encrypted JSON): `text`, `media {kind,url,key,iv,sha,mime,size,name,dur,wave}`, `poll {question,options}`, `contact`, `location`, `linkPreview`, `caption`, `preview`.
- **Header as AAD**: the ciphertext only decrypts with the exact sender, device, chat, client id and time it was made with.
- **Signature**: proves which device wrote it; the recipient checks it with that device's public key **before** decrypting.
- **Recipient checks**: signature valid · message's sender (`msgByUserId`) equals `from` · the chat it appears in equals `to` (so the server can't move a message to another chat or relabel the sender).

### 3.3 Server's role (`server/helpers/e2ee.js`, `server/socket/e2eeHandlers.js`)
- Validates envelope **shape and size** (ciphertext ≤ 160 KB, ≤ 2048 wrapped keys, no duplicates), that `from` is the logged-in user and `to` is the chat.
- **Coverage check**: every active device of every participant must have a wrapped key, otherwise `E2EE_KEYS_CHANGED` → the client re-fetches keys and re-encrypts once automatically (nobody receives a message they can't open).
- Rejects wrapped keys for people outside the chat.
- **Per-viewer filtering**: each person only receives the wrapped keys for their own devices.
- Stores `e2ee` + a coarse `e2eeKind` (needed for "Media / Docs / Links" tabs and validation); plain `text` stays empty.

### 3.4 Groups
- Same fan-out as 1:1: one ciphertext, one wrapped key per member device (members + my other devices). New members can't read messages from before they joined (like WhatsApp). Former members keep only what they had.

### 3.5 Files (photos, videos, documents, voice, status media)
- The device encrypts the file (AES-256-GCM, random key) and uploads only ciphertext to Cloudinary as a raw file.
- The URL, key, IV, SHA-256 of the ciphertext, MIME type, size and name travel **inside** the encrypted message.
- Recipients download, verify the hash, decrypt and show a local `blob:` URL. The sender sees their own file instantly (no re-download).

### 3.6 Multi-device + history sync
- New device → `e2ee-new-device` reaches your other online devices → toast **"Chatify was opened on a new device … Share your message history with it?"**.
- On **Share**, the old device asks for messages it can open that the new one can't (`e2ee-sync-batch`), unwraps each message key with its own private key and re-wraps it for the new device's public key (`e2ee-add-keys`). The server only stores the new wrapped keys — it never sees a message key.
- Until then the new device shows **"Waiting for this message. This may take a while."** (WhatsApp wording).

### 3.7 Security code and change notices
- **Security code**: 60 digits computed from both people's device public keys (each half: 1 024 rounds of SHA-256). Both phones/browsers show the same code; **Contact info → Encryption**.
- **Mark as verified** is stored on the device.
- If a contact's keys change (new device / reinstall), a notice appears in the chat: *"Your security code with … changed … Click to verify it."*

### 3.8 Things the server used to do on plaintext, now done on the device
| Feature | Before | Now (encrypted chats) |
|---|---|---|
| Search messages | MongoDB regex on `text` | Local index of decrypted text in IndexedDB, merged with server results for old plain messages |
| Export chat | Server wrote the .txt | Server returns encrypted items; the device decrypts and writes the file |
| Forward | Server copied the message | Device re-encrypts it for each target chat (media key reused, file not re-uploaded) |
| Link preview | Server fetched after sending | Device asks `/api/link-preview` before sending and puts the preview inside the encrypted body (the server sees that one URL; switch off under Privacy → Link previews) |
| Edit | New text to the server | New envelope for the same people |
| Reminder preview | Server copied message text | Preview encrypted for my own devices only |
| Scheduled message | Text stored until due | Encrypted when scheduled, sent unchanged when due |
| Polls | Question/options stored | Encrypted; server stores only the number of options to count votes |
| View once | URL withheld | Whole envelope withheld until "open", handed out once |
| Delete for everyone | Text wiped | Envelope wiped |

---

## 4. Rollout and compatibility
- **Existing messages** stay as they were (plain); nothing is lost.
- A chat switches to encryption automatically as soon as **every** participant has opened the updated Chatify once (their browser creates keys). Until then the chat shows a grey notice *"Messages to X aren't end-to-end encrypted yet because they haven't opened the latest Chatify"* and messages are sent as before. When encrypted, the yellow WhatsApp-style notice says *"Messages and calls are end-to-end encrypted…"*.
- Browsers without WebCrypto/IndexedDB keep working unencrypted and say so.
- **No configuration needed**: no new environment variables, no new packages, no paid services.
- **Cloudinary note**: encrypted files are uploaded as *raw* files through the existing unsigned preset. Cloudinary's plan limits for raw files apply (on free plans raw files are typically limited to 10 MB). If an upload is refused, the user sees "Couldn't upload … Tap to retry". Check the `chatify_File` preset allows raw/auto uploads before deploying.

---

## 5. Comparison with WhatsApp (Signal Protocol)

| Property | WhatsApp | Chatify v1 |
|---|---|---|
| Messages unreadable by the server | ✅ | ✅ |
| Server can't forge / alter messages | ✅ | ✅ (ECDSA + AES-GCM AAD) |
| Encrypted media | ✅ | ✅ |
| Groups | ✅ (Sender Keys) | ✅ (per-device fan-out; fine up to the 256-member limit) |
| Multi-device | ✅ | ✅ (+ history sharing) |
| Security code / change notice | ✅ | ✅ |
| Forward secrecy per message (Double Ratchet) | ✅ | ❌ — a stolen device key can open messages that device received; each message still has its own random key and an ephemeral wrap key |
| Signed device list (account-level identity) | ✅ | ❌ — a new device of a contact is trusted on first use (mitigated by change notice + code) |
| Encrypted backups | ✅ (optional) | ❌ |
| Call media | E2EE (SRTP) | WebRTC DTLS-SRTP peer-to-peer (already encrypted end to end; signalling fingerprints not yet verified) |
| Code verification for the web client | Code Verify extension | ❌ (roadmap) |

---

## 6. Files

**New**
- `client/src/helpers/e2ee/crypto.js` — primitives (keys, seal/open, wrap/unwrap/rewrap, file encryption, security code)
- `client/src/helpers/e2ee/store.js` — IndexedDB (device keys, pins, local search index)
- `client/src/helpers/e2ee/index.js` — manager (registration, key directory, encrypt-before-send, decrypt-on-receive, media, search, security, history sync)
- `client/src/helpers/rawCall.js` — socket call without the E2EE layer
- `client/src/components/Encryption.jsx` — chat notices, Encryption row, security-code dialog, export formatting
- `client/src/helpers/e2ee/crypto.test.js` — 8 unit tests
- `server/helpers/e2ee.js` — envelope validation, per-viewer filtering, coverage
- `server/socket/e2eeHandlers.js` — device directory + history sync events
- `server/tests/e2ee.test.js` — 63 backend tests

**Changed**
- Server: `models/user.model.js` (devices), `models/conversation.model.js` (e2ee, e2eeKind, viewOnceKind, statusReply.e2ee), `models/status.model.js`, `models/planner.model.js`, `helpers/chat.js` (serialization), `socket/chatHandlers.js` (encrypted send/edit/delete/forward/shared/view once/export), `socket/plannerHandlers.js`, `socket/statusHandlers.js`, `helpers/scheduler.js`, `socket/index.js`, `controllers/sessions.controller.js` (remote log out retires keys), `controllers/deleteAccount.controller.js` (keys removed).
- Client: `helpers/socketCall.js` (encrypt out / decrypt back, automatic retry on key changes), `helpers/uploadFile.js` (encrypt files), `pages/Home.jsx` (start keys, decrypt events, new-device + history prompts), `components/Message.jsx`, `MessageBubble.jsx`, `SideBar.jsx`, `ChatSearch.jsx`, `ContactInfo.jsx`, `GroupInfo.jsx`, `StatusPanel.jsx`, `StarredMessages.jsx`, `setupTests.js`.

---

## 7. Known limitations (honest list)
1. **No per-message forward secrecy** (see §5). Mitigation today: private keys are non-extractable, so malware can use them while it runs but can't copy them out.
2. **Trust on first use** for new devices of contacts; detection via security codes and change notices, not prevention.
3. **Metadata visible** to the server (who, when, type, reactions, vote positions, mentions).
4. **History on a new device** needs one of your old devices to be online and you to tap *Share*. Statuses aren't synced (they expire in 24 h anyway).
5. **Search** covers encrypted messages that this device has already opened (like WhatsApp's local search).
6. **Link previews**: the server is asked for the preview of the URL you are about to send (it can see that URL, not the message). Turn off in Privacy → Link previews.
7. **Custom stickers** you create are uploaded as normal images so they can be reused from "My stickers"; the message that sends them is encrypted.
8. **Cloudinary raw-file size limits** may apply to encrypted media (see §4).
9. Messages sent before encryption was enabled remain plain on the server.

---

## 8. Roadmap (what "full Signal-level" would add)
| Step | What | Effort |
|---|---|---|
| 1 | **Double Ratchet + X3DH** (per-message forward secrecy, post-compromise security) using Signal's open-source `libsignal` (WASM, AGPL-3.0 — licence must suit the project) or a reviewed TypeScript implementation; keep the envelope `v:2` | Large |
| 2 | **Sender Keys** for groups (one encryption per message instead of per device) | Medium |
| 3 | **Account identity key** that signs each device ("signed device list") so the server can't silently add devices | Medium |
| 4 | **Encrypted backup** of keys with a user passphrase (Argon2/PBKDF2 → AES-GCM) for "lost all devices" recovery | Medium |
| 5 | **Call verification**: show/compare DTLS fingerprints or sign them with device keys | Small |
| 6 | **Code transparency** for the web client (Subresource Integrity + published build hashes / browser extension) | Medium |
| 7 | QR-code scanning of security codes; per-chat "verified" badge in the header | Small |

---

## 9. Test evidence

### Backend (`TEST_MONGODB_URI=mongodb://127.0.0.1:27018/chatify_test npm test`)
| Suite | Result |
|---|---|
| api | 67/67 |
| calls | 27/27 |
| contacts | 37/37 |
| **e2ee (new)** | **63/63** |
| features | 74/74 |
| groupcalls | 29/29 |
| groups | 64/64 |
| media | 16/16 |
| otp | 28/28 |
| phone | 17/17 |
| planner | 23/23 |
| status | 27/27 |
| **Total** | **472/472** |

New backend checks include: invalid / mismatched device keys refused · public-key directory never exposes session ids · envelope from someone else / for another chat / unknown kind refused · missing recipient device → `E2EE_KEYS_CHANGED` · keys for outsiders refused · each viewer gets only their own wrapped keys · server never echoes plaintext · server search can't find encrypted text · reply quotes filtered per viewer · plain-text edit of an encrypted message refused, encrypted edit accepted · server-side forward refused, device forward keeps "Forwarded" · encrypted polls store no text, votes counted by number, out-of-range vote refused · encrypted photos listed in Media · view once withheld and opened exactly once · delete for everyone wipes the envelope · group coverage and per-member keys · status audience and per-viewer status keys, strangers refused · scheduled message stored encrypted and sent unchanged · reminder preview encrypted for own devices only · encrypted export · second device registration, new-device notice, history sync batch/add-keys rules, Bob can't add keys to Alice's device · remote log out stops encrypting to that device but keeps its public key.

### Client unit tests (`CI=true npx react-scripts test`) — 14/14
Crypto: private keys not extractable · sender and recipient decrypt, ciphertext hides text · no key → can't open, stolen entry → refused · changed ciphertext / header / signature detected · forged device signature refused · re-wrapped key opens on a new device · file encrypt/verify/decrypt, altered file refused · security code: 60 digits, identical on both sides, changes with a new device.

### Browser, two to four real Chrome sessions (each its own device) — `e2ee.js` 45/45
Device keys registered (public only) · encrypted-chat notice · recipient + sender read the message · **database holds ciphertext only** (checked directly in MongoDB) · keys only for the two people · third user can't load the chat · reply · edit (not stored in plaintext) · local search finds encrypted messages · link message (URL not in DB) · **photo: Cloudinary received ciphertext, recipient sees the decrypted photo**, caption not stored · same 60-digit security code on both sides · **tampered ciphertext rejected** · **message re-labelled as from someone else rejected** · forward re-encrypted on device and labelled Forwarded · group of 3: readable, keys for exactly 3 members · encrypted poll readable, not in DB, votes counted · **second device: "Waiting for this message" → old device offers Share → history readable** · message from 2nd device readable by contact and 1st device · view once encrypted, withheld, opens once · scheduled message stored encrypted, shown in Planner, delivered · status audience, status stored encrypted, contact sees it decrypted · contact without keys → clear "not encrypted yet" notice and message still delivered · delete for everyone removes ciphertext · two active devices · no page errors.

### Full browser regression with encryption switched on
Every earlier browser suite was re-run with encryption active (each browser registers keys, so these chats are now encrypted). Three test scripts needed selector updates for the navigation rail added earlier; the app needed no changes.

| Suite | Result |
|---|---|
| Core 1:1 journey | 9/9 |
| Dark mode | 2/2 |
| Round 1 features | 36/36 |
| Round 2 edge cases | 16/16 |
| Responsive (6 sizes, light + dark) | 72/72 |
| Phase 2 (Planner, notes, silent) | 14/14 |
| **E2EE (new)** | **45/45** |
| **Total** | **194/194** |

### Build
`CI=true react-scripts build` (warnings treated as errors): **Compiled successfully.**

### Not tested
Real Cloudinary raw-upload limits on your plan, real phones, browsers other than Chrome, very large groups (256 members × several devices), and live calls.
