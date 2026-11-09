## WireShift v3.0.0 — Native macOS redesign

iPhone'dan Mac'ga kabel orqali ko'chirish va qurilma diagnostikasi — endi macOS ilovasidek his qilinadi.

### Yangi dizayn

- Haqiqiy macOS sidebar materiali (vibrancy), 52px toolbar, 13px system shrift, ixcham grouped ro'yxatlar.
- Sidebar'da ulangan qurilmalar ro'yxati; eksport jarayoni har qanday sahifadan ko'rinadi.
- Klaviatura: ⌘1–⌘4 sahifalar, ⌘, sozlamalar, ⌘R yangilash, galereyada ⌘A / Esc / Space / ⌘F.
- "Tarix" bo'limi olib tashlandi; "Sozlamalar" to'liq ishlaydi (saqlash papkasi, Finder'da ochish, AAE, katakcha o'lchami, kesh).

### Galereya

- Pastdagi blur panel olib tashlandi — tanlov soni, hajmi va "Mac'ga saqlash" yuqoridagi qatorda.
- Bosish = tanlash, Shift = oraliq tanlash, 2x bosish yoki Space = ko'rish.
- Ko'rish oynasida video telefondan to'g'ridan-to'g'ri oqim bilan ijro etiladi (yuklab olmasdan, oldinga/orqaga surish bilan); HEIC/JPG to'liq o'lchamda; ←/→ bilan varaqlash.
- AAE (rasm tahriri) fayllari "Barchasi"dan chiqarildi va tanlangan rasm bilan birga avtomatik saqlanadi.
- Kichik fayllar endi "0.0 MB" emas, KB da ko'rsatiladi.
- Tuzatildi: MP4 videolar saralashda doim tepaga chiqib qolardi (`IMG_7240.MP4` → 72404 deb o'qilardi).

### Diagnostika — endi haqiqiy ma'lumot

- Batareya salomatligi, sikllar soni, hozirgi/zavod sig'imi (mAh), kuchlanish — telefonning diagnostika xizmatidan.
  Avval zaryad darajasi (91%) noto'g'ri "salomatlik" deb, sikl esa 0 deb ko'rsatilardi.
- Xotira hajmi iOS 17+ da ham to'g'ri chiqadi (avval "N/A").
- Model raqami va hudud (masalan, J/A — kamera ovozi o'chmaydigan Yaponiya modeli), IMEI, SIM, Wi‑Fi/Bluetooth manzillari, modem dasturi.
- Soxta "Asl (Original)" qismlar tekshiruvi olib tashlandi.

### Tuzatishlar

- Sarlavha qatorida 2x bosish oyna kattalashtirishni ikki marta chaqirardi; endi macOS sozlamasiga ("Double-click a window's title bar to") qarab bir marta ishlaydi.
- Eksport progressi saqlash papkasidagi eski fayllarni ham sanardi.

---

### O'rnatish

- **1-usul (tavsiya):** `WireShift_3.0.0_aarch64.pkg` ni yuklab, o'rnating.
- **2-usul:** `WireShift_3.0.0_aarch64.dmg` ni ochib, `WireShift.app` ni Applications papkasiga tashlang.

Ilova telefondagi fayllarni faqat o'qiydi — hech narsa o'chirilmaydi yoki o'zgartirilmaydi.
