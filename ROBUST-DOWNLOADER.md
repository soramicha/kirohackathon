# Robust Video Downloader - Local & Cloud Compatible

## Problem

yt-dlp and YouTube behave inconsistently between local and cloud environments:
- Different formats available
- Different cookie behavior
- Different ffmpeg availability
- Network conditions vary

## Solution

Implemented a **multi-strategy fallback system** that tries multiple approaches until one succeeds.

## How It Works

### Strategy 1: Best Quality with Merging
```python
"format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
"merge_output_format": "mp4"
```

**Best for**: Local with ffmpeg installed  
**Requires**: ffmpeg for merging video+audio  
**Quality**: Highest  

### Strategy 2: Best Single File
```python
"format": "best[ext=mp4]/best"
```

**Best for**: Cloud without ffmpeg  
**Requires**: Nothing  
**Quality**: Good  

### Strategy 3: Universal Fallback
```python
"format": "best"
```

**Best for**: Any environment  
**Requires**: Nothing  
**Quality**: Whatever's available  

## Execution Flow

```
1. Try Strategy 1 (best quality)
   ├─ Success? → Return ✓
   └─ Fail? → Continue

2. Try Strategy 2 (single file)
   ├─ Success? → Return ✓
   └─ Fail? → Continue

3. Try Strategy 3 (fallback)
   ├─ Success? → Return ✓
   └─ Fail? → Error ✗
```

## Cookie Handling

### Smart Cookie Management

1. **Check if cookies exist**
2. **Copy to temp** (writable location)
3. **Try with cookies**
4. **If cookies cause errors** → Disable and retry
5. **Clean up temp cookies** after success

### Cookie Error Detection

Automatically detects cookie-related errors:
- "format is not available"
- "sign in"
- Other authentication issues

When detected, disables cookies for remaining attempts.

## Logging

Clear, emoji-based logging for easy debugging:

```
✓ Using cookies from: /etc/secrets/cookies.txt
→ Attempt 1/3: Best quality MP4 with merging
✗ Strategy 1 failed: ERROR: Requested format is not available
  → Cookies may be causing issues, disabling for next attempts
→ Attempt 2/3: Best single MP4 file
✓ Success with strategy 2: Best single MP4 file
```

## Benefits

✅ **Works everywhere**: Local, Render, Railway, Vercel, etc.  
✅ **Automatic fallback**: Tries multiple strategies  
✅ **Cookie resilience**: Disables bad cookies automatically  
✅ **Clear logging**: Easy to debug issues  
✅ **No manual intervention**: Just works  

## Environment Compatibility

### Local Development
- ✅ Strategy 1: Works (ffmpeg available)
- ✅ Strategy 2: Works
- ✅ Strategy 3: Works

### Render/Cloud
- ⚠️ Strategy 1: May fail (ffmpeg might not be available)
- ✅ Strategy 2: Works
- ✅ Strategy 3: Works

### With Bad Cookies
- ✗ Strategy 1: Fails
- ✗ Strategy 2: Fails
- ✓ Cookies disabled
- ✅ Strategy 3: Works (without cookies)

## Testing

### Test All Strategies

```bash
cd backend
python3 -c "
from services.downloader import download_video

url = 'https://www.youtube.com/watch?v=1kYrp_Bs8DU'
session_id = 'test_robust'

metadata = download_video(url, session_id)
print(f'Success: {metadata[\"title\"]}')
"
```

### Expected Output

```
ℹ No cookies file - proceeding without authentication
→ Attempt 1/3: Best quality MP4 with merging
✓ Success with strategy 1: Best quality MP4 with merging
Success: BLACKPINK - '휘파람(WHISTLE)' DANCE PRACTICE VIDEO
```

Or with fallback:

```
✓ Using cookies from: cookies.txt
→ Attempt 1/3: Best quality MP4 with merging
✗ Strategy 1 failed: ERROR: Requested format is not available
  → Cookies may be causing issues, disabling for next attempts
→ Attempt 2/3: Best single MP4 file
✓ Success with strategy 2: Best single MP4 file
Success: BLACKPINK - '휘파람(WHISTLE)' DANCE PRACTICE VIDEO
```

## Configuration

### Add More Strategies

Easy to add more fallback strategies:

```python
format_strategies = [
    # ... existing strategies ...
    
    # Strategy 4: Lower quality for slow networks
    {
        "format": "worst[ext=mp4]/worst",
        "description": "Lowest quality (fast download)"
    },
]
```

### Adjust Strategy Order

Reorder strategies based on your needs:

```python
# For cloud (no ffmpeg), put single-file first
format_strategies = [
    {"format": "best[ext=mp4]/best", ...},  # Single file first
    {"format": "bestvideo+bestaudio", ...},  # Merging second
    {"format": "best", ...},  # Fallback last
]
```

## Error Handling

### All Strategies Fail

If all strategies fail, raises exception with last error:

```python
Exception: All download strategies failed. Last error: [youtube] ...
```

### Partial Success

If any strategy succeeds, returns immediately (no need to try remaining strategies).

## Files Changed

- `backend/services/downloader.py`:
  - Added multi-strategy fallback system
  - Smart cookie error detection
  - Automatic cookie disabling on errors
  - Clear emoji-based logging
  - Temp cookie cleanup

## Summary

✅ **Robust**: Tries multiple strategies until one works  
✅ **Smart**: Detects and handles cookie issues automatically  
✅ **Compatible**: Works in local and cloud environments  
✅ **Debuggable**: Clear logging shows what's happening  
✅ **Maintainable**: Easy to add more strategies  

The downloader now bridges the gap between local and cloud environments by trying multiple approaches and automatically handling common issues like bad cookies and missing ffmpeg!
