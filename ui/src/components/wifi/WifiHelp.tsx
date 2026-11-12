import React, { useEffect } from "react";
import { X } from "lucide-react";

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <div className="flex gap-3">
    <span className="w-5 h-5 rounded-full bg-[var(--ws-accent)] text-white text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
      {n}
    </span>
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-white">{title}</div>
      <div className="text-[12px] text-[var(--ws-label-2)] mt-0.5 leading-relaxed">{children}</div>
    </div>
  </div>
);

/** How Wi-Fi transfer works and what to check when the phone can't open the page. */
export const WifiHelp: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="ws-sheet-in w-[520px] max-h-[86vh] overflow-y-auto rounded-xl bg-[var(--ws-elevated)] border border-white/10 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Wi-Fi orqali ulanish bo'yicha yordam"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Wi-Fi orqali qanday ishlaydi</h2>
            <p className="text-[12px] text-[var(--ws-label-2)] mt-0.5">
              Mac shu tarmoq ichida kichik sahifa ochadi. Telefon uni Safari'da ochadi — ilova kerak
              emas, fayllar internetga chiqmaydi.
            </p>
          </div>
          <button className="ws-icon-btn shrink-0" onClick={onClose} title="Yopish">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-4">
          <Step n={1} title="Bitta Wi-Fi tarmog'i">
            iPhone va Mac bitta routerga ulangan bo'lsin. «Mehmon» (guest) tarmoqlar va ba'zi ofis
            Wi-Fi'lari qurilmalarni bir-biridan ajratadi — unda sahifa ochilmaydi. Telefondagi VPN'ni
            vaqtincha o'chiring.
          </Step>
          <Step n={2} title="macOS ruxsat so'rasa — «Allow»">
            Birinchi marta «WireShift kiruvchi ulanishlarni qabul qilsinmi?» oynasi chiqsa,{" "}
            <b>Allow</b> bosing. Bosilmagan bo'lsa: <b>System Settings → Network → Firewall →
            Options</b> → WireShift → <b>Allow incoming connections</b>.
          </Step>
          <Step n={3} title="QR kodni skanerlang">
            Kamera ilovasi QR ustidagi sariq havolani ko'rsatadi — bosing, sahifa Safari'da ochiladi.
            Har ulanishda yangi kalit yaratiladi, eski havola ishlamaydi.
          </Step>
          <Step n={4} title="Asl sifatda yuborish">
            «Rasm va videolar» oynasida <b>Options → Current</b> ni tanlang, aks holda iPhone videoni
            «Most Compatible» formatga o'girib yuborishi mumkin. «Fayllar»dan tanlanganlar doim asl
            holida ketadi. Yuborish tugaguncha telefon ekranini o'chirmang.
          </Step>
          <Step n={5} title="Mac'dan telefonga">
            Fayllarni «Telefonga yuborish ro'yxati»ga torting. Telefonda «Yuklab olish» → fayl{" "}
            <b>Files → Downloads</b>ga tushadi; u yerdan <b>Share → Save</b> bilan «Rasmlar»ga
            saqlanadi. Rasmni ochib, uzoq bossangiz — <b>Save to Photos</b>.
          </Step>
          <Step n={6} title="Xavfsizlik">
            Faqat shu tarmoqdagi va QR kalitiga ega qurilma ulanadi. Telefon faqat ro'yxatdagi
            fayllarni ko'radi. 15 daqiqa ishlatilmasa ulanish o'zi o'chadi.
          </Step>
        </div>
        <button className="ws-btn ws-btn-primary mt-6 w-full" onClick={onClose} autoFocus>
          Tushunarli
        </button>
      </div>
    </div>
  );
};
