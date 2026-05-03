# 🚀 Render Cookies - Simple Fix

## Problem: Environment Variable Too Long

Render has a size limit on environment variables. Use **Secret Files** instead.

---

## Solution (3 Steps)

### Step 1: Export Cookies

```bash
cd backend
python3 export_cookies.py chrome
```

✅ Creates `cookies.txt`

---

### Step 2: Add to Render as Secret File

1. Go to https://dashboard.render.com
2. Select your web service
3. Click **"Environment"** tab
4. Scroll to **"Secret Files"** section
5. Click **"Add Secret File"**

**Configure:**
- **Filename:** `cookies.txt`
- **Contents:** Copy/paste from your local `backend/cookies.txt`

To get contents:
```bash
cat backend/cookies.txt
```

6. Click **"Save Changes"**

✅ Render will redeploy automatically

---

### Step 3: Verify

Check Render logs for:

```
[downloader] ✅ Using Render secret file: /etc/secrets/cookies.txt
```

or

```
[downloader] ✅ Using cookie file: cookies.txt
```

✅ Done! Cookies are working.

---

## How It Works

Render mounts secret files at `/etc/secrets/`. The code checks:

1. `/etc/secrets/cookies.txt` (Render secret file) ✅
2. `cookies.txt` (local file)
3. Chrome browser cookies (local dev only)

---

## Troubleshooting

### "No cookies available" in logs

**Check:**
1. Render → Environment → Secret Files
2. Verify `cookies.txt` is listed
3. Contents are not empty
4. Service has redeployed

### Still not working?

**Debug:**
1. Check the filename is exactly: `cookies.txt`
2. No extra spaces or characters
3. File contents start with: `# Netscape HTTP Cookie File`

---

## Remove Old Environment Variable

If you added `YOUTUBE_COOKIES_BASE64`:

1. Render → Environment tab
2. Find `YOUTUBE_COOKIES_BASE64`
3. Click delete (X)
4. Save

You don't need it anymore!

---

## Summary

✅ **No size limits** with secret files  
✅ **More secure** than environment variables  
✅ **Easier to update** - just edit the secret file  

**Time:** 3 minutes  
**Difficulty:** Easy  
**Works:** ✅ Yes!
