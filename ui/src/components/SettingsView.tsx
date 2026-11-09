import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { AppSettings } from "../hooks/useSettings";
import { SystemStatus } from "../types";
import { formatBytes } from "../utils/format";

interface SettingsViewProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  onPickExportPath: () => void;
  onOpenFolder: () => void;
  status: SystemStatus | null;
}

const Switch: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className="ws-switch"
    onClick={() => onChange(!checked)}
  />
);

const SettingRow: React.FC<{
  title: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ title, hint, children }) => (
  <div className="ws-row">
    <div className="min-w-0">
      <div className="text-[13px] text-[var(--ws-label)]">{title}</div>
      {hint && (
        <div className="text-[11px] text-[var(--ws-label-2)] mt-0.5">
          {hint}
        </div>
      )}
    </div>
    <div className="shrink-0 flex items-center gap-1.5">{children}</div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    <div className="ws-section-title">{title}</div>
    <div className="ws-group">{children}</div>
  </section>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdate,
  onPickExportPath,
  onOpenFolder,
  status,
}) => {
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadCacheSize = () =>
    invoke<number>("get_cache_size")
      .then(setCacheBytes)
      .catch(() => setCacheBytes(null));

  useEffect(() => {
    loadCacheSize();
  }, []);

  const clearCache = async () => {
    setClearing(true);
    try {
      await invoke("clear_thumbnail_cache");
    } catch (e) {
      console.error("Clear cache error:", e);
    } finally {
      await loadCacheSize();
      setClearing(false);
    }
  };

  return (
    <>
      <PageHeader title="Sozlamalar" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] mx-auto px-6 py-6 space-y-6">
          <Section title="Saqlash">
            <SettingRow
              title="Saqlash papkasi"
              hint={settings.exportPath || "—"}
            >
              <button className="ws-btn" onClick={onPickExportPath}>
                O'zgartirish…
              </button>
              <button
                className="ws-icon-btn"
                onClick={onOpenFolder}
                title="Finder'da ochish"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </SettingRow>
            <SettingRow
              title="Tugagach Finder'da ochish"
              hint="Eksport tugashi bilan papka avtomatik ochiladi"
            >
              <Switch
                label="Tugagach Finder'da ochish"
                checked={settings.openFinderAfterExport}
                onChange={(v) => onUpdate("openFinderAfterExport", v)}
              />
            </SettingRow>
          <SettingRow
              title="Faqat yangi fayllar"
              hint="Mac'da shu nom va hajmda bor fayllar qayta ko'chirilmaydi"
            >
              <Switch
                label="Faqat yangi fayllar"
                checked={settings.skipExisting}
                onChange={(v) => onUpdate("skipExisting", v)}
              />
            </SettingRow>
          </Section>

          <Section title="Galereya">
            <SettingRow
              title="Tahrirlarni ham saqlash (AAE)"
              hint="Tanlangan rasmning .AAE fayli (kesish, filtr) u bilan birga saqlanadi"
            >
              <Switch
                label="AAE fayllarni saqlash"
                checked={settings.includeSidecars}
                onChange={(v) => onUpdate("includeSidecars", v)}
              />
            </SettingRow>
            <SettingRow title="Katakcha o'lchami">
              <input
                type="range"
                min={110}
                max={300}
                step={2}
                value={settings.thumbSize}
                onChange={(e) => onUpdate("thumbSize", Number(e.target.value))}
                className="ws-slider w-36"
              />
            </SettingRow>
          </Section>

          <Section title="Kesh">
            <SettingRow
              title="Rasm eskizlari keshi"
              hint="Faqat shu Mac'dagi kichik eskizlar. Telefondagi fayllarga tegilmaydi."
            >
              <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums mr-1">
                {cacheBytes === null ? "—" : formatBytes(cacheBytes)}
              </span>
              <button
                className="ws-btn"
                onClick={clearCache}
                disabled={clearing || !cacheBytes}
              >
                {clearing ? "Tozalanmoqda…" : "Tozalash"}
              </button>
            </SettingRow>
          </Section>

          <Section title="Tizim">
            <SettingRow title="usbmuxd xizmati">
              <StatusDot
                ok={!!status?.usbmuxd}
                text={status?.usbmuxd ? "Ishlayapti" : "Topilmadi"}
              />
            </SettingRow>
            <SettingRow title="MobileDevice ko'prigi">
              <StatusDot
                ok={!!status?.libimobiledevice}
                text={status?.libimobiledevice ? "Tayyor" : "Topilmadi"}
              />
            </SettingRow>
            <SettingRow title="Versiya">
              <span className="text-[12px] text-[var(--ws-label-2)] tabular-nums">
                {status?.version ?? "—"}
              </span>
            </SettingRow>
          </Section>
        </div>
      </div>
    </>
  );
};

const StatusDot: React.FC<{ ok: boolean; text: string }> = ({ ok, text }) => (
  <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ws-label-2)]">
    <span
      className={`w-2 h-2 rounded-full ${ok ? "bg-[var(--ws-green)]" : "bg-[var(--ws-orange)]"}`}
    />
    {text}
  </span>
);
