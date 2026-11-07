import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderCustomerSummary } from '../src/services/order-summary.js';

test('buildOrderCustomerSummary includes customer info and item details', () => {
  const order = {
    id: 42,
    status: 'paid',
    payment_status: 'paid',
    total: 2500,
    user_id: 7,
    customer_name: 'Jane',
    customer_email: 'jane@example.com',
    items: [
      { product_id: 1, name: 'Glow Serum', quantity: 1, unit_price: 1800 },
      { product_id: 2, name: 'Lip Oil', quantity: 2, unit_price: 350 }
    ]
  };

  const summary = buildOrderCustomerSummary(order);

  assert.equal(summary.id, 42);
  assert.equal(summary.customer.name, 'Jane');
  assert.equal(summary.customer.email, 'jane@example.com');
  assert.deepEqual(summary.items.map((item) => item.name), ['Glow Serum', 'Lip Oil']);
  assert.equal(summary.items[1].quantity, 2);
  assert.equal(summary.total, 2500);
});
