## WireShift v1.0.2 — Fast Video Export & Path Resolution Fix 🚀

Ultra-Fast Direct Cable iPhone Migration, Selective Media Extraction & Hardware Diagnostics for macOS (Apple Silicon M1/M2/M3/M4).

### 🌟 What's Fixed in v1.0.2

- 🎬 **Video & Media Export Destination Fix:**
  - Resolved Unix tilde expansion (`~`) in export destination directories. Previously, macOS GUI apps running from `/Applications` treated `~` literally against root (`/`), causing file system errors. Now all paths expand directly to `$HOME/Pictures/WireShift_Exports`.
- 🛡️ **Quoted Argument Safety in `afcclient`:**
  - Remote and local paths containing spaces or special characters are safely escaped with quotes (`get "<remote>" "<local>"`), preventing argument parsing failures during 4K/ProRes video transfers.
- ⚡ **Stream Flush & Output Diagnostic Capture:**
  - Interactive stdin stream is explicitly flushed and closed, and child process stdout/stderr streams are captured to provide transparent error reporting if a transfer fails.
- 📂 **Finder Folder Reveal (`open_folder_in_finder`):**
  - Guarantees the destination directory exists before revealing in Finder, ensuring 1-click access to exported videos and photos.

---

### 📦 Installation

- **Option 1 (Recommended):** `WireShift_1.0.2_aarch64.pkg` faylini yuklab oling va macOS installer orqali o'rnating.
- **Option 2:** `WireShift_1.0.2_aarch64.dmg` faylini oching va `WireShift.app` ni Applications papkasiga tashlang.
