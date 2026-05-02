# Requirements Document

## Introduction

The Dance Formation App is a web application that enables choreographers, dance coaches, and performers to analyze dance formations from YouTube videos. Users provide a YouTube link and select timestamps; the system downloads the video, extracts frames at those timestamps, uses AI and computer vision to detect and number each dancer, translates the front-facing camera view into a top-down formation map, and exports a PDF report containing screenshots, formation diagrams, dancer metadata, and position data. The app is deployed on Vercel and stores all session data locally in the browser or a lightweight backend store.

---

## Glossary

- **App**: The Dance Formation web application
- **User**: A choreographer, coach, or performer using the App
- **YouTube_Importer**: The subsystem responsible for accepting YouTube URLs and downloading video data
- **Video_Processor**: The subsystem responsible for extracting frames from video at specified timestamps
- **AI_Detector**: The AI/computer vision subsystem responsible for detecting people in frames
- **Formation_Mapper**: The subsystem responsible for translating front-view dancer positions into a top-down formation map
- **Environment_Analyzer**: The subsystem responsible for identifying the physical environment and estimating depth from video
- **Dancer**: A person detected in a video frame by the AI_Detector
- **Dancer_Profile**: A record associating a Dancer's identifier (number or name) with their visual description and tracking data
- **Timestamp**: A specific point in time within a YouTube video, expressed in HH:MM:SS format
- **Formation**: A top-down 2D spatial representation of Dancer positions at a given Timestamp
- **Formation_Image**: A rendered image of a Formation
- **Session**: A single user work session associated with one YouTube URL and its derived data
- **Session_Store**: The local data store that persists Session data
- **Metadata**: A JSON object containing Timestamp, Formation reference, Dancer_Profile list, and environment data for a Session
- **PDF_Exporter**: The subsystem responsible for generating a PDF report from Session data
- **Vercel**: The cloud deployment platform hosting the App
- **OPFS**: Origin Private File System — a browser-native file system API used to store large binary data (downloaded video, extracted frames) locally in the browser
- **IndexedDB**: A browser-native structured data store used to persist Session Metadata, Dancer_Profiles, and other JSON-serializable records
- **Compute_API**: The set of Vercel Python serverless functions that perform heavy server-side computation (video download, pose detection, tracking, depth estimation)
- **yt-dlp**: An open-source command-line tool used server-side by the Compute_API to download YouTube videos
- **Pose_Estimator**: The server-side component that runs YOLOv8-pose or YOLOv11-pose to detect persons and their body keypoints in video frames
- **Tracker**: The server-side component that runs BoT-SORT or DeepSORT to re-identify and track the same Dancer across frames
- **Depth_Estimator**: The server-side component that runs MiDaS or Depth Anything v2 to produce a monocular depth map used for perspective calibration

---

## Requirements

### Requirement 1: YouTube Video Input

**User Story:** As a User, I want to submit a YouTube URL to the App, so that I can analyze dance formations from any publicly available YouTube video.

#### Acceptance Criteria

1. THE App SHALL provide a text input field that accepts a YouTube URL.
2. WHEN a User submits a YouTube URL, THE YouTube_Importer SHALL validate that the URL points to a publicly accessible YouTube video.
3. IF the submitted URL is not a valid YouTube URL, THEN THE App SHALL display a descriptive error message identifying the validation failure.
4. IF the YouTube video is private, age-restricted, or otherwise inaccessible, THEN THE YouTube_Importer SHALL return an error message describing the access failure.
5. WHEN a valid YouTube URL is accepted, THE YouTube_Importer SHALL retrieve the video title, duration, and thumbnail and display them to the User for confirmation.
6. WHEN the User confirms the video, THE Compute_API SHALL invoke yt-dlp server-side via a Vercel API route to download the video file and return it to the browser.
7. WHEN the video file is received by the browser, THE Session_Store SHALL write the video binary to OPFS under a filename derived from the video identifier.

---

### Requirement 2: Timestamp Selection

**User Story:** As a User, I want to select specific timestamps from the YouTube video, so that I can generate formation images only at the moments I care about.

#### Acceptance Criteria

1. WHEN a YouTube video is confirmed, THE App SHALL display a timestamp input interface that allows the User to add one or more Timestamps.
2. THE App SHALL allow the User to enter Timestamps manually in HH:MM:SS format.
3. WHERE a video preview player is available, THE App SHALL allow the User to select a Timestamp by pausing the player and clicking a "Add Timestamp" control.
4. WHEN a Timestamp is added, THE App SHALL validate that the Timestamp falls within the video's duration.
5. IF a Timestamp falls outside the video's duration, THEN THE App SHALL display an error and reject the Timestamp.
6. THE App SHALL allow the User to remove any previously added Timestamp before processing begins.
7. THE App SHALL require at least one Timestamp before allowing the User to proceed to processing.

---

### Requirement 3: Full Video Dancer Scan

**User Story:** As a User, I want the AI to scan the entire video and identify all unique dancers, so that I have an accurate count and profile of every performer before I review specific formations.

#### Acceptance Criteria

1. WHEN the User initiates processing, THE AI_Detector SHALL scan the full video to identify all unique Dancers present across the entire duration.
2. THE Pose_Estimator SHALL use YOLOv8-pose or YOLOv11-pose to detect each person and their body keypoints in sampled frames across the full video duration.
3. THE Tracker SHALL use BoT-SORT or DeepSORT to associate detections across frames and assign a stable identity to each unique Dancer.
4. THE AI_Detector SHALL assign a unique numeric identifier to each detected Dancer.
5. WHEN the full scan is complete, THE App SHALL display the detected Dancer count and a visual summary of each Dancer to the User for verification.
6. THE App SHALL allow the User to assign a custom name or label to each Dancer_Profile in place of the default numeric identifier.
7. WHEN a User assigns a name to a Dancer_Profile, THE Session_Store SHALL update the Dancer_Profile record with the provided name.
8. THE App SHALL display an AI-generated visual description alongside each Dancer_Profile to assist the User in identifying individuals.
9. IF the AI_Detector detects fewer or more Dancers than the User expects, THE App SHALL provide a mechanism for the User to manually adjust the Dancer count.

---

### Requirement 4: Environment Analysis

**User Story:** As a User, I want the system to identify the performance environment from the video, so that depth perception can be calibrated for accurate top-down formation mapping.

#### Acceptance Criteria

1. WHEN a video is loaded, THE Environment_Analyzer SHALL analyze the video to identify the type of performance environment (e.g., stage, studio, outdoor).
2. THE Depth_Estimator SHALL use MiDaS or Depth Anything v2 to produce a monocular depth map from representative video frames.
3. THE Environment_Analyzer SHALL use the depth map produced by the Depth_Estimator to calibrate the perspective transformation used by the Formation_Mapper.
4. WHEN environment analysis is complete, THE App SHALL display the detected environment type and depth calibration parameters to the User.
5. THE App SHALL allow the User to confirm or override the detected environment type before formation processing begins.
6. IF the Environment_Analyzer cannot determine the environment with sufficient confidence, THEN THE App SHALL prompt the User to manually select the environment type from a predefined list.

---

### Requirement 5: Frame Extraction at Timestamps

**User Story:** As a User, I want the system to extract a screenshot from the video at each of my selected timestamps, so that I have a visual reference for each formation.

#### Acceptance Criteria

1. WHEN processing begins, THE Video_Processor SHALL extract one image frame from the video at each User-selected Timestamp.
2. THE Video_Processor SHALL extract frames at a minimum resolution of 720p where the source video supports it.
3. WHEN a frame is extracted, THE Session_Store SHALL associate the frame with its corresponding Timestamp.
4. IF a frame cannot be extracted at a specified Timestamp, THEN THE Video_Processor SHALL log the failure and notify the User with the affected Timestamp.
5. WHEN all frames are extracted, THE App SHALL display thumbnail previews of each extracted frame to the User.

---

### Requirement 6: Dancer Position Detection per Frame

**User Story:** As a User, I want the AI to identify the position of each dancer in every extracted frame, so that I can see exactly where each performer is at each timestamp.

#### Acceptance Criteria

1. WHEN a frame is extracted, THE AI_Detector SHALL identify the pixel coordinates of each Dancer present in that frame.
2. THE Pose_Estimator SHALL use YOLOv8-pose or YOLOv11-pose to detect each person's bounding box and body keypoints in the extracted frame.
3. THE Tracker SHALL use BoT-SORT or DeepSORT to match each detection in the extracted frame to the corresponding Dancer_Profile established during the full video scan.
4. WHEN Dancer positions are detected in a frame, THE Session_Store SHALL store the Dancer identifier and pixel coordinates for that frame.
5. IF a Dancer from the Dancer_Profile list is not detected in a given frame, THE AI_Detector SHALL mark that Dancer as absent for that Timestamp.
6. THE App SHALL overlay Dancer identifiers on the extracted frame image to visually confirm detected positions.

---

### Requirement 7: Top-Down Formation Mapping

**User Story:** As a User, I want the system to translate each front-view frame into a top-down formation diagram, so that I can clearly see the spatial arrangement of dancers on the floor.

#### Acceptance Criteria

1. WHEN Dancer positions are detected in a frame, THE Formation_Mapper SHALL apply a perspective transformation to convert front-view pixel coordinates into top-down 2D floor coordinates.
2. THE Formation_Mapper SHALL use the depth calibration data produced by the Environment_Analyzer when computing the perspective transformation.
3. WHEN a Formation is computed, THE Formation_Mapper SHALL render a Formation_Image showing each Dancer as a labeled marker at their top-down position.
4. THE Formation_Image SHALL display each Dancer using their Dancer_Profile identifier (name or number).
5. WHEN a Formation_Image is rendered, THE Session_Store SHALL associate the Formation_Image with its corresponding Timestamp and extracted frame.
6. IF the perspective transformation cannot be computed for a frame, THEN THE Formation_Mapper SHALL notify the User and display the front-view frame without a top-down conversion.

---

### Requirement 8: Local Data Storage

**User Story:** As a User, I want all session data to be stored locally, so that I can return to my work without re-processing the video.

#### Acceptance Criteria

1. THE Session_Store SHALL persist all Session data locally, including the YouTube URL, Timestamps, Dancer_Profiles, extracted frames, Formation_Images, and Metadata.
2. THE Session_Store SHALL store large binary data — including the downloaded video file and extracted frame images — in OPFS.
3. THE Session_Store SHALL store structured Session Metadata — including the YouTube URL, Timestamps, Dancer_Profiles, environment type, and Formation references — in IndexedDB as JSON records.
4. WHEN a Session is created or updated, THE Session_Store SHALL write the updated data without requiring a page reload.
5. THE App SHALL allow the User to load a previously saved Session by selecting it from a list of stored Sessions.
6. THE App SHALL allow the User to delete a stored Session, which SHALL remove all associated binary data from OPFS and all associated records from IndexedDB.
7. WHEN the User deletes a Session, THE App SHALL prompt for confirmation before permanently removing the data.

---

### Requirement 9: Metadata JSON Export

**User Story:** As a User, I want to download session metadata as a JSON file, so that I can use the structured data in other tools or for record-keeping.

#### Acceptance Criteria

1. THE App SHALL provide a "Download Metadata" control that triggers a JSON file download.
2. WHEN the User activates the "Download Metadata" control, THE App SHALL generate a JSON file containing: the YouTube URL, all Timestamps, each Timestamp's associated Formation_Image filename, all Dancer_Profiles with identifiers and names, and the detected environment type.
3. THE JSON file SHALL conform to a documented schema with consistent field names and data types.
4. WHEN the JSON file is downloaded and re-imported into the App, THE Session_Store SHALL reconstruct the Session data equivalent to the original Session (round-trip property).
5. IF Session data is incomplete at the time of export, THEN THE App SHALL include only the fields that have been populated and SHALL mark incomplete fields with a null value.

---

### Requirement 10: PDF Export

**User Story:** As a User, I want to export a PDF report of the session, so that I can share formation diagrams and metadata with my team in a portable format.

#### Acceptance Criteria

1. THE App SHALL provide an "Export PDF" control that generates and downloads a PDF report.
2. WHEN the User activates "Export PDF", THE PDF_Exporter SHALL generate a PDF containing one page per Timestamp.
3. FOR EACH Timestamp page, THE PDF_Exporter SHALL include: the extracted frame screenshot, the Formation_Image, the list of Dancer identifiers and names, and the Timestamp value.
4. THE PDF_Exporter SHALL include a cover page containing the video title, YouTube URL, total Dancer count, and export date.
5. IF a Formation_Image is unavailable for a Timestamp, THEN THE PDF_Exporter SHALL include the extracted frame screenshot and a note indicating the formation could not be generated.
6. WHEN the PDF is generated, THE App SHALL initiate a file download with a filename derived from the video title and export date.

---

### Requirement 12: Server-Side Compute API

**User Story:** As a User, I want all heavy computation to run on the server, so that the browser remains responsive and the App works on low-powered devices.

#### Acceptance Criteria

1. THE Compute_API SHALL expose dedicated API routes on Vercel for each heavy compute operation: video download, pose estimation, dancer tracking, and depth estimation.
2. WHEN the browser invokes a Compute_API route, THE Compute_API SHALL execute the requested operation inside a Vercel Python serverless function and return the result to the browser.
3. THE Compute_API SHALL run yt-dlp for video download, YOLOv8-pose or YOLOv11-pose for pose estimation, BoT-SORT or DeepSORT for tracking, and MiDaS or Depth Anything v2 for depth estimation.
4. WHEN a Compute_API route completes successfully, THE Compute_API SHALL return a structured JSON response containing the operation result and a success status.
5. IF a Compute_API route encounters an error, THEN THE Compute_API SHALL return a structured JSON error response containing a descriptive error message and an HTTP error status code.
6. THE Compute_API SHALL not persist any user data server-side; all results SHALL be returned to the browser for local storage in OPFS or IndexedDB.
7. WHEN deployed to Vercel, THE Compute_API SHALL be accessible only over HTTPS.

---

### Requirement 11: Vercel Deployment

**User Story:** As a User, I want the App to be accessible via a public URL, so that I can use it from any device without installing software.

#### Acceptance Criteria

1. THE App SHALL be deployable to Vercel using standard Vercel build and deployment configuration.
2. WHEN deployed to Vercel, THE App SHALL serve all pages and API routes over HTTPS.
3. THE App SHALL function correctly in the latest stable versions of Chrome, Firefox, and Safari.
4. WHEN the App is deployed, THE App SHALL load the initial page within 3 seconds on a standard broadband connection.
