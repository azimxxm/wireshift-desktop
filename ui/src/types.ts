export interface BatteryInfo {
  /** charge level 0-100 */
  charge_percent: number;
  is_charging: boolean;
  cycle_count: number | null;
  /** maximum capacity vs. new (Battery Health) */
  health_percent: number | null;
  design_capacity_mah: number | null;
  nominal_capacity_mah: number | null;
  voltage_mv: number | null;
  adapter_watts: number | null;
}

export interface DeviceDetails {
  model_number: string | null;
  region_info: string | null;
  build_version: string | null;
  hardware_model: string | null;
  chip: string | null;
  baseband_version: string | null;
  imei: string | null;
  imei2: string | null;
  phone_number: string | null;
  sim_status: string | null;
  activation_state: string | null;
  /** lockdown PasswordProtected: true while the screen is locked */
  screen_locked: boolean | null;
  wifi_address: string | null;
  bluetooth_address: string | null;
  time_zone: string | null;
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
  negotiated_speed_mbps: number;
}

export interface CableDiagnostic {
  negotiated_speed_mbps: number;
  device_max_mbps: number;
  is_cable_throttled: boolean;
  mac_model: string;
}

export interface CableBenchmarkResult {
  speed_mb_s: number;
  transferred_mb: number;
  elapsed_seconds: number;
  sample_file: string;
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
  details: DeviceDetails;
}

export interface SystemStatus {
  usbmuxd: boolean;
  libimobiledevice: boolean;
  bundle: string;
  version: string;
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
  kind: 'video' | 'photo' | 'audio' | 'sidecar' | 'file';
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
