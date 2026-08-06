// Scroll-reveal helpers on framer-motion
import { motion } from 'framer-motion'

export function Reveal({ children, delay = 0, y = 28, className, once = true }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-60px' }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function Stagger({ children, className, gap = 0.08 }) {
  return (
    <motion.div
      className={className}
      initial="off"
      whileInView="on"
      viewport={{ once: true, margin: '-60px' }}
      transition={{ staggerChildren: gap }}
    >
      {children}
    </motion.div>
  )
}

export function Item({ children, className, y = 26 }) {
  return (
    <motion.div
      className={className}
      variants={{
        off: { opacity: 0, y },
        on: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  )
}
