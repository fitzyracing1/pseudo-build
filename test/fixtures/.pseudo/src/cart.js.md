# src/cart.js

- Language: javascript
- Summary: Shopping cart helpers for the sample app. 5 symbol(s): total, Cart, Cart.constructor, Cart.add, applyCoupon

## FUNCTION total(items, taxRate)  _(line 4)_

> Compute the cart total including tax.

1. Note: add up each line item
2. For each item of items
3. If item.qty <= 0 then continue
4. Return sum * (1 + taxRate)

## CLASS Cart  _(line 14)_

## METHOD Cart.constructor(owner)  _(line 15)_

1. (straight-line body)

## METHOD Cart.add(item)  _(line 19)_

1. If !item.sku then raise new Error('missing sku')
2. Call this.items.push

## FUNCTION applyCoupon(amount, coupon)  _(line 25)_

1. If coupon === 'HALF' then return amount / 2
2. Return amount
