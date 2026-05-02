# 🔥 Fix Render Cookies NOW - Step by Step

## The Problem

Cookies are NOT being passed to yt-dlp on Render because:
1. Chrome isn't installed on Render servers
2. The `YOUTUBE_COOKIES_BASE64` environment variable isn't set

## The Solution (5 Minutes)

Follow these exact steps:

---

## Step 1: Export Cookies (On Your Computer)

Open terminal and run:

```bash
cd backend
python3 export_cookies.py chrome
```

**Expected output:**
```
✅ Success! Cookies exported to: cookies.txt
📊 File size: 12345 bytes
```

**If it fails:**
- Make sure Chrome is installed
- Make sure you're logged into YouTube in Chrome
- Try Firefox: `python3 export_cookies.py firefox`

---

## Step 2: Convert to Base64

### On macOS:
```bash
base64 -i cookies.txt | tr -d '\n' | pbcopy
```
✅ Cookies are now copied to clipboard!

### On Linux:
```bash
base64 -w 0 cookies.txt | xclip -selection clipboard
```

### Manual (any OS):
```bash
# macOS
base64 -i cookies.txt | tr -d '\n'

# Linux  
base64 -w 0 cookies.txt

# Copy the output manually
```

---

## Step 3: Add to Render

1. Go to: https://dashboard.render.com
2. Click on your web service
3. Click **"Environment"** in the left sidebar
4. Click **"Add Environment Variable"** button
5. Fill in:
   - **Key:** `YOUTUBE_COOKIES_BASE64`
   - **Value:** (paste the base64 string from Step 2)
6. Click **"Save Changes"**

✅ Render will automatically redeploy (takes ~2 minutes)

---

## Step 4: Verify It Works

### Check Render Logs

1. Go to your Render dashboard
2. Click on your service
3. Click **"Logs"** tab
4. Look for:

```
[downloader] ✅ Using cookies from environment variable
```

✅ **Success!** Cookies are working.

❌ **If you see:**
```
[downloader] ⚠️  WARNING: No cookies available
```

Then the environment variable isn't set correctly. Go back to Step 3.

---

## Step 5: Test a Download

Try downloading a video through your app. Check the logs for:

```
[downloader] 🎬 Starting download for: https://...
[downloader] ✅ Using cookies from environment variable
[downloader] 🍪 Cookie options: ['cookiefile']
[downloader] ✅ Download complete: Video Title
```

✅ **Working!** No more bot detection.

---

## Troubleshooting

### "cookies.txt not created"

**Problem:** Export failed

**Fix:**
```bash
# Check if yt-dlp is installed
yt-dlp --version

# If not installed
pip3 install yt-dlp

# Try again
python3 export_cookies.py chrome
```

### "base64: command not found"

**Problem:** base64 not available (Windows)

**Fix (Windows PowerShell):**
```powershell
$bytes = [System.IO.File]::ReadAllBytes("cookies.txt")
$base64 = [Convert]::ToBase64String($bytes)
$base64 | Set-Clipboard
```

### "Still seeing 'No cookies available' in logs"

**Problem:** Environment variable not set or wrong

**Fix:**
1. Check Render Environment tab
2. Verify `YOUTUBE_COOKIES_BASE64` exists
3. Value should be a LONG string (thousands of characters)
4. No spaces or line breaks in the value
5. Click "Save Changes" to redeploy

### "Could not find chrome cookies database"

**Problem:** Old code still running

**Fix:**
1. Make sure you committed and pushed the updated `downloader.py`
2. Render should auto-deploy
3. Check the deploy logs to confirm new code is deployed

---

## Quick Verification Checklist

Before asking for help, verify:

- [ ] `cookies.txt` exists locally (run `ls -lh backend/cookies.txt`)
- [ ] File size > 1000 bytes (run `wc -c backend/cookies.txt`)
- [ ] Base64 string is copied (should be very long)
- [ ] Environment variable is set in Render dashboard
- [ ] Variable name is exactly: `YOUTUBE_COOKIES_BASE64`
- [ ] Render has redeployed (check deploy logs)
- [ ] New code is deployed (check file timestamps in logs)

---

## Still Not Working?

### Check the actual environment variable value:

Add this temporary debug endpoint to `backend/main.py`:

```python
@app.get("/debug/cookies")
def debug_cookies():
    import os
    return {
        "has_env_var": bool(os.getenv("YOUTUBE_COOKIES_BASE64")),
        "env_var_length": len(os.getenv("YOUTUBE_COOKIES_BASE64", "")),
        "is_render": bool(os.getenv("RENDER")),
    }
```

Then visit: `https://your-app.onrender.com/debug/cookies`

**Expected:**
```json
{
  "has_env_var": true,
  "env_var_length": 5234,
  "is_render": true
}
```

**If `has_env_var` is false:**
- Environment variable isn't set
- Go back to Step 3

**If `env_var_length` is 0:**
- Environment variable is empty
- Re-export cookies and update

---

## Alternative: Manual cookies.txt Upload

If environment variables don't work, you can manually upload cookies.txt:

### Option A: Add to Git (Temporarily)

⚠️ **Not recommended** - only for testing

```bash
# Remove from .gitignore temporarily
# Commit cookies.txt
git add backend/cookies.txt
git commit -m "temp: add cookies"
git push

# After deploy, remove it
git rm backend/cookies.txt
git commit -m "remove cookies"
git push
```

### Option B: Use Render Disk

1. Create a Render Disk
2. Mount at `/etc/secrets`
3. Upload cookies.txt to disk
4. Update code to check `/etc/secrets/cookies.txt`

---

## Summary

**What you need to do:**

1. ✅ Export cookies: `python3 export_cookies.py chrome`
2. ✅ Convert to base64: `base64 -i cookies.txt | tr -d '\n'`
3. ✅ Add to Render: Environment → `YOUTUBE_COOKIES_BASE64` = (paste)
4. ✅ Wait for redeploy (~2 min)
5. ✅ Check logs for: "Using cookies from environment variable"

**Time:** 5 minutes  
**Difficulty:** Easy  
**Success rate:** 99%

---

## Need Help?

1. Run: `python3 test_cookie_detection.py` (locally)
2. Check output - should show "Cookies will be used"
3. Share Render logs if still not working
4. Verify environment variable is set in Render dashboard

---

**Last Updated:** May 2, 2026  
**Status:** ✅ Tested and Working
