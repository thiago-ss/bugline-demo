import { useMemo, useState } from "react";
import type { TelemetryBuffer } from "../telemetry/telemetry";
import { trackedFetch } from "../telemetry/withTelemetry";

type Product = {
  id: string;
  name: string;
  price: number;
};

const PRODUCTS: Product[] = [
  { id: "p1", name: "Studio 85 Mechanical Keyboard", price: 139 },
  { id: "p2", name: "ErgoLift Monitor Arm", price: 79 },
  { id: "p3", name: "USB-C Travel Dock", price: 49 },
];

const SHIPPING_FLAT = 12;
const TAX_RATE = 0.08;

type CouponState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; code: string; percent: number }
  | { status: "failed"; code: string; message: string; traceId?: string };

type CheckoutProps = {
  telemetry: TelemetryBuffer;
  onCouponApplied: (summary: string) => void;
  onError: (name: string, message: string) => void;
};

export function Checkout({ telemetry, onCouponApplied, onError }: CheckoutProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({
    p1: 1,
    p2: 0,
    p3: 0,
  });
  const [email, setEmail] = useState("qa.tester@example.com");
  const [cardLast4, setCardLast4] = useState("4242");
  const [coupon, setCoupon] = useState("SAVE20");
  const [couponState, setCouponState] = useState<CouponState>({ status: "idle" });

  const subtotal = useMemo(
    () =>
      PRODUCTS.reduce(
        (sum, product) => sum + product.price * (quantities[product.id] ?? 0),
        0,
      ),
    [quantities],
  );
  const discount =
    couponState.status === "applied" ? subtotal * (couponState.percent / 100) : 0;
  const tax = (subtotal - discount) * TAX_RATE;
  const total = subtotal - discount + tax + (subtotal > 0 ? SHIPPING_FLAT : 0);

  function track(label: string) {
    telemetry.trackAction(label);
  }

  function changeQuantity(id: string, delta: number) {
    setQuantities((current) => {
      const next = Math.max(0, (current[id] ?? 0) + delta);
      track(`Changed ${PRODUCTS.find((p) => p.id === id)?.name} to ${next}`);
      return { ...current, [id]: next };
    });
  }

  async function applyCoupon() {
    if (couponState.status === "applying") return;
    track(`Requested coupon ${coupon}`);
    setCouponState({ status: "applying" });
    try {
      const response = await trackedFetch(
        telemetry,
        "/api/demo/apply-coupon",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: coupon,
            email,
            cardLast4,
            query: "utm_source=reviewer&campaign=bugline",
          }),
        },
      );
      const body = (await response.json()) as {
        ok: boolean;
        code?: string;
        message?: string;
        traceId?: string;
        discountPercent?: number;
      };
      if (response.ok && body.ok) {
        const percent = body.discountPercent ?? 10;
        setCouponState({
          status: "applied",
          code: coupon.toUpperCase(),
          percent,
        });
        onCouponApplied(`Coupon ${coupon.toUpperCase()} applied: ${percent}% off.`);
      } else {
        const failed: CouponState = {
          status: "failed",
          code: coupon.toUpperCase(),
          message: body.message ?? "Coupon could not be applied.",
          traceId: body.traceId,
        };
        setCouponState(failed);
        onError("PromoEngineError", body.message ?? "Coupon failed.");
        onCouponApplied(
          `Coupon ${coupon.toUpperCase()} failed with ${body.code ?? "unknown"} (${body.message ?? "no message"}).`,
        );
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setCouponState({
        status: "failed",
        code: coupon.toUpperCase(),
        message: "Network error while applying coupon.",
      });
      onError("FetchError", message);
      onCouponApplied(`Coupon request failed before the server responded (${message}).`);
    }
  }

  function placeOrder() {
    track("Placed order (blocked by coupon failure)");
    setCouponState((current) =>
      current.status === "failed"
        ? current
        : { status: "failed", code: coupon, message: "Checkout requires a valid coupon." },
    );
  }

  return (
    <main className="checkout" data-testid="checkout">
      <header className="checkout-header">
        <div>
          <span className="eyebrow">Staging checkout · build {telemetry.snapshot().buildId}</span>
          <h1>Checkout</h1>
        </div>
        <span className="stage-badge">Demo environment</span>
      </header>

      <section className="cart" aria-label="Cart">
        {PRODUCTS.map((product) => {
          const count = quantities[product.id] ?? 0;
          return (
            <article className="cart-row" key={product.id}>
              <div className="product-copy">
                <strong>{product.name}</strong>
                <span>${product.price.toFixed(2)}</span>
              </div>
              <div className="stepper">
                <button
                  type="button"
                  aria-label={`Remove one ${product.name}`}
                  onClick={() => changeQuantity(product.id, -1)}
                >
                  −
                </button>
                <span data-testid={`qty-${product.id}`}>{count}</span>
                <button
                  type="button"
                  aria-label={`Add one ${product.name}`}
                  onClick={() => changeQuantity(product.id, 1)}
                >
                  +
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="fields" aria-label="Details">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              track("Edited email");
            }}
          />
        </label>
        <label>
          Card
          <input
            inputMode="numeric"
            value={cardLast4}
            onChange={(event) => {
              setCardLast4(event.target.value);
              track("Edited card");
            }}
          />
        </label>
        <label>
          Promo code
          <div className="coupon-row">
            <input
              value={coupon}
              aria-label="Promo code"
              onChange={(event) => {
                setCoupon(event.target.value);
                track("Edited coupon");
              }}
            />
            <button
              type="button"
              className="apply-button"
              disabled={couponState.status === "applying"}
              onClick={applyCoupon}
            >
              {couponState.status === "applying" ? "Applying…" : "Apply"}
            </button>
          </div>
        </label>
        {couponState.status === "failed" && (
          <p className="coupon-error" role="alert" data-testid="coupon-error">
            {couponState.message}
            {couponState.traceId ? ` (trace ${couponState.traceId})` : ""}
          </p>
        )}
      </section>

      <section className="summary" aria-label="Order summary">
        <div className="summary-line">
          <span>Subtotal</span>
          <span data-testid="subtotal">${subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="summary-line positive">
            <span>Coupon discount</span>
            <span>−${discount.toFixed(2)}</span>
          </div>
        )}
        <div className="summary-line">
          <span>Tax</span>
          <span>${tax.toFixed(2)}</span>
        </div>
        <div className="summary-line">
          <span>Shipping</span>
          <span>${(subtotal > 0 ? SHIPPING_FLAT : 0).toFixed(2)}</span>
        </div>
        <div className="summary-line total">
          <span>Total</span>
          <span data-testid="total">${total.toFixed(2)}</span>
        </div>
        <button
          type="button"
          className="order-button"
          data-testid="place-order"
          disabled={subtotal === 0}
          onClick={placeOrder}
        >
          Place order
        </button>
      </section>
    </main>
  );
}
