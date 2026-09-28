import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/** A perspective wrapper so children's `rotateX` entrance animations (see StatsCard, Panel)
 * read as a genuine 3D flip rather than a flat 2D one. */
export function Scene({ children, className = 'space-y-6' }: { children: ReactNode; className?: string }) {
  return (
    <div style={{ perspective: 1400 }} className={className}>
      {children}
    </div>
  )
}

/** A section card that flips in from a slight 3D tilt, staggered by `delay` -- the same
 * "load-in" language as StatsCard's own entrance, for the larger panels below a stat row. */
export function Panel({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      style={{ transformPerspective: 1400 }}
      initial={{ opacity: 0, y: 40, rotateX: -10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 22 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
