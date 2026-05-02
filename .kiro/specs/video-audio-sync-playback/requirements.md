# Requirements Document

## Introduction

This feature adds real-time video and audio playback capabilities to the dance formation extraction application. Currently, the system works with static frames extracted at specific timestamps. This enhancement will allow users to play the video with synchronized audio while viewing formation data, enabling better choreography analysis by seeing formations in motion alongside the extracted formation maps.

## Glossary

- **Video_Player**: The frontend component responsible for rendering video content with playback controls
- **Audio_Stream**: The audio track synchronized with the video playback
- **Formation_Visualizer**: The component that displays top-down formation maps
- **Playback_Controller**: The component that manages play/pause/seek operations
- **Timestamp_Marker**: Visual indicators on the timeline showing where formations were detected
- **Sync_Engine**: The system that maintains synchronization between video playback position and formation data display
- **Session**: A user's working context containing a downloaded video and its extracted formation data
- **Backend_API**: The FastAPI service that serves video files and formation data
- **Frontend_Client**: The React application that displays the user interface

## Requirements

### Requirement 1: Video Streaming

**User Story:** As a choreographer, I want to stream the video file from the backend, so that I can watch the dance performance in the application.

#### Acceptance Criteria

1. WHEN a session with a downloaded video exists, THE Backend_API SHALL serve the video file via HTTP streaming
2. THE Backend_API SHALL support HTTP range requests for video seeking
3. WHEN the Frontend_Client requests a video, THE Video_Player SHALL load and buffer the video stream
4. THE Video_Player SHALL display a loading indicator while buffering
5. IF the video file does not exist, THEN THE Backend_API SHALL return a 404 error with a descriptive message

### Requirement 2: Audio Playback

**User Story:** As a choreographer, I want to hear the music synchronized with the video, so that I can understand the choreography in context with the aud@

#### Acceptance Criteria

1. WHEN a video is loaded, THE Video_Player SHALL extract and play the Audio_Stream
2. THE Audio_Stream SHALL remain synchronized with video playback within 100 milliseconds
3. WHEN the user adjusts volume, THE Video_Player SHALL change the Audio_Stream volume accordingly
4. THE Video_Player SHALL provide a mute toggle control
5. WHEN the video is paused, THE Audio_Stream SHALL pause simultaneously

### Requirement 3: Playback Controls

**User Story:** As a choreographer, I want standard video controls (play, pause, seek), so that I can navigate through the performance easily.

#### Acceptance Criteria

1. THE Playback_Controller SHALL provide play and pause buttons
2. WHEN the user clicks play, THE Video_Player SHALL begin playback from the current position
3. WHEN the user clicks pause, THE Video_Player SHALL stop playback and maintain the current position
4. THE Playback_Controller SHALL display a seekable timeline showing total duration
5. WHEN the user drags the timeline scrubber, THE Video_Player SHALL seek to the selected timestamp
6. THE Playback_Controller SHALL display the current playback time and total duration in MM:SS format
7. WHEN the video reaches the end, THE Video_Player SHALL pause and reset to the beginning

### Requirement 4: Formation Timestamp Markers

**User Story:** As a choreographer, I want to see markers on the timeline indicating where formations were detected, so that I can quickly jump to important moments.

#### Acceptance Criteria

1. WHEN formation timestamps exist for a session, THE Playback_Controller SHALL display Timestamp_Markers on the timeline
2. EACH Timestamp_Marker SHALL be positioned proportionally to its timestamp relative to video duration
3. WHEN the user clicks a Timestamp_Marker, THE Video_Player SHALL seek to that timestamp
4. THE Timestamp_Markers SHALL be visually distinct from the timeline background
5. WHEN the user hovers over a Timestamp_Marker, THE Playback_Controller SHALL display the timestamp value

### Requirement 5: Real-Time Formation Synchronization

**User Story:** As a choreographer, I want the formation visualization to update automatically as the video plays, so that I can see how dancer positions change over time.

#### Acceptance Criteria

1. WHILE the video is playing, THE Sync_Engine SHALL monitor the current playback position
2. WHEN the playback position crosses a formation timestamp, THE Formation_Visualizer SHALL display the corresponding formation map
3. THE Sync_Engine SHALL update the Formation_Visualizer within 200 milliseconds of crossing a timestamp
4. WHEN no formation exists at the current playback position, THE Formation_Visualizer SHALL display the most recent formation or a placeholder
5. WHEN the user seeks to a new position, THE Formation_Visualizer SHALL immediately update to show the appropriate formation for that timestamp

### Requirement 6: Playback Speed Control

**User Story:** As a choreographer, I want to adjust playback speed, so that I can study complex formations in slow motion or review quickly at faster speeds.

#### Acceptance Criteria

1. THE Playback_Controller SHALL provide playback speed options of 0.25x, 0.5x, 0.75x, 1x, 1.25x, 1.5x, and 2x
2. WHEN the user selects a playback speed, THE Video_Player SHALL adjust both video and Audio_Stream playback rate
3. THE Audio_Stream SHALL maintain pitch correction at all playback speeds
4. THE Sync_Engine SHALL maintain formation synchronization accuracy at all playback speeds
5. THE Playback_Controller SHALL display the current playback speed

### Requirement 7: Side-by-Side Layout

**User Story:** As a choreographer, I want to view the video and formation map side-by-side, so that I can compare the actual performance with the extracted formation.

#### Acceptance Criteria

1. THE Frontend_Client SHALL display the Video_Player and Formation_Visualizer in a side-by-side layout
2. THE Video_Player SHALL occupy 50% of the available width on desktop viewports
3. THE Formation_Visualizer SHALL occupy 50% of the available width on desktop viewports
4. WHEN the viewport width is less than 768 pixels, THE Frontend_Client SHALL stack the Video_Player above the Formation_Visualizer
5. BOTH components SHALL maintain their aspect ratios when resized

### Requirement 8: Keyboard Shortcuts

**User Story:** As a choreographer, I want keyboard shortcuts for common actions, so that I can control playback efficiently without using the mouse.

#### Acceptance Criteria

1. WHEN the user presses the spacebar, THE Playback_Controller SHALL toggle between play and pause
2. WHEN the user presses the left arrow key, THE Video_Player SHALL seek backward 5 seconds
3. WHEN the user presses the right arrow key, THE Video_Player SHALL seek forward 5 seconds
4. WHEN the user presses the M key, THE Video_Player SHALL toggle mute
5. WHEN the user presses the F key, THE Video_Player SHALL toggle fullscreen mode
6. THE Frontend_Client SHALL prevent keyboard shortcuts from triggering when the user is typing in an input field

### Requirement 9: Video File Format Support

**User Story:** As a choreographer, I want the player to support common video formats, so that videos downloaded from YouTube work reliably.

#### Acceptance Criteria

1. THE Video_Player SHALL support MP4 container format with H.264 video codec
2. THE Video_Player SHALL support AAC audio codec
3. THE Video_Player SHALL support WebM container format with VP9 video codec
4. THE Video_Player SHALL support Opus audio codec
5. IF an unsupported format is encountered, THEN THE Video_Player SHALL display an error message indicating the format is not supported

### Requirement 10: Playback State Persistence

**User Story:** As a choreographer, I want my playback position to be remembered, so that I can resume where I left off if I navigate away.

#### Acceptance Criteria

1. WHEN the user seeks or plays to a new position, THE Frontend_Client SHALL store the current timestamp in browser local storage
2. WHEN the user returns to a session, THE Video_Player SHALL restore the playback position from local storage
3. WHEN the user closes the session, THE Frontend_Client SHALL clear the stored playback position for that session
4. THE stored playback position SHALL be associated with the session ID
5. IF no stored position exists, THEN THE Video_Player SHALL start at the beginning of the video

### Requirement 11: Loading and Error States

**User Story:** As a choreographer, I want clear feedback when the video is loading or if errors occur, so that I understand the system status.

#### Acceptance Criteria

1. WHILE the video is buffering, THE Video_Player SHALL display a loading spinner overlay
2. IF the video fails to load, THEN THE Video_Player SHALL display an error message with the failure reason
3. IF the network connection is lost during playback, THEN THE Video_Player SHALL display a connection error message
4. WHEN the video is ready to play, THE Video_Player SHALL remove the loading indicator
5. THE Video_Player SHALL provide a retry button when errors occur

### Requirement 12: Performance Optimization

**User Story:** As a choreographer, I want smooth video playback without lag, so that I can analyze formations without interruption.

#### Acceptance Criteria

1. THE Video_Player SHALL maintain a minimum of 24 frames per second during playback
2. THE Backend_API SHALL implement video file caching headers to enable browser caching
3. THE Video_Player SHALL preload at least 5 seconds of video content ahead of the current playback position
4. THE Sync_Engine SHALL use requestAnimationFrame for smooth formation updates
5. WHEN the browser tab is not visible, THE Video_Player SHALL reduce resource usage by pausing non-essential updates

