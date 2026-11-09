# WireShift Desktop (`wireshift-desktop`)

<p align="center">
  <img src="./assets/hero-about.png" alt="WireShift 3D Hero Icon" width="360" style="border-radius: 36px; box-shadow: 0 20px 50px rgba(1, 87, 252, 0.3);" />
</p>

<p align="center">
  <img src="./assets/WireShift%20Device%20Transfer%20Logo.png" alt="WireShift Logo" width="380" />
</p>

<p align="center">
  <strong>Ultra-Fast Cable-Based iPhone Migration & Hardware Diagnostics</strong><br/>
  iPhone sotuvchilari, servis ustalari va oddiy foydalanuvchilar uchun.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/App_Name-WireShift-blue" alt="App Name" />
  <img src="https://img.shields.io/badge/Bundle-uz.azimjondev.wireshift-indigo" alt="Bundle" />
  <img src="https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon)-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/Stack-Tauri%202%20%7C%20Rust%20%7C%20React%2019-teal" alt="Stack" />
</p>

---

## 📥 O'rnatish

### Talablar

| | |
|---|---|
| Kompyuter | Apple Silicon Mac (M1, M2, M3, M4). Intel Mac'lar qo'llab-quvvatlanmaydi |
| Tizim | macOS 11 Big Sur yoki yangiroq |
| Telefon | iPhone (USB-C yoki Lightning), kabel orqali ulangan |
| Qo'shimcha dastur | **Kerak emas** — Homebrew, iTunes yoki boshqa narsa o'rnatish shart emas |

### 1-usul: Terminal orqali (tavsiya etiladi)

Eng oson yo'l — hech qanday ogohlantirish chiqmaydi.

1. **Terminal**'ni oching (Spotlight: `⌘ Space` → «Terminal»).
2. Quyidagi buyruqni nusxalab, Terminal'ga qo'ying va `Enter` bosing:

   ```bash
   curl -fsSL https://github.com/azimxxm/wireshift-desktop/releases/latest/download/install.sh | bash
   ```

3. Skript so'nggi versiyani yuklab oladi, `Applications` papkasiga o'rnatadi va ilovani ochadi.

Agar `/Applications` ga yozish ruxsati bo'lmasa, ilova `~/Applications` ga o'rnatiladi — parol so'ralmaydi.

### 2-usul: `.pkg` o'rnatuvchi

1. [Releases](https://github.com/azimxxm/wireshift-desktop/releases/latest) sahifasidan `WireShift_x.x.x_aarch64.pkg` ni yuklab oling.
2. Faylni oching. macOS **«Apple could not verify…»** deb ogohlantirsa — **Done** ni bosing.
3. **System Settings → Privacy & Security** ni oching, pastga tushing va **Open Anyway** ni bosing.
4. `.pkg` ni qayta oching va o'rnatishni tugating. WireShift `Applications` papkasida paydo bo'ladi.

> Ogohlantirish ilova Apple'da notarizatsiya qilinmagani uchun chiqadi. Bu faqat bir marta, o'rnatishda bo'ladi.

### 3-usul: `.dmg`

1. Releases sahifasidan `WireShift_x.x.x_aarch64.dmg` ni yuklab oching.
2. `WireShift.app` ni `Applications` papkasiga torting.
3. Birinchi ochishda ogohlantirish chiqsa — 2-usuldagi 3-qadam (**Open Anyway**).

### Birinchi ulanish

1. iPhone'ni kabel bilan Mac'ga ulang.
2. Telefon ekranini oching va **«Ishonish» (Trust This Computer)** ni bosing, parolni kiriting.
3. WireShift chap paneldagi **Qurilmalar** ro'yxatida telefonni ko'rsatadi.

### Yangilash

1-usuldagi buyruqni qayta ishga tushiring — eski versiya yopiladi va yangisi bilan almashtiriladi.
Sozlamalar (saqlash papkasi va boshqalar) saqlanib qoladi.

### O'chirish

```bash
rm -rf /Applications/WireShift.app ~/.cache/wireshift
```

Ikkinchi yo'l rasm eskizlari keshini o'chiradi. Mac'ga ko'chirilgan rasm va videolaringizga (`~/Pictures/WireShift_Exports`) tegilmaydi.

### Muammolar va yechimlar

| Muammo | Yechim |
|---|---|
| Telefon ko'rinmayapti | Kabelni qayta ulang, telefon ekranini oching va «Ishonish»ni bosing. Chap paneldagi ↻ tugmasi (`⌘R`) qayta qidiradi |
| «Ishonish» chiqmadi | iPhone'da: Sozlamalar → Umumiy → O'tkazish yoki tiklash → Tiklash → **Joylashuv va maxfiylikni tiklash**, so'ng qayta ulang |
| «Apple could not verify» | System Settings → Privacy & Security → **Open Anyway**, yoki 1-usuldan foydalaning |
| «WireShift is damaged» | Terminal'da: `xattr -dr com.apple.quarantine /Applications/WireShift.app` |
| Ko'chirish sekin (~38 MB/s) | Kabel USB 2.0. **Kabel tezligi** bo'limida qaysi kabel kerakligi ko'rsatilgan (iPhone 15 Pro va yangi Pro modellar uchun 10 Gbps kabel ~15 barobar tez) |
| Intel Mac'da ishlamayapti | Hozircha faqat Apple Silicon qo'llab-quvvatlanadi |

---

## ⚡ Imkoniyatlar

1. 🖼️ **Rasm va videolarni Mac'ga ko'chirish** — hammasi, faqat videolar yoki faqat rasmlar; albom papkalari saqlanadi,
   Mac'da bor fayllar qayta ko'chirilmaydi, rasm tahrirlari (AAE) birga saqlanadi.
2. 🎞️ **Galereya** — telefondagi rasm va videolarni ko'rish (video telefondan to'g'ridan-to'g'ri o'ynaydi), bittalab tanlab saqlash.
3. 🔌 **Kabel tezligi** — haqiqiy ulanish tezligi, 64 MB o'qib o'lchash va qaysi kabel qancha tezlik berishi.
4. 🔍 **Diagnostika** — batareya salomatligi, sikllar, mAh, xotira, model/hudud (masalan J/A), IMEI, SIM va boshqalar.

Ilova telefondagi fayllarni faqat o'qiydi — hech narsa o'chirilmaydi yoki o'zgartirilmaydi.

---

## 🎨 Color Design System

The complete color design system is established in [`design-system/`](./design-system/):
- [`design-system/COLOR_SYSTEM.md`](./design-system/COLOR_SYSTEM.md) — Comprehensive design token manual and WCAG 2.2 AA audit.
- [`design-system/theme.css`](./design-system/theme.css) — Production CSS custom properties for Dark & Light modes.
- [`design-system/tokens.json`](./design-system/tokens.json) — JSON design tokens format.
