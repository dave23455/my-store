export function buildOrderCustomerSummary(order = {}) {
  const items = Array.isArray(order.items) ? order.items.map((item) => ({
    id: item.id ?? null,
    product_id: item.product_id ?? item.productId ?? null,
    variant_id: item.variant_id ?? item.variantId ?? null,
    name: item.name || 'Product',
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price ?? item.price ?? 0),
  })) : [];

  return {
    ...order,
    customer: {
      id: order.user_id ?? null,
      name: order.customer_name || order.name || 'Customer',
      email: order.customer_email || order.email || '',
    },
    items,
    total: Number(order.total ?? 0),
  };
}
