import { motion } from 'framer-motion'
import { Heart, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import type { MenuItem } from '../types/api'
import { money } from '../utils/format'

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

/** Plain, no-photography menu card: category label, name, description, price and an Add
 * button/quantity stepper, with a favorite heart in the corner. No color beyond the
 * app's own teal/slate palette, and no icon or emoji standing in for a dish photo. */
export function MenuCard({ item, isFavorite, onToggleFavorite, quantityInCart = 0, onAdd, onIncrement, onDecrement }: MenuCardProps) {
  const [favoriteBusy, setFavoriteBusy] = useState(false)
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
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md hover:shadow-slate-200/70 ${!item.IsAvailable ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{item.Category.CategoryName}</span>
        <button
          type="button"
          onClick={handleToggleFavorite}
          disabled={favoriteBusy}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${item.Name} from favorites` : `Add ${item.Name} to favorites`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 transition hover:bg-white disabled:opacity-60"
        >
          <Heart className={`h-4 w-4 transition-colors ${isFavorite ? 'fill-rose-500 text-rose-500' : 'fill-transparent text-slate-300'}`} strokeWidth={2} />
        </button>
      </div>

      <h3 className="mt-1.5 font-semibold text-ink dark:text-white leading-snug">{item.Name}</h3>
      {item.Description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.Description}</p>}
      {!item.IsAvailable && <p className="mt-1 text-xs font-medium text-rose-500">Currently unavailable</p>}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
        <span className="text-sm font-semibold text-brand-700">{money(item.Price)}</span>

        {showCartControl &&
          (quantityInCart === 0 ? (
            <button
              type="button"
              onClick={() => onAdd?.(item)}
              disabled={!item.IsAvailable}
              className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          ) : (
            <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1">
              <button
                type="button"
                onClick={() => onDecrement?.(item)}
                aria-label={`Remove one ${item.Name}`}
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 transition hover:bg-white hover:text-rose-600"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center text-sm font-semibold text-ink dark:text-white">{quantityInCart}</span>
              <button
                type="button"
                onClick={() => onIncrement?.(item)}
                aria-label={`Add one more ${item.Name}`}
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 transition hover:bg-white hover:text-brand-700"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
      </div>
    </motion.div>
  )
}
