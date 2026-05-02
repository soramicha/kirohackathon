# 🚀 Production Cookies - Quick Start

## The Problem

```
ERROR: could not find chrome cookies database in "/opt/render/.config/google-chrome"
```

This happens because Chrome isn't installed on production servers (Render, Railway, Vercel, etc.).

## The Solution

Use environment variables to pass cookies to production.

---

## 3-Step Setup

### Step 1: Export Cookies Locally

```bash
cd backend
python3 export_cookies.py chrome
```

✅ Creates `cookies.txt` in backend directory

### Step 2: Generate Base64

```bash
./setup_render_cookies.sh
```

✅ Displays base64-encoded cookies and instructions

**Or manually:**

```bash
# macOS
base64 -i cookies.txt | tr -d '\n'

# Linux
base64 -w 0 cookies.txt
```

### Step 3: Add to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your web service
3. Click **Environment** tab
4. Add variable:
   - **Key:** `YOUTUBE_COOKIES_BASE64`
   - **Value:** (paste base64 string from Step 2)
5. Click **Save Changes**

✅ Render auto-redeploys with cookies

---

## Verify It Works

Check your Render logs for:

```
[downloader] Using cookies from environment variable
```

✅ Success! Bot detection avoided.

---

## Update Cookies (Every 30 Days)

Cookies expire. To refresh:

```bash
cd backend
./setup_render_cookies.sh
```

Then update the `YOUTUBE_COOKIES_BASE64` variable in Render.

---

## How It Works

### Local Development
```
1. Code checks for cookies.txt → Not found
2. Code checks for Chrome browser → Found!
3. Uses Chrome cookies automatically
```

### Production (Render)
```
1. Code checks YOUTUBE_COOKIES_BASE64 env var → Found!
2. Decodes base64 to cookies.txt
3. Uses cookies.txt for downloads
```

---

## Troubleshooting

### "No cookies available" in logs

**Cause:** Environment variable not set

**Fix:**
1. Check Render Environment tab
2. Verify `YOUTUBE_COOKIES_BASE64` exists
3. Value should be a long base64 string

### "Bot detection" errors

**Cause:** Cookies expired (>30 days old)

**Fix:**
1. Run `./setup_render_cookies.sh` locally
2. Update `YOUTUBE_COOKIES_BASE64` in Render
3. Redeploy

### "Failed to decode cookies from env"

**Cause:** Invalid base64 encoding

**Fix:**
1. Re-export cookies: `python3 export_cookies.py chrome`
2. Re-encode: `base64 -i cookies.txt | tr -d '\n'`
3. Update Render environment variable

---

## Security Checklist

- [x] `cookies.txt` in `.gitignore` ✅
- [x] Never commit cookies to git ✅
- [x] Use environment variables ✅
- [ ] Rotate cookies every 30 days
- [ ] Use separate YouTube account
- [ ] Monitor for bot detection

---

## Alternative: Manual cookies.txt

If you prefer not to use environment variables:

1. Export cookies locally
2. Manually upload `cookies.txt` to server
3. Place in `backend/` directory

⚠️ **Not recommended** - harder to update and less secure.

---

## Files Modified

### `backend/services/downloader.py`
```python
# Added environment variable support
cookies_b64 = os.getenv("YOUTUBE_COOKIES_BASE64")
if cookies_b64:
    cookie_file.write_bytes(base64.b64decode(cookies_b64))
```

### `backend/.gitignore`
```
cookies.txt
cookies*.txt
```

---

## Summary

| Environment | Cookie Method |
|-------------|---------------|
| **Local Dev** | Chrome browser (automatic) |
| **Production** | Environment variable (YOUTUBE_COOKIES_BASE64) |

**Setup time:** 5 minutes  
**Update frequency:** Every 30 days  
**Difficulty:** Easy ⭐

---

## Need Help?

1. Check `RENDER-DEPLOYMENT.md` for detailed guide
2. Check `COOKIE-SETUP.md` for cookie basics
3. Run `./setup_render_cookies.sh` for automated setup

---

**Last Updated:** May 2, 2026  
**Status:** ✅ Production Ready
