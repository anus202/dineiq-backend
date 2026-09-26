import { useState } from 'react'
import { MovementLogTable } from '../components/inventory/MovementLogTable'
import { PageHeader } from '../components/layout/AppLayout'
import { Button } from '../components/ui'

export function StockMovementLogPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <>
      <PageHeader
        title="Stock Movement Log"
        subtitle="Every stock change — purchases, adjustments and order consumption"
        actions={
          <Button variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            ↻ Refresh
          </Button>
        }
      />
      <MovementLogTable refreshKey={refreshKey} />
    </>
  )
}
