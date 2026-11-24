# TikTok app review and Content Posting audit: application kit

The rules were checked against TikTok's Content Sharing Guidelines and Content Posting API docs
(as of 2026-11-23). Two separate approvals are needed:

1. **App review** (production app): Login Kit + Content Posting API with the `user.info.basic`,
   `video.upload` and `video.publish` scopes.
2. **Content Posting API audit**: lifts "private only", so direct posts can be public, get
   auto-added music, and go out on schedule with no tapping.

---

## 0. Before you submit (decisions only you can make)

- [x] **Make Slideflow genuinely available to other people.** Done: public repo https://github.com/anduciu234/slideflow (MIT). TikTok's guidelines say an app must
      not be "limited to test apps or internal use". The website and this application describe
      Slideflow as a product for app makers, so that has to be true: a public download, a
      public GitHub repo, or a sign-up/waitlist page where people can actually get it. Put the
      link in `site/index.html` (`[DOWNLOAD LINK]`).
- [x] **Add a support contact**. Done: GitHub Issues, linked on every page. (a support email or form) to the website. Reviewers expect a way
      to reach you. Fill in `[SUPPORT EMAIL]` / `[OPERATOR NAME]` in `site/*.html`.
- [ ] **Request only the scopes you demo:** `user.info.basic`, `video.upload`, `video.publish`.
      Remove any others (e.g. stats scopes) from the production app before submitting, or the
      review gets delayed.
- [ ] **Products on the production app:** Login Kit (Desktop, redirect `http://localhost:5178/callback`)
      and Content Posting API with Direct Post turned on. URL prefix
      `https://slideflow-site.vercel.app/` is verified (keep the signature files).
- [x] **Deploy the updated website.**

---

## 1. App details (copy and paste)

**App name:** Slideflow

**Category:** Photo & Video (or Productivity)

**Description:**
> Slideflow is a desktop studio for app makers who market their apps on TikTok. Users create
> photo slideshows for each of their apps, preview them, and publish them to their own TikTok
> accounts, either straight to their profile or to their TikTok inbox to finish in the TikTok
> app, now or at a time they choose.

**Platform:** Desktop, website `https://slideflow-site.vercel.app/`

**Terms of Service:** `https://slideflow-site.vercel.app/terms.html`
**Privacy Policy:** `https://slideflow-site.vercel.app/privacy.html`

---

## 2. "Explain how each product and scope works" (≤1000 characters, currently 962)

> Slideflow is a desktop studio where app makers create TikTok photo slideshows for their apps and post them to their own TikTok accounts.
>
> Login Kit (user.info.basic): in Slideflow, the user clicks "Connect a TikTok account" and approves on TikTok's authorization page. We read open_id and display_name to show which account is connected and to label posts.
>
> Content Posting API (video.publish): on the "Post to TikTok" screen the user sees the account nickname, a preview of every photo, an editable title and caption, a privacy dropdown with no default (options come from creator_info), "Allow comments" (off by default), and the commercial content disclosure toggles. After they click Post, we upload the photos with DIRECT_POST and show the publish status.
>
> Content Posting API (video.upload): the user can instead choose "Send to my TikTok inbox". We upload with MEDIA_UPLOAD and tell them to open the inbox notification to add a sound and publish in TikTok.

---

## 3. Content Posting API audit form: suggested answers

| Question | Answer |
|---|---|
| Use case | App makers publishing photo slideshows they created in Slideflow to their own TikTok accounts. |
| Content type | Photo posts (PULL_FROM_URL from our verified URL prefix). |
| How users post | They choose every setting on the Post to TikTok screen and click Post or Schedule. Nothing is posted without that explicit action. Scheduled posts use the settings chosen at scheduling time. |
| Expected daily active creators | Start small and honest, e.g. **25** (raise later). |
| Expected posts per creator per day | **1–3** |
| Content origin | Created by the user in Slideflow (original slideshows for their own apps). No content copied from other platforms. No Slideflow watermark or branding is added. |

---

## 4. Demo video script (record in the **sandbox**, about 2–3 minutes, MP4 or MOV, ≤50 MB)

TikTok requires first-time apps to demo with a sandbox. Before recording:
- Set the TikTok test account to **private** (unaudited apps can only post to private accounts, as "Only me").
- Run the dashboard: `npm run dashboard`, then open http://localhost:5180.
- Record with **Cmd+Shift+5 → Record Selected Portion**, at 1080p. Speak or add captions for each step.

| # | Show | Say / caption |
|---|---|---|
| 1 | The website `slideflow-site.vercel.app` in the browser | "This is Slideflow, a desktop studio for creating and posting TikTok slideshows for your apps." |
| 2 | The dashboard: sidebar of apps → pick an app → Slideshows | "Users organise slideshows by app." |
| 3 | **Accounts → Connect a TikTok account** → TikTok's authorization page with the scopes listed → Authorize → "Connected" | "Login Kit: the user connects their TikTok account. We use user.info.basic to show the connected account." |
| 4 | Slideshows → **Post or schedule…** on a slideshow | "The Post to TikTok screen." |
| 5 | Point at "Posting to <nickname> (@username)" and the photo preview | "We show which account it will post to, and a preview of every photo." |
| 6 | Edit the title and caption a little | "Title and hashtags are editable." |
| 7 | How to post → **Publish directly**. Open the privacy dropdown (it starts on "Select…") and choose **Only me** | "Privacy options come from creator_info and have no default." |
| 8 | Show "Allow comments" unchecked. Tick it, then untick it | "Interaction settings are off by default." |
| 9 | Turn on **Disclose commercial content** → Your brand → shows "Promotional content". Tick Branded content → "Only me" greys out and the declaration changes. Turn the toggle off again | "Commercial content disclosure, per TikTok's guidelines." |
| 10 | Point at "By posting, you agree to TikTok's Music Usage Confirmation" | — |
| 11 | Click **Post now**: "Uploading…" → "Published" | "video.publish: DIRECT_POST, then we show the publish status." |
| 12 | Open TikTok (app or web) on the test account and show the new photo post | "The post is on the profile." |
| 13 | Back in Slideflow: another slideshow → How to post → **Send to my TikTok inbox** → Send to inbox → status "In your TikTok inbox" | "video.upload: MEDIA_UPLOAD." |
| 14 | On the phone: TikTok inbox notification → open → TikTok editor (add a sound) → post | "The user finishes the post in TikTok." |
| 15 | Optional: When → Schedule for… → pick a time → Schedule → it shows in Schedule | "Users can also choose a time. The post goes out with the settings they chose." |

Upload the video under "Upload at least one demo video". If it's over 50 MB, export it at a lower bitrate.

---

## 5. Compliance checklist (TikTok Content Sharing Guidelines → Slideflow)

| Guideline | Where in Slideflow | Status |
|---|---|---|
| 1. Fetch the latest creator_info when the post page opens | `openPost` → `/api/creator` on open and on account change | ✅ |
| 1a. Show the creator's nickname | "Posting to **nickname** (@username)" | ✅ |
| 1b. Creator can't post → stop and ask them to try later | creator_info error → red "can't post right now… try again later", button disabled | ✅ |
| 2a. Title can be entered | Title field (max 90) | ✅ |
| 2b. Privacy from privacy_level_options, chosen manually, no default | Dropdown starts on "Select…", Post disabled until chosen | ✅ |
| 2c. Interactions off by default, greyed out if disabled. Photos: comments only | "Allow comments" unchecked, disabled if `comment_disabled` | ✅ |
| Music Usage Confirmation declaration before posting | Shown above the button | ✅ |
| 3a. Commercial toggle off by default, Your brand / Branded content, label prompts, button disabled until one is chosen | Implemented with TikTok's wording | ✅ |
| 3b. Branded content can't be private | "Only me" disabled with hover text, and vice versa | ✅ |
| 4. Declarations change with the selection (Branded Content Policy + Music Usage Confirmation) | `pLegal` updates | ✅ |
| 5a. Preview the content | Strip with every photo | ✅ |
| 5b. No promotional watermark. Title and hashtags editable | No Slideflow branding is added. Fields are editable | ✅ |
| 5c. Upload only after explicit consent | Server rejects any post without the consent flag sent by the Post button | ✅ |
| 5d. Tell users processing can take a few minutes | Note under the form, plus a toast after posting | ✅ |
| 5e. Poll the publish status | `/api/status` is polled every 5 s until done or failed | ✅ |
| Inbox mode: tell users to open the inbox notification | Note in inbox mode, plus a toast | ✅ |
| Photos only via PULL_FROM_URL from a verified domain | Vercel URL prefix, verified | ✅ |

---

## 6. After approval

1. Copy the **production** client key and secret into `.env` (replacing the sandbox ones).
2. Reconnect each account: Accounts → Connect a TikTok account.
3. Schedule → Mode **Direct post**, choose the privacy for autopilot posts, and turn Autopilot on.
4. From then on, approved slideshows post publicly at their times, with TikTok's auto-added music.
   No tapping needed.
