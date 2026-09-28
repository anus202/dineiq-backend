import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function Scene({ children, className = 'space-y-6' }: { children: ReactNode; className?: string }) {
  return (
    <div style={{ perspective: 1400 }} className={className}>
      {children}
    </div>
  )
}

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
