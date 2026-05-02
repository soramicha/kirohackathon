# 🔐 Render Secret Files - Cookie Setup

## The Problem

Environment variables are too long for cookies.txt content.

## The Solution

Use Render's **Secret Files** feature instead.

---

## Step 1: Create cookies.txt Locally

```bash
cd backend
python3 export_cookies.py chrome
```

✅ Creates `cookies.txt`

---

## Step 2: Add Secret File in Render

### A. Go to Render Dashboard

1. Go to https://dashboard.render.com
2. Select your web service
3. Click **"Environment"** in left sidebar
4. Scroll down to **"Secret Files"** section
5. Click **"Add Secret File"**

### B. Configure Secret File

**Filename:** `cookies.txt`

**Contents:** (paste the entire contents of your local `backend/cookies.txt` file)

To get the contents:
```bash
cat backend/cookies.txt
```

Copy everything and paste into Render.

### C. Save

Click **"Save Changes"**

Render will redeploy automatically.

---

## Step 3: Update Code to Use Secret File

The code already checks for `cookies.txt` in the current directory, so it should work automatically!

But let's verify the path. Update `backend/services/downloader.py`:

```python
def get_cookie_options():
    """..."""
    cookie_opts = {}
    
    # Method 1: Check for secret file (Render Secret Files)
    # Render mounts secret files in /etc/secrets/
    secret_cookie = Path("/etc/secrets/cookies.txt")
    if secret_cookie.exists():
        print(f"[downloader] ✅ Using secret file: {secret_cookie}")
        cookie_opts["cookiefile"] = str(secret_cookie)
        return cookie_opts
    
    # Method 2: Check for local cookies.txt
    cookie_file = Path("cookies.txt")
    if cookie_file.exists():
        print(f"[downloader] ✅ Using cookie file: {cookie_file}")
        cookie_opts["cookiefile"] = str(cookie_file)
        return cookie_opts
    
    # ... rest of the code
```

---

## Step 4: Verify

Check Render logs for:

```
[downloader] ✅ Using secret file: /etc/secrets/cookies.txt
```

or

```
[downloader] ✅ Using cookie file: cookies.txt
```

✅ Done!

---

## How Render Secret Files Work

- Files are mounted at `/etc/secrets/`
- Not stored in environment variables
- No size limits
- Secure and encrypted
- Updated on redeploy

---

## Alternative: Commit cookies.txt (NOT RECOMMENDED)

⚠️ **Security Risk** - Only for testing

1. Remove `cookies.txt` from `.gitignore`
2. Commit and push
3. Render will deploy with the file
4. **Remember to remove it later!**

---

## Troubleshooting

### "Secret file not found"

**Check:**
1. Render dashboard → Environment → Secret Files
2. Filename is exactly: `cookies.txt`
3. Contents are not empty
4. Service has redeployed

### "Still no cookies"

**Try:**
1. Check logs for cookie detection messages
2. Verify file path in code
3. Add debug logging to see what's checked

---

## Summary

**Best approach:**
1. ✅ Export cookies locally
2. ✅ Add as Render Secret File
3. ✅ Update code to check `/etc/secrets/cookies.txt`
4. ✅ Redeploy

**Time:** 3 minutes  
**Size limit:** None  
**Security:** ✅ Secure
