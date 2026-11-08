export interface BatteryInfo {
  cycle_count: number;
  health_percent: number;
  design_capacity: number;
  current_capacity: number;
  is_charging: boolean;
}

export interface StorageInfo {
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
}

export interface IcloudStatus {
  fmi_enabled: boolean;
  activation_state: string;
}

export interface ConnectionSpeed {
  bus_type: string;
  max_bandwidth_mbps: number;
  is_cable_throttled: boolean;
  negotiated_speed_mbps?: number;
  port_location?: string;
}

export interface CableDiagnostic {
  negotiated_speed_mbps: number;
  negotiated_speed_text: string;
  max_device_speed_mbps: number;
  max_port_speed_mbps: number;
  is_cable_throttled: boolean;
  port_side: string;
  port_name: string;
  mac_model: string;
  verdict_summary: string;
  verdict_details: string;
}

export interface CableBenchmarkResult {
  speed_mb_s: number;
  transferred_mb: number;
  elapsed_seconds: number;
  cable_grade: string;
  verdict: string;
}

export interface ConnectedDevice {
  udid: string;
  name: string;
  marketing_name: string;
  product_type: string;
  ios_version: string;
  serial_number: string;
  color: string;
  is_trusted: boolean;
  battery: BatteryInfo | null;
  storage: StorageInfo | null;
  icloud: IcloudStatus | null;
  connection: ConnectionSpeed;
}

export interface SystemStatus {
  usbmuxd: boolean;
  libimobiledevice: boolean;
  bundle: string;
  version: string;
}

export interface ExportStats {
  dcim_count: number;
  default_dir: string;
}

export interface ExportProgress {
  copied_files: number;
  copied_bytes: number;
  current_album: string;
}

export interface MediaItem {
  path: string;
  name: string;
  album: string;
  size_bytes: number;
  date: string;
  kind: 'video' | 'photo' | 'audio' | 'file';
  extension: string;
}

export interface MediaCatalogSummary {
  total_files: number;
  total_bytes: number;
  video_count: number;
  video_bytes: number;
  photo_count: number;
  photo_bytes: number;
  other_count: number;
  other_bytes: number;
  items: MediaItem[];
}
