# Q4 FY2026 Earnings PWA — Deploy to iPhone

## ⚡ Deploy to Vercel (Free, 5 minutes)

### Step 1 — Create a GitHub account
Go to https://github.com and sign up (free).

### Step 2 — Upload this project to GitHub
1. Go to https://github.com/new
2. Name it `earnings-pwa`, click **Create repository**
3. Upload ALL files from this folder (drag and drop in browser works)

### Step 3 — Deploy on Vercel
1. Go to https://vercel.com and sign up with your GitHub account
2. Click **Add New → Project**
3. Select your `earnings-pwa` repository
4. Click **Deploy** (no settings to change — Vercel auto-detects Vite)
5. Wait ~60 seconds → you get a live URL like `earnings-pwa.vercel.app`

---

## 📱 Install on iPhone (Safari only)

1. Open **Safari** on your iPhone (must be Safari, not Chrome)
2. Go to your Vercel URL (e.g. `https://earnings-pwa.vercel.app`)
3. Tap the **Share button** (box with arrow pointing up)
4. Scroll down → tap **"Add to Home Screen"**
5. Tap **Add**

The app now appears on your home screen like a native app — full screen, no browser bar, with your custom icon.

---

## 🔄 Updating the app
Edit any file → push to GitHub → Vercel auto-redeploys in ~30 seconds.
The PWA on your iPhone updates automatically next time you open it.

---

## 📁 Project Structure
```
earnings-pwa/
├── index.html          ← PWA meta tags, iOS viewport
├── vite.config.js      ← Vite + PWA plugin config
├── package.json        ← Dependencies
├── public/
│   ├── icon-192.png        ← App icon
│   ├── icon-512.png        ← App icon (large)
│   └── apple-touch-icon.png ← iOS home screen icon
└── src/
    ├── main.jsx        ← React entry point
    └── App.jsx         ← Main app (full screen, PWA-ready)
```

## 🛠️ Run locally (optional)
```bash
npm install
npm run dev
```
Open http://localhost:5173
