import { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { categoryApi } from '../../services/endpoints'
import type { Category } from '../../types/api'
import { dateOnly } from '../../utils/format'
import { Button, ConfirmDialog, DataTable, Modal, TextField, useToast, type Column } from '../ui'

export function CategoryManager() {
  const toast = useToast()
  const { data, loading, error, reload } = useApi(() => categoryApi.list(), [])
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const open = (target: Category | 'new') => {
    setEditing(target)
    setName(target === 'new' ? '' : target.Name)
    setSubmitted(false)
  }

  const nameError = !name.trim() ? 'Name is required' : null

  const save = async () => {
    setSubmitted(true)
    if (nameError) {
      toast.error('Missing required field', 'Please fix the highlighted field.')
      return
    }
    setSaving(true)
    try {
      if (editing === 'new') await categoryApi.create(name.trim())
      else if (editing) await categoryApi.update(editing.Id, name.trim())
      toast.success(editing === 'new' ? 'Category created' : 'Category updated', name.trim())
      setEditing(null)
      await reload()
    } catch (err) {
      toast.error('Could not save category', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      await categoryApi.remove(deleting.Id)
      toast.success('Category deleted', deleting.Name)
      setDeleting(null)
      await reload()
    } catch (err) {
      toast.error('Could not delete category', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const columns: Column<Category>[] = [
    { key: 'id', header: 'ID', render: (c) => <span className="text-slate-400">#{c.Id}</span>, sortValue: (c) => c.Id },
    { key: 'name', header: 'Category', render: (c) => <span className="font-medium text-ink dark:text-white">{c.Name}</span>, sortValue: (c) => c.Name },
    { key: 'created', header: 'Created', render: (c) => dateOnly(c.CreatedAt), sortValue: (c) => c.CreatedAt },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => open(c)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleting(c)}>
            Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(c) => c.Id}
        loading={loading && !data}
        error={error}
        onRetry={reload}
        searchText={(c) => c.Name}
        searchPlaceholder="Search categories…"
        toolbar={<Button onClick={() => open('new')}>+ New category</Button>}
        emptyTitle="No categories yet"
      />
      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'New category' : 'Edit category'}
        onClose={() => setEditing(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          error={submitted ? nameError : null}
        />
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete category?"
        message={`"${deleting?.Name}" will be hidden from the menu. Its history stays for reporting.`}
        confirmLabel="Delete"
        busy={saving}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
