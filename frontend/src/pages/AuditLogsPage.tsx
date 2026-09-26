import { AuditLogTable } from '../components/admin/AuditLogTable'
import { PageHeader } from '../components/layout/AppLayout'

export function AuditLogsPage() {
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every tracked create, update and delete across the system" />
      <AuditLogTable />
    </>
  )
}
