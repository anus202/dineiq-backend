import { motion } from 'framer-motion'
import { useApi } from '../../hooks/useApi'
import { customerPortalApi } from '../../services/endpoints'
import { money } from '../../utils/format'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../ui'

export function Recommendations() {
  const recs = useApi(() => customerPortalApi.recommendations(), [])
  const data = recs.data

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-ink dark:text-white">Recommended for you</h3>
      <p className="mb-4 text-xs text-slate-500">
        {data
          ? data.BasedOnOrders > 0
            ? `Based on your ${data.BasedOnOrders} completed order${data.BasedOnOrders === 1 ? '' : 's'}${data.FavouriteCategories.length ? `. You love ${data.FavouriteCategories.join(', ')}` : ''}`
            : 'Our most popular dishes, until we learn your taste'
          : 'Personalised from your order history'}
      </p>
      {recs.error && <ErrorBanner message={recs.error} onRetry={recs.reload} />}
      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <ShimmerSkeleton key={i} className="h-24" rounded="rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.Items.map((item, i) => (
            <motion.div
              key={item.MenuItemId}
              className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 transition hover:border-brand-300 hover:shadow-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-ink dark:text-white">{item.Name}</p>
                <span className="shrink-0 text-sm font-semibold text-brand-700">{money(item.Price)}</span>
              </div>
              <Badge tone="gray">{item.CategoryName}</Badge>
              <p className="mt-2 text-xs text-slate-500">
                {item.Reason.startsWith("You've") ? '↻ ' : item.Reason.startsWith('Popular in') ? '♥ ' : '★ '}
                {item.Reason}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
