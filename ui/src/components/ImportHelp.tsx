import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ImportHelpProps {
  isOpen: boolean;
  onClose: () => void;
  /** set when the help was opened by a failed send */
  errorText?: string;
  appName?: string;
}

const Step: React.FC<{
  n: number;
  title: string;
  children: React.ReactNode;
}> = ({ n, title, children }) => (
  <div className="flex gap-3">
    <span className="w-5 h-5 rounded-full bg-[var(--ws-accent)] text-white text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
      {n}
    </span>
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-white">{title}</div>
      <div className="text-[12px] text-[var(--ws-label-2)] mt-0.5 leading-relaxed">
        {children}
      </div>
    </div>
  </div>
);

/** How Mac -> iPhone works and what to do when the phone refuses the folder. */
export const ImportHelp: React.FC<ImportHelpProps> = ({
  isOpen,
  onClose,
  errorText,
  appName,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="ws-sheet-in w-[520px] max-h-[86vh] overflow-y-auto rounded-xl bg-[var(--ws-elevated)] border border-white/10 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="iPhone'ga yuborish bo'yicha yordam"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">
              Fayllar iPhone'ga qanday tushadi
            </h2>
            <p className="text-[12px] text-[var(--ws-label-2)] mt-0.5">
              iOS tashqi dasturga «Rasmlar»ga to'g'ridan-to'g'ri yozishga ruxsat
              bermaydi. Shuning uchun fayllar telefondagi ilova papkasiga
              tushadi, «Rasmlar»ga esa o'zingiz bir bosishda saqlaysiz.
            </p>
          </div>
          <button
            className="ws-icon-btn shrink-0"
            onClick={onClose}
            title="Yopish"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {errorText && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--ws-red)]/10 border border-[var(--ws-red)]/30 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--ws-red)] shrink-0 mt-0.5" />
            <div className="text-[12px] text-[var(--ws-label)]">
              <b>{appName ?? "Tanlangan ilova"}</b> papka yarata olmadi:{" "}
              {errorText}
              <div className="text-[var(--ws-label-2)] mt-1">
                Quyidagi 1–2 qadamni tekshiring va qayta yuboring.
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <Step n={1} title="To'g'ri ilovani tanlang">
            Ro'yxatdagi ilova telefonda <b>Files → On My iPhone</b> ichida o'z
            papkasiga ega bo'lishi kerak. Eng ishonchlisi — <b>VLC</b> (bepul,
            App Store). «Files'da ko'rinmaydi» deb belgilanganlari mos emas.
            VPN, brauzer yoki reklama ilovalari ba'zan papkani yopib qo'yadi —
            boshqasini tanlang.
          </Step>
          <Step n={2} title="Ilovani telefonda bir marta oching">
            Yangi o'rnatilgan ilova papkasi birinchi ochilgandan keyin paydo
            bo'ladi. Ilovani oching, yoping, keyin WireShift'da ↻ tugmasini
            bosib ro'yxatni yangilang. Telefon ekrani ochiq va «Ishonish»
            bosilgan bo'lsin.
          </Step>
          <Step n={3} title="Mac'dan yuboring">
            Fayllarni torting yoki «Fayl qo'shish…» bilan tanlang, papka nomini
            qoldiring va <b>iPhone'ga yuborish</b>ni bosing. Hamma fayllar bitta
            yangi papkaga tushadi — telefondagi hech narsa o'chirilmaydi.
          </Step>
          <Step n={4} title="Telefonda papkani toping">
            <b>Files</b> ilovasi → pastdan <b>Browse</b> → <b>On My iPhone</b> →{" "}
            <b>{appName ?? "ilova nomi"}</b> → <b>WireShift …</b> papkasi.
          </Step>
          <Step n={5} title="«Rasmlar»ga saqlang">
            Yuqori o'ngdagi <b>⋯</b> → <b>Select</b> → <b>Select All</b> →
            pastdagi <b>Share</b> → <b>Save N Items</b>. Rasm va videolar
            galereyaga tushadi, sanasi va sifati saqlanadi.
          </Step>
          <Step n={6} title="Joyni bo'shating (ixtiyoriy)">
            Saqlangandan keyin Files'dagi WireShift papkasini o'chirsangiz
            bo'ladi — aks holda fayllar ikki marta joy egallaydi.
          </Step>
        </div>

        <button
          className="ws-btn ws-btn-primary mt-6 w-full"
          onClick={onClose}
          autoFocus
        >
          Tushunarli
        </button>
      </div>
    </div>
  );
};
