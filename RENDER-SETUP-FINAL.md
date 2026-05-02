# 🚀 Render Setup - Final Solution

## The Issue

`[Errno 30] Read-only file system: '/etc/secrets/cookies.txt'`

This happens because:
1. You haven't added cookies.txt as a Secret File in Render yet, OR
2. The secret file path is incorrect

## The Solution

### Option 1: Add Secret File (Recommended)

1. **Export cookies locally:**
   ```bash
   cd backend
   python3 export_cookies.py chrome
   cat cookies.txt  # Copy this output
   ```

2. **Add to Render:**
   - Go to https://dashboard.render.com
   - Select your web service
   - Click **"Environment"** tab
   - Scroll to **"Secret Files"** section
   - Click **"Add Secret File"**
   - **Filename:** `cookies.txt`
   - **Contents:** Paste the contents from step 1
   - Click **"Save Changes"**

3. **Verify:**
   - Render will redeploy automatically
   - Check logs for: `[downloader] ✅ Using Render secret file`

### Option 2: Skip Cookies (Quick Test)

If you just want to test without cookies:

The code will automatically fall back to no cookies and show:
```
[downloader] ⚠️  WARNING: No cookies available
```

This works for most videos, but may trigger bot detection on some.

## Why the Error Happens

The error occurs when:
- Code checks if `/etc/secrets/cookies.txt` exists
- File doesn't exist (you haven't added it yet)
- Render's filesystem is read-only

The fix I added catches this error and falls back gracefully.

## After Adding Secret File

Once you add the secret file, you should see:
```
[downloader] ✅ Using Render secret file: /etc/secrets/cookies.txt
[downloader] 🍪 Cookie options: ['cookiefile']
```

## If It Still Fails

1. **Check the secret file exists:**
   - Render Dashboard → Environment → Secret Files
   - Should show: `cookies.txt`

2. **Check the filename is exact:**
   - Must be exactly: `cookies.txt`
   - No extra spaces or characters

3. **Check the contents:**
   - Should start with: `# Netscape HTTP Cookie File`
   - Should be several KB in size

4. **Redeploy:**
   - After adding secret file, Render auto-redeploys
   - Wait for deployment to complete

## Summary

✅ **The code is fixed** - it handles the read-only error  
📝 **You need to add** the secret file in Render  
⏱️ **Takes 2 minutes** to set up  

Follow Option 1 above to add the secret file.
