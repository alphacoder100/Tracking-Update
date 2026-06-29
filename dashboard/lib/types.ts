// Mirrors the backend Pydantic schemas (app/schemas.py).

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RegionOfInterest {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RoiResponse {
  roi: RegionOfInterest | null;
}

export interface VisitorSummary {
  id: string;
  name: string | null;
  visit_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_staff: boolean;
  is_active: boolean;
  best_face_det_score: number | null;
  thumbnail_url: string | null;
}

export interface VisitorListResponse {
  total: number;
  visitors: VisitorSummary[];
}

export interface VisitSummary {
  id: string;
  entered_at: string;
  left_at: string | null;
  duration_minutes: number | null;
  detection_count: number;
  best_face_confidence: number | null;
  camera_id: string | null;
  is_active: boolean;
}

export interface VisitorDetail extends VisitorSummary {
  notes: string | null;
  total_faces_recorded: number;
  latest_visit: VisitSummary | null;
  consent_status?: string | null;
  consent_at?: string | null;
  consent_method?: string | null;
  opted_out_at?: string | null;
}

export interface VisitListResponse {
  total: number;
  visits: VisitSummary[];
}

// One stored gallery face for a visitor (GET /api/visitors/{id}/faces).
export interface VisitorFaceItem {
  id: string;
  det_score: number | null;
  clarity_score: number | null;
  pose_bin: string | null;
  yaw: number | null;
  source_camera_id: string | null;
  created_at: string | null;
  crop_url: string | null;
}

export interface CameraStatus {
  is_running: boolean;
  source: string | null;
  source_kind?: "video" | "camera" | null;
  looping?: boolean;
  camera_id: string | null;
  fps: number | null;
  frames_processed: number;
  frames_skipped: number;
  persons_detected: number;
  new_visitors: number;
  returning_visitors: number;
  uptime_seconds: number;
  last_error: string | null;
}

export interface AnalyticsSummary {
  total_unique_visitors: number;
  total_visits: number;
  new_visitors: number;
  returning_visitors: number;
  average_duration_minutes: number;
  return_rate: number;
  visits_by_day: { day: string; visits: number }[];
}

export interface FrequencyDistribution {
  distribution: Record<string, number>;
}

export interface HourlyBreakdown {
  hourly: { hour: number; new: number; returning: number }[];
}

export interface TopVisitor {
  visitor_id: string;
  name: string | null;
  visit_count: number;
  first_visit: string | null;
  last_visit: string | null;
  avg_duration_minutes: number | null;
}

export interface ActivityEvent {
  id: string;
  detected_at: string;
  visitor_id: string | null;
  visitor_name: string | null;
  thumbnail_url: string | null;
  visit_id: string | null;
  face_similarity: number | null;
  is_new_visitor: boolean;
  is_ambiguous: boolean;
  match_source: string | null;
  camera_id: string | null;
}

export interface ActivityResponse {
  total: number;
  events: ActivityEvent[];
}

export interface SettingsResponse {
  returning_face_threshold: number;
  new_visitor_max_similarity: number;
  reject_similarity: number;
  ambiguity_margin: number;
  strong_match_threshold: number;
  max_faces_per_visitor: number;
  face_quality_cutoff: number;
  visit_cooldown_minutes: number;
  max_visit_duration_hours: number;
  stale_check_interval_seconds: number;
  camera_source: string;
  camera_fps: number;
  frame_dedup_enabled: boolean;
  visitor_retention_days: number;
}

export interface HealthResponse {
  status: string;
  database: string;
  models_loaded: boolean;
  yolo_loaded: boolean;
  arcface_loaded: boolean;
  camera_running: boolean;
  visitors_count: number;
  total_visits: number;
}

export interface DetectionItem {
  visitor_id: string | null;
  is_new: boolean;
  is_ambiguous: boolean;
  visit_id: string | null;
  face_confidence: number | null;
  match_source: string;
  bbox: BoundingBox | null;
}

export interface DetectResponse {
  detections: DetectionItem[];
  new_visitors_count: number;
  returning_visitors_count: number;
  frames_processed: number;
}

// ── New backend capabilities ────────────────────────────────

export interface ReviewFlag {
  id: string;
  visitor_id: string;
  flag_type: string;
  detail: string;
  matched_visitor_id: string | null;
  matched_visitor_name: string | null;
  similarity: number | null;
  created_at: string | null;
}

export interface ConfidenceWeighted {
  unique_visitors: number;
  effective_unique: number;
  avg_confidence: number;
  min_confidence_filter: number;
}

export interface ConfidenceWeightedSummary extends AnalyticsSummary {
  confidence_weighted: ConfidenceWeighted;
}

export interface DetectionQuality {
  bands: { high: number; medium: number; low: number };
  pct_high: number;
  pct_medium: number;
  pct_low: number;
  total_detections: number;
}

// Decision-pipeline health (from GET /api/analytics/pipeline-quality). Drives
// the AI Diagnostics page — how detections were resolved and how many were held.
export interface PipelineQuality {
  total_detections: number;
  by_source: Record<string, number>;
  grey_zone: number;
  grey_zone_rate: number;
  ambiguous: number;
  ambiguous_rate: number;
  temporal_recoveries: number;
  cross_camera_recoveries: number;
  tracklet_recoveries: number;
  new_registrations: number;
}

// Entry→exit gate counting (from GET /api/analytics/gate).
export interface GatePass {
  id: string;
  visitor_id: string | null;
  visitor_name: string | null;
  thumbnail_url: string | null;
  entry_camera_id: string | null;
  exit_camera_id: string | null;
  entered_at: string;
  exited_at: string | null;
  duration_seconds: number | null;
}

export interface GateStats {
  enabled: boolean;
  entry_camera_id: string | null;
  exit_camera_id: string | null;
  currently_inside: number;
  completed_today: number;
  completed_total: number;
  inside: GatePass[];
  recent_passes: GatePass[];
}

// Vector-DB / embedding diagnostics (from GET /api/analytics/embeddings).
export interface EmbeddingCentroid {
  visitor_id: string;
  name: string | null;
  is_staff: boolean;
  gallery_size: number;
  cohesion: number | null;
  x: number;
  y: number;
}

export interface EmbeddingFacePoint {
  visitor_id: string;
  face_id?: string;
  x: number;
  y: number;
}

export interface EmbeddingNeighbor {
  visitor_id: string;
  name: string | null;
  similarity: number;
}

export interface EmbeddingConfusion {
  visitor_id: string;
  name: string | null;
  neighbors: EmbeddingNeighbor[];
}

export interface EmbeddingMergeCandidate {
  a_id: string;
  a_name: string | null;
  b_id: string;
  b_name: string | null;
  similarity: number;
}

export interface EmbeddingDiagnostics {
  visitor_count: number;
  face_count: number;
  explained_variance: number[];
  centroids: EmbeddingCentroid[];
  faces: EmbeddingFacePoint[];
  confusion: EmbeddingConfusion[];
  merge_candidates: EmbeddingMergeCandidate[];
  gallery_size_distribution: Record<string, number>;
}

// Runtime-editable admin settings (from GET/PATCH /api/admin/settings).
export type AdminSettings = Record<string, number | boolean | string>;

// Processing device state (from GET/POST /api/admin/device).
export interface DeviceStatus {
  requested: string; // "auto" | "cpu" | "cuda"
  current_device: string; // "cpu" | "cuda"
  cuda_available: boolean;
  gpu_name: string | null;
  gpu_memory_mb: number | null;
  gpu_memory_used_mb: number | null;
  models_loaded: boolean;
}

// Detector / recognition model selection (from GET/POST /api/admin/models).
export interface ModelStatus {
  yolo_model: string;
  insightface_model: string;
  yolo_options: string[];
  insightface_options: string[];
  device: string;
  models_loaded: boolean;
  gallery_visitor_count: number;
  gallery_face_count: number;
}

// One model's row in a saved benchmark report.
export type BenchmarkResult = Record<string, number | string | boolean | null | Record<string, number>>;

// Summary of a saved benchmark run (from GET /api/admin/benchmarks).
export interface BenchmarkSummary {
  name: string;
  kind: "recognition" | "detection";
  generated_at: string;
  meta: Record<string, number | string | boolean>;
  model_count: number;
}

// Full saved benchmark report (from GET /api/admin/benchmarks/{name}).
export interface BenchmarkReport {
  kind: "recognition" | "detection";
  generated_at: string;
  meta: Record<string, number | string | boolean>;
  results: BenchmarkResult[];
}

// Live benchmark-run status (from GET/POST /api/admin/benchmarks/run).
export interface BenchmarkRunStatus {
  status: "idle" | "running" | "done" | "error";
  kind: string | null;
  models: string[];
  align: string | null;
  device: string | null;
  started_at: string | null;
  finished_at: string | null;
  report: string | null;
  error: string | null;
  log: string[];
}

// One model's best-ever result (from GET /api/admin/benchmarks/leaderboard).
export interface LeaderboardEntry extends BenchmarkResult {
  model: string;
  source_report: string;
  generated_at: string | null;
  is_active: boolean;
  is_best: boolean;
}

export interface Leaderboard {
  kind: "recognition" | "detection";
  active_model: string;
  best_model: string | null;
  models: LeaderboardEntry[];
  all_candidates: string[];
}

export interface VideoStreamResponse {
  status: string;
  filename: string;
  source: string;
  size_mb: number;
  looping: boolean;
  camera_id: string;
}

export interface LiveFeedMessage {
  type: string;
  is_running: boolean;
  currently_inside: number;
  gate_inside?: number;
  stats: {
    frames_processed: number;
    frames_skipped: number;
    persons_detected: number;
    new_visitors: number;
    returning_visitors: number;
  };
  frame: string | null;
}
