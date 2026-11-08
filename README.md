# WireShift Desktop (`wireshift-desktop`)

<p align="center">
  <img src="./assets/WireShift%20Device%20Transfer%20Logo.png" alt="WireShift Logo" width="480" />
</p>

<p align="center">
  <strong>Ultra-Fast Cable-Based iPhone Migration & Hardware Diagnostics</strong><br/>
  Designed for iPhone Resellers, Trade-in Shops, and Mobile Technicians.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/App_Name-WireShift-blue" alt="App Name" />
  <img src="https://img.shields.io/badge/Bundle-uz.azimjondev.wireshift-indigo" alt="Bundle" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/Stack-Tauri%202%20%7C%20Rust%20%7C%20React%2019-teal" alt="Stack" />
</p>

---

## ⚡ Overview

**WireShift** solves the trade-in data transfer bottleneck. Instead of waiting 1–3 hours for wireless Apple Quick Start or dealing with bloated third-party utilities, WireShift enables direct, hardware-accelerated cable migration between two iPhones via computer at up to **10 Gbps (USB 3.2)**, alongside instant hardware authenticity inspection.

### Key Capabilities

1. 🚀 **Direct Phone-to-Phone Migration (Full Clone):**
   - Connect Source iPhone (Port A) and Target iPhone (Port B).
   - 1-Click full backup & restore streaming pipeline via `MobileBackup2`.
2. 🖼️ **Selective Media & Contacts Transfer:**
   - Direct extraction of `DCIM` photos, 4K videos, and address books via Apple File Conduit (`AFC`), skipping 40GB+ of junk application cache.
3. 🔍 **Instant Hardware Diagnostics (Forensic Inspection):**
   - Battery cycle count and measured real health capacity vs design capacity.
   - Genuine parts verification (Screen, Battery, Camera serial matching).
   - Instant iCloud Activation Lock & Find My iPhone status verification.

---

## 🎨 Color Design System

The complete color design system is established in [`design-system/`](./design-system/):
- [`design-system/COLOR_SYSTEM.md`](./design-system/COLOR_SYSTEM.md) — Comprehensive design token manual and WCAG 2.2 AA audit.
- [`design-system/theme.css`](./design-system/theme.css) — Production CSS custom properties for Dark & Light modes.
- [`design-system/tokens.json`](./design-system/tokens.json) — JSON design tokens format.
