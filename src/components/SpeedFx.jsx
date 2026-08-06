// Red scroll progress bar
import { motion, useScroll, useSpring } from 'framer-motion'

export default function SpeedFx() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 })
  return <motion.div className="speedbar" style={{ scaleX }} />
}
