// Warstwa danych dla Google Tag Managera (kontener wpięty w index.html).
// W aplikacji jednostronicowej przejścia nie powodują przeładowania, więc odsłony
// i zdarzenia zakupowe trzeba wypchnąć samemu — inaczej w statystykach widać tylko
// stronę, na którą użytkownik wszedł z zewnątrz.
export function gtmPush(data) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(data)
}

const item = (row) => ({
  item_id: row.product_id || row.id,
  item_name: row.name,
  item_variant: row.variant || undefined,
  price: (row.price || 0) / 100,
  quantity: row.qty || 1,
})

export const gtmPageView = (path, title) =>
  gtmPush({ event: 'spa_page_view', page_path: path, page_location: window.location.href, page_title: title })

export const gtmAddToCart = (row) =>
  gtmPush({ event: 'add_to_cart', ecommerce: { currency: 'PLN', value: ((row.price || 0) / 100) * (row.qty || 1), items: [item(row)] } })

export const gtmBeginCheckout = (rows, valueGrosze) =>
  gtmPush({ event: 'begin_checkout', ecommerce: { currency: 'PLN', value: valueGrosze / 100, items: rows.map(item) } })

export const gtmPurchase = (order) =>
  gtmPush({
    event: 'purchase',
    ecommerce: {
      transaction_id: String(order.number),
      currency: 'PLN',
      ...(order.discount_code ? { coupon: order.discount_code } : {}),
      value: (order.total || 0) / 100,
      items: (order.items || []).map(item),
    },
  })
