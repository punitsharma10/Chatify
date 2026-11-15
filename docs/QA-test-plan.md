# Chatify 3-in-1: QA test plan

This plan covers the features added in the 3-in-1 work:

- **Pixify**, the Instagram-style app.
- **Connectify**, the Facebook-style app.
- The changes made inside **Chatify**, the messaging app, to connect the three apps.

Chatify features that existed before this work, such as chats, groups, calls and end-to-end encryption, are not part of this plan.

Tick each box as you test. When something fails, write down:

- the case number (for example **PX-4.3**)
- the account you used
- the screen size, and light or dark mode
- what you expected
- what happened, with a screenshot

---

## 0. Before you start

### 0.1 Accounts
Create at least **4 test accounts** (A, B, C, D) with different email addresses or phone numbers. Use two browsers or an incognito window to be logged in as two people at once.

| Account | Used for |
|---|---|
| A | Main tester |
| B | Friend and follower of A |
| C | Follows A but isn't A's Connectify friend |
| D | A stranger: no follow, no friendship, private account for some tests |

### 0.2 Server settings (`server/.env`)
- `YOUTUBE_API_KEY` must be set to test YouTube Shorts in Reels, Explore and Watch. Without it, those screens only show users' own posts.
- Cloudinary must be configured: posts, covers, Marketplace photos and voice notes upload there.

### 0.3 Devices and screens
Run the main flows on:
- **Desktop**, about 1440 px wide.
- **Tablet**, about 800 px.
- **Phone**, about 390 px (browser dev tools or a real phone).

Check **light and dark mode** at least once per app (Chatify Settings → Theme).

### 0.4 Test media
- 2–3 photos, including a portrait and a landscape one.
- 1 short video **with sound**.
- 1 longer video.

---

## 1. Across all three apps

### 1.1 App switcher
- [ ] **X-1.1** Desktop Chatify: the left rail shows icons for Chatify, Pixify and Connectify. Clicking each opens that app without logging in again.
- [ ] **X-1.2** Pixify: the switcher is at the bottom of the left menu. When the menu is open on hover, the three icons sit **in a row**. When it's closed, they're stacked.
- [ ] **X-1.3** Connectify: the switcher icons show in the top bar on large screens. The left column has "Your apps → Chatify, Pixify".
- [ ] **X-1.4** Phone: Connectify has an app bar at the bottom (Chatify / Pixify / Connectify). In Pixify, the "Pixify ▾" title at the top opens an app menu.
- [ ] **X-1.5** The messaging app is called **"Chatify"** everywhere (switcher tooltip, Connectify menu, share sheets). Inside Chatify, the **Chats** and **Calls** tabs keep their names.
- [ ] **X-1.6** Badges: an unread Chatify chat shows a badge on the Chatify icon. New Pixify notifications or Pixify messages show one on Pixify. New Connectify notifications, friend requests or Connectify messages show one on Connectify. The app you're in shows no badge.

### 1.2 @username (one username for all three apps)
- [ ] **X-2.1** Register a new account: an optional username field shows "available" or "taken" as you type.
- [ ] **X-2.2** An account with no username that opens Pixify or Connectify for the first time is asked to choose one. "Back to Chatify" returns to Chatify.
- [ ] **X-2.3** Chatify → Edit profile: change the username. It updates in Pixify and Connectify.
- [ ] **X-2.4** You can't take another user's username. Invalid characters and too-short names are rejected with a message.
- [ ] **X-2.5** Chatify search: typing an exact `@username` finds that person.

### 1.3 Stories shared to other apps
- [ ] **X-3.1** Create a story in Chatify. The composer has a **Share to: Chatify · Pixify · Connectify** picker; at least one must stay ticked.
- [ ] **X-3.2** A story shared to Pixify shows in Pixify's stories bar for A's **followers** only. A story shared to Connectify shows for A's **friends** only.
- [ ] **X-3.3** A story shared only to Chatify isn't visible in Pixify or Connectify.
- [ ] **X-3.4** Stories can also be created from Pixify (Create → Story) and from Connectify (Create story).
- [ ] **X-3.5** A blocked person (see 1.6) can't see A's stories in any app.

### 1.4 Posts sent into Chatify chats
- [ ] **X-4.1** From a Pixify or Connectify post, choose **Send in Chatify** (in Pixify: share sheet → Chatify), pick a chat and send.
- [ ] **X-4.2** In the Chatify chat, the message shows as a **post card** (app logo, author, picture or text, "View on Pixify/Connectify"). Clicking it opens the post.
- [ ] **X-4.3** The Chatify chat list preview shows "🖼️ Pixify post" or "📰 Connectify post" instead of a long link.
- [ ] **X-4.4** A post the recipient isn't allowed to see (private account, friends-only) shows "This post isn't available".

### 1.5 Chatify contact info
- [ ] **X-5.1** Open a contact's info in Chatify. There are links to their **Pixify** and **Connectify** profiles, and they open the right profile.

### 1.6 Blocking and deleting accounts
- [ ] **X-6.1** A blocks B in Chatify. B no longer sees A's posts, profile, stories or messages in Pixify or Connectify, and A doesn't see B's.
- [ ] **X-6.2** After unblocking, everything is visible again.
- [ ] **X-6.3** Delete test account D:
  - its posts, comments, follows, friendships, groups it owned and Marketplace listings disappear
  - its group memberships and event RSVPs are removed
  - its one-to-one Pixify/Connectify message threads are deleted
- [ ] **X-6.4** Profile photos that fail to load show the person's **initials** instead of a broken image.

---

## 2. Pixify (Instagram-style)

### 2.1 Navigation and layout
- [ ] **PX-1.1** Desktop: the left menu shows **icons only**. Hovering opens the full menu with names **over** the page, and the page doesn't move.
- [ ] **PX-1.2** Clicking an item (e.g. Explore) opens it and the menu folds back to icons. It only opens again after the mouse leaves and comes back.
- [ ] **PX-1.3** Phone: there's a top bar (Pixify ▾, ♡ notifications, ✈ messages) and a bottom tab bar (Home, Search, Create, Reels, Profile).
- [ ] **PX-1.4** The Messages icon in the left menu shows an unread count.

### 2.2 Home feed
- [ ] **PX-2.1** Home shows posts from people you follow plus your own, newest first.
- [ ] **PX-2.2** The **Following / Favorites** buttons work. Favorites shows only accounts added to Favorites, with a hint when it's empty.
- [ ] **PX-2.3** Desktop right column: your account plus **Suggested for you** with Follow buttons. There are **no** suggestion cards in the middle of the feed (removed on purpose).
- [ ] **PX-2.4** A new account with an empty feed sees a welcome message, "Share a photo" and **Suggested posts**.
- [ ] **PX-2.5** At the end of the feed: "You're all caught up" and "Explore more posts".

### 2.3 Create a post
- [ ] **PX-3.1** Create → Post: drag and drop or **Select from computer**, up to 10 photos and videos. More than 10 is refused.
- [ ] **PX-3.2** Arrows and the thumbnail strip move between items. ✕ removes an item, + adds more.
- [ ] **PX-3.3** **Filters**: 12 filters show as previews. The chosen filter shows on the big preview and is **kept in the posted photo**.
- [ ] **PX-3.4** Caption with up to 2,200 characters. The counter works. @mentions and #hashtags are allowed.
- [ ] **PX-3.5** **Add location**: it shows under the username on the post.
- [ ] **PX-3.6** **Tag people**: search and tick people. Tagged people get a notification, and a 👤 badge on the photo lists them.
- [ ] **PX-3.7** **Hide like count**: other people see "Liked by X and others" without numbers. The author still sees the count.
- [ ] **PX-3.8** **Turn off commenting**: the comment box and button are hidden for others.
- [ ] **PX-3.9** **Also share to Connectify**: the same photos and caption appear as a Connectify post.
- [ ] **PX-3.10** A single video becomes a **Reel**: it shows in Reels and on the profile's Reels tab.
- [ ] **PX-3.11** Upload progress shows, and the post opens after sharing.

### 2.4 Post actions (feed card and post page)
- [ ] **PX-4.1** Double-tap the photo → a heart animation plays and the post is liked. The heart button toggles like/unlike, and the count updates.
- [ ] **PX-4.2** "Liked by X and N others" → opens the list of people who liked it.
- [ ] **PX-4.3** Save/unsave (bookmark): it appears on and disappears from the profile's **Saved** tab.
- [ ] **PX-4.4** Paper plane → **Share** sheet (see 2.12).
- [ ] **PX-4.5** Carousel: swipe or use the arrows between photos.
- [ ] **PX-4.6** ••• menu on **your own** post:
  - Delete (asks for confirmation)
  - Archive / Show on profile
  - Pin to your profile / Unpin (max 3; a 4th is refused)
  - Hide or unhide like count
  - Edit (caption and location; shows "Edited")
  - Turn commenting on or off
  - Share to…, Copy link
- [ ] **PX-4.7** ••• menu on **someone else's** post:
  - Report (reason list → thank-you screen)
  - Unfollow
  - Add to favorites
  - Mute (their posts leave your feed)
  - Not interested (where shown)
  - Go to post, Share to…, Copy link, About this account
- [ ] **PX-4.8** The post page shows the picture on the left (desktop), with comments, the like bar, the date and the comment box.

### 2.5 Comments
- [ ] **PX-5.1** Add a comment from the feed card and from the post page.
- [ ] **PX-5.2** **Reply**: replies nest under the comment, with "View replies (N)".
- [ ] **PX-5.3** Like a comment (small heart); the count shows.
- [ ] **PX-5.4** The post's author can **Pin** one comment. It moves to the top with a "📌 Pinned" label. **Unpin** works, and nobody else can pin.
- [ ] **PX-5.5** The author's own comments show "· Author".
- [ ] **PX-5.6** The **quick emoji row** (❤️🙌🔥👏😢😍😮😂) above the comment box adds that emoji.
- [ ] **PX-5.7** Delete: you can delete your own comment, and the post author can delete any comment on their post.
- [ ] **PX-5.8** @mentioning someone in a comment notifies them.

### 2.6 Hashtags and search
- [ ] **PX-6.1** Clicking a #hashtag in a caption opens the **hashtag page**: post count and a grid of posts.
- [ ] **PX-6.2** Matching ignores case (#Goa = #goa) and must be the whole tag (#bea doesn't match #beach).
- [ ] **PX-6.3** Search: typing a name or @username shows people with Follow buttons. Typing `#tra` shows hashtags with post counts.
- [ ] **PX-6.4** **Recent searches**: they're remembered after opening a result. You can remove one with ✕ or **Clear all**.
- [ ] **PX-6.5** Clicking a post's location opens search for that place.

### 2.7 Explore
- [ ] **PX-7.1** Explore shows posts from **all public accounts**, including ones you don't follow. Private accounts are hidden unless you follow them, and your own posts aren't shown.
- [ ] **PX-7.2** Popular posts (more likes, comments and plays) come before quiet ones, with newer posts favoured.
- [ ] **PX-7.3** Layout: 3 columns, and every 5 tiles one **tall tile**. Tall tiles alternate right and left.
- [ ] **PX-7.4** Video and reel tiles show a 🎞 icon and play count. Hovering shows like and comment counts.
- [ ] **PX-7.5** Clicking a **video/reel tile** opens **Reels starting with that video**. Clicking a photo opens the post.
- [ ] **PX-7.6** Scrolling never repeats a post. After users' posts, **YouTube Shorts** tiles keep loading (needs the YouTube key).
- [ ] **PX-7.7** "Not interested" on a post removes it from Explore.

### 2.8 Reels
- [ ] **PX-8.1** Desktop layout (like Instagram):
  - the video is **centred** in a rounded 9:16 frame
  - the poster's avatar, username, **Follow** (if not followed), caption and "♪ Original audio" are on the **left**
  - the action column is on the **right**
- [ ] **PX-8.2** Action column, top to bottom: ❤️ with count, 💬 with count, ✈ share, 🔖 save, ••• and the poster's avatar.
- [ ] **PX-8.3** Phone: the video fills the screen; the caption and actions sit over the video and don't overlap the Messages button.
- [ ] **PX-8.4** Videos start **muted**, because browsers block autoplay with sound.
  - **Tap the video** to turn sound on or off; a speaker icon flashes.
  - Sound **stays on** for the next reels.
  - The 🔊 button is at the top right.
- [ ] **PX-8.5** A video with no audio track shows "This video has no sound" when sound is turned on.
- [ ] **PX-8.6** Double-tap the video → heart animation and like.
- [ ] **PX-8.7** 💬 opens the **comments panel** (read, write, like comments); the count updates.
- [ ] **PX-8.8** ••• menu:
  - Report (not on YouTube Shorts)
  - Not interested
  - Go to post / **Watch on YouTube** (for Shorts)
  - Copy link
  - About this account
- [ ] **PX-8.9** Desktop: the ⌃ / ⌄ buttons on the right and the keyboard ↑ / ↓ keys move between reels.
- [ ] **PX-8.10** Play counts go up when someone **else** watches. The author's own views don't count.
- [ ] **PX-8.11** Reels from public accounts you **don't follow** appear too.

### 2.9 YouTube Shorts in Reels and Explore (needs `YOUTUBE_API_KEY`)
- [ ] **PX-9.1** After users' reels run out, YouTube Shorts keep coming without end.
- [ ] **PX-9.2** A Short shows the channel name, a red YouTube icon, a "YouTube" badge and its title. The video plays inside the reel with **sound** after tapping.
- [ ] **PX-9.3** You can **like, comment on, save and share** a Short. The counts are kept when you come back.
- [ ] **PX-9.4** A Short shared in Direct opens in Reels when tapped.
- [ ] **PX-9.5** Shorts don't appear on hashtag pages or in the home feed, and they can't be deleted or reported.
- [ ] **PX-9.6** With the key removed, Reels and Explore stop when users' posts run out ("You've seen everything for now"), with no errors.

### 2.10 Profile
- [ ] **PX-10.1** Profile header:
  - photo, @username, post/follower/following counts
  - name with **pronouns**, bio, website link
  - "Follows you"
  - "Followed by X, Y" (mutual followers)
- [ ] **PX-10.2** Tabs: **Posts, Reels, Saved** (your own profile only) and **Tagged** ("Photos of you").
- [ ] **PX-10.3** Pinned posts come first in the grid with a 📌 icon. Archived posts aren't shown or counted.
- [ ] **PX-10.4** Your own profile:
  - **Edit profile**: photo, name, username, pronouns, website, bio (max 150), private account
  - **Share profile**: opens the share sheet
  - ⚙ / ☰ menu: Edit profile, Your activity (likes), Archive, Saved, Favorites, Muted accounts
- [ ] **PX-10.5** Someone else's profile:
  - Follow / Following / Requested, and **Message** (opens Pixify Messages)
  - ••• menu: Report, Mute/Unmute, Add to or Remove from favorites (only when following), Share this profile, Copy profile link, Remove follower (if they follow you)
- [ ] **PX-10.6** Followers and Following lists open. On your own Followers list, **Remove** works.
- [ ] **PX-10.7** **Your activity**: shows posts you liked.
- [ ] **PX-10.8** **Archive** page: archived posts, and opening one lets you show it on the profile again.
- [ ] **PX-10.9** **Favorites** and **Muted accounts** pages: lists with Remove/Unmute.

### 2.11 Follows and private accounts
- [ ] **PX-11.1** Follow a public account: posts appear in the feed straight away.
- [ ] **PX-11.2** Account D sets **Private account**. A taps Follow and sees "Requested"; D's posts show "This account is private".
- [ ] **PX-11.3** D gets the follow request (Notifications → requests). Confirm → A sees D's posts; Delete → the request is removed.
- [ ] **PX-11.4** Turning private off approves everyone who was waiting.
- [ ] **PX-11.5** Unfollow and cancelling a request both work.

### 2.12 Share sheet (paper plane)
- [ ] **PX-12.1** It shows a search box, recent chats and people you follow as round avatars. Tap to select several.
- [ ] **PX-12.2** With people selected, you can add a "Write a message…" note, then **Send** (or "Send separately" for several). They receive the post card, then the note.
- [ ] **PX-12.3** With nobody selected: **Copy link** and **Chatify** (sends into a Chatify chat).
- [ ] **PX-12.4** You can't share a private account's post that the person can't see.

### 2.13 Notifications
- [ ] **PX-13.1** Each of these creates a notification:
  - likes, comments, replies, comment likes
  - mentions, being tagged in a post
  - new followers, follow requests, accepted requests
- [ ] **PX-13.2** Follow-back buttons work from notifications, and follow requests can be confirmed or deleted.
- [ ] **PX-13.3** The unread badge clears after opening Notifications.

### 2.14 Pixify Messages (Direct): separate from Chatify
- [ ] **PX-14.1** **Messages** in the left menu opens the inbox: chat list on the left, chat on the right (desktop). On phones, the list and the chat are separate screens.
- [ ] **PX-14.2** **Notes** row at the top: "Your note" lets you write up to 60 characters, shared for 24 hours. Followers you follow back see it, and you can delete it.
- [ ] **PX-14.3** **New message** (✏️): search people and pick one (opens the chat) or several (creates a group, optional name).
- [ ] **PX-14.4** **Message requests**:
  - a message from someone you don't follow goes to **Requests**
  - the sender doesn't see "Seen" until you accept
  - Accept moves it to your inbox; Delete removes it (a new message brings it back); Block blocks them
- [ ] **PX-14.5** Following the sender moves their request into your inbox.
- [ ] **PX-14.6** In a chat:
  - text and emoji (1–3 emoji show large)
  - photos and videos (up to 10, with upload progress)
  - camera (phone)
  - **voice message** (record, cancel or send; plays back)
  - **❤️ heart** button
- [ ] **PX-14.7** Hover a message (desktop):
  - 😊 → quick reactions or the full emoji picker; one reaction per person
  - ↩ **Reply** (shows a quote)
  - ••• → time, Copy, **Forward**, **Edit** (own text within 15 minutes; shows "Edited"), **Unsend** (asks for confirmation)
- [ ] **PX-14.8** Phone: long-press a message for the reactions and menu.
- [ ] **PX-14.9** Double-tap a message → ❤️ reaction. Tapping the reaction pill shows who reacted, and lets you remove your own.
- [ ] **PX-14.10** **Seen** (1:1: "Seen just now" / "Seen 5m ago"; group: "Seen by …") and the **typing** indicator update live.
- [ ] **PX-14.11** "Active now" / "Active 5m ago" shows under the name, following Chatify's last-seen privacy setting.
- [ ] **PX-14.12** **Forward**: choose people or chats; the message arrives as a copy.
- [ ] **PX-14.13** Shared posts show as post cards and shared profiles as profile cards; both open correctly.
- [ ] **PX-14.14** Details (ⓘ):
  - Mute messages (no unread badge)
  - group name and photo (anyone can change them; a grey notice shows in the chat)
  - members with roles
  - Add people
  - admin: make or remove admin, remove from group
  - Leave chat, Delete chat, Block/Unblock
- [ ] **PX-14.15** **Calls**: the 📞 and 🎥 buttons start an audio or video call once the chat is accepted.
- [ ] **PX-14.16** Messages arrive live, without refreshing, in the other browser.
- [ ] **PX-14.17** Blocked, or blocked by them: the chat shows "You blocked this account" with Unblock, or "This account can't receive your messages".

### 2.15 Floating Messages button and popup
- [ ] **PX-15.1** A **Messages** button shows at the bottom right on every Pixify page (desktop) and just above the tab bar (phone). It isn't shown inside Messages itself.
- [ ] **PX-15.2** It shows a red unread count and the photos of the latest 3 chats with "•••". Message requests don't count.
- [ ] **PX-15.3** Clicking it opens the **popup** over the current page, showing "Messages" with a red count, **enlarge** and **✕**.
- [ ] **PX-15.4** The list shows unread chats in bold with a blue dot and "New message", plus times. The ✏️ button starts a new message.
- [ ] **PX-15.5** Clicking a chat opens it **inside the popup**, where you can reply. ← goes back to the list.
- [ ] **PX-15.6** **Enlarge** opens the full Messages page (and the open chat). ✕ and Esc close the popup.

---

## 3. Connectify (Facebook-style)

### 3.1 Layout
- [ ] **CX-1.1** Top bar tabs: Home, Friends (with request badge), **Watch**, **Marketplace**, **Groups**. The active tab is underlined.
- [ ] **CX-1.2** Top right: Messenger button (with unread count), 🔔 notifications (with badge), and your avatar.
- [ ] **CX-1.3** Left column (wide screens): you, Friends, Groups, Marketplace, Watch, Events, Memories, Saved, Birthdays, Pokes, then Your apps.
- [ ] **CX-1.4** Right column (wide screens):
  - a **birthday card** ("X has a birthday today") when a friend's birthday is today
  - a **Contacts** list; clicking a contact opens a Connectify chat with them
- [ ] **CX-1.5** Phone: a tab row (Home, Friends, Notifications, Profile, Menu). **Menu** shows all the shortcuts as cards.

### 3.2 News feed and composer
- [ ] **CX-2.1** The feed shows friends' posts, your own posts, and posts from **groups you're in**. It doesn't show snoozed or unfollowed people, or hidden posts.
- [ ] **CX-2.2** Create post:
  - text, with a large font for short posts
  - **coloured backgrounds** (short text only)
  - photos and videos
  - audience **Public / Friends / Only me**
- [ ] **CX-2.3** **Feeling/activity**: 24 options. The post reads "A is 😊 feeling happy", and "Remove feeling" works.
- [ ] **CX-2.4** **Tag friends**: pick from your friend list; the post reads "with B and 2 others". Tapping "2 others" lists them, and tagged friends are notified.
- [ ] **CX-2.5** **Check in**: the post reads "at Pune".
- [ ] **CX-2.6** **Also share to Pixify** (when the post has photos).
- [ ] **CX-2.7** The audience is respected: Friends-only posts aren't visible to non-friends, and Only me isn't visible to anyone else.

### 3.3 Reactions, comments, sharing
- [ ] **CX-3.1** Hover or long-press **Like** to get 7 reactions (Like, Love, Care, Haha, Wow, Sad, Angry). Click to change or remove. The counts and top-3 icons update.
- [ ] **CX-3.2** Clicking the reaction count lists people and their reactions.
- [ ] **CX-3.3** Comments:
  - add, reply (nested), like
  - delete your own; the post author can delete any comment on their post
  - the post author can **Pin comment**, and it moves to the top with a "Pinned" label
- [ ] **CX-3.4** **Send** button: opens the share sheet to send the post in **Connectify Messages**. The sheet also has **Chatify** and Copy link.
- [ ] **CX-3.5** **Share** button → Share to Feed (public posts only, with your own text), Send in Messages, Send in Chatify, Copy link.
- [ ] **CX-3.6** Hashtags in posts are clickable and open a Connectify hashtag page.

### 3.4 Post ••• menu
- [ ] **CX-4.1** On your own post:
  - Save/Unsave, Pin/Unpin to profile (max 3)
  - Edit post, Edit audience
  - Turn commenting on or off
  - Open post, Copy link
  - Move to trash
- [ ] **CX-4.2** On someone else's post:
  - Save post
  - **Hide post** (it leaves the feed)
  - **Snooze X for 30 days**
  - **Unfollow X** (you stay friends but stop seeing their posts)
  - **Report post**
- [ ] **CX-4.3** In a group where you're an admin: **Remove post from group**.

### 3.5 Friends
- [ ] **CX-5.1** Send, cancel, accept and decline friend requests from profiles, suggestions and notifications.
- [ ] **CX-5.2** **People you may know**: Chatify contacts and friends of friends, with a mutual friend count.
- [ ] **CX-5.3** Unfriend works, and the badge on Friends shows waiting requests.

### 3.6 Profile
- [ ] **CX-6.1** Your own profile:
  - cover photo upload ("Add cover photo" / "Edit cover photo")
  - friend count with friend avatars
  - **Edit profile** → bio, city, work, education, hometown, website, relationship status, **birthday** (month and day; year optional and private)
- [ ] **CX-6.2** The Intro shows each filled field with an icon (works at, studied at, lives in, from, relationship, birthday, website link, joined date).
- [ ] **CX-6.3** Friends see the birthday day and month; non-friends don't see it. The year is never shown to others.
- [ ] **CX-6.4** A friend's profile:
  - Add friend / Friends
  - **Message** (opens Connectify Messages)
  - **Poke** / Poke back / "Poked"
  - ••• → Snooze or Unsnooze, Unfollow or Follow posts again, Copy link to profile, Report profile
- [ ] **CX-6.5** Tabs: **Posts** (pinned post first, with a 📌 icon), **About**, **Friends**, **Photos**.

### 3.7 Pokes and birthdays
- [ ] **CX-7.1** You can only poke friends. Poking twice is refused. A poke notifies the person.
- [ ] **CX-7.2** **Pokes** page lists who poked you, with **Poke back** (which clears their poke).
- [ ] **CX-7.3** **Birthdays** page shows today's birthdays and those in the next 30 days, each with a Message button (opens Connectify Messages).

### 3.8 Groups
- [ ] **CX-8.1** **Create new group**: name, privacy (Public/Private), description, cover photo, invite friends (they're notified).
- [ ] **CX-8.2** **Your groups** and **Discover** tabs, and group search.
- [ ] **CX-8.3** **Public** group: Join adds you at once. Anyone can see the posts.
- [ ] **CX-8.4** **Private** group:
  - non-members see "This group is private" and can't see posts, even by direct link
  - Join sends a **request**, and Cancel request works
- [ ] **CX-8.5** Admin → **Requests** tab: Approve/Decline. Approved people are notified and can then see posts.
- [ ] **CX-8.6** Members can post ("Write something…"). Group posts show "A ▸ Group name" in the news feed. Non-members can't post.
- [ ] **CX-8.7** **Members** tab: admins first. An admin can Make admin, Remove as admin or Remove from group.
- [ ] **CX-8.8** **Edit group** (admins only): name, privacy, description, cover, **Delete group** (removes its posts).
- [ ] **CX-8.9** **Leave group**: if the last admin leaves, the longest-standing member becomes admin.
- [ ] **CX-8.10** **About** tab: description, privacy and created date.

### 3.9 Events
- [ ] **CX-9.1** **Create new event**: cover, name, start (must be in the future), optional end (must be after the start), location, privacy (Public / Friends / Private-invite only), details, invite friends.
- [ ] **CX-9.2** Tabs: **Upcoming**, **Going / interested**, **Hosting**, **Past**.
- [ ] **CX-9.3** **Interested** and **Going** buttons toggle, and the counts update. The host is notified when someone is going.
- [ ] **CX-9.4** Friends-only events are visible to the host's friends only. Private events only to invited people.
- [ ] **CX-9.5** **Invite**: the host and guests who are going can invite friends, who are notified.
- [ ] **CX-9.6** Clicking the guest count lists the Going and Interested people.
- [ ] **CX-9.7** The host can **Edit** and **Cancel event**. Others can't.

### 3.10 Marketplace
- [ ] **CX-10.1** **Create new listing**: 1–10 photos (required), title, price (0 shows "Free"), category, condition, location, description.
- [ ] **CX-10.2** **Browse all**: category chips and search filter the grid. Sold items aren't shown.
- [ ] **CX-10.3** A listing page shows the photo dots, price, status, details and seller.
- [ ] **CX-10.4** As a buyer: **Message seller** (opens Connectify Messages) and **Save** (appears in the Saved tab).
- [ ] **CX-10.5** As the seller: **Edit**, Mark as **pending / sold / available**, **Delete**. **Your listings** shows them all, including sold ones.
- [ ] **CX-10.6** Only the seller can edit or delete. Negative prices are refused.

### 3.11 Watch (with YouTube Shorts)
- [ ] **CX-11.1** Watch shows video posts from friends, your groups and public posts.
- [ ] **CX-11.2** After those run out, **YouTube Shorts** keep loading (needs the YouTube key). Each shows a red YouTube icon, the channel name, a "YouTube" badge and the title.
- [ ] **CX-11.3** Shorts play in YouTube's player. Tap for sound.
- [ ] **CX-11.4** You can use **all 7 reactions** on a Short, plus comments, Save and Send in Messages. Its counts are **separate** from the same Short in Pixify.
- [ ] **CX-11.5** On a Short's ••• menu, Snooze, Unfollow and Report are hidden and **Watch on YouTube** is shown. "Share to feed" isn't offered.
- [ ] **CX-11.6** Shorts don't appear in the news feed.

### 3.12 Memories and Saved
- [ ] **CX-12.1** **Memories** shows your own posts from today's date in earlier years, with "N years ago". Otherwise it shows an empty message.
- [ ] **CX-12.2** **Saved** lists the posts you saved, newest saved first.

### 3.13 Notifications
- [ ] **CX-13.1** Each of these creates a notification with the right text:
  - reactions, comments, replies, comment likes, mentions, shares
  - friend requests and accepts
  - tagged in a post, poked
  - group invite, join request, approved request
  - event invite, someone going
- [ ] **CX-13.2** Clicking a notification opens the right place: post, profile, group, event or Pokes.
- [ ] **CX-13.3** A friend request can be accepted directly from Notifications. The **Unread** filter works.

### 3.14 Search
- [ ] **CX-14.1** Search people by name or @username, with friend status shown.

### 3.15 Connectify Messages (like Messenger): separate from Chatify and Pixify
- [ ] **CX-15.1** The **Messenger button** in the top bar opens the **popup** (same behaviour as PX-15.3 to PX-15.6, in Connectify colours). Inside the full Messages page, it goes to the page instead.
- [ ] **CX-15.2** Full page at `/connectify/messages`, titled "Chats". The left and right columns are hidden so the chat has room.
- [ ] **CX-15.3** **Friends'** messages go straight to the inbox. **Non-friends'** messages go to **Requests** (Accept / Delete / Block).
- [ ] **CX-15.4** Pixify following does **not** move a Connectify request to the inbox; only friendship does.
- [ ] **CX-15.5** Connectify chats never appear in Pixify Messages or Chatify, and the other way round.
- [ ] **CX-15.6** All chat features from PX-14.6 to PX-14.17 work the same here (except Notes, which is Pixify-only).
- [ ] **CX-15.7** The Messenger button's badge and the Connectify app-switcher badge count unread Connectify messages.
- [ ] **CX-15.8** **Message** buttons open Connectify Messages: profiles, Contacts, Marketplace "Message seller", Birthdays.
- [ ] **CX-15.9** Light and dark mode both use Connectify's blue colour scheme.

---

## 4. Privacy and security checks (all apps)
- [ ] **SEC-1** Logged out: every Pixify and Connectify page and API returns you to login, or answers 401.
- [ ] **SEC-2** Private Pixify account: posts, Tagged, Reels and Saved stay hidden from non-followers, including by direct post link.
- [ ] **SEC-3** Connectify Friends-only and Only-me posts can't be opened by others through a copied link.
- [ ] **SEC-4** Private group posts and private events can't be opened by non-members or uninvited people through a link.
- [ ] **SEC-5** You can't read, react to, edit or unsend messages in someone else's conversation.
- [ ] **SEC-6** You can't edit or delete another person's post, comment, group, event or listing.
- [ ] **SEC-7** Media must come from the app's upload service: pasting outside image or video links is refused.
- [ ] **SEC-8** Blocking applies everywhere (see X-6.1).

---

## 5. Responsive and theme pass
For each screen below, check **desktop, tablet and phone**, **light and dark mode**, with **no sideways scrolling** and nothing overlapping:

- [ ] **Pixify:** Home, Post page, Explore, Reels, Search, Profile, Edit profile, Notifications, Messages (inbox and chat), Messages popup, Create post.
- [ ] **Connectify:** Home, Friends, Profile, Watch, Groups (list and page), Events (list and page), Marketplace (browse and listing), Messages (page and popup), Menu, Birthdays, Pokes, Memories, Saved, Notifications.

---

## 6. Not built yet (don't log as bugs)
- Pixify: story highlights, close friends, vanish mode, GIFs and stickers in Messages, collab and scheduled posts.
- Connectify: Pages (business/creator pages), live video, fundraisers, dating, gaming.
- Phone push notifications for Pixify/Connectify activity.
- Notes in Connectify Messages.
