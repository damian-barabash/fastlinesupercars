// Products store: bundled seed + live override from Supabase
import { useEffect, useState } from 'react'
import SEED from '../data/products.json'
import { rest } from './api.js'

let live = null
const listeners = new Set()

export function getProducts() { return live || SEED }

async function load() {
  try {
    const rows = await rest('products?select=*&active=eq.true&order=sort.asc')
    if (rows?.length) {
      live = rows
      listeners.forEach((fn) => fn(rows))
    }
  } catch { /* offline → seed */ }
}
load()

export function useProducts() {
  const [products, setProducts] = useState(getProducts())
  useEffect(() => {
    const fn = (rows) => setProducts(rows)
    listeners.add(fn)
    if (live) setProducts(live)
    return () => listeners.delete(fn)
  }, [])
  return products
}

export function productPrice(p, variant) {
  if (p.variants?.length) {
    const v = p.variants.find((v) => v.laps === variant)
    if (v) return v.price
  }
  return p.price_from
}
