// Cart store — localStorage + custom event
import { productPrice } from './products.js'
const KEY = 'fs_cart_v1'

export function getCart() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}

function save(items) {
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent('fs-cart', { detail: items }))
}

export function addToCart(item) {
  const items = getCart()
  // ta sama kwota vouchera = ta sama pozycja; inna kwota = osobna linia
  const found = items.find((i) => i.product_id === item.product_id && i.variant === item.variant
    && (i.amount ?? null) === (item.amount ?? null))
  if (found) found.qty = Math.min(found.qty + (item.qty || 1), 10)
  else items.push({ ...item, qty: item.qty || 1 })
  save(items)
}

export function updateQty(idx, qty) {
  const items = getCart()
  if (!items[idx]) return
  if (qty <= 0) items.splice(idx, 1)
  else items[idx].qty = Math.min(qty, 10)
  save(items)
}

export function removeFromCart(idx) {
  const items = getCart()
  items.splice(idx, 1)
  save(items)
}

export function clearCart() { save([]) }

export function cartTotal(items, products) {
  return items.reduce((sum, it) => {
    const p = products.find((x) => x.id === it.product_id)
    if (!p) return sum
    return sum + productPrice(p, it.variant, it.amount) * it.qty
  }, 0)
}

export function cartCount() { return getCart().reduce((s, i) => s + i.qty, 0) }
