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

/** iPhone app that accepts files from the Mac (house_arrest Documents) */
export interface SharedApp {
  bundle_id: string;
  name: string;
  /** shows up in Files > On My iPhone, so "Save to Photos" works from there */
  visible_in_files: boolean;
}

export interface LocalItem {
  path: string;
  name: string;
  is_dir: boolean;
  file_count: number;
  size_bytes: number;
}

export interface ImportProgress {
  active: boolean;
  total_files: number;
  done_files: number;
  total_bytes: number;
  done_bytes: number;
  current_file: string;
}

export interface ImportResult {
  copied: number;
  folder: string;
}

/* ---------- Wi-Fi transfer ---------- */

export interface WifiInfo {
  url: string;
  qr_svg: string;
  /** where files from the phone are saved */
  folder: string;
}

export interface WifiPhone {
  ip: string;
  label: string;
  connected: boolean;
}

export interface WifiIncoming {
  id: string;
  name: string;
  size: number;
  received: number;
  saved_as: string | null;
  cancelled_by: "phone" | "mac" | null;
}

export interface WifiOutgoing {
  id: number;
  name: string;
  path: string;
  size: number;
  kind: "image" | "video" | "file";
  sent_bytes: number;
  /** downloads of this file running right now */
  active: number;
}

export interface WifiZip {
  name: string;
  files: number;
  total: number;
  sent: number;
  state: "running" | "done" | "cancelled";
}

export interface WifiStatus {
  running: boolean;
  lan_ip: string | null;
  url: string | null;
  folder: string | null;
  phone: WifiPhone | null;
  incoming: WifiIncoming[];
  outgoing: WifiOutgoing[];
  zips: WifiZip[];
  received_total: number;
  sent_total: number;
  stop_reason: string | null;
}

// ---------- Mac <-> Mac ----------

export interface NetInfo {
  kind: "wifi" | "ethernet" | "none";
  /** null when macOS hides the Wi-Fi name */
  ssid: string | null;
  band: string | null;
  channel: string | null;
  standard: string | null;
  rate_mbps: number | null;
  signal_dbm: number | null;
  ip: string | null;
}

export interface PeerNet {
  kind: string;
  band: string | null;
  channel: string | null;
  rate_mbps: number | null;
}

export interface MacPeer {
  net: PeerNet | null;
  id: string;
  name: string;
  /** "MacBook Pro", "Mac mini"... */
  model: string;
  /** reachable over a Thunderbolt cable */
  cable: boolean;
}

export type MacSendState =
  | "connecting"
  | "waiting"
  | "sending"
  | "paused"
  | "reconnecting"
  | "done"
  | "declined"
  | "failed"
  | "cancelled";

export type MacRecvState = "receiving" | "paused" | "interrupted" | "done" | "failed" | "cancelled";

export interface MacSend {
  peer_id: string;
  peer_name: string;
  peer_model: string;
  state: MacSendState;
  message: string | null;
  code: string;
  total: number;
  done: number;
  /** raw network bytes of the current link, for the speed meter */
  counter: number;
  files: number;
  roots: string[];
  current: string | null;
  link: "cable" | "wifi" | null;
  elapsed_ms: number;
}

export interface MacReceive {
  from_name: string;
  from_model: string;
  state: MacRecvState;
  message: string | null;
  total: number;
  done: number;
  counter: number;
  files: number;
  roots: string[];
  folder: string;
  elapsed_ms: number;
}

export interface MacRequest {
  id: string;
  from_name: string;
  from_model: string;
  code: string;
  total: number;
  files: number;
  roots: string[];
  /** already on this Mac from an interrupted try */
  resume_bytes: number;
}

export interface MacLinkStatus {
  me: {
    id: string;
    name: string;
    model: string;
    receive_dir: string;
    online: boolean;
    starting: boolean;
    net: NetInfo | null;
    error: string | null;
  };
  peers: MacPeer[];
  send: MacSend | null;
  receive: MacReceive | null;
  request: MacRequest | null;
  trusted: string[];
}

export interface MacPicked {
  path: string;
  name: string;
  is_dir: boolean;
  size: number;
  files: number;
}
