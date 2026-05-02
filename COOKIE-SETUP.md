# 🍪 Cookie Setup for yt-dlp (Avoid Bot Detection)

## Why Cookies?

YouTube may flag automated downloads as bot activity, especially for deployed websites. Using browser cookies makes yt-dlp appear as a normal browser session, avoiding:
- ❌ Bot detection
- ❌ CAPTCHA challenges
- ❌ Rate limiting
- ❌ IP blocks

## Quick Setup (Recommended)

### Method 1: Auto-Extract from Browser

**Step 1: Make sure you're logged into YouTube**
- Open Chrome/Firefox/Edge
- Go to youtube.com
- Log in to your account

**Step 2: Export cookies**
```bash
cd backend
python export_cookies.py chrome
```

Or for Firefox:
```bash
python export_cookies.py firefox
```

**Step 3: Verify**
```bash
ls -lh cookies.txt
# Should show a file with size > 0 bytes
```

**Step 4: Restart backend**
```bash
python main.py
```

✅ Done! The downloader will automatically use cookies.

## Manual Setup (Alternative)

### Using Browser Extension

**For Chrome:**
1. Install [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
2. Go to youtube.com
3. Click the extension icon
4. Click "Export" → Save as `cookies.txt`
5. Move `cookies.txt` to `backend/` directory

**For Firefox:**
1. Install [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)
2. Go to youtube.com
3. Click the extension icon
4. Save as `cookies.txt`
5. Move `cookies.txt` to `backend/` directory

⚠️ **Security Warning:** Only use trusted extensions! The "LOCALLY" version is safe.

## How It Works

### Automatic Cookie Detection

The downloader tries these methods in order:

1. **Manual cookie file** (`cookies.txt`)
   - Highest priority
   - Most reliable
   - Portable across systems

2. **Browser cookies** (Chrome/Firefox/Edge)
   - Automatic extraction
   - No manual export needed
   - Requires browser to be installed

3. **No cookies** (fallback)
   - May trigger bot detection
   - Use only for testing

### Code Flow

```python
# In downloader.py
def get_cookie_options():
    # 1. Check for cookies.txt
    if Path("cookies.txt").exists():
        return {"cookiefile": "cookies.txt"}
    
    # 2. Try browser cookies
    for browser in ["chrome", "firefox", "edge"]:
        try:
            return {"cookiesfrombrowser": (browser,)}
        except:
            continue
    
    # 3. No cookies (fallback)
    return {}
```

## File Format

### cookies.txt Format (Netscape)

```
# Netscape HTTP Cookie File
# This is a generated file! Do not edit.

.youtube.com	TRUE	/	TRUE	1234567890	CONSENT	YES+cb
.youtube.com	TRUE	/	FALSE	1234567890	VISITOR_INFO1_LIVE	abc123
```

**Requirements:**
- First line must be `# Netscape HTTP Cookie File` or `# HTTP Cookie File`
- Tab-separated values
- Unix line endings (`\n`) on Linux/macOS
- Windows line endings (`\r\n`) on Windows

## Troubleshooting

### "HTTP Error 400: Bad Request"

**Cause:** Wrong line endings in cookies.txt

**Fix (Linux/macOS):**
```bash
dos2unix cookies.txt
```

**Fix (Windows):**
```bash
unix2dos cookies.txt
```

**Fix (Python):**
```python
# Convert to Unix line endings
with open('cookies.txt', 'r') as f:
    content = f.read()
with open('cookies.txt', 'w', newline='\n') as f:
    f.write(content)
```

### "Could not access browser cookies"

**Possible causes:**
1. Browser not installed
2. Browser not running
3. No YouTube login in browser
4. Browser profile in non-standard location

**Fix:**
1. Make sure browser is installed
2. Log into YouTube in that browser
3. Try different browser: `python export_cookies.py firefox`
4. Use manual export method instead

### "cookies.txt not found"

**Fix:**
```bash
cd backend
ls cookies.txt  # Check if file exists
pwd  # Make sure you're in backend/ directory
```

### "Bot detection still happening"

**Possible causes:**
1. Cookies expired
2. Cookies from wrong account
3. IP address flagged

**Fix:**
1. Re-export cookies: `python export_cookies.py chrome`
2. Log into YouTube in browser first
3. Use VPN or different IP
4. Wait 24 hours before retrying

## Security Best Practices

### ⚠️ CRITICAL: Never Commit Cookies!

```bash
# Check .gitignore includes:
cat backend/.gitignore | grep cookies
# Should show:
# cookies.txt
# cookies*.txt
```

### Why?

`cookies.txt` contains authentication for **ALL websites**, not just YouTube:
- 🔐 Login sessions
- 🔑 API tokens
- 💳 Payment info
- 📧 Email access
- 🏦 Banking sessions

**If leaked:**
- ❌ Attacker can impersonate you
- ❌ Access your accounts
- ❌ Steal personal data
- ❌ Make purchases

### Safe Practices

✅ **DO:**
- Add `cookies.txt` to `.gitignore`
- Keep file permissions restricted: `chmod 600 cookies.txt`
- Regenerate cookies regularly
- Use separate YouTube account for automation
- Delete cookies when done

❌ **DON'T:**
- Commit to git
- Share with others
- Store in public locations
- Use personal account cookies
- Leave on production servers

## Production Deployment

### Option 1: Environment Variable

```bash
# Export cookies to base64
export YOUTUBE_COOKIES=$(base64 -w 0 cookies.txt)

# In downloader.py
import os
import base64

cookies_b64 = os.getenv("YOUTUBE_COOKIES")
if cookies_b64:
    cookies_content = base64.b64decode(cookies_b64)
    with open("cookies.txt", "wb") as f:
        f.write(cookies_content)
```

### Option 2: Secrets Manager

```python
# AWS Secrets Manager
import boto3

client = boto3.client('secretsmanager')
response = client.get_secret_value(SecretId='youtube-cookies')
cookies = response['SecretString']

with open("cookies.txt", "w") as f:
    f.write(cookies)
```

### Option 3: Volume Mount (Docker)

```yaml
# docker-compose.yml
services:
  backend:
    volumes:
      - ./secrets/cookies.txt:/app/cookies.txt:ro
```

## Testing

### Test Cookie Export

```bash
cd backend
python export_cookies.py chrome

# Should see:
# ✅ Success! Cookies exported to: cookies.txt
# 📊 File size: 12345 bytes
```

### Test Cookie Usage

```bash
# Start backend
python main.py

# In another terminal, test download
curl -X POST http://localhost:8000/video/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"}'

# Check logs for:
# [downloader] Using cookie file: cookies.txt
```

### Verify No Bot Detection

```bash
# Download should succeed without errors
# No CAPTCHA challenges
# No "Video unavailable" errors
# No rate limiting
```

## Cookie Lifecycle

### When to Regenerate

- ✅ Every 30 days (recommended)
- ✅ After password change
- ✅ After logout from YouTube
- ✅ If downloads start failing
- ✅ If bot detection occurs

### How to Regenerate

```bash
cd backend
rm cookies.txt  # Delete old cookies
python export_cookies.py chrome  # Export fresh cookies
```

## Advanced Configuration

### Custom Cookie File Location

```python
# In downloader.py
cookie_file = Path(os.getenv("COOKIE_FILE", "cookies.txt"))
if cookie_file.exists():
    ydl_opts["cookiefile"] = str(cookie_file)
```

### Multiple Cookie Files

```python
# Use different cookies per user/session
def get_cookie_file(user_id):
    return Path(f"cookies_{user_id}.txt")

cookie_file = get_cookie_file(session.user_id)
if cookie_file.exists():
    ydl_opts["cookiefile"] = str(cookie_file)
```

### Cookie Rotation

```python
# Rotate between multiple cookie files
import random

cookie_files = list(Path(".").glob("cookies_*.txt"))
if cookie_files:
    cookie_file = random.choice(cookie_files)
    ydl_opts["cookiefile"] = str(cookie_file)
```

## Summary

### Setup Checklist

- [ ] Install yt-dlp: `pip install -U yt-dlp`
- [ ] Log into YouTube in browser
- [ ] Export cookies: `python export_cookies.py chrome`
- [ ] Verify cookies.txt exists and has content
- [ ] Check cookies.txt is in .gitignore
- [ ] Restart backend server
- [ ] Test video download
- [ ] Verify no bot detection

### Maintenance Checklist

- [ ] Regenerate cookies monthly
- [ ] Check .gitignore includes cookies.txt
- [ ] Monitor for bot detection
- [ ] Keep yt-dlp updated
- [ ] Use separate YouTube account

### Security Checklist

- [ ] Never commit cookies.txt
- [ ] Set file permissions: `chmod 600 cookies.txt`
- [ ] Use environment variables in production
- [ ] Rotate cookies regularly
- [ ] Delete cookies when done

## Resources

- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp#usage-and-options)
- [Cookie Format Specification](https://curl.se/docs/http-cookies.html)
- [Get cookies.txt LOCALLY (Chrome)](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- [cookies.txt (Firefox)](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Verify cookies.txt format
3. Try different browser
4. Regenerate cookies
5. Check yt-dlp version: `yt-dlp --version`

Happy downloading! 🎉
