import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  RefreshCw,
  LayoutGrid,
  List,
  Check,
  Play,
  Expand,
  FileText,
  Music,
  Smartphone,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { MediaCatalogSummary, MediaItem } from "../types";
import { PageHeader } from "./PageHeader";
import { QuickLook } from "./QuickLook";
import { formatBytes, formatShortDate } from "../utils/format";

type FilterTab = "video" | "photo" | "other" | "all";
type SortKey = "newest" | "oldest" | "size-desc" | "name";

interface MediaExplorerProps {
  catalog: MediaCatalogSummary | null;
  isLoading: boolean;
  hasDevice: boolean;
  onRefreshCatalog: () => void;
  destinationDir: string;
  onExportSelected: (paths: string[]) => Promise<void>;
  isExporting: boolean;
  exportProgress: number;
  isExportSuccess: boolean;
  onOpenFolder: () => void;
  onCancelExport?: () => void;
  udid?: string;
  includeSidecars: boolean;
  thumbSize: number;
  onThumbSizeChange: (size: number) => void;
}

const PAGE = 90;

// Number from the name without its extension: "IMG_7240.MP4" -> 7240 (not 72404)
const extractNum = (s: string) => {
  const digits = s.replace(/\.[^.]+$/, "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
};

const stemOf = (name: string) => name.replace(/\.[^.]+$/, "").toUpperCase();
const sidecarKey = (album: string, name: string) => `${album}/${stemOf(name)}`;

const sorters: Record<SortKey, (a: MediaItem, b: MediaItem) => number> = {
  // Newest first: highest album number (107 > 106), then highest file number
  newest: (a, b) =>
    extractNum(b.album) - extractNum(a.album) ||
    extractNum(b.name) - extractNum(a.name) ||
    b.name.localeCompare(a.name),
  oldest: (a, b) =>
    extractNum(a.album) - extractNum(b.album) ||
    extractNum(a.name) - extractNum(b.name) ||
    a.name.localeCompare(b.name),
  "size-desc": (a, b) => b.size_bytes - a.size_bytes,
  name: (a, b) => a.name.localeCompare(b.name),
};

const hasThumbnail = (item: MediaItem) =>
  item.kind === "photo" || item.kind === "video";

const FileGlyph: React.FC<{ item: MediaItem; size?: number }> = ({
  item,
  size = 28,
}) => {
  const Icon =
    item.kind === "audio"
      ? Music
      : item.kind === "photo"
        ? ImageIcon
        : FileText;
  return (
    <div className="flex flex-col items-center gap-1.5 text-[var(--ws-label-3)]">
      <Icon style={{ width: size, height: size }} strokeWidth={1.3} />
      <span className="text-[10px] font-semibold tracking-wide">
        {item.extension}
      </span>
    </div>
  );
};

export const MediaExplorer: React.FC<MediaExplorerProps> = ({
  catalog,
  isLoading,
  hasDevice,
  onRefreshCatalog,
  destinationDir,
  onExportSelected,
  isExporting,
  exportProgress,
  isExportSuccess,
  onOpenFolder,
  onCancelExport,
  udid,
  includeSidecars,
  thumbSize,
  onThumbSizeChange,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(PAGE);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestedThumbs = useRef<Set<string>>(new Set());

  // Photos edit sidecars (IMG_1234.AAE) grouped by album + file stem
  const sidecars = useMemo(() => {
    const map = new Map<string, MediaItem>();
    catalog?.items.forEach((i) => {
      if (i.kind === "sidecar") map.set(sidecarKey(i.album, i.name), i);
    });
    return map;
  }, [catalog]);

  const counts = useMemo(() => {
    const c = {
      video: 0,
      photo: 0,
      other: 0,
      all: 0,
      videoBytes: 0,
      photoBytes: 0,
    };
    catalog?.items.forEach((i) => {
      if (i.kind === "video") {
        c.video++;
        c.videoBytes += i.size_bytes;
      } else if (i.kind === "photo") {
        c.photo++;
        c.photoBytes += i.size_bytes;
      } else c.other++;
      if (i.kind !== "sidecar") c.all++;
    });
    return c;
  }, [catalog]);

  const filteredItems = useMemo(() => {
    if (!catalog?.items) return [];
    const query = searchQuery.trim().toLowerCase();
    const list = catalog.items.filter((item) => {
      if (activeTab === "video" && item.kind !== "video") return false;
      if (activeTab === "photo" && item.kind !== "photo") return false;
      if (
        activeTab === "other" &&
        (item.kind === "video" || item.kind === "photo")
      )
        return false;
      // AAE sidecars only make sense next to "Other"; they travel with their photo on export
      if (activeTab === "all" && item.kind === "sidecar") return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.album.toLowerCase().includes(query) ||
        item.extension.toLowerCase().includes(query)
      );
    });
    return list.sort(sorters[sortBy]);
  }, [catalog, activeTab, searchQuery, sortBy]);

  // Reset paging when the list changes
  useEffect(() => {
    setVisibleLimit(PAGE);
    setAnchorIndex(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab, searchQuery, sortBy, catalog]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleLimit >= filteredItems.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting)
          setVisibleLimit((prev) =>
            Math.min(prev + PAGE, filteredItems.length),
          );
      },
      { root: scrollRef.current, rootMargin: "800px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredItems.length, visibleLimit, viewMode]);

  // Lazy-load thumbnails for visible photos/videos only (AAE & files have none)
  useEffect(() => {
    if (!udid) return;
    const missing = filteredItems
      .slice(0, visibleLimit)
      .filter(hasThumbnail)
      .filter((i) => {
        const key = `${i.album}_${i.name}`
        return !thumbnails[key] && !requestedThumbs.current.has(key)
      })
      .slice(0, 60);
    if (missing.length === 0) return;
    missing.forEach((i) => requestedThumbs.current.add(`${i.album}_${i.name}`));
    invoke<Record<string, string>>("fetch_media_thumbnails_batch", {
      udid,
      items: missing.map((i) => [i.album, i.name]),
    })
      .then((res) => {
        if (res && Object.keys(res).length > 0)
          setThumbnails((prev) => ({ ...prev, ...res }));
      })
      .catch((e) => console.debug("Thumbnails fetch error:", e));
  }, [filteredItems, udid, visibleLimit, thumbnails]);

  // A refreshed catalog may retry thumbnails that failed before
  useEffect(() => {
    requestedThumbs.current.clear()
  }, [catalog])

  // New phone -> fresh thumbnails
  useEffect(() => {
    requestedThumbs.current.clear();
    setThumbnails({});
    setSelectedPaths(new Set());
  }, [udid]);

  const selectedTotalBytes = useMemo(() => {
    if (!catalog?.items) return 0;
    let total = 0;
    for (const item of catalog.items)
      if (selectedPaths.has(item.path)) total += item.size_bytes;
    return total;
  }, [catalog, selectedPaths]);

  // Clear the selection once an export finished successfully
  const wasExporting = useRef(false);
  useEffect(() => {
    if (wasExporting.current && !isExporting && isExportSuccess)
      setSelectedPaths(new Set());
    wasExporting.current = isExporting;
  }, [isExporting, isExportSuccess]);

  const handleItemClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const item = filteredItems[index];
      if (!item) return;
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && anchorIndex !== null) {
          const [from, to] =
            anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
          for (let i = from; i <= to; i++) next.add(filteredItems[i].path);
        } else if (next.has(item.path)) {
          next.delete(item.path);
        } else {
          next.add(item.path);
        }
        return next;
      });
      setAnchorIndex(index);
    },
    [filteredItems, anchorIndex],
  );

  const toggleOne = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAllFiltered = () =>
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((i) => next.add(i.path));
      return next;
    });

  const handleStartExport = () => {
    if (selectedPaths.size === 0 || isExporting || !catalog) return;
    const paths = new Set(selectedPaths);
    if (includeSidecars) {
      catalog.items.forEach((i) => {
        if (selectedPaths.has(i.path) && i.kind === "photo") {
          const aae = sidecars.get(sidecarKey(i.album, i.name));
          if (aae) paths.add(aae.path);
        }
      });
    }
    onExportSelected(Array.from(paths));
  };

  // Keyboard: ⌘A select all, Esc clear, Space preview, ⌘F search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (previewIndex !== null) return;
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement;
      if (e.metaKey && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) {
        if (e.key === "Escape") (document.activeElement as HTMLElement).blur();
        return;
      }
      if (e.metaKey && e.key === "a") {
        e.preventDefault();
        selectAllFiltered();
      } else if (e.key === "Escape") {
        setSelectedPaths(new Set());
      } else if (e.key === " " && filteredItems.length > 0) {
        e.preventDefault();
        setPreviewIndex(anchorIndex ?? 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visibleItems = filteredItems.slice(0, visibleLimit);
  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "Barchasi", count: counts.all },
    { id: "video", label: "Videolar", count: counts.video },
    { id: "photo", label: "Rasmlar", count: counts.photo },
    { id: "other", label: "Boshqa", count: counts.other },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <PageHeader
        title="Galereya"
        subtitle={
          catalog
            ? `${counts.all} ta · ${formatBytes(catalog.total_bytes)}`
            : undefined
        }
      >
        <div className="relative" data-no-drag>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ws-label-3)]" />
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Qidirish"
            className="ws-field w-48 pl-7 pr-2"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="ws-field"
          title="Saralash"
        >
          <option value="newest">Eng yangilari</option>
          <option value="oldest">Eng eskilari</option>
          <option value="size-desc">Eng kattalari</option>
          <option value="name">Nomi bo'yicha</option>
        </select>
        <div className="flex">
          <button
            className="ws-icon-btn"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
            title="Katakchalar"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            className="ws-icon-btn"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
            title="Ro'yxat"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
        <button
          className="ws-icon-btn"
          onClick={onRefreshCatalog}
          disabled={isLoading || !hasDevice}
          title="Yangilash (⌘R)"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </PageHeader>

      {/* filter + selection bar */}
      <div className="h-11 shrink-0 flex items-center justify-between gap-4 px-5 border-b border-[var(--ws-separator)]">
        <div className="ws-segmented">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-pressed={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              <span className="tabular-nums opacity-60">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 min-w-0">
          {isExporting ? (
            <>
              <div className="w-28 ws-progress">
                <div style={{ width: `${Math.max(exportProgress, 2)}%` }} />
              </div>
              <span className="text-[12px] tabular-nums text-[var(--ws-label-2)]">
                {exportProgress}%
              </span>
              {onCancelExport && (
                <button className="ws-btn" onClick={onCancelExport}>
                  To'xtatish
                </button>
              )}
            </>
          ) : selectedPaths.size > 0 ? (
            <>
              <span className="text-[12px] tabular-nums text-[var(--ws-label-2)] whitespace-nowrap">
                <span className="text-white font-medium">
                  {selectedPaths.size} ta
                </span>{" "}
                · {formatBytes(selectedTotalBytes)}
              </span>
              <button
                className="ws-btn"
                onClick={() => setSelectedPaths(new Set())}
                title="Esc"
              >
                Bekor qilish
              </button>
              <button
                className="ws-btn ws-btn-primary"
                onClick={handleStartExport}
                title={
                  destinationDir ? `Saqlash joyi: ${destinationDir}` : undefined
                }
              >
                Mac'ga saqlash
              </button>
            </>
          ) : (
            <>
              {isExportSuccess && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ws-green)]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saqlandi
                  <button className="ws-link" onClick={onOpenFolder}>
                    Ko'rsatish
                  </button>
                </span>
              )}
              {viewMode === "grid" && (
                <input
                  type="range"
                  min={110}
                  max={300}
                  step={2}
                  value={thumbSize}
                  onChange={(e) => onThumbSizeChange(Number(e.target.value))}
                  className="ws-slider w-24"
                  title="Katakcha o'lchami"
                />
              )}
              <button
                className="ws-btn"
                onClick={selectAllFiltered}
                disabled={filteredItems.length === 0}
                title="⌘A"
              >
                Hammasini tanlash
              </button>
            </>
          )}
        </div>
      </div>

      {/* content */}
      {!hasDevice ? (
        <EmptyState
          icon={Smartphone}
          title="iPhone ulanmagan"
          text="Galereyani ko'rish uchun telefonni kabel bilan ulang."
        />
      ) : isLoading && !catalog ? (
        <EmptyState
          icon={RefreshCw}
          spin
          title="iPhone xotirasi o'qilmoqda…"
          text="Bir necha soniya vaqt oladi."
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Hech narsa topilmadi"
          text="Boshqa so'z yoki bo'limni tanlab ko'ring."
        />
      ) : viewMode === "grid" ? (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-6"
        >
          <div
            role="grid"
            aria-multiselectable
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`,
              gap: "14px 10px",
            }}
          >
            {visibleItems.map((item, index) => {
              const isSelected = selectedPaths.has(item.path);
              const thumbUrl = thumbnails[`${item.album}_${item.name}`];
              return (
                <div
                  key={item.path}
                  role="gridcell"
                  aria-selected={isSelected}
                  onClick={(e) => handleItemClick(index, e)}
                  onDoubleClick={() => setPreviewIndex(index)}
                  className="group min-w-0"
                >
                  <div className="relative aspect-square rounded-[7px] overflow-hidden bg-white/[0.045] flex items-center justify-center">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt=""
                        draggable={false}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : hasThumbnail(item) ? (
                      <div className="w-full h-full bg-white/[0.03]" />
                    ) : (
                      <FileGlyph item={item} />
                    )}

                    {item.kind === "video" && (
                      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between px-1.5 pb-1 text-[11px] font-medium text-white tabular-nums pointer-events-none">
                        <Play className="w-3 h-3 fill-current" />
                        <span>{formatBytes(item.size_bytes)}</span>
                      </div>
                    )}

                    {isSelected && (
                      <div className="absolute inset-0 rounded-[7px] ring-[3px] ring-inset ring-[var(--ws-accent)] bg-black/10 pointer-events-none" />
                    )}

                    <span
                      className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-opacity ${
                        isSelected
                          ? "bg-[var(--ws-accent)] text-white opacity-100 shadow"
                          : "border-[1.5px] border-white/80 bg-black/20 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {isSelected && (
                        <Check className="w-3 h-3" strokeWidth={3.5} />
                      )}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewIndex(index);
                      }}
                      title="Ko'rish (Space)"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/45 text-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-opacity"
                    >
                      <Expand className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 px-0.5">
                    <div
                      className={`text-[12px] truncate ${isSelected ? "text-[var(--ws-accent)]" : "text-[var(--ws-label)]"}`}
                    >
                      {item.name}
                    </div>
                    <div className="text-[11px] text-[var(--ws-label-3)] truncate tabular-nums">
                      {formatBytes(item.size_bytes)} ·{" "}
                      {formatShortDate(item.date)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div ref={sentinelRef} className="h-px" />
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-left text-[12px] border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--ws-canvas)] text-[var(--ws-label-2)]">
              <tr className="border-b border-[var(--ws-separator)]">
                <th className="w-9 py-1.5 pl-5" />
                <th className="py-1.5 font-medium">Nomi</th>
                <th className="py-1.5 font-medium w-24">Hajmi</th>
                <th className="py-1.5 font-medium w-28">Albom</th>
                <th className="py-1.5 font-medium w-44 pr-5">Sana</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, index) => {
                const isSelected = selectedPaths.has(item.path);
                return (
                  <tr
                    key={item.path}
                    onClick={(e) => handleItemClick(index, e)}
                    onDoubleClick={() => setPreviewIndex(index)}
                    className={`h-7 ${
                      isSelected
                        ? "bg-[var(--ws-accent)]/25"
                        : index % 2
                          ? "bg-white/[0.02]"
                          : ""
                    } hover:bg-white/[0.05]`}
                  >
                    <td className="pl-5">
                      <span className="ws-checkbox" data-checked={isSelected}>
                        {isSelected && (
                          <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                        )}
                      </span>
                    </td>
                    <td className="text-[var(--ws-label)] truncate max-w-0">
                      <span className="inline-flex items-center gap-2">
                        {item.kind === "video" ? (
                          <Play className="w-3.5 h-3.5 text-[var(--ws-label-2)]" />
                        ) : item.kind === "photo" ? (
                          <ImageIcon className="w-3.5 h-3.5 text-[var(--ws-label-2)]" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-[var(--ws-label-3)]" />
                        )}
                        {item.name}
                      </span>
                    </td>
                    <td className="tabular-nums text-[var(--ws-label-2)]">
                      {formatBytes(item.size_bytes)}
                    </td>
                    <td className="text-[var(--ws-label-2)]">{item.album}</td>
                    <td className="tabular-nums text-[var(--ws-label-2)] pr-5">
                      {item.date}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div ref={sentinelRef} className="h-px" />
        </div>
      )}

      {previewIndex !== null && udid && (
        <QuickLook
          items={filteredItems}
          index={previewIndex}
          udid={udid}
          thumbnails={thumbnails}
          isSelected={(p) => selectedPaths.has(p)}
          onToggleSelect={toggleOne}
          onNavigate={(i) => {
            setPreviewIndex(i);
            setAnchorIndex(i);
            if (i >= visibleLimit - 5)
              setVisibleLimit((v) => Math.min(v + PAGE, filteredItems.length));
          }}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
};

const EmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  text: string;
  spin?: boolean;
}> = ({ icon: Icon, title, text, spin }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 pb-16">
    <Icon
      className={`w-8 h-8 text-[var(--ws-label-3)] mb-2 ${spin ? "animate-spin" : ""}`}
      strokeWidth={1.4}
    />
    <p className="text-[13px] font-medium text-white">{title}</p>
    <p className="text-[12px] text-[var(--ws-label-2)]">{text}</p>
  </div>
);
