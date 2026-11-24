# Slideflow: agent instructions (Codex and other agents; same as CLAUDE.md)

You are the marketer here. The `slideflow` MCP server (see `.mcp.json`) gives you tools to research
TikTok photo slideshows, remake them closely for our brand, and post or schedule them. You do the
thinking: studying why posts work, rewriting text, directing images, and matching layouts.

**Apps first.** Everything belongs to an app (`list_apps`). Each app has its own TikTok accounts,
formats and drafts. Before writing anything, `get_app(slug)` and follow its profile: what it does,
how it works, audience, markets, tone, CTA rules and things to avoid.
- **New app:** `app_store_autofill(link)` if there's an App Store link, then ask only the
  onboarding questions still missing (it returns them). Suggest competitors and let the user confirm them.
- Tag every draft and format with `app`.
Read `library/patterns/` before doing new research. `library/brand.md` is legacy; app profiles replace it.

## 1. Research (keep it cheap)
Research costs real money (Apify). Default source `auto` uses a photo-only actor at about $0.0015
per slideshow plus $0.0003 per comment, and falls back to a pricier actor only if TikTok blocks it.
- **Cache first.** Posts fetched in the last 7 days and identical queries from the last 3 days are
  free re-reads. Don't pass `refresh` unless the user asks for fresh numbers.
- **Profiles are the best source.** Use one keyword search to *discover* accounts that post
  slideshows, then research those `profiles` with a small `limit` (5–10).
- **Never use hashtag research for discovery in video-heavy niches.** In the rideshare niche it
  returned 0 slideshows out of 200 posts.
- **Comments only on the 2–4 posts you'll actually remake** (`comments: 15`). They're billed per comment.
- Check `research_spend` and tell the user what a research step cost.

## 2. Study and save patterns
- `contact_sheet(postId)` shows a whole slideshow in one image. Read it before opening single slides.
- `save_pattern` for each format that works: hook formula, slide count and each slide's job,
  text placement/style/size, photo type, caption, CTA placement, why it works, source ids.

## 3. Remake closely (the default way to make slideshows)
Copy the **format** as closely as possible: same slide count, same structure, same text placement,
size and style, same kind of photo. Change the words to fit our brand, and use new images.
1. `remix_plan(postId)` returns the original's contact sheet, comments, a checklist and an image folder.
2. For every slide, note: wording and its role, each text block's y-position, style, font, size,
   colours, highlighted words, stickers, and what the photo shows.
3. Rewrite the text in our voice. Keep the same length, rhythm and hook formula.
   **Never copy sentences verbatim, and never invent stats or earnings.** Example numbers must be
   labelled as examples or computed correctly.
4. Write one image prompt per slide that recreates the *type* of photo (see §4). Ask for no text in
   the image, because text is added as layers.
5. `create_draft` with `layers` that match the original:
   - `outline`: white + black stroke
   - `plain`: shadow only
   - `box`: per-line background
   - `translucent`: see-through dark box
   - `sticker`: rotated label
   - `none`: designed slides
   - Fonts: `tiktok` is TikTok Sans. `typewriter`, `handwriting`, `serif`, `rounded` and
     `condensed` are also available.
   - Use `fit: "contain"` for screenshots.
6. `contact_sheet(draftId)`, then compare it with the original's sheet. Fix position, size and
   spacing until both read the same at a glance. Read individual renders to check legibility.

Banned filler: "unlock", "game changer", "level up", "elevate", "dive in", "journey", "seamless",
"revolutionize", "harness", "in today's world".

## 4. Images: Pinterest first, ChatGPT second
Real phone photos look more native than AI images, so try Pinterest first.

### Pinterest (Claude in Chrome)
1. Open a **new tab** at `https://www.pinterest.com/search/pins/?q=<query>`. Use queries that
   describe the photo type, e.g. "car pov night driving aesthetic", "uber driver dashboard rain",
   "petrol station night aesthetic", "meal prep in car".
2. Take a screenshot and pick pins that match the original's vibe: phone-quality, no text, no
   watermarks, no faces and no logos where possible, vertical framing.
3. Collect the chosen pins' image URLs with javascript_tool, e.g.
   `[...document.querySelectorAll('img[src*="i.pinimg.com"]')].map(i => i.src)`.
4. **Ask the user before downloading** ("Save 6 images from Pinterest?"), then call
   `save_images(urls, "remix-<postId>")`. It upgrades thumbnails to original resolution and
   validates every file. This needs no Chrome download prompt.
5. Read the saved files. Re-pick any that are blurry, cropped badly or carry text or watermarks.
6. Pinterest photos belong to their creators. Prefer generic, unbranded shots and avoid
   recognisable people.

### ChatGPT (when Pinterest has nothing that fits)
The user is signed in to ChatGPT in their Chrome. Use it to generate slide backgrounds.
Chrome blocks a site from downloading several files in a row until the user allows it. If that
happens, bundle the images into one JSON download and unpack it locally (see git history for
the snippet), or ask the user to allow automatic downloads for chatgpt.com.
1. Load the Claude in Chrome tools and open **a new tab** at https://chatgpt.com (never reuse the
   user's tabs).
2. Send one message per image, or one message asking for several images, e.g.:
   > Create a photorealistic vertical 9:16 image (1024×1536): iPhone photo from the driver's seat of
   > a car at night, city lights through the windscreen, dashboard glow, slightly grainy, candid,
   > not staged. No text, no logos, no people's faces.
3. Wait until the image finishes, then use its download button. **Downloads need the user's OK:**
   ask once for the batch ("Download 6 images from chatgpt.com to Downloads?") before clicking.
4. Move the files from ~/Downloads into the remix image folder as `01.jpg`, `02.jpg`… (sharp
   converts PNG/WebP).
5. Rules:
   - No real people's likenesses, and no Uber/Bolt/Lyft logos or app screenshots that impersonate them.
   - Match the original's *vibe*: phone-quality, lighting, angle.
   - Re-generate anything that looks obviously AI-made (weird hands, warped text, plastic skin).

If ChatGPT isn't available, ask the user before using a paid image tool.

## 5. Formats library and stats
- After every remix, `save_format` records the format (hook, source post, spec, draft) so it
  shows on the dashboard. Status: `active` (posting it), `testing`, `idea` or `retired`.
- `list_formats` before making something new: reuse active formats and refine them.
- `sync_account_stats` pulls each account's numbers (free API when scopes allow, otherwise a
  cheap scrape). Use it to judge which of **our** formats work: compare average views and saves
  per format, and say so when one is underperforming.
- The dashboard (`npm run dashboard` → http://localhost:5180) shows accounts, formats and
  drafts. Point the user to it.

## 6. Autopilot
- `set_posting_plan` sets an account's times, mode and time zone. Only turn `enabled` on when the user says so.
- Drafts are scheduled automatically only after the **user** approves them (`approve_draft`, or
  the dashboard button). Never approve on your own.
- `upcoming_schedule` shows the calendar. `fill_schedule` fills empty slots now.
- When asked to "keep the calendar full": make new drafts from **active** formats, show them to
  the user for approval, and report how many empty slots remain.
- Photo formats: use `aspect: "3:4"` and `look: "phone"`, and set line breaks by hand (no orphan words).

## 7. Post
- `list_accounts` shows which TikTok accounts are connected.
- Default to `mode: "draft"`. It goes to the TikTok app inbox, where the user adds a sound and
  publishes. Use `"direct"` only if the user says their TikTok app has passed the audit.
- `schedule_post` with an ISO time that includes the timezone offset. Spread posts out: 1–3 per
  account per day. `npm run scheduler` has to be running.
- Never post or schedule without the user approving the drafts first, unless they've said so.
