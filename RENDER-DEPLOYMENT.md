# 🚀 Render Deployment Guide

## Cookie Setup for Production

The error `could not find chrome cookies database in "/opt/render/.config/google-chrome"` occurs because Chrome isn't installed on Render servers. You need to use a `cookies.txt` file instead.

## Quick Fix

### Step 1: Export Cookies Locally

On your local machine:

```bash
cd backend
source ../.venv/bin/activate  # or activate your venv
python export_cookies.py chrome
```

This creates `cookies.txt` in the `backend/` directory.

### Step 2: Deploy cookies.txt to Render

You have **3 options**:

---

## Option 1: Environment Variable (Recommended)

### A. Encode cookies.txt to base64

```bash
cd backend
base64 -i cookies.txt | tr -d '\n' > cookies_base64.txt
cat cookies_base64.txt
```

Copy the output (it's a long string).

### B. Add to Render Environment Variables

1. Go to your Render dashboard
2. Select your web service
3. Go to **Environment** tab
4. Add new environment variable:
   - **Key:** `YOUTUBE_COOKIES_BASE64`
   - **Value:** (paste the base64 string)
5. Click **Save Changes**

### C. Update downloader.py to decode

Add this at the top of `get_cookie_options()`:

```python
def get_cookie_options():
    """..."""
    cookie_opts = {}
    
    # Check for base64-encoded cookies from environment
    import os
    import base64
    
    cookies_b64 = os.getenv("YOUTUBE_COOKIES_BASE64")
    if cookies_b64:
        try:
            cookie_file = Path("cookies.txt")
            cookies_content = base64.b64decode(cookies_b64)
            cookie_file.write_bytes(cookies_content)
            print(f"[downloader] Decoded cookies from environment variable")
            cookie_opts["cookiefile"] = str(cookie_file)
            return cookie_opts
        except Exception as e:
            print(f"[downloader] Failed to decode cookies: {e}")
    
    # Method 1: Check for manual cookie file
    cookie_file = Path("cookies.txt")
    if cookie_file.exists():
        # ... rest of the code
```

### D. Redeploy

Render will automatically redeploy with the new environment variable.

---

## Option 2: Secret Files (Render Disk)

### A. Create a Persistent Disk

1. Go to Render dashboard
2. Create a new **Disk**
3. Name: `youtube-cookies`
4. Mount Path: `/etc/secrets`
5. Size: 1 GB (minimum)

### B. Attach Disk to Service

1. Go to your web service
2. **Settings** → **Disks**
3. Attach the disk you created

### C. Upload cookies.txt

You'll need to SSH into your Render instance or use a one-time script:

**One-time upload script** (add to your repo):

```python
# backend/upload_cookies.py
import os
from pathlib import Path

# Read local cookies
local_cookies = Path("cookies.txt").read_text()

# Write to mounted disk
secret_path = Path("/etc/secrets/cookies.txt")
secret_path.parent.mkdir(parents=True, exist_ok=True)
secret_path.write_text(local_cookies)
print("✅ Cookies uploaded to /etc/secrets/cookies.txt")
```

### D. Update downloader.py

```python
def get_cookie_options():
    """..."""
    cookie_opts = {}
    
    # Check for cookies in mounted disk (Render)
    secret_cookie = Path("/etc/secrets/cookies.txt")
    if secret_cookie.exists():
        print(f"[downloader] Using cookie file from disk: {secret_cookie}")
        cookie_opts["cookiefile"] = str(secret_cookie)
        return cookie_opts
    
    # Check for local cookies.txt
    cookie_file = Path("cookies.txt")
    if cookie_file.exists():
        # ... rest of the code
```

---

## Option 3: Build-time Secret (Not Recommended)

⚠️ **Warning:** This commits cookies to your build, which is less secure.

### A. Add cookies.txt to repo (temporarily)

```bash
# Remove from .gitignore temporarily
# Add cookies.txt
git add backend/cookies.txt
git commit -m "Add cookies for deployment"
git push
```

### B. After deployment, remove it

```bash
git rm backend/cookies.txt
git commit -m "Remove cookies from repo"
git push
```

### C. Re-add to .gitignore

Make sure `cookies.txt` is back in `.gitignore`.

---

## Recommended: Option 1 (Environment Variable)

This is the most secure and easiest to update.

### Complete Implementation

Update `backend/services/downloader.py`:

```python
import yt_dlp
import json
import os
import base64
from pathlib import Path


def get_cookie_options():
    """
    Get cookie configuration for yt-dlp to avoid bot detection.
    Priority:
    1. Environment variable (YOUTUBE_COOKIES_BASE64) - for production
    2. Manual cookie file (cookies.txt) - for local with manual export
    3. Browser cookies (Chrome) - for local development
    4. No cookies (fallback)
    """
    cookie_opts = {}
    
    # Method 1: Environment variable (PRODUCTION)
    cookies_b64 = os.getenv("YOUTUBE_COOKIES_BASE64")
    if cookies_b64:
        try:
            cookie_file = Path("cookies.txt")
            cookies_content = base64.b64decode(cookies_b64)
            cookie_file.write_bytes(cookies_content)
            print(f"[downloader] Using cookies from environment variable")
            cookie_opts["cookiefile"] = str(cookie_file)
            return cookie_opts
        except Exception as e:
            print(f"[downloader] Failed to decode cookies from env: {e}")
    
    # Method 2: Manual cookie file
    cookie_file = Path("cookies.txt")
    if cookie_file.exists():
        print(f"[downloader] Using cookie file: {cookie_file}")
        cookie_opts["cookiefile"] = str(cookie_file)
        return cookie_opts
    
    # Method 3: Browser cookies (LOCAL DEVELOPMENT ONLY)
    is_production = os.getenv("RENDER") or os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("VERCEL")
    
    if not is_production:
        browsers_to_try = [("chrome", None), ("firefox", None), ("edge", None)]
        
        for browser, profile in browsers_to_try:
            try:
                print(f"[downloader] Attempting to use {browser} cookies...")
                cookie_opts["cookiesfrombrowser"] = (browser, profile) if profile else (browser,)
                return cookie_opts
            except Exception as e:
                print(f"[downloader] Could not access {browser} cookies: {e}")
                continue
    else:
        print("[downloader] Production environment detected - skipping browser detection")
    
    # Method 4: No cookies (fallback)
    print("[downloader] WARNING: No cookies available - may trigger bot detection")
    return {}


def download_video(url: str, session_id: str) -> dict:
    # ... rest of the code stays the same
```

---

## Testing

### Local Test
```bash
cd backend
python main.py
# Should see: "[downloader] Using cookie file: cookies.txt"
```

### Production Test (after deployment)
Check Render logs for:
```
[downloader] Using cookies from environment variable
```

---

## Updating Cookies

Cookies expire after ~30 days. To update:

### Option 1 (Environment Variable)
1. Export new cookies locally: `python export_cookies.py chrome`
2. Encode to base64: `base64 -i cookies.txt | tr -d '\n'`
3. Update `YOUTUBE_COOKIES_BASE64` in Render dashboard
4. Render auto-redeploys

### Option 2 (Disk)
1. SSH into Render or use upload script
2. Replace `/etc/secrets/cookies.txt`
3. Restart service

---

## Security Checklist

- [ ] `cookies.txt` is in `.gitignore`
- [ ] Never commit cookies to git
- [ ] Use environment variables for production
- [ ] Rotate cookies every 30 days
- [ ] Use separate YouTube account for automation
- [ ] Monitor logs for bot detection

---

## Troubleshooting

### "No cookies available" in production
**Cause:** Environment variable not set or cookies.txt missing

**Fix:**
1. Check Render environment variables
2. Verify `YOUTUBE_COOKIES_BASE64` is set
3. Check logs for decoding errors

### "Bot detection" errors
**Cause:** Cookies expired or invalid

**Fix:**
1. Export fresh cookies locally
2. Update environment variable
3. Redeploy

### "Could not find chrome cookies database"
**Cause:** Code is trying to use browser cookies in production

**Fix:**
1. Update `downloader.py` with production detection
2. Use environment variable method
3. Redeploy

---

## Quick Setup Script

Save as `backend/setup_render_cookies.sh`:

```bash
#!/bin/bash

echo "🍪 Render Cookie Setup"
echo "====================="
echo

# Export cookies
echo "Step 1: Exporting cookies from Chrome..."
python export_cookies.py chrome

if [ ! -f cookies.txt ]; then
    echo "❌ Failed to export cookies"
    exit 1
fi

echo "✅ Cookies exported"
echo

# Encode to base64
echo "Step 2: Encoding to base64..."
BASE64_COOKIES=$(base64 -i cookies.txt | tr -d '\n')

echo "✅ Encoded"
echo

# Display instructions
echo "Step 3: Add to Render"
echo "====================="
echo
echo "1. Go to Render Dashboard"
echo "2. Select your web service"
echo "3. Go to Environment tab"
echo "4. Add new variable:"
echo
echo "   Key: YOUTUBE_COOKIES_BASE64"
echo "   Value:"
echo
echo "$BASE64_COOKIES"
echo
echo "5. Save and redeploy"
echo
echo "✅ Setup complete!"
```

Make executable:
```bash
chmod +x backend/setup_render_cookies.sh
```

Run:
```bash
cd backend
./setup_render_cookies.sh
```

---

## Summary

1. **Export cookies locally:** `python export_cookies.py chrome`
2. **Encode to base64:** `base64 -i cookies.txt | tr -d '\n'`
3. **Add to Render:** Environment variable `YOUTUBE_COOKIES_BASE64`
4. **Update code:** Add environment variable decoding to `downloader.py`
5. **Deploy:** Render auto-redeploys
6. **Verify:** Check logs for "Using cookies from environment variable"

🎉 Done! Your Render deployment will now use cookies to avoid bot detection.
