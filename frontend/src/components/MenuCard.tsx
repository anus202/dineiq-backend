import { motion } from 'framer-motion'
import { Heart, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import type { MenuItem } from '../types/api'
import { money } from '../utils/format'

// No photography in the data model (MenuItem has no image field) -- each card gets a
// deterministic gradient + food emoji instead, keyed by the item's own id so the same
// dish always looks the same without depending on any particular category name existing.
const SWATCHES = [
  { gradient: 'from-amber-400 to-orange-500', emoji: '🍛' },
  { gradient: 'from-rose-400 to-red-500', emoji: '🍕' },
  { gradient: 'from-emerald-400 to-teal-500', emoji: '🥗' },
  { gradient: 'from-sky-400 to-blue-500', emoji: '🍔' },
  { gradient: 'from-violet-400 to-purple-500', emoji: '🍜' },
  { gradient: 'from-fuchsia-400 to-pink-500', emoji: '🍰' },
  { gradient: 'from-lime-400 to-green-500', emoji: '🥤' },
  { gradient: 'from-cyan-400 to-teal-600', emoji: '🍗' },
]
const swatchFor = (id: number) => SWATCHES[id % SWATCHES.length]

export interface MenuCardProps {
  item: MenuItem
  isFavorite: boolean
  onToggleFavorite: (item: MenuItem) => void | Promise<void>
  /** How many of this item are already in the cart (0 if none). Omit the whole
   * add-to-cart control by leaving both this and onAdd undefined. */
  quantityInCart?: number
  onAdd?: (item: MenuItem) => void
  onIncrement?: (item: MenuItem) => void
  onDecrement?: (item: MenuItem) => void
}

export function MenuCard({ item, isFavorite, onToggleFavorite, quantityInCart = 0, onAdd, onIncrement, onDecrement }: MenuCardProps) {
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const swatch = swatchFor(item.Id)
  const showCartControl = !!(onAdd || onIncrement || onDecrement)

  const handleToggleFavorite = async () => {
    setFavoriteBusy(true)
    try {
      await onToggleFavorite(item)
    } finally {
      setFavoriteBusy(false)
    }
  }

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-shadow hover:shadow-xl hover:shadow-slate-200/80 ${!item.IsAvailable ? 'opacity-60 saturate-50' : ''}`}
    >
      {/* Visual header */}
      <div className={`relative flex h-28 items-center justify-center bg-gradient-to-br ${swatch.gradient}`}>
        <span className="text-5xl drop-shadow-sm" aria-hidden>
          {swatch.emoji}
        </span>

        {/* Glassmorphic category badge, top-left */}
        <span className="absolute top-3 left-3 rounded-full border border-white/30 bg-white/25 px-2.5 py-1 text-[11px] font-medium text-white uppercase tracking-wide shadow-sm backdrop-blur-md">
          {item.Category.CategoryName}
        </span>

        {/* Favorite heart, top-right */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          disabled={favoriteBusy}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${item.Name} from favorites` : `Add ${item.Name} to favorites`}
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/25 shadow-sm backdrop-blur-md transition hover:bg-white/40 disabled:opacity-60"
        >
          <Heart
            className={`h-4.5 w-4.5 transition-colors ${isFavorite ? 'fill-rose-500 text-rose-500' : 'fill-transparent text-white'}`}
            strokeWidth={2}
          />
        </button>

        {!item.IsAvailable && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[11px] font-semibold tracking-wide text-white uppercase">
            Currently unavailable
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-ink leading-snug">{item.Name}</h3>
          {/* Price tag */}
          <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700">{money(item.Price)}</span>
        </div>
        {item.Description && <p className="line-clamp-2 text-sm text-slate-500">{item.Description}</p>}

        {showCartControl && (
          <div className="mt-1 flex items-center justify-end">
            {quantityInCart === 0 ? (
              <button
                type="button"
                onClick={() => onAdd?.(item)}
                disabled={!item.IsAvailable}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            ) : (
              <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                <button
                  type="button"
                  onClick={() => onDecrement?.(item)}
                  aria-label={`Remove one ${item.Name}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 transition hover:bg-white hover:text-rose-600"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-4 text-center text-sm font-semibold text-ink">{quantityInCart}</span>
                <button
                  type="button"
                  onClick={() => onIncrement?.(item)}
                  aria-label={`Add one more ${item.Name}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 transition hover:bg-white hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
