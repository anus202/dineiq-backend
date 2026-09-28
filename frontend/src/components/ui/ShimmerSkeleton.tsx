export function ShimmerSkeleton({ className = 'h-4 w-full', rounded = 'rounded-md' }: { className?: string; rounded?: string }) {
  return (
    <div className={`relative overflow-hidden bg-slate-200/80 dark:bg-slate-700/50 ${rounded} ${className}`} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />
      <style>{'@keyframes shimmer { 100% { transform: translateX(100%); } }'}</style>
    </div>
  )
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <ShimmerSkeleton key={c} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  )
}
