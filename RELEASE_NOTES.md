## WireShift v3.0.1 — hammasi haqiqiy ishlaydi

### O'rnatish (eng oson)
Terminal'ni oching va yozing:
```bash
curl -fsSL https://github.com/azimxxm/wireshift-desktop/releases/latest/download/install.sh | bash
```
Ilova yuklab olinadi, Applications papkasiga o'rnatiladi va ochiladi — ogohlantirish chiqmaydi.

**Yoki** `WireShift_3.0.1_aarch64.pkg` ni yuklab o'rnating. macOS «Apple tekshira olmadi» desa:
System Settings → Privacy & Security → pastda **Open Anyway** → qayta oching.

Talab: Apple Silicon Mac (M1/M2/M3/M4), macOS 11+. Homebrew kerak emas.

### Yangi
- **Eksport:** hammasi / faqat videolar / faqat rasmlar; albom papkalari saqlanadi; **faqat yangi fayllar** —
  Mac'da bor fayllar qayta ko'chirilmaydi; rasm tahrirlari (AAE) birga saqlanadi.
- **Kabel tezligi:** haqiqiy ulanish tezligi va Mac modeli; 64 MB o'qib aniq o'lchash (hech narsa yozilmaydi);
  qaysi kabel (oddiy, 5 Gbps, 10 Gbps, Thunderbolt) qancha tezlik berishi rasmlar bilan va galereyangizni necha daqiqada ko'chirishi.

### Olib tashlandi (kabel orqali iloji yo'q)
- Kontaktlar, «Boshqa fayllar» va «Boshqa iPhone'ga» rejimi — ular ishlamas edi.

### Tuzatishlar
- Homebrew o'rnatilmagan Mac'larda iPhone ko'rinmas edi (kutubxona Homebrew'ga bog'lanib qolgan edi).
- iPhone 16 / 16 Plus noto'g'ri USB 3 deb ko'rsatilardi (ular USB 2.0).
- Galereyada iOS tizim fayllari va AAE kataklari ko'rinmaydi.

v3.0.0 dagi yangi dizayn, video ko'rish va haqiqiy batareya diagnostikasi ham shu versiyada.
