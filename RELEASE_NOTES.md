## WireShift v3.1.0 — Mac → iPhone va Wi-Fi orqali (QR kod)

### O'rnatish (eng oson)
Terminal'ni oching va yozing:
```bash
curl -fsSL https://github.com/azimxxm/wireshift-desktop/releases/latest/download/install.sh | bash
```
Ilova yuklab olinadi, Applications papkasiga o'rnatiladi va ochiladi.

**Yoki** `WireShift_3.1.0_aarch64.pkg` ni yuklab o'rnating. macOS «Apple tekshira olmadi» desa:
System Settings → Privacy & Security → pastda **Open Anyway** → qayta oching.

Talab: Apple Silicon Mac (M1/M2/M3/M4), macOS 11+. Homebrew kerak emas.

### Yangi
- **iPhone'ga yuborish (kabel orqali):** video, rasm va fayllarni Mac'dan telefonga yuboring — Finder'dan
  tortib tashlash ham ishlaydi. Fayllar telefondagi ilova (masalan VLC) papkasiga tushadi:
  Files → On My iPhone → ilova → WireShift … → Select All → Share → Save to Photos.
  Ilova papka yarata olmasa — qadamma-qadam yordam oynasi ochiladi.
- **Wi-Fi orqali (kabelsiz, QR kod):** «Wi-Fi orqali ulanish» → QR chiqadi → iPhone kamerasi bilan skanerlang.
  Telefonga ilova o'rnatish shart emas, Safari'da ochiladi. Telefon va Mac bitta Wi-Fi'da bo'lishi kerak.
  - Telefondan Mac'ga: rasm va videolar bo'laklab, parallel yuboriladi; uzilsa davom etadi.
  - Mac'dan telefonga: fayllarni ro'yxatga torting — telefonda bittalab, «Hammasini olish» (birma-bir)
    yoki xohlasangiz bitta .zip qilib olasiz.
  - Har bir faylni yoki hammasini istalgan payt bekor qilish — chala fayllar darhol o'chadi.
  - Mac'da jonli tezlik, kelgan fayllarni ochish / Finder'da ko'rsatish, «Papkani ochish», «Tozalash».
  - Xavfsizlik: har sessiyaga maxfiy kalit, faqat lokal tarmoq; server faqat tugma bosilganda ishlaydi
    va 15 daqiqa ishlatilmasa o'zi o'chadi.

### Birinchi Wi-Fi ulanishida
macOS «WireShift kiruvchi ulanishlarni qabul qilsinmi?» deb so'rasa — **Allow**.
Asl sifatdagi video uchun telefonda tanlash oynasida Options → **Current**.

### Tuzatishlar
- Buzuq video thumbnail'i Quick Look'ni abadiy osib qo'yardi — endi 8 soniyada to'xtatiladi.
- Ilova loglari endi yoziladi (muammolarni topish osonroq).
