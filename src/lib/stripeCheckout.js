export function isStripeCheckoutConfigured() {
  return Boolean(import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT);
}

export async function startStripeCheckout(planId) {
  if (!isStripeCheckoutConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  // TODO: Replace this endpoint call with the Supabase checkout function once
  // Stripe products and webhook handling are live.
  const response = await fetch(import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  if (!response.ok) {
    return { ok: false, reason: "checkout_failed" };
  }
  const payload = await response.json();
  if (payload?.url) {
    window.location.assign(payload.url);
    return { ok: true };
  }
  return { ok: false, reason: "missing_checkout_url" };
}

export async function openStripeCustomerPortal() {
  if (!import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_ENDPOINT) {
    return { ok: false, reason: "not_configured" };
  }

  // TODO: Move this through a Supabase function that authenticates the user
  // and creates a Stripe customer portal session.
  const response = await fetch(import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  if (!response.ok) {
    return { ok: false, reason: "portal_failed" };
  }
  const payload = await response.json();
  if (payload?.url) {
    window.location.assign(payload.url);
    return { ok: true };
  }
  return { ok: false, reason: "missing_portal_url" };
}
