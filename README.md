# Slideflow

Your own version of slideshow.sh and scroll.show. Claude Code researches viral TikTok photo
slideshows in your niche, works out why they perform, remakes the format for your app, and
schedules the results to TikTok through the official Content Posting API.

```
research (Apify or free scraper) → Claude studies slides + comments → pattern notes
   → Claude writes slides → renderer (1080×1920 JPG) → Vercel site → TikTok API (inbox draft or direct)
                                                              ↑ scheduler sends at the set time
```

## Quick start

```bash
npm install
npx playwright install chromium
npx tsx src/cli/fetch-fonts.ts
cp .env.example .env
npm run render:test          # checks rendering works; outputs land in library/renders/
```

Then open this folder in Claude Code. It picks up `.mcp.json` and `CLAUDE.md`. Fill in
`library/brand.md` and ask, for example: *"Research slideshows for my app and make me 3 drafts."*

## Setup, piece by piece

### Research (choose one)
- **Apify (recommended):** set `APIFY_TOKEN`. Reliable, and costs a few cents per run.
- **Free browser scraper:** loads tiktok.com in headless Chromium. **Tested 2026-11-23:
  signed out, TikTok returns empty post lists to it**, so it found nothing. Running
  `npm run research:login` (a logged-in session) may help, but that hasn't been tested. Treat
  this path as experimental.

### TikTok posting
Full step-by-step instructions are in [TIKTOK_SETUP.md](TIKTOK_SETUP.md). The short version:

1. Create an app at developers.tiktok.com. Add **Login Kit** and **Content Posting API**, and
   request the scopes `user.info.basic`, `video.upload`, `video.publish`.
2. Add the redirect URI `http://localhost:5178/callback`, using the Desktop platform.
3. **Verify a domain** you own (URL properties). TikTok only pulls photos from verified domains.
4. Put the keys in `.env`, then run `npm run tiktok:login -- myapp` for each account.

**Before the audit:** use `mode: "draft"`. Posts arrive in your TikTok inbox and you tap
publish (adding a trending sound at that point is a bonus). Direct posting before the audit is
private-only, per TikTok's docs. Apply for the audit once
the flow works so direct public posting opens up.

### Image hosting
TikTok photo posts take URLs, not file uploads, and only from a URL prefix verified to your app.
By default (`STORAGE=vercel`) slideflow copies each post's slides into `site/slides/` and
redeploys the Vercel site in `site/`, whose prefix is verified with TikTok. That takes about 20
seconds per post, and slides older than 2 days are pruned on the next upload. `STORAGE=s3`
switches to an S3/R2 bucket instead (the `S3_*` settings).

### Scheduling
`npm run scheduler` publishes due posts every minute while it runs. For posting with your Mac
off, run `npm run scheduler:once` from cron on a small server. Copy `library/` (or at least
`queue.json`, `drafts/`, `renders/` and `accounts.json`) to it.

## Apps
Everything is organised by app: each app has a profile (what it does, how it works, audience,
markets, tone, CTA rules, competitors) and its own TikTok accounts, formats and slideshows.
Add one from the dashboard sidebar. Paste the App Store link and the profile fills itself in
(Apple's public lookup API), then answer what's missing or let Claude interview you.

## Posting screen (TikTok-compliant)
"Post or schedule…" on any slideshow follows TikTok's Content Sharing Guidelines, which the
Direct Post audit requires: it shows the account's nickname, a privacy dropdown with no
default, "Allow comments" off by default, the commercial content toggles (Your brand /
Branded content) with TikTok's labels, the Music Usage Confirmation and Branded Content Policy
declarations, a preview, explicit consent, and status. Choose inbox or direct, now or scheduled.

## Dashboard
```bash
npm run dashboard        # http://localhost:5180 (accounts & post stats, formats library, drafts & queue, research spend)
npm run stats            # sync stats for all connected accounts from the terminal
```
Stats use TikTok's official API when the app has the `user.info.stats` and `video.list` scopes
(enable them on the app, set `TIKTOK_SCOPES` in `.env`, run `npm run tiktok:login` again).
Otherwise they fall back to a cheap scrape of the public profile (~$0.0015 per post).

## Autopilot (posting by itself)
1. **Plan:** dashboard → Schedule. Set post times per account (e.g. `08:30, 18:00`), mode and time zone, then turn Autopilot on.
2. **Approve:** dashboard → Drafts & queue → "Approve for autopilot" on the slideshows you're happy with.
3. **Scheduler:** every 30 minutes it fills empty slots with the oldest approved drafts, and every minute it posts what's due.
   - While testing: `npm run scheduler` in a terminal.
   - Always-on (Mac): `npx tsx src/cli/install-scheduler.ts` installs a background job that runs every 5 minutes
     (`--remove` to uninstall). The project must live in a permanent folder.
4. **Draft mode** (before TikTok's audit): each post lands in your TikTok inbox at its time, and you tap publish.

## Layout
- `src/research/`: Apify and browser scrapers, normalisation, image download
- `src/render/`: layered HTML→JPG renderer (text blocks, stickers, image overlays, TikTok Sans and TikTok-style fonts)
- `src/autopilot.ts`: posting plan, approvals, slot filling. `src/cli/install-scheduler.ts`: background job
- `src/formats.ts`, `src/stats.ts`, `src/dashboard/`: formats library, account stats, local dashboard
- `src/images.ts`: save Pinterest/ChatGPT images into assets (original resolution, validated)
- `src/remix.ts`: contact sheets and remix plans for copying a format closely
- `src/cli/build-draft.ts`: build a draft from a JSON spec in `library/specs/` (placeholders for missing images)
- `src/research/lurk.ts`: cheap photo-only research (default). `src/research/spend.ts` logs spend
- `src/tiktok/`: OAuth and the Content Posting API (photo)
- `src/storage/`: S3/R2 upload
- `src/queue.ts`, `src/cli/scheduler.ts`: posting queue
- `src/mcp.ts`: tools Claude uses
- `library/`: your data (research, patterns, drafts, renders, queue, accounts)

## Caveats
- Scraping tiktok.com is against TikTok's terms. Keep the volume low or use Apify.
- Remake formats, not posts. Don't reuse other creators' images or wording.
- Some API details (desktop PKCE hex challenge, Apify actor field names) are taken from the
  docs as I understood them. Check them on your first real run.
