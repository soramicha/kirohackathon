# ➕ Add Formation Feature

## Overview

The **Add Formation** feature allows you to generate new dance formations at any timestamp in the video. Simply specify when you want to capture a formation, and the system will automatically:

1. Extract the video frame at that timestamp
2. Detect all dancers using YOLOv11 pose estimation
3. Generate a top-down formation view
4. Add it to your formation timeline

## How to Use

### Step 1: Open Formation Viewer
After analyzing a video, you'll see the Formation Viewer with your existing formations.

### Step 2: Click "➕ Add Formation"
In the top-right corner, click the **"➕ Add Formation"** button.

### Step 3: Enter Timestamp
A modal will appear asking for a timestamp. You can enter it in two formats:

**Format 1: Minutes:Seconds**
```
1:23    → 1 minute 23 seconds (83 seconds)
0:45    → 45 seconds
2:30    → 2 minutes 30 seconds (150 seconds)
```

**Format 2: Total Seconds**
```
83      → 83 seconds (1:23)
45      → 45 seconds
150     → 150 seconds (2:30)
```

### Step 4: Generate
Click **"Generate Formation"** and wait a few seconds while the system:
- Extracts the frame
- Detects dancers
- Creates the formation

### Step 5: View & Edit
The new formation will appear in your timeline, sorted by timestamp. You can:
- ✅ View the formation
- ✅ Add/remove dancers manually
- ✅ Drag dancers to adjust positions
- ✅ Save changes

## Features

### ✅ Automatic Dancer Detection
- Uses YOLOv11 pose estimation
- Detects all visible dancers
- Assigns consistent IDs
- Provides confidence scores

### ✅ Smart Timestamp Parsing
- Accepts MM:SS format (e.g., "1:23")
- Accepts seconds format (e.g., "83")
- Validates against video duration
- Shows helpful error messages

### ✅ Timeline Integration
- New formations automatically sorted by timestamp
- Seamlessly integrates with existing formations
- Maintains dancer ID consistency
- Updates frames index

### ✅ Real-time Feedback
- Loading indicator during generation
- Success message with dancer count
- Error messages for invalid inputs
- Auto-dismissing notifications

## Use Cases

### 1. Fill Gaps in Auto-Detection
Sometimes the automatic formation scanner misses key moments. Use this feature to manually add formations at important timestamps.

**Example:**
```
Auto-detected: 0:00, 0:15, 0:45, 1:30
Missing: 1:00 (important transition)
→ Add formation at 1:00
```

### 2. Capture Specific Choreography
Want to analyze a specific move or transition? Add a formation at that exact moment.

**Example:**
```
"I want to see the formation at 2:15 when they do the spin"
→ Add formation at 2:15
```

### 3. Create Dense Timeline
For detailed analysis, add formations at regular intervals.

**Example:**
```
Add formations every 10 seconds:
0:10, 0:20, 0:30, 0:40, 0:50, 1:00, etc.
```

### 4. Compare Before/After
Add formations just before and after a transition to see how dancers move.

**Example:**
```
Transition at 1:30
→ Add formation at 1:28 (before)
→ Add formation at 1:32 (after)
```

## Technical Details

### Backend Endpoint
```
POST /formations/add-formation
```

**Request:**
```json
{
  "session_id": "abc123",
  "timestamp": 83.5
}
```

**Response:**
```json
{
  "session_id": "abc123",
  "frame_id": "frame_00083500",
  "timestamp": 83.5,
  "dancer_count": 8,
  "dancers": [
    {
      "id": 1,
      "label": "Dancer 1 (top-left)",
      "x": 0.25,
      "y": 0.30,
      "x_top": 0.25,
      "y_top": 0.30,
      "bbox": [120, 150, 180, 280],
      "keypoints": [...],
      "confidence": 0.92
    },
    // ... more dancers
  ],
  "topdown_image": "formations/frame_00083500_topdown.jpg",
  "message": "Formation added successfully"
}
```

### Frame Extraction
- Uses OpenCV to extract frame at exact timestamp
- Saves as JPEG in `sessions/{session_id}/frames/`
- Frame ID format: `frame_{milliseconds:08d}`
- Example: `frame_00083500.jpg` for 83.5 seconds

### Dancer Detection
- YOLOv11 pose estimation model
- Detects persons with confidence > 0.4
- Extracts 17 keypoints per dancer
- Assigns IDs left-to-right

### Top-Down View
- Perspective transformation
- Normalized coordinates (0-1 range)
- Saved as `formations/{frame_id}_topdown.jpg`
- JSON data saved as `formations/{frame_id}_dancers.json`

### Index Update
- Updates `frames_index.json` with new frame
- Maintains sorted order by timestamp
- Prevents duplicate frame IDs
- Persists across sessions

## Validation

### Timestamp Validation
✅ **Valid formats:**
- `1:23` → 83 seconds
- `83` → 83 seconds
- `0:45` → 45 seconds
- `2:30.5` → 150.5 seconds

❌ **Invalid formats:**
- `abc` → Not a number
- `-10` → Negative timestamp
- `99:99` → Exceeds video duration
- Empty string

### Error Messages
```
"Invalid timestamp format"
→ Timestamp is not a valid number

"Timestamp exceeds video duration (3:45)"
→ Requested timestamp is beyond video end

"Could not extract frame at 83.5s"
→ Video file issue or timestamp out of range

"Failed to add formation"
→ General error (check backend logs)
```

## UI Components

### Add Formation Button
```jsx
<button className="bg-violet-600 hover:bg-violet-700">
  ➕ Add Formation
</button>
```
- Located in top-right header
- Violet color to stand out
- Opens modal on click

### Modal Dialog
- Dark theme matching app design
- Input field with placeholder
- Format hint below input
- Cancel and Generate buttons
- Keyboard support (Enter to submit)

### Success Message
```
"Formation added at 1:23 (8 dancers)"
```
- Green background
- Top-right corner
- Auto-dismisses after 3 seconds

### Error Message
```
"Timestamp exceeds video duration (3:45)"
```
- Red background
- Top-right corner
- Auto-dismisses after 3 seconds

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit timestamp (when modal is open) |
| `Escape` | Close modal (future enhancement) |

## Performance

### Speed
- Frame extraction: ~100ms
- Dancer detection: ~500ms
- Top-down generation: ~200ms
- **Total: ~800ms per formation**

### Limitations
- Maximum video duration: No limit
- Maximum formations: No limit (but UI may slow with 100+)
- Timestamp precision: Milliseconds
- Concurrent requests: One at a time (frontend prevents)

## Best Practices

### 1. Check Video Duration First
Before adding formations, note the video duration shown in the header:
```
"12 formations · 8 dancers · 3:45 total"
                              ^^^^
```

### 2. Use Consistent Intervals
For systematic analysis, add formations at regular intervals:
```
Every 10 seconds: 0:10, 0:20, 0:30, ...
Every 30 seconds: 0:30, 1:00, 1:30, ...
```

### 3. Preview Before Adding
Watch the video first to identify key moments worth capturing.

### 4. Name Your Formations (Future)
Currently formations are numbered. In the future, you'll be able to name them:
```
"Opening Formation"
"Transition 1"
"Final Pose"
```

### 5. Save After Adding
After adding formations, use the save feature to persist your changes:
```
💾 Save Current  → Save single formation
💾 Save All      → Save all formations
```

## Troubleshooting

### Issue: "Could not extract frame"
**Possible causes:**
- Timestamp exceeds video duration
- Video file corrupted
- Insufficient disk space

**Solution:**
1. Check video duration
2. Try a different timestamp
3. Re-download the video

### Issue: "No dancers detected"
**Possible causes:**
- Frame is too dark
- Dancers are too small
- Dancers are occluded

**Solution:**
1. Try a different timestamp
2. Manually add dancers using "+ Add Dancer"
3. Adjust video quality settings

### Issue: Modal won't close
**Solution:**
- Click "Cancel" button
- Refresh the page if stuck

### Issue: Formation not appearing
**Possible causes:**
- Generation still in progress
- Error occurred (check message)
- Browser cache issue

**Solution:**
1. Wait for success message
2. Check for error message
3. Refresh the page

## Future Enhancements

### Planned Features
- [ ] Batch add formations (multiple timestamps at once)
- [ ] Formation naming/labeling
- [ ] Duplicate formation (copy existing)
- [ ] Delete formation
- [ ] Keyboard shortcuts (Escape to close modal)
- [ ] Timestamp picker with video preview
- [ ] Formation templates
- [ ] Auto-suggest timestamps based on music beats

### API Improvements
- [ ] Batch endpoint for multiple timestamps
- [ ] WebSocket for real-time progress
- [ ] Formation comparison endpoint
- [ ] Formation merge/split

## Examples

### Example 1: Add Single Formation
```
1. Click "➕ Add Formation"
2. Enter "1:23"
3. Click "Generate Formation"
4. Wait ~1 second
5. See "Formation added at 1:23 (8 dancers)"
6. New formation appears in timeline
```

### Example 2: Add Multiple Formations
```
1. Add formation at 0:30
2. Wait for success
3. Add formation at 1:00
4. Wait for success
5. Add formation at 1:30
6. All three appear in sorted timeline
```

### Example 3: Handle Error
```
1. Click "➕ Add Formation"
2. Enter "99:99" (exceeds duration)
3. Click "Generate Formation"
4. See error: "Timestamp exceeds video duration (3:45)"
5. Enter valid timestamp "2:00"
6. Success!
```

## Code Examples

### Frontend: Add Formation
```javascript
async function handleAddFormation() {
  const timestampSeconds = parseTimestamp(newTimestamp);
  
  try {
    const result = await addFormation(session.session_id, timestampSeconds);
    
    // Add to formations list
    const newFormation = {
      frame_id: result.frame_id,
      timestamp: result.timestamp,
      dancers: result.dancers.map(convertToCanvasCoords),
    };
    
    setFormations(prev => [...prev, newFormation].sort(byTimestamp));
    showSuccess(`Formation added at ${formatTime(timestampSeconds)}`);
  } catch (error) {
    showError(error.message);
  }
}
```

### Backend: Generate Formation
```python
@router.post("/add-formation")
def add_formation_at_timestamp(req: AddFormationRequest):
    # Extract frame
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_MSEC, req.timestamp * 1000)
    ret, frame = cap.read()
    
    # Save frame
    cv2.imwrite(frame_path, frame)
    
    # Detect dancers
    dancers = detect_dancers(session_id, frame_id)
    
    # Generate top-down
    topdown = generate_topdown(session_id, frame_id, dancers)
    
    return {
        "frame_id": frame_id,
        "timestamp": req.timestamp,
        "dancers": dancers,
    }
```

## Summary

The **Add Formation** feature gives you complete control over your formation timeline:

✅ **Easy to use** - Simple timestamp input  
✅ **Fast** - Generates in ~1 second  
✅ **Accurate** - YOLOv11 pose estimation  
✅ **Flexible** - Add formations anywhere  
✅ **Integrated** - Seamless timeline updates  

Perfect for:
- Filling gaps in auto-detection
- Capturing specific moments
- Dense timeline analysis
- Before/after comparisons

---

**Need help?** Check the troubleshooting section or open an issue on GitHub.
