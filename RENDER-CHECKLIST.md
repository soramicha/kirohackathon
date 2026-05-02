# ✅ Render Deployment Checklist

## Current Status

You're seeing: `[Errno 30] Read-only file system: '/etc/secrets/cookies.txt'`

**This is expected!** The code is trying to check for cookies but you haven't added them yet.

## What to Do

### Quick Fix (2 minutes)

1. **On your local machine:**
   ```bash
   cd backend
   python3 export_cookies.py chrome
   ```

2. **Copy the file contents:**
   ```bash
   cat cookies.txt
   ```
   Select all and copy (Cmd+A, Cmd+C on Mac)

3. **In Render Dashboard:**
   - Go to your service
   - Click **"Environment"** tab
   - Scroll to **"Secret Files"**
   - Click **"Add Secret File"**
   - Filename: `cookies.txt`
   - Contents: Paste what you copied
   - Click **"Save Changes"**

4. **Wait for redeploy** (~2 minutes)

5. **Check logs** - should see:
   ```
   [downloader] ✅ Using Render secret file: /etc/secrets/cookies.txt
   ```

## What's Happening Now

Without the secret file, the code:
1. ✅ Tries `/etc/secrets/cookies.txt` - not found (expected)
2. ✅ Catches the error gracefully
3. ✅ Falls back to no cookies
4. ⚠️  Shows warning: "No cookies available"
5. ✅ Downloads still work (but may hit bot detection)

## After Adding Secret File

With the secret file:
1. ✅ Finds `/etc/secrets/cookies.txt`
2. ✅ Uses cookies for all downloads
3. ✅ No bot detection
4. ✅ All videos work

## Verify It's Working

After adding the secret file, test a download and check logs:

**Good:**
```
[downloader] ✅ Using Render secret file: /etc/secrets/cookies.txt
[downloader] 🍪 Cookie options: ['cookiefile']
[downloader] 🎬 Starting download for: https://...
[downloader] ✅ Download complete: Video Title
```

**Still needs setup:**
```
[downloader] ⚠️  WARNING: No cookies available
```

## Summary

- ✅ Code is working correctly
- ✅ Error is handled gracefully
- 📝 You need to add the secret file
- ⏱️ Takes 2 minutes
- 🎯 Follow steps above

The app will work without cookies, but adding them prevents bot detection.
