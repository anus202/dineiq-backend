import { AnimatePresence, motion } from 'framer-motion'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  message?: string
}

interface ToastApi {
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const styles: Record<ToastKind, { bar: string; icon: string }> = {
  success: { bar: 'bg-emerald-500', icon: '✓' },
  error: { bar: 'bg-rose-500', icon: '!' },
  warning: { bar: 'bg-amber-500', icon: '⚠' },
  info: { bar: 'bg-sky-500', icon: 'i' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = nextId.current++
      setToasts((all) => [...all.slice(-3), { id, kind, title, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, m) => push('success', t, m),
      error: (t, m) => push('error', t, m),
      warning: (t, m) => push('warning', t, m),
      info: (t, m) => push('info', t, m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="card pointer-events-auto flex overflow-hidden"
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <div className={`w-1.5 ${styles[t.kind].bar}`} />
              <div className="flex flex-1 gap-3 px-4 py-3">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${styles[t.kind].bar}`}>
                  {styles[t.kind].icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink dark:text-white">{t.title}</p>
                  {t.message && <p className="mt-0.5 text-xs break-words text-slate-500 dark:text-slate-400">{t.message}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="self-start text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
