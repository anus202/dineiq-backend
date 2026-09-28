import { useState } from 'react'
import { PageHeader } from '../components/layout/AppLayout'
import { Button, EmptyState, ErrorBanner, ShimmerSkeleton, TextAreaField, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { apiErrorMessage } from '../services/api'
import { customerPortalApi, ratingApi } from '../services/endpoints'
import { dateOnly } from '../utils/format'

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`text-xl ${n <= value ? 'text-amber-400' : 'text-slate-300'}`} aria-label={`${n} star${n === 1 ? '' : 's'}`}>
          ★
        </button>
      ))}
    </div>
  )
}

function RatingForm({ orderId, menuItemId, itemName, onSubmitted }: { orderId: number; menuItemId: number; itemName: string; onSubmitted: () => void }) {
  const toast = useToast()
  const [score, setScore] = useState(5)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      await ratingApi.create({ MenuItemId: menuItemId, OrderId: orderId, Score: score, Comment: comment.trim() || null })
      toast.success('Thanks for the feedback!', itemName)
      setOpen(false)
      setComment('')
      onSubmitted()
    } catch (err) {
      toast.error('Could not submit rating', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Rate this dish
      </Button>
    )
  }
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
      <Stars value={score} onChange={setScore} />
      <TextAreaField label="Comment (optional)" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder="What did you think?" />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={saving}>
          Submit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function RatingsFeedbackPage() {
  const orders = useApi(() => customerPortalApi.myOrders({ skip: 0, limit: 20, open_only: false }), [])
  const myRatings = useApi(() => ratingApi.mine({ skip: 0, limit: 50 }), [])
  const completed = (orders.data?.Items ?? []).filter((o) => o.Status === 'Completed')
  const ratedKeys = new Set((myRatings.data?.Items ?? []).map((r) => `${r.OrderId}-${r.MenuItemId}`))

  return (
    <>
      <PageHeader title="Ratings & Feedback" subtitle="Rate dishes from your completed orders" />
      {orders.error && <ErrorBanner message={orders.error} onRetry={orders.reload} />}
      {orders.loading && !orders.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {orders.data && completed.length === 0 && (
        <div className="card">
          <EmptyState title="No completed orders yet" message="Once an order is completed, you can rate its dishes here." icon="⭐" />
        </div>
      )}
      <div className="space-y-4">
        {completed.map((order) => (
          <div key={order.Id} className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-sm font-medium text-ink dark:text-white">{order.OrderNumber}</p>
              <p className="text-xs text-slate-500">{dateOnly(order.OrderDate)}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items.map((line) => {
                const key = `${order.Id}-${line.MenuItemId}`
                return (
                  <div key={line.Id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink dark:text-white">{line.MenuItemName}</span>
                      {ratedKeys.has(key) ? (
                        <span className="text-xs font-medium text-emerald-600">✓ Rated</span>
                      ) : (
                        <RatingForm orderId={order.Id} menuItemId={line.MenuItemId} itemName={line.MenuItemName} onSubmitted={myRatings.reload} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {(myRatings.data?.Items.length ?? 0) > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-semibold text-ink dark:text-white">Your past ratings</h2>
          <div className="space-y-2">
            {myRatings.data!.Items.map((r) => (
              <div key={r.Id} className="card flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-ink dark:text-white">{r.MenuItemName}</p>
                  {r.Comment && <p className="text-sm text-slate-500">{r.Comment}</p>}
                </div>
                <span className="text-amber-500">{'★'.repeat(r.Score)}{'☆'.repeat(5 - r.Score)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
