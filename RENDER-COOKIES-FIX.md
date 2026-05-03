# Fix: Read-only File System Error on Render

## Problem

```
[Errno 30] Read-only file system: '/etc/secrets/cookies.txt'
```

**Cause**: yt-dlp tries to UPDATE cookies during download (writes back to the file), but Render Secret Files are mounted as **read-only**.

## Solution

Copy the read-only cookies to a writable temporary location before passing to yt-dlp.

## Code Changes

### Before (Broken on Render):
```python
cookies_path = Path(COOKIES_FILE)
if cookies_path.exists():
    ydl_opts["cookiefile"] = str(cookies_path)  # ❌ Read-only on Render
```

### After (Fixed):
```python
import tempfile
import shutil

cookies_path = Path(COOKIES_FILE)
if cookies_path.exists():
    # Copy to writable temp location (yt-dlp may try to update cookies)
    temp_cookie_path = Path(tempfile.gettempdir()) / "cookies.txt"
    shutil.copyfile(cookies_path, temp_cookie_path)
    ydl_opts["cookiefile"] = str(temp_cookie_path)  # ✅ Writable
    print(f"Using cookies from temp copy: {temp_cookie_path}")
```

## How It Works

1. **Read from Secret File**: `/etc/secrets/cookies.txt` (read-only)
2. **Copy to temp**: `/tmp/cookies.txt` (writable)
3. **Pass to yt-dlp**: Uses writable copy
4. **yt-dlp can update**: Writes to `/tmp/cookies.txt` (no error)
5. **Original preserved**: `/etc/secrets/cookies.txt` unchanged

## Why This Works

### Render Secret Files
- Mounted at `/etc/secrets/`
- **Read-only** filesystem
- Cannot be modified by application

### System Temp Directory
- Located at `/tmp/` on Linux
- **Writable** by application
- Cleared on restart (ephemeral)

### yt-dlp Behavior
- Reads cookies from file
- May **update** cookies during download (session refresh)
- Needs **write** permission to cookie file

## Deployment

### On Render:

1. **Secret File** (already set up):
   - Filename: `cookies.txt`
   - Mounted at: `/etc/secrets/cookies.txt`

2. **Environment Variable** (already set up):
   - Key: `YOUTUBE_COOKIES_FILE`
   - Value: `/etc/secrets/cookies.txt`

3. **Deploy** with updated code:
   - Code now copies to `/tmp/cookies.txt`
   - yt-dlp uses writable copy
   - ✅ No more read-only errors!

### Locally:

Works the same way:
- Cookies at `backend/cookies.txt` (writable)
- Copied to `/tmp/cookies.txt`
- yt-dlp uses temp copy

## Benefits

✅ **Works on Render**: No read-only errors  
✅ **Works locally**: Same code path  
✅ **Preserves original**: Secret File unchanged  
✅ **Secure**: Temp file cleared on restart  
✅ **No config changes**: Just code update  

## Testing

### Test on Render:

1. Deploy updated code
2. Try downloading a video
3. Check logs for:
   ```
   Using cookies from temp copy: /tmp/cookies.txt
   ```
4. Download should succeed ✅

### Test locally:

1. Restart backend: `python3 main.py`
2. Try downloading a video
3. Check logs for:
   ```
   Using cookies from temp copy: /tmp/cookies.txt
   ```
4. Download should succeed ✅

## Troubleshooting

### Still getting read-only error?

**Check**:
1. Code is deployed (not using old version)
2. Imports are correct (`tempfile`, `shutil`)
3. Temp directory is writable: `ls -la /tmp/`

### Cookies not working?

**Check**:
1. Secret File exists in Render
2. Environment variable is set
3. Cookies are not expired (re-export if needed)

### Temp file not found?

**Check**:
1. `tempfile.gettempdir()` returns valid path
2. Permissions on `/tmp/` directory
3. Disk space available

## File Changes

- `backend/services/downloader.py`:
  - Added `import tempfile`
  - Added `import shutil`
  - Copy cookies to temp before using

## Summary

✅ **Fixed**: Read-only file system error on Render  
✅ **Method**: Copy cookies to writable temp location  
✅ **Impact**: Works on Render and locally  
✅ **Security**: Original cookies preserved  

The fix is simple: copy read-only cookies to a writable location before passing to yt-dlp. This allows yt-dlp to update the cookies without errors.
