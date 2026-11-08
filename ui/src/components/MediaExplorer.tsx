import React, { useState, useMemo, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Film,
  Image as ImageIcon,
  FileText,
  Search,
  CheckSquare,
  Square,
  FolderOpen,
  Play,
  CheckCircle2,
  Download,
  RefreshCw,
  Video,
  Eye,
  Calendar,
  X,
  LayoutGrid,
  List
} from 'lucide-react'
import { MediaCatalogSummary, MediaItem } from '../types'

interface MediaExplorerProps {
  catalog: MediaCatalogSummary | null
  isLoading: boolean
  onRefreshCatalog: () => void
  destinationDir: string
  onPickDestinationDir: () => void
  onExportSelected: (paths: string[]) => Promise<void>
  isExporting: boolean
  exportProgress: number
  exportSpeed: string
  isExportSuccess: boolean
  onOpenFolder: () => void
  onCancelExport?: () => void
  udid?: string
}

export const MediaExplorer: React.FC<MediaExplorerProps> = ({
  catalog,
  isLoading,
  onRefreshCatalog,
  destinationDir,
  onPickDestinationDir,
  onExportSelected,
  isExporting,
  exportProgress,
  exportSpeed,
  isExportSuccess,
  onOpenFolder,
  onCancelExport,
  udid,
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'photo' | 'other' | 'all'>('video')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'size-desc' | 'name'>('newest')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cardDensity, setCardDensity] = useState<'compact' | 'standard' | 'large'>('standard')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null)
  const [visibleLimit, setVisibleLimit] = useState<number>(120)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Extract number from album name e.g. "105APPLE" -> 105
  const extractAlbumNum = (album: string): number => {
    const digits = album.replace(/\D/g, '')
    return digits ? parseInt(digits, 10) : 0
  }

  // Extract number from file name e.g. "IMG_5475.MOV" -> 5475
  const extractFileNum = (name: string): number => {
    const digits = name.replace(/\D/g, '')
    return digits ? parseInt(digits, 10) : 0
  }

  // Filter and sort items based on activeTab, search query, and sortBy
  const filteredItems = useMemo(() => {
    if (!catalog?.items) return []

    // 1. Filter
    let list = catalog.items.filter((item) => {
      if (activeTab === 'video' && item.kind !== 'video') return false
      if (activeTab === 'photo' && item.kind !== 'photo') return false
      if (activeTab === 'other' && (item.kind === 'video' || item.kind === 'photo')) return false

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return (
          item.name.toLowerCase().includes(query) ||
          item.album.toLowerCase().includes(query) ||
          item.extension.toLowerCase().includes(query)
        )
      }
      return true
    })

    // 2. Sort
    list = [...list].sort((a, b) => {
      if (sortBy === 'newest') {
        // Newest First: Highest album number (107 > 106 > 105), highest file number (IMG_7215 > IMG_5000)
        const albA = extractAlbumNum(a.album)
        const albB = extractAlbumNum(b.album)
        if (albA !== albB) return albB - albA

        const numA = extractFileNum(a.name)
        const numB = extractFileNum(b.name)
        if (numA !== numB) return numB - numA

        return b.name.localeCompare(a.name)
      } else if (sortBy === 'oldest') {
        // Oldest First: Lowest album number (100 < 105), lowest file number
        const albA = extractAlbumNum(a.album)
        const albB = extractAlbumNum(b.album)
        if (albA !== albB) return albA - albB

        const numA = extractFileNum(a.name)
        const numB = extractFileNum(b.name)
        if (numA !== numB) return numA - numB

        return a.name.localeCompare(b.name)
      } else if (sortBy === 'size-desc') {
        return b.size_bytes - a.size_bytes
      } else {
        return a.name.localeCompare(b.name)
      }
    })

    return list
  }, [catalog, activeTab, searchQuery, sortBy])

  // Infinite scroll observer when reaching near bottom of grid
  useEffect(() => {
    if (!sentinelRef.current || visibleLimit >= filteredItems.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLimit((prev) => Math.min(prev + 60, filteredItems.length))
        }
      },
      { root: gridContainerRef.current, rootMargin: '600px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [filteredItems.length, visibleLimit])

  // Lazy-load batch thumbnails for visible items
  useEffect(() => {
    if (!udid || filteredItems.length === 0) return

    const visibleSlice = filteredItems.slice(0, visibleLimit)
    const missing = visibleSlice.filter((i) => !thumbnails[`${i.album}_${i.name}`])
    if (missing.length === 0) return

    // Chunk into batches of 60 items
    const batch = missing.slice(0, 60).map((i) => [i.album, i.name])
    invoke<Record<string, string>>('fetch_media_thumbnails_batch', {
      udid,
      items: batch,
    })
      .then((res) => {
        if (res && Object.keys(res).length > 0) {
          setThumbnails((prev) => ({ ...prev, ...res }))
        }
      })
      .catch((e) => console.debug('Thumbnails fetch error:', e))
  }, [filteredItems, udid, visibleLimit, thumbnails])

  // Infinite scroll trigger when reaching bottom of grid
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 400) {
      if (visibleLimit < filteredItems.length) {
        setVisibleLimit((prev) => Math.min(prev + 60, filteredItems.length))
      }
    }
  }

  // Calculate selected total size
  const selectedTotalBytes = useMemo(() => {
    if (!catalog?.items) return 0
    let total = 0
    for (const item of catalog.items) {
      if (selectedPaths.has(item.path)) {
        total += item.size_bytes
      }
    }
    return total
  }, [catalog, selectedPaths])

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    const mb = bytes / (1024 * 1024)
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`
    }
    return `${mb.toFixed(1)} MB`
  }

  // Toggle single item selection
  const toggleSelect = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Select all filtered items
  const selectAllFiltered = () => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      for (const item of filteredItems) {
        next.add(item.path)
      }
      return next
    })
  }

  // Deselect all items
  const deselectAll = () => {
    setSelectedPaths(new Set())
  }

  const handleStartExport = () => {
    if (selectedPaths.size === 0 || isExporting) return
    onExportSelected(Array.from(selectedPaths))
  }

  // Grid column minmax width based on density
  const gridMinWidth = useMemo(() => {
    switch (cardDensity) {
      case 'compact':
        return 190
      case 'large':
        return 340
      case 'standard':
      default:
        return 260
    }
  }, [cardDensity])

  return (
    <div className="w-full h-full flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden relative">
      {/* Top Header Card (Spans full window width) */}
      <div className="apple-glass rounded-2xl p-4 shadow-xl w-full shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1 rounded-lg bg-[#0A84FF]/15 text-[#0A84FF] border border-[#0A84FF]/25">
                <Film className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">Rasmlar & Videolar Galereyasi</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-[#30D158]/15 text-[#30D158] font-semibold border border-[#30D158]/25">
                To'g'ridan-to'g'ri kabel orqali
              </span>
            </div>
            <p className="text-xs text-white/60">
              iPhone'dagi og'ir 4K/ProRes videolarni va rasmlarni saralab, Mac'ga alohida tanlab yuklab oling.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start xl:self-auto">
            <button
              onClick={onRefreshCatalog}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.08] transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0A84FF]' : ''}`} />
              <span>Katalogni yangilash</span>
            </button>
          </div>
        </div>

        {/* Catalog Statistics Pills (Fluid Full-Width Grid) */}
        {catalog && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3.5 border-t border-white/[0.06]">
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col">
              <span className="text-[10px] text-white/50 block">Jami DCIM Media:</span>
              <span className="text-xs font-bold font-mono text-white mt-0.5">
                {catalog.total_files} ta ({formatBytes(catalog.total_bytes)})
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0A84FF]/10 border border-[#0A84FF]/25 flex flex-col">
              <span className="text-[10px] text-[#0A84FF] block font-medium">Videolar:</span>
              <span className="text-xs font-bold font-mono text-white mt-0.5">
                {catalog.video_count} ta ({formatBytes(catalog.video_bytes)})
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col">
              <span className="text-[10px] text-white/50 block">Rasmlar (HEIC/JPG):</span>
              <span className="text-xs font-bold font-mono text-white mt-0.5">
                {catalog.photo_count} ta ({formatBytes(catalog.photo_bytes)})
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col">
              <span className="text-[10px] text-white/50 block">Boshqa fayllar:</span>
              <span className="text-xs font-bold font-mono text-white mt-0.5">
                {catalog.other_count} ta ({formatBytes(catalog.other_bytes)})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Control Toolbar: Tabs, Sorting, Search, Density & View Mode (Full Width) */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 w-full shrink-0">
        {/* Category Tabs */}
        <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 gap-1 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'video'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Videolar ({catalog?.video_count || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('photo')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'photo'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Rasmlar ({catalog?.photo_count || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('other')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'other'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Boshqa ({catalog?.other_count || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <span>Barchasi ({catalog?.total_files || 0})</span>
          </button>
        </div>

        {/* Right Controls: Sort Order, Card Density, Search, and Grid/List switcher */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Sort By Selector (Date / Size) */}
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl px-2.5 py-1 text-xs text-white gap-1.5 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-[#0A84FF]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs text-white outline-none cursor-pointer"
            >
              <option value="newest" className="bg-[#121317]">⏱ Sana: Eng yangilari birinchi</option>
              <option value="oldest" className="bg-[#121317]">⏳ Sana: Eng eskilar birinchi</option>
              <option value="size-desc" className="bg-[#121317]">💾 Hajmi: Eng kattalari birinchi</option>
              <option value="name" className="bg-[#121317]">🔤 Nomi: A dan Z gacha</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Fayl nomi yoki albom qidirish..."
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-[#0A84FF] transition-all"
            />
          </div>

          {/* Card Density Zoom Toggle (Compact / Standard / Large) */}
          {viewMode === 'grid' && (
            <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl p-0.5 gap-0.5 shrink-0">
              <button
                onClick={() => setCardDensity('compact')}
                title="Kichikroq kartalar"
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  cardDensity === 'compact' ? 'bg-white/[0.12] text-white shadow-sm' : 'text-white/50 hover:text-white'
                }`}
              >
                Ixcham
              </button>
              <button
                onClick={() => setCardDensity('standard')}
                title="Standart kartalar"
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  cardDensity === 'standard' ? 'bg-[#0A84FF] text-white shadow-sm' : 'text-white/50 hover:text-white'
                }`}
              >
                O'rta
              </button>
              <button
                onClick={() => setCardDensity('large')}
                title="Katta kartalar"
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                  cardDensity === 'large' ? 'bg-white/[0.12] text-white shadow-sm' : 'text-white/50 hover:text-white'
                }`}
              >
                Katta
              </button>
            </div>
          )}

          {/* View Mode Toggle (Grid vs List) */}
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl p-0.5 gap-0.5 shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              title="Galereya ko'rinishi (Visual Thumbnails)"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-[#0A84FF] text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Ixcham ro'yxat"
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'list' ? 'bg-[#0A84FF] text-white shadow-sm' : 'text-white/50 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Selection Control Bar & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 text-xs w-full shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAllFiltered}
            className="text-xs text-[#0A84FF] hover:underline font-semibold cursor-pointer"
          >
            Ko'rsatilganlarni barchasini tanlash ({filteredItems.length})
          </button>
          <span className="text-white/20">•</span>
          <button
            onClick={deselectAll}
            className="text-xs text-white/50 hover:text-white cursor-pointer"
          >
            Tanlovni bekor qilish
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-white/60">
            {sortBy === 'newest' && '⏱ Eng oxirgi olinganlar boshida'}
            {sortBy === 'oldest' && '⏳ Eng dastlabki olinganlar boshida'}
            {sortBy === 'size-desc' && '💾 Eng og\'ir fayllar boshida'}
          </span>
          <span className="text-white/30">|</span>
          <span className="text-white/60">Tanlandi:</span>
          <span className="font-mono font-bold text-white bg-white/[0.08] px-2.5 py-0.5 rounded-md">
            {selectedPaths.size} ta fayl ({formatBytes(selectedTotalBytes)})
          </span>
        </div>
      </div>

      {/* Media Items View (Full Height, Infinite Scrolling, Dynamic Width) */}
      {isLoading ? (
        <div className="apple-glass rounded-2xl p-20 text-center space-y-3 w-full">
          <RefreshCw className="w-8 h-8 text-[#0A84FF] animate-spin mx-auto" />
          <p className="text-xs font-semibold text-white">iPhone xotirasi o'qilmoqda...</p>
          <p className="text-[11px] text-white/50">2,000+ ta video va fotosuratlar ro'yxati tahlil qilinmoqda.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="apple-glass rounded-2xl p-20 text-center space-y-3 w-full">
          <Film className="w-8 h-8 text-white/30 mx-auto" />
          <p className="text-xs font-semibold text-white">Hech qanday fayl topilmadi</p>
          <p className="text-[11px] text-white/50">Qidiruv so'zini o'zgartirib ko'ring yoki boshqa toifani tanlang.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* VISUAL GALLERY GRID (Apple Photos / Native HIG Grid with 16:9 HD Thumbnails) */
        <div
          ref={gridContainerRef}
          onScroll={handleScroll}
          className="w-full flex-1 min-h-0 overflow-y-auto pr-1 pb-32 select-none"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth}px, 1fr))`,
              gap: '16px',
            }}
            className="w-full"
          >
            {filteredItems.slice(0, visibleLimit).map((item) => {
              const isSelected = selectedPaths.has(item.path)
              const thumbKey = `${item.album}_${item.name}`
              const thumbUrl = thumbnails[thumbKey]

              return (
                <div
                  key={item.path}
                  onClick={() => toggleSelect(item.path)}
                  className={`group relative rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer flex flex-col bg-[#141519] hover:bg-[#181920] shadow-md hover:shadow-xl hover:-translate-y-0.5 select-none ${
                    isSelected
                      ? 'border-[#0A84FF] ring-2 ring-[#0A84FF]/60 shadow-lg shadow-[#0A84FF]/25 bg-[#0A84FF]/[0.05]'
                      : 'border-white/[0.08] hover:border-white/[0.22]'
                  }`}
                >
                  {/* Visual Thumbnail Area (Widescreen 16:9 Aspect Ratio) */}
                  <div className="relative w-full aspect-video bg-[#0A0B0E] overflow-hidden flex items-center justify-center shrink-0">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      /* Clean fallback placeholder while thumbnail downloads */
                      <div className="w-full h-full flex flex-col items-center justify-center bg-white/[0.02]">
                        {item.kind === 'video' ? (
                          <div className="w-11 h-11 rounded-full bg-[#0A84FF]/20 border border-[#0A84FF]/40 flex items-center justify-center text-[#0A84FF] shadow-sm">
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </div>
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-[#30D158]/20 border border-[#30D158]/40 flex items-center justify-center text-[#30D158] shadow-sm">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Top-Left Circular Selection Indicator */}
                    <div
                      onClick={(e) => toggleSelect(item.path, e)}
                      className="absolute top-2.5 left-2.5 z-10 cursor-pointer"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-[#0A84FF] text-white shadow-lg ring-2 ring-white/40'
                            : 'bg-black/50 backdrop-blur-md border border-white/40 text-transparent hover:border-white'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4 fill-current" />
                      </div>
                    </div>

                    {/* Top-Right Format Badge */}
                    <div className="absolute top-2.5 right-2.5 z-10">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-black/70 backdrop-blur-md text-white/90 border border-white/10 shadow-sm">
                        {item.extension}
                      </span>
                    </div>

                    {/* Bottom-Left Type Badge for Videos */}
                    {item.kind === 'video' && (
                      <div className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-white/90 border border-white/10 text-[10px] font-semibold">
                        <Play className="w-2.5 h-2.5 fill-current text-[#0A84FF]" />
                        <span>Video</span>
                      </div>
                    )}

                    {/* Bottom-Right Size Pill */}
                    <div className="absolute bottom-2.5 right-2.5 z-10">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/80 backdrop-blur-md text-white border border-white/10 shadow-sm">
                        {formatBytes(item.size_bytes)}
                      </span>
                    </div>

                    {/* Quick Look Eye on Hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewItem(item)
                      }}
                      title="Kattalashtirib ko'rish"
                      className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/75 backdrop-blur-md border border-white/30 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-xl cursor-pointer"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Card Footer Info */}
                  <div className="h-[68px] p-3 bg-[#121317] border-t border-white/[0.06] flex flex-col justify-between shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate group-hover:text-[#0A84FF] transition-colors" title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-white/50 shrink-0">
                        {item.album}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-white/40 font-mono">
                      <span>{item.date ? item.date.split(' ').slice(0, 2).join(' ') : '—'}</span>
                      <span className="text-white/70 font-semibold">{formatBytes(item.size_bytes)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="w-full h-10 shrink-0 pointer-events-none" />
        </div>
      ) : (
        /* COMPACT LIST VIEW (Full Width) */
        <div className="apple-glass rounded-xl overflow-hidden flex-1 min-h-0 overflow-y-auto w-full pb-32">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.04] text-white/50 border-b border-white/[0.08] sticky top-0 backdrop-blur-md z-10">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">Tanlash</th>
                <th className="py-2.5 px-3">Fayl Nomi</th>
                <th className="py-2.5 px-3">Toifasi</th>
                <th className="py-2.5 px-3">Hajmi</th>
                <th className="py-2.5 px-3">Albom</th>
                <th className="py-2.5 px-3">Sana</th>
                <th className="py-2.5 px-3 text-right">Ko'rish</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredItems.map((item) => {
                const isSelected = selectedPaths.has(item.path)
                return (
                  <tr
                    key={item.path}
                    onClick={() => toggleSelect(item.path)}
                    className={`hover:bg-white/[0.04] cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#0A84FF]/10 text-white' : 'text-white/80'
                    }`}
                  >
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.path)}
                        className="rounded accent-[#0A84FF] cursor-pointer"
                      />
                    </td>
                    <td className="py-2 px-3 font-semibold text-white flex items-center gap-2">
                      {item.kind === 'video' ? (
                        <Video className="w-3.5 h-3.5 text-[#0A84FF]" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-[#30D158]" />
                      )}
                      <span>{item.name}</span>
                    </td>
                    <td className="py-2 px-3 uppercase text-[10px] font-mono text-white/50">{item.extension}</td>
                    <td className="py-2 px-3 font-mono font-medium">{formatBytes(item.size_bytes)}</td>
                    <td className="py-2 px-3 text-white/50">{item.album}</td>
                    <td className="py-2 px-3 text-white/40 text-[11px]">{item.date}</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewItem(item)
                        }}
                        className="p-1 text-white/40 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating Export Action Dock (Pinned at bottom with Apple Glass blur) */}
      <div className="absolute bottom-4 left-4 right-4 z-20 apple-glass rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/70">
            <Download className="w-5 h-5 text-[#0A84FF]" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Tanlangan {selectedPaths.size} ta fayl</span>
              <span className="font-mono text-[#30D158]">({formatBytes(selectedTotalBytes)})</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/50 mt-0.5">
              <span>Saqlash joyi: {destinationDir}</span>
              <button
                onClick={onPickDestinationDir}
                className="text-[#0A84FF] hover:underline font-semibold cursor-pointer"
              >
                O'zgartirish
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isExportSuccess && (
            <button
              onClick={onOpenFolder}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.09] text-white border border-white/[0.08] transition-all cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Finder'da ko'rish</span>
            </button>
          )}

          {isExporting && onCancelExport && (
            <button
              onClick={onCancelExport}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 transition-all cursor-pointer active:scale-95"
            >
              <X className="w-4 h-4" />
              <span>Eksportni to'xtatish</span>
            </button>
          )}

          <button
            onClick={handleStartExport}
            disabled={selectedPaths.size === 0 || isExporting}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-lg ${
              selectedPaths.size > 0 && !isExporting
                ? 'bg-[#0A84FF] hover:bg-[#0071E3] active:scale-[0.99] text-white shadow-[#0A84FF]/25 cursor-pointer'
                : 'bg-white/[0.04] text-white/30 cursor-not-allowed border border-white/[0.06]'
            }`}
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Yuklanmoqda ({exportProgress}%)</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Tanlanganlarni Mac'ga Eksport Qilish</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Look Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="relative w-full max-w-xl rounded-2xl apple-glass p-6 overflow-hidden shadow-2xl space-y-4">
            <button
              onClick={() => setPreviewItem(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-[#0A84FF]/15 text-[#0A84FF]">
                {previewItem.kind === 'video' ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
              </span>
              <h3 className="text-sm font-bold text-white truncate">{previewItem.name}</h3>
            </div>

            {/* Thumbnail Preview Image */}
            <div className="relative aspect-video w-full rounded-xl bg-black/60 overflow-hidden flex items-center justify-center border border-white/[0.08]">
              {thumbnails[`${previewItem.album}_${previewItem.name}`] ? (
                <img
                  src={thumbnails[`${previewItem.album}_${previewItem.name}`]}
                  alt={previewItem.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center text-white/40 space-y-1">
                  <Film className="w-8 h-8 mx-auto" />
                  <p className="text-xs">Asl media fayl (iPhone'da)</p>
                </div>
              )}
            </div>

            {/* Metadata Table */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-white/40 block text-[10px]">Fayl Hajmi:</span>
                <span className="font-mono font-semibold text-white">{formatBytes(previewItem.size_bytes)}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-white/40 block text-[10px]">Albom:</span>
                <span className="font-semibold text-white">{previewItem.album}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-white/40 block text-[10px]">Formati:</span>
                <span className="font-mono font-semibold text-white">{previewItem.extension} (Asl Sifat)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <span className="text-white/40 block text-[10px]">Yozilgan Vaqti:</span>
                <span className="text-white/80">{previewItem.date}</span>
              </div>
            </div>

            {/* Action in Modal */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  toggleSelect(previewItem.path)
                  setPreviewItem(null)
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedPaths.has(previewItem.path)
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-[#0A84FF] text-white shadow-md'
                }`}
              >
                {selectedPaths.has(previewItem.path) ? 'Tanlovdan chiqarish' : 'Tanlash (Eksportga qo\'shish)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
