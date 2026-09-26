import { useState } from 'react'
import { PageHeader } from '../components/layout/AppLayout'
import { Badge, EmptyState, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { categoryApi, menuApi } from '../services/endpoints'
import { money } from '../utils/format'

export function MenuBrowsePage() {
  const categories = useApi(() => categoryApi.list(), [])
  const [categoryId, setCategoryId] = useState<number | 'All'>('All')
  const [search, setSearch] = useState('')
  const menu = useApi(
    () => menuApi.list({ skip: 0, limit: 100, is_available: true, category_id: categoryId === 'All' ? undefined : categoryId, search: search || undefined }),
    [categoryId, search],
  )

  return (
    <>
      <PageHeader title="Menu" subtitle="Everything available to order right now" />
      {menu.error && <ErrorBanner message={menu.error} onRetry={menu.reload} />}

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryId('All')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${categoryId === 'All' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          All
        </button>
        {(categories.data ?? []).map((c) => (
          <button
            key={c.Id}
            onClick={() => setCategoryId(c.Id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${categoryId === c.Id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {c.Name}
          </button>
        ))}
      </div>
      <input className="field-input mb-5 max-w-md" placeholder="Search dishes…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search menu" />

      {menu.loading && !menu.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <ShimmerSkeleton key={i} className="h-28" rounded="rounded-2xl" />
          ))}
        </div>
      )}
      {menu.data && menu.data.Items.length === 0 && (
        <div className="card">
          <EmptyState title="No dishes found" message="Try a different category or search term." icon="🍽" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {menu.data?.Items.map((item) => (
          <div key={item.Id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ink">{item.Name}</p>
              <Badge tone="teal">{money(item.Price)}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">{item.Category.CategoryName}</p>
            {item.Description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.Description}</p>}
          </div>
        ))}
      </div>
    </>
  )
}
