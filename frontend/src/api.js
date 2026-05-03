import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: BASE });

export const processVideo = (url) =>
  api.post("/video/process", { url }).then((r) => r.data);

export const scanFormations = (session_id) =>
  api.post(`/video/scan/${session_id}`).then((r) => r.data);

export const extractFrames = (session_id, timestamps) =>
  api.post("/video/extract-frames", { session_id, timestamps }).then((r) => r.data);

export const analyzeFormation = (session_id, frame_id) =>
  api.post("/formations/analyze", { session_id, frame_id }).then((r) => r.data);

export const analyzeAll = (session_id, dancer_count) =>
  api.post("/formations/analyze-all", { session_id, dancer_count }).then((r) => r.data);

export const saveFormations = (session_id, formations) =>
  api.post("/formations/save-formations", { session_id, formations }).then((r) => r.data);

export const addFormation = (session_id, timestamp) =>
  api.post("/formations/add-formation", { session_id, timestamp }).then((r) => r.data);

export const deleteFormation = (session_id, frame_id) =>
  api.post("/formations/delete-formation", { session_id, frame_id }).then((r) => r.data);

export const exportSession = (session_id) =>
  api.post("/formations/export", { session_id }, { responseType: "blob" }).then((r) => r.data);

export const imageUrl = (session_id, filename) =>
  `${BASE}/formations/image/${session_id}/${filename}`;

export const videoStreamUrl = (session_id) =>
  `${BASE}/video/stream/${session_id}`;
