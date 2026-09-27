import { ShoppingCart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MenuCard } from '../components/MenuCard'
import { PageHeader } from '../components/layout/AppLayout'
import { Button, EmptyState, ErrorBanner, ShimmerSkeleton, useToast } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import { apiErrorMessage } from '../services/api'
import { categoryApi, favoriteApi, menuApi } from '../services/endpoints'
import type { MenuItem } from '../types/api'

/** Item id -> quantity. Carried to the checkout page via router state when "Place Your
 * Order" is pressed; it doesn't need to survive a full page reload. */
export type Cart = Record<number, number>

export function MenuBrowsePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const categories = useApi(() => categoryApi.list(), [])
  const [categoryId, setCategoryId] = useState<number | 'All'>('All')
  const [search, setSearch] = useState('')
  const menu = useApi(
    () => menuApi.list({ skip: 0, limit: 100, is_available: true, category_id: categoryId === 'All' ? undefined : categoryId, search: search || undefined }),
    [categoryId, search],
  )

  const favorites = useApi(() => favoriteApi.mine(), [])
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (favorites.data) setFavoriteIds(new Set(favorites.data.MenuItemIds))
  }, [favorites.data])

  const [cart, setCart] = useState<Cart>({})
  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0)

  const handleToggleFavorite = async (item: MenuItem) => {
    const wasFavorite = favoriteIds.has(item.Id)
    // Optimistic: the heart flips instantly, then reconciles with the server's answer.
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      wasFavorite ? next.delete(item.Id) : next.add(item.Id)
      return next
    })
    try {
      const result = await favoriteApi.toggle(item.Id)
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        result.IsFavorite ? next.add(item.Id) : next.delete(item.Id)
        return next
      })
    } catch (err) {
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        wasFavorite ? next.add(item.Id) : next.delete(item.Id)
        return next
      })
      toast.error('Could not update favorite', apiErrorMessage(err))
    }
  }

  const addToCart = (item: MenuItem) => setCart((prev) => ({ ...prev, [item.Id]: (prev[item.Id] ?? 0) + 1 }))
  const incrementCart = (item: MenuItem) => addToCart(item)
  const decrementCart = (item: MenuItem) =>
    setCart((prev) => {
      const current = prev[item.Id] ?? 0
      if (current <= 1) {
        const { [item.Id]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [item.Id]: current - 1 }
    })

  const handlePlaceOrder = () => {
    navigate(`/customer/order?email=${encodeURIComponent(user?.Email ?? '')}`, { state: { cart, email: user?.Email ?? '' } })
  }

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle="Everything available to order right now"
        actions={
          <Button variant="primary" icon={<ShoppingCart className="h-4 w-4" />} onClick={handlePlaceOrder} disabled={cartCount === 0}>
            Place Your Order{cartCount > 0 ? ` (${cartCount})` : ''}
          </Button>
        }
      />
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
            <ShimmerSkeleton key={i} className="h-56" rounded="rounded-2xl" />
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
          <MenuCard
            key={item.Id}
            item={item}
            isFavorite={favoriteIds.has(item.Id)}
            onToggleFavorite={handleToggleFavorite}
            quantityInCart={cart[item.Id] ?? 0}
            onAdd={addToCart}
            onIncrement={incrementCart}
            onDecrement={decrementCart}
          />
        ))}
      </div>
    </>
  )
}
