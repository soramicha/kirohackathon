# ⚡ QUICK FIX - Cookies Too Long

## The Issue

Environment variable `YOUTUBE_COOKIES_BASE64` is too long for Render.

## The Fix

Use **Render Secret Files** instead (no size limit).

---

## 3 Steps (3 minutes)

### 1️⃣ Export Cookies

```bash
cd backend
python3 export_cookies.py chrome
cat cookies.txt  # Copy this output
```

### 2️⃣ Add to Render

```
Render Dashboard
  → Your Service
    → Environment Tab
      → Secret Files Section
        → Add Secret File
          → Filename: cookies.txt
          → Contents: (paste from step 1)
          → Save Changes
```

### 3️⃣ Verify

Wait 2 minutes for redeploy, then check logs:

```
✅ [downloader] Using Render secret file: /etc/secrets/cookies.txt
```

---

## Clean Up

**Remove the environment variable:**

```
Render Dashboard
  → Environment Tab
    → Find: YOUTUBE_COOKIES_BASE64
      → Delete (X)
        → Save
```

---

## Done! 🎉

Cookies will now work without size limits.

---

## Visual Guide

```
Local Machine                    Render Dashboard
─────────────                    ────────────────

backend/
  cookies.txt  ──────────────>  Secret Files
  (export)                         ├─ cookies.txt
                                   └─ (mounted at /etc/secrets/)

                                 Code checks:
                                   1. /etc/secrets/cookies.txt ✅
                                   2. cookies.txt
                                   3. Browser cookies
```

---

## Why This Works

- ✅ No size limits on secret files
- ✅ More secure than env vars
- ✅ Easier to update
- ✅ Code already supports it

---

## Need Help?

See: `RENDER-SECRET-FILES.md` for detailed guide
