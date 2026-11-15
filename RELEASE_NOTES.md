## WireShift v3.2.0 — Mac ↔ Mac (Wi-Fi orqali katta fayllar)

### O'rnatish (eng oson)
Terminal'ni oching va yozing:
```bash
curl -fsSL https://github.com/azimxxm/wireshift-desktop/releases/latest/download/install.sh | bash
```
Ilova yuklab olinadi, Applications papkasiga o'rnatiladi va ochiladi.

**Yoki** `WireShift_3.2.0_aarch64.pkg` ni yuklab o'rnating. macOS «Apple tekshira olmadi» desa:
System Settings → Privacy & Security → pastda **Open Anyway** → qayta oching.

Talab: Apple Silicon Mac (M1/M2/M3/M4), macOS 11+. Homebrew kerak emas.

### Yangi: Mac ↔ Mac (⌘4)
Ikki Mac o'rtasida istalgan hajmdagi fayl va papkalar (60–80 GB ham) — Wi-Fi orqali, sozlamasiz.
File Sharing, parol yoki «Connect As» kerak emas.

1. Ikkala Mac'da WireShift → **Mac ↔ Mac** → **Boshlash**.
2. Ikkinchi Mac ro'yxatda o'zi chiqadi — fayl/papkani sudrab tashlang → **Yuborish**.
3. Qabul qiluvchi Mac'da oyna chiqadi: kim, qancha, 4 xonali kod (ikkala ekranda bir xil) → **Qabul qilish**.
   «Ishonaman» belgilansa keyingi safar so'ramaydi.

- 4 ta parallel oqim, har bo'lak tekshiriladi (CRC32); jonli tezlik, qolgan vaqt, pauza / davom ettirish.
- Wi-Fi uzilsa o'zi qayta ulanadi va **to'xtagan joyidan davom etadi** (ilova qayta ochilsa ham).
- Qabul qilishdan oldin bo'sh joy tekshiriladi; yuborish vaqtida Mac uxlamaydi.
- Har ikki Mac'ning tarmog'i ko'rinadi: 2.4 / 5 GHz, kanal, Wi-Fi 6, Mbit/s, signal va taxminiy tezlik.
  Mac 2.4 GHz'da bo'lsa — ogohlantirish va «Wi-Fi sozlamalari» tugmasi.
- Bu Mac'ning nomini o'zgartirish mumkin (✏️) — boshqa Mac'larda darhol yangilanadi.
- Fayllar `~/Downloads` ga tushadi (o'zgartirish mumkin). Xizmat faqat «Boshlash» bosilganda ishlaydi, «To'xtatish» bilan yashirinadi.

### Birinchi ishga tushishda
macOS **«Local Network»** yoki «kiruvchi ulanishlar» ruxsatini so'raydi — ikkala Mac'da ham **Allow**.
Router 2.4 va 5 GHz tarmoq bersa — ikkala Mac'ni ham 5 GHz (…5G) tarmoqqa ulang: bir necha barobar tez.

### O'zgargan
- Sidebar tugmalari: Galereya ⌘5, Kabel tezligi ⌘6, Diagnostika ⌘7.
