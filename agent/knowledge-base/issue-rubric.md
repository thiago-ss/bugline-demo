# Issue-Writing and Severity Rubric

## Severity

Assign severity only from this rubric. Never infer severity from tone or guess.

- **high**: The failure blocks the primary checkout path for most customers
  (cannot complete an order, coupon engine unavailable, data loss).
- **medium**: A feature is broken but a workaround exists, or the failure
  affects a subset of customers without blocking checkout entirely.
- **low**: Cosmetic, minor, or edge-case behavior; no customer workaround needed.

If the tester gives enough evidence to place the report in one bucket, use that
bucket. Otherwise ask one focused question.

## Title

- Short, specific, and searchable.
- Format: `<area>: <what fails>`.
- Example: `SAVE20 promo engine times out at checkout`.
- No markdown, no trailing punctuation.

## Summary

- One or two sentences: what was attempted, what happened, what was expected.
- Include the failed code (for example `PROMO_ENGINE_TIMEOUT`) when known.

## Actual vs expected

- `actualBehavior`: observable result only.
- `expectedBehavior`: what the spec says should happen.
- Never invent behavior. Cite the checkout spec when it applies.

## Reproduction steps

- Numbered, concrete, repeatable.
- Include the seeded prerequisite when relevant (cart subtotal > $50.00).
- One action per step.

## Evidence

- Include route, build ID, browser, viewport, recent actions, failed requests,
  and errors from the captured context.
- Never include emails, tokens, card numbers, query strings, headers, or
  request bodies.

## Fingerprint and session

- The server computes the fingerprint from the redacted draft content.
- Include `reportSessionId` and the fingerprint marker exactly as returned.
- The same bug reported twice must produce the same fingerprint and be treated
  as a duplicate.
