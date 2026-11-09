use std::path::PathBuf;
use std::process::Command as StdCommand;
use tokio::process::Command as TokioCommand;

pub struct Bridge;

impl Bridge {
    /// Initialize process environment (PATH and DYLD_LIBRARY_PATH) so that
    /// bundled or system-installed iOS tools and libraries are seamlessly resolved.
    pub fn init_environment() {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let mut paths: Vec<String> = Vec::new();

        // 1. If running inside a macOS app bundle (e.g. WireShift.app/Contents/MacOS/wireshift)
        if let Ok(exe) = std::env::current_exe() {
            if let Some(macos_dir) = exe.parent() {
                if let Some(contents_dir) = macos_dir.parent() {
                    let res_dir = contents_dir.join("Resources");

                    // Check Resources/bin and Resources/resources/bin
                    let bin_candidates = [
                        res_dir.join("bin"),
                        res_dir.join("resources").join("bin"),
                    ];
                    for b in &bin_candidates {
                        if b.exists() {
                            paths.push(b.to_string_lossy().to_string());
                        }
                    }

                    // Check Resources/lib and Resources/resources/lib
                    let lib_candidates = [
                        res_dir.join("lib"),
                        res_dir.join("resources").join("lib"),
                    ];
                    let mut lib_paths = Vec::new();
                    for l in &lib_candidates {
                        if l.exists() {
                            lib_paths.push(l.to_string_lossy().to_string());
                        }
                    }

                    if !lib_paths.is_empty() {
                        let current_dyld = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();
                        let new_dyld = if current_dyld.is_empty() {
                            lib_paths.join(":")
                        } else {
                            format!("{}:{}", lib_paths.join(":"), current_dyld)
                        };
                        std::env::set_var("DYLD_LIBRARY_PATH", new_dyld);
                    }
                }
            }
        }

        // 2. Relative dev environment (when running `cargo run` or `tauri dev` in src-tauri or repo root)
        let dev_candidates = [
            PathBuf::from("resources/bin"),
            PathBuf::from("src-tauri/resources/bin"),
            PathBuf::from("../src-tauri/resources/bin"),
        ];
        for d in &dev_candidates {
            if d.exists() {
                if let Ok(abs) = d.canonicalize() {
                    paths.push(abs.to_string_lossy().to_string());
                }
            }
        }

        // 3. System Homebrew (Apple Silicon + Intel) & standard macOS user locations
        paths.push("/opt/homebrew/bin".to_string());
        paths.push("/opt/homebrew/sbin".to_string());
        paths.push("/usr/local/bin".to_string());
        paths.push("/usr/local/sbin".to_string());
        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.local/bin", home));
            paths.push(format!("{}/bin", home));
        }

        let new_path = if current_path.is_empty() {
            paths.join(":")
        } else {
            format!("{}:{}", paths.join(":"), current_path)
        };
        std::env::set_var("PATH", new_path);
    }

    /// Resolve absolute path for a tool binary (idevice_id, ideviceinfo, afcclient, etc.)
    pub fn find_binary(tool_name: &str) -> PathBuf {
        // 1. In macOS App Bundle Resources
        if let Ok(exe) = std::env::current_exe() {
            if let Some(contents) = exe.parent().and_then(|p| p.parent()) {
                let res = contents.join("Resources");
                let candidate1 = res.join("bin").join(tool_name);
                if candidate1.exists() {
                    return candidate1;
                }
                let candidate2 = res.join("resources").join("bin").join(tool_name);
                if candidate2.exists() {
                    return candidate2;
                }
            }
        }

        // 2. In dev resources
        let dev_candidates = [
            PathBuf::from("resources/bin").join(tool_name),
            PathBuf::from("src-tauri/resources/bin").join(tool_name),
            PathBuf::from("../src-tauri/resources/bin").join(tool_name),
        ];
        for dev in &dev_candidates {
            if dev.exists() {
                if let Ok(abs) = dev.canonicalize() {
                    return abs;
                }
                return dev.clone();
            }
        }

        // 3. In Apple Silicon Homebrew
        let brew_arm = PathBuf::from("/opt/homebrew/bin").join(tool_name);
        if brew_arm.exists() {
            return brew_arm;
        }

        // 4. In Intel Homebrew
        let brew_intel = PathBuf::from("/usr/local/bin").join(tool_name);
        if brew_intel.exists() {
            return brew_intel;
        }

        // 5. Default fallback to PATH
        PathBuf::from(tool_name)
    }

    /// Create an asynchronous Tokio command configured with necessary environment variables
    pub fn tokio_cmd(tool_name: &str) -> TokioCommand {
        let bin_path = Self::find_binary(tool_name);
        let mut cmd = TokioCommand::new(bin_path);
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }
        if let Ok(dyld) = std::env::var("DYLD_LIBRARY_PATH") {
            cmd.env("DYLD_LIBRARY_PATH", dyld);
        }
        cmd
    }

    /// Create a synchronous Std command configured with necessary environment variables
    pub fn std_cmd(tool_name: &str) -> StdCommand {
        let bin_path = Self::find_binary(tool_name);
        let mut cmd = StdCommand::new(bin_path);
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }
        if let Ok(dyld) = std::env::var("DYLD_LIBRARY_PATH") {
            cmd.env("DYLD_LIBRARY_PATH", dyld);
        }
        cmd
    }

    /// Check if MobileDevice bridge tools are present and functional
    pub async fn is_available() -> bool {
        let mut cmd = Self::tokio_cmd("ideviceinfo");
        cmd.arg("--version");
        match cmd.output().await {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_bridge_availability() {
        Bridge::init_environment();
        let available = Bridge::is_available().await;
        println!("Bridge available: {}", available);
        assert!(available, "Bridge should be available via bundled resources or fallback paths");
    }

    #[tokio::test]
    async fn test_device_detection() {
        Bridge::init_environment();
        let udids = crate::device::DeviceDetector::list_udids().await;
        println!("Detected UDIDs: {:?}", udids);
        assert!(udids.is_ok(), "DeviceDetector::list_udids should succeed");

        if let Ok(list) = udids {
            if let Some(first) = list.first() {
                let device = crate::device::DeviceDetector::inspect_device(first).await;
                println!("Device inspection: {:?}", device);
                assert!(device.is_ok(), "Device inspection should succeed");
            }
        }
    }
}
