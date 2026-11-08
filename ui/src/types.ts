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
