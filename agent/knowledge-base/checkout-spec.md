# Staging Checkout — Product Specification

## Demo environment

- Environment name: `staging`
- Repository: `thiago-ss/bugline-demo`
- Build ID: `2026.08.22-staging-a7f3`
- The app is a demo checkout; the coupon engine is intentionally seeded to fail
  for `SAVE20`.

## Catalog

- Studio 85 Mechanical Keyboard — $139.00
- ErgoLift Monitor Arm — $79.00
- USB-C Travel Dock — $49.00

## Order math

- Subtotal = sum of item price × quantity.
- A promo code applies a percentage discount to the subtotal.
- Tax = 8% of (subtotal − discount).
- Shipping = flat $12.00 when subtotal > $0.
- Total = subtotal − discount + tax + shipping.

## Coupon behavior

- `SAVE20` should apply a 20% discount when the cart subtotal exceeds $50.00.
- The demo backend returns `500 PROMO_ENGINE_TIMEOUT` for `SAVE20` with a
  `traceId` in the response body.
- Unknown codes are rejected by the backend as a normal client error.

## Expected failure signature

The seeded failure is:

```json
{
  "ok": false,
  "code": "PROMO_ENGINE_TIMEOUT",
  "message": "Promo engine timed out after 2s while validating SAVE20.",
  "traceId": "tracetest-..."
}
```

Reported failures must include this code and the trace ID when available.
