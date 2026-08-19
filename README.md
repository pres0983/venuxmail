# VenuxMail

A disposable email inbox you can install as an app. Generate a real, working
email address, receive mail sent to it in real time, and save it for later
with a portable recovery code — all with zero backend, zero database, and
zero cost.

**Live demo:** _add your Render URL here once deployed_

---

## Features

- **Instant disposable inbox** — a real email address, generated the moment you open the app
- **Live inbox** — new mail shows up automatically, no refresh needed
- **Save for later** — turn a temp address permanent and get a one-time recovery code to restore it on any device
- **Restore anywhere** — paste your recovery code on any browser to get your saved inbox back
- **Installable PWA** — add it to your phone's home screen like a native app, with offline app-shell caching
- **No backend, no database** — runs entirely client-side against the free [mail.tm](https://mail.tm) API

## How it works

VenuxMail is a static site (`index.html` + `style.css` + `app.js`). It talks
directly to the [mail.tm](https://docs.mail.tm/) public API from the browser:

1. Generates a random address + password, creates a mail.tm account
2. Exchanges credentials for a short-lived JWT
3. Polls `/messages` every few seconds for new mail
4. "Save for later" stores the credentials in `localStorage` on your device
   and encodes them into a copyable recovery code (`base64(address:password)`)
   so you can restore the same inbox on a different device or after clearing
   your browser data

Because everything runs client-side, there's nothing to host except static
files — no server, no environment variables, no database to manage.

## Tech stack

- Vanilla HTML/CSS/JS — no framework, no build step
- [mail.tm](https://mail.tm) — free temporary email API (receiving only)
- Web App Manifest + Service Worker — PWA installability and app-shell caching

## Project structure

```
venuxmail/
├── index.html          Main page
├── style.css            Styles
├── app.js                App logic (mail.tm integration, UI, PWA)
├── manifest.json         Web app manifest (installability)
├── sw.js                  Service worker (offline app-shell caching)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-512-maskable.png
    └── apple-touch-icon.png
```

## Deploy your own (free)

1. Fork or clone this repo
2. Go to [render.com](https://render.com) → **New → Static Site**
3. Connect this repo
4. Build command: _(leave blank)_
5. Publish directory: `.`
6. Deploy — that's it, no environment variables needed

## Run locally

No build tools required — any static file server works:

```bash
npx serve .
```

Then open the printed local URL in your browser.

## Limitations

- Addresses use mail.tm's shared domains, not a custom domain
- **Receive only** — mail.tm's free API has no send/reply endpoint, so
  replying to a message isn't supported
- Saved inboxes rely on mail.tm's own retention; there's no guarantee they
  persist forever
- iOS Safari doesn't support automatic "Add to Home Screen" prompts (an
  Apple platform limitation) — installing there is a manual Share → Add to
  Home Screen step

## Credits

Built on the free [mail.tm](https://mail.tm) API.

## License

MIT — do whatever you'd like with it.
