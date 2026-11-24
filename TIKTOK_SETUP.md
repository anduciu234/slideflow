# TikTok posting setup

The rules below were checked against TikTok's developer docs on 2026-11-23.

TikTok only pulls photos from https URLs on a domain or URL prefix verified to your app. A free
`*.vercel.app` site verified as a URL prefix is enough, so you don't need to own a domain.

## 1. Create the app (about 15 minutes)
1. Sign in at developers.tiktok.com → **Manage apps** → **Connect an app**. An organisation
   owner is recommended.
2. App details:
   - icon: 1024×1024 PNG or JPG
   - name and description
   - platform: **Desktop**
   - **official website URL**: required for Desktop
3. **Add products:**
   - **Login Kit**: add the redirect URI `http://localhost:5178/callback`. It must match `.env`
     exactly, including any trailing slash.
   - **Content Posting API**: also turn on **Direct Post** in its settings.
4. Scopes: `user.info.basic`, `video.upload`, `video.publish`.

## 2. Verify a URL prefix (what we did)
In the app's **URL properties**, add a **URL prefix** `https://slideflow-site.vercel.app/`,
download the signature file, put it in `site/`, redeploy, and click Verify. The sandbox needs its
own file. If you later use a domain you own, you can verify it with a DNS record instead, which
covers all of its subdomains.

## 3. Image hosting (Vercel, already done)
The site in `site/` is deployed to `https://slideflow-site.vercel.app/`, and that URL prefix is
verified for both the production app and the sandbox (the two `tiktok*.txt` signature files in
`site/`). Keep those files, because removing them breaks verification. `.env` has
`STORAGE=vercel` and `PUBLIC_BASE_URL=https://slideflow-site.vercel.app`.

TikTok's rules for the image URLs: https only, no redirects, JPEG or WebP, at most 20 MB, at
most 1080p. Slideflow renders 1080×1920 JPGs, which fit.

## 4. Choose: Sandbox now, Production later
| | Sandbox | Production (unaudited) | Production (audited) |
|---|---|---|---|
| Needs TikTok review | No | Yes (app review) | Yes, plus the Content Posting audit |
| Accounts | Up to 10 you own | Your users | Your users |
| Posts | Private only | Private only | **Public** |

**Start with Sandbox.** App page → **Sandbox** → create one → add your TikTok accounts as target
users → copy the **sandbox** Client key and Client secret into `.env`. They're different from
the production keys.

```
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=http://localhost:5178/callback
```

## 5. Connect accounts and test
```bash
npm run tiktok:login -- myapp
```
A browser tab opens. Approve, and the account is saved under the name `myapp`. Repeat this for
each account. Then ask Claude to "post draft X to myapp in draft mode".

- **Draft mode** (`MEDIA_UPLOAD`): the post lands in the TikTok app's inbox and you publish it
  there. Add a trending sound before you publish.
- **Direct mode**: private (`SELF_ONLY`) until the audit passes.

## 6. Going public (later)
Submit the production app for review: explain each product and scope and include a demo video
(a screen recording of the login → draft → post flow). Then apply for the Content Posting
audit. Once approved, swap the production keys into `.env`, log the accounts in again, and
`direct` mode with `PUBLIC_TO_EVERYONE` works.
