# Pixify & Connectify: QA, Bug Fixes and Instagram/Facebook Parity Report

_Date: 15 November 2026 · Branch: `feature/social-qa-parity` (cut from `feature/3-in-1-v2`, not committed) · All testing was local: own MongoDB, own servers on ports 3091/5091, fake Cloudinary, no YouTube key. Production was never touched._

---

## 1. Summary

| | |
|---|---|
| **Test plan executed** | Every case in `docs/QA-test-plan.md` (sections 1–5) in real Chrome browsers with 2–4 accounts at once, plus ~530 extra API checks and edge cases beyond the plan. |
| **Result of the plan** | Almost everything passed first time. **26 bugs** found (privacy, layout, races, missing refreshes), plus a few unfinished-looking gaps. |
| **Bugs fixed** | **All 26 fixed** and re-tested, plus 1 extra layout bug found while testing the new features. |
| **New features (Instagram → Pixify)** | Story **Highlights** + **Stories archive**, **Close Friends** (green ring), **Collab posts**, **Scheduled posts**, **Alt text**, **Post insights**, **Hidden words** (comment filter), **Location pages**, Explore on the phone Search tab, unfollow confirmation for private accounts. |
| **New features (Facebook → Connectify)** | **Pages** (create, follow, post as a Page, admins, discover), **Polls** in posts, **Scheduled posts**, custom audiences **"Specific friends"** and **"Friends except…"**. |
| **Tests at the end** | Backend **1,015 / 1,015** (20 suites; 4 new: postextras 46, highlights 60, pages 63, plus the earlier e2ee 63) · client unit 14/14 · new browser suites: fixes + post features 22/22, Highlights/Close Friends 52/53 (1 timing-only miss), Pages 40/40 · strict production build compiles · regression run of the testers' suites (see §6). |
| **Not testable here** | YouTube Shorts with a real key (PX-9.1–9.5, CX-11.2–11.5), real Cloudinary, real phones/touch, push notifications. |

---

## 2. How the testing was done
- **Two QA passes in parallel**: one for Pixify (section 2 + Pixify security/responsive), one for Connectify + cross-app (sections 1, 3, 4, 5).
- Real accounts created through the normal email-code sign-up, logged in from separate browser contexts (each one a separate device), talking to each other live.
- Every screen in section 5 checked at **1440 / 800 / 390 px**, **light and dark**, with an automatic sideways-scroll check and screenshots.
- Data checked directly in MongoDB where the plan needs it (account deletion clean-up, privacy).
- Everything beyond the plan: long text/URLs, emoji, rapid double clicks, simultaneous requests, refresh/back button, direct links to private content, console errors.

---

## 3. Test plan results

| Area | Result |
|---|---|
| X-1 App switcher, badges | ✅ all pass |
| X-2 @username | ✅ (X-2.1 checked in the Connectify prompt; the same field) |
| X-3 Stories to other apps | ✅ — bug 6 fixed (unfriend didn't hide a story) |
| X-4 Posts in Chatify chats | ✅ |
| X-5 Contact info links | ✅ |
| X-6 Block / delete account | ✅ (deletion clean-up verified in MongoDB) |
| PX-1 Navigation | ✅ |
| PX-2 Home feed | ✅ |
| PX-3 Create post | ✅ (filter really baked into the uploaded photo) |
| PX-4 Post actions | ❌→✅ "Not interested" and Favorites toggle fixed |
| PX-5 Comments | ✅ — reply-to-reply mention fixed |
| PX-6 Hashtags, search | ✅ — hashtag counts fixed; location now opens a real place page |
| PX-7 Explore | ❌→✅ "Not interested" on posts opened from Explore |
| PX-8 Reels | ❌→✅ Messages button overlapping, replies in comments, end message, "1 play" |
| PX-9 YouTube Shorts | ⚪ not testable without a key; graceful end ✅ |
| PX-10 Profile | ❌→✅ Edit profile blank on refresh; "Follows you" on phones |
| PX-11 Follows / private | ✅ |
| PX-12 Share sheet | ✅ |
| PX-13 Notifications | ✅ |
| PX-14 Direct | ❌→✅ request → inbox after following; block from a request |
| PX-15 Messages popup | ❌→✅ enlarge from an open chat; "New message" no longer closes the popup |
| CX-1 – CX-3 | ✅ — shared group post bug fixed |
| CX-4 Post menu | ❌→✅ Hide / Snooze / Unfollow now remove posts instantly |
| CX-5 – CX-8 | ✅ — private-group mention leak fixed |
| CX-9 Events | ✅ — end-before-start validation fixed |
| CX-10 Marketplace | ✅ |
| CX-11 Watch | ✅ (Shorts ⚪ not testable) — nested-button warning fixed |
| CX-12 – CX-15 | ✅ — Saved page unsave, join-request notification fixed |
| SEC-1 … SEC-8 | ❌→✅ private-group mention leak, hashtag counts and play counts on private reels fixed |
| Section 5 responsive + dark | ❌→✅ clipped captions and overlapping Messages button fixed |

---

## 4. Bugs found and fixed (26 + 1)

### Privacy / security
| # | Bug | Fix |
|---|---|---|
| 1 | **@mentioning someone in a private group post sent them a notification with the post text**, even though they're not a member (SEC-4). | Mentions check group privacy before notifying (`helpers/social.js`). |
| 2 | Hashtag counts (page + search suggestions) included posts you can't see, e.g. from private accounts (SEC-2). | Counts only posts visible to the viewer (`countVisible`). |
| 3 | With "Hide like count" on, the real number still came back from the like API and showed on grid/Explore tiles. | Server masks the count for others; tiles hide it. |
| 4 | Non-followers could add plays to a private account's reels via the API. | Plays are counted only from people who can see the reel. |
| 5 | Private-group posts could be shared to a public feed. | Sharing is refused for private-group posts. |
| 6 | After unfriending/unfollowing, the person could still see your Connectify/Pixify story until it expired. | The stories bar checks the current friendship/follow every time. |

### Functional
| # | Bug | Fix |
|---|---|---|
| 7 | Connectify Hide post / Snooze / Unfollow showed a toast but the post stayed until refresh. | Removed immediately (Snooze/Unfollow remove all their posts). |
| 8 | Sharing any group post to your feed showed "This content isn't available". | Shared posts load their group too. |
| 9 | Event end time could end up before the start when editing the start. | Validated. |
| 10 | Five fast clicks on Like could create duplicate reactions from one person. | Atomic "add only if not there". |
| 11 | Deleting the same comment twice at once made the comment count negative. | Count follows what was really deleted, never below 0. |
| 12 | Pixify Edit profile was blank when opened directly or refreshed. | Form fills once the account has loaded. |
| 13 | "Not interested" in the home feed hid all of that person's posts, and the post came back after refresh. | Hides just that post, also on the server. |
| 14 | "Not interested" missing on posts opened from Explore, and on the reel you opened Reels with. | Added. |
| 15 | Following someone didn't move their waiting message request into your inbox (Instagram does). Same for becoming friends in Connectify. | Request moves to the inbox immediately. |
| 16 | Blocking from a message request left it showing "Accept message request". | Shows the blocked state. |
| 17 | No "enlarge" while a chat is open in the Messages popup; closing "New message" closed the whole popup. | Enlarge button added; popup stays. |
| 18 | Replying to a reply @mentioned the wrong person. | Mentions the person you reply to. |
| 19 | Recent searches were shared by every account on the same browser. | Stored per account. |
| 20 | "Also share to Connectify" dropped location and tagged people. | Kept. |
| 21 | Post menu always said "Add to favorites". | Toggles to "Remove from favorites". |
| 22 | Replies never showed in the Reels comments panel; Reels had no end message; "1 plays". | Fixed all three. |
| 23 | Hashtag page count dropped to 0 after loading more posts. | Count kept while paging. |
| 24 | Connectify Saved: unsaving left the card until reload; join-request notification opened the wrong tab; @username shown with a map-pin icon; video tiles had a button inside a button (React warning). | All fixed. |

### Layout
| # | Bug | Fix |
|---|---|---|
| 25 | A long word/URL in a caption widened the post page so the whole caption was clipped (phone and desktop). | Wraps correctly. |
| 26 | The floating Messages button covered the comment "Post" button (phone post page) and Reels captions/avatar. Also "Follows you" was missing on phones. | Button hidden where it overlaps; label shown on phones. |
| 27 | _(found while testing the new features)_ With more options, Pixify's "New post" side panel didn't scroll and the caption box collapsed. | Panel scrolls. |

Also improved: comment **Delete** is visible on phones (was hover-only); unfollowing a **private** account asks first; the phone Search tab shows the **Explore grid** (there was no way to Explore on phones); clicking a location opens a **place page** instead of an empty people search.

---

## 5. New features

### Pixify (Instagram)
| Feature | How it works |
|---|---|
| **Stories archive** | Every story shared to Pixify is kept privately after it expires (profile ☰ → Stories archive). |
| **Highlights** | Circles under the bio; create from the archive, title, cover, edit/rename/remove, delete; full-screen viewer with progress bars and tap navigation. Respect private accounts and blocks. |
| **Close Friends** | Manage the list (profile ☰ → Close friends); "Close friends only" when posting a story → **green ring** + badge, visible only to people on the list (checked live). |
| **Collab posts** | "Invite collaborator" (up to 3). Invitee accepts from a banner on the post; then it shows "ana and bea", appears on both profiles and both sets of followers' feeds. "Remove me as collaborator" later. |
| **Scheduled posts** | Advanced settings → Schedule (5 min – 75 days). Invisible until published; tags/mentions notify at publish time; Scheduled posts page with Publish now / Change time / Delete. |
| **Alt text** | Per photo, used by screen readers. |
| **Post insights** | ••• → View insights: accounts reached, likes, comments, saves, shares, plays (author only). |
| **Hidden words** | Comments containing your words are hidden from everyone but the writer; you see them marked "Hidden". |
| **Location pages** | Tap a location → all posts from that place with a count. |

### Connectify (Facebook)
| Feature | How it works |
|---|---|
| **Pages** | Create a Page (category, bio, picture, cover, contact). Follow/Following, Posts and About tabs, admins (add friends / remove, always ≥ 1), edit, delete. **Post as the Page**; followers see Page posts in Home with the Page as the author. Pages hub: Your Pages, Followed, Discover, Create. Follow notifications to admins. |
| **Polls** | Poll button in the composer: 2–6 options, single or multiple choice; vote / change / take back; percentage bars; "See votes". |
| **Scheduled posts** | Schedule button in the composer; Scheduled posts page in the menu. |
| **Specific friends / Friends except…** | Two new audiences with a friend picker; enforced on the server for feed, links and search. |

---

## 6. Test evidence
- **Backend (fresh database):** api 67 · apps 39 · calls 27 · contacts 37 · dm 82 · e2ee 63 · explore 34 · features 74 · groupcalls 29 · groups 64 · **highlights 60** · media 16 · otp 28 · **pages 63** · phone 17 · planner 23 · **postextras 46** · social 106 · socialplus 109 · status 27 → **1,015 / 1,015**.
  - Note: some suites use fixed hashtags/places and expect exact counts, so they must run on a **fresh** test database (running them repeatedly on the same one fails those counts).
- **Client:** unit tests 14/14; `CI=true react-scripts build` compiles with no warnings.
- **Browser:** QA passes on all of sections 1–5 (≈300 Pixify + ≈230 Connectify/API checks); new-feature/fix suite 22/22; Highlights + Close Friends 52/53 (the 1 miss read a colour mid-animation; screenshot shows it correct); Pages 40/40; regression re-run of the testers' suites on the final code: Connectify API 227/229, Connectify UI 79/80 + 86/88 + 16/16, Pages 40/40, Highlights 52/53. Each remaining miss was checked by hand and is a test expectation, not an app bug: the left column now (correctly) also lists Pages and Scheduled posts; one script step depends on an earlier step's data (the join-request notification works when tested directly); a friends-only post shared to a non-friend arrives as a post id that the app resolves to "This post isn't available"; a text pattern that doesn't cross line breaks; and 404s from the fake image host.

### Known limits (not bugs)
- Explore paging is by rank position, so a post that gains likes while you scroll can be skipped (never repeated).
- Insights "accounts reached" counts people who liked or commented (impressions aren't tracked).
- Uploaded photos show as broken in test screenshots because the fake image host serves compressed bytes; the real Cloudinary path is unchanged.

---

## 7. Ideas that would make Chatify different from Instagram and Facebook

These are things neither app offers, built on what makes Chatify unique: **three apps, one account, one inbox of trust**.

1. **One post, three audiences, three tones.** Write once and Chatify adapts it: a family-only photo album to Chatify groups, a polished post to Pixify followers, a text update to Connectify friends, each with its own caption and audience, in one step.
2. **Circles that work everywhere.** One "Family", "College", "Work" list used across all three apps (chat groups, Pixify Close Friends, Connectify "Specific friends"). Neither Meta app shares lists between products.
3. **Private by default, end-to-end for real.** Extend Chatify's end-to-end encryption to Pixify Direct, Connectify Messages and Close-Friends stories. Instagram/Facebook DMs aren't end-to-end encrypted by default everywhere; "your friends-only content is unreadable even to us" is a strong promise.
4. **Calm mode / no-ads, chronological guarantee.** A clear promise: no ads, no algorithm in Home (always newest first), "You're all caught up" after a daily limit you choose, and a weekly digest instead of endless scrolling.
5. **Shared memories across apps.** "On this day" that pulls together chats, photos and posts from the same day, family-friendly, with a one-tap "Send to the group that was there".
6. **Planner everywhere.** Chatify already has reminders and scheduled messages; extend them: "remind me about this post", event reminders from Connectify Events into your Chatify Planner, group trips with a shared checklist.
7. **Family / community spaces.** A "Home" space that bundles a Chatify group, a private Pixify album, a Connectify group and a shared calendar, ideal for families, hostels, clubs, small societies.
8. **Group polls that decide things.** Polls with deadlines, auto-reminders to people who haven't voted, and a result posted back to the chat (dates, places, food orders).
9. **Ownership and portability.** "Download everything" in open formats (photos with captions, chats as text, posts as a website) and a one-click "leave without losing anything". Both Meta apps make this hard.
10. **Local-language first.** Auto-captions and translation for Hindi and other regional languages in chats, posts and Reels, so families across languages can talk.
11. **Verified-by-friends instead of blue ticks.** Trust badges earned from mutual contacts ("known to 12 of your contacts") to fight fake profiles and scams.
12. **Group-buy Marketplace for neighbours.** Neighbourhood listings with "split the cost" group buys and handover chat in Chatify.

---

## 8. Files touched (all uncommitted on `feature/social-qa-parity`)
- **New (server):** `controllers/postExtras.controller.js`, `controllers/highlights.controller.js`, `controllers/pages.controller.js`, `models/highlight.model.js`, `models/cxPage.model.js`, `tests/postextras.test.js`, `tests/highlights.test.js`, `tests/pages.test.js`.
- **New (client):** `components/pixify/PixifyExtras.jsx`, `components/pixify/Highlights.jsx`, `components/connectify/CxPages.jsx`.
- **Changed (server):** `models/social.model.js`, `models/user.model.js`, `models/status.model.js`, `helpers/social.js`, `helpers/status.js`, `helpers/socialCleanup.js`, `helpers/scheduler.js`, `controllers/posts.controller.js`, `controllers/people.controller.js`, `controllers/dm.controller.js`, `controllers/cx.controller.js`, `socket/statusHandlers.js`, `routes/social.js`, `controllers/deleteAccount.controller.js`.
- **Changed (client):** `routes/Routes.jsx`, `helpers/social.js`, `components/StatusPanel.jsx`, `components/social/common.jsx`, `components/social/extras.jsx`, Pixify: `CreatePost.jsx`, `Post.jsx`, `PixifyHome.jsx`, `PixifyProfile.jsx`, `PixifyDiscover.jsx`, `PixifyLayout.jsx`, `Reels.jsx`, `direct/DirectThread.jsx`, `direct/MessagesPill.jsx`; Connectify: `Composer.jsx`, `CxPost.jsx`, `ConnectifyHome.jsx`, `ConnectifyPages.jsx`, `ConnectifyMore.jsx`.
