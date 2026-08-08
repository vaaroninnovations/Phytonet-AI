// Razorpay Standard Checkout — tiny helper.
//
// Lazily injects the official checkout.js script the first time it's needed
// (avoiding an extra network call for users who never touch the buy flow),
// then opens the modal against a server-created order.
//
// The KEY_ID travels back from the backend inside the `/nodes/purchase-intent`
// response — that way we never bake a payment key into the frontend bundle
// and rotating keys never requires a rebuild. The KEY_SECRET only ever lives
// on the server and is used for HMAC signature verification.

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** Loads Razorpay's checkout.js exactly once. Resolves to the global Razorpay
 *  constructor, or rejects if the script fails to load (e.g. offline). */
export function loadRazorpay() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    // Reuse an existing tag if another caller already injected it.
    let s = document.querySelector(`script[src="${CHECKOUT_SCRIPT}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = CHECKOUT_SCRIPT;
      s.async = true;
      document.body.appendChild(s);
    }
    s.addEventListener("load", () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay checkout script loaded but window.Razorpay is missing"));
    });
    s.addEventListener("error", () => reject(new Error("Failed to load Razorpay checkout script")));
  });
}

/** Opens the Razorpay Standard Checkout modal.
 *
 *  @param {object} intent — response from POST /api/nodes/purchase-intent:
 *                           { order_id, amount, currency, razorpay_key_id,
 *                             plan, prefill }
 *  @param {(payload: {razorpay_order_id, razorpay_payment_id, razorpay_signature}) => Promise<any>} onSuccess
 *                     — called after the user pays; usually verifies the
 *                       signature with the backend and refreshes the balance.
 *  @param {(err: any) => void} onFailure  — called for payment.failed events.
 *  @param {() => void} onDismiss           — called when the user closes the
 *                                            modal without paying.
 */
export async function openRazorpayCheckout({ intent, onSuccess, onFailure, onDismiss }) {
  const Razorpay = await loadRazorpay();
  const rzp = new Razorpay({
    key: intent.razorpay_key_id,
    amount: intent.amount,
    currency: intent.currency || "INR",
    name: "PhytoNet AI",
    description: `${intent.plan?.nodes ?? ""} nodes — ${intent.plan?.label ?? "PhytoNet AI"}`,
    order_id: intent.order_id,
    prefill: intent.prefill || {},
    theme: { color: "#5139ED" },
    handler: async (resp) => {
      // resp = { razorpay_payment_id, razorpay_order_id, razorpay_signature }
      try { await onSuccess?.(resp); } catch (e) { onFailure?.(e); }
    },
    modal: {
      ondismiss: () => onDismiss?.(),
    },
  });
  rzp.on("payment.failed", (resp) => onFailure?.(resp?.error || resp));
  rzp.open();
}

/** Opens the Razorpay Standard Checkout modal in *subscription* mode.
 *  Unlike one-time purchases this uses `subscription_id` (not `order_id`)
 *  so Razorpay auto-charges the user every month until they cancel.
 *
 *  @param {object} intent — response from POST /api/nodes/subscription/create:
 *                           { subscription_id, razorpay_key_id, plan, prefill }
 */
export async function openRazorpaySubscription({ intent, onSuccess, onFailure, onDismiss }) {
  const Razorpay = await loadRazorpay();
  const rzp = new Razorpay({
    key: intent.razorpay_key_id,
    name: "PhytoNet AI",
    description: `${intent.plan?.label || "PhytoNet Pro"} — auto-renewing monthly`,
    subscription_id: intent.subscription_id,
    prefill: intent.prefill || {},
    theme: { color: "#5139ED" },
    handler: async (resp) => {
      // resp = { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
      // Verification happens server-side via the razorpay webhook — nothing to
      // verify from the client. Just refresh the balance/pro state.
      try { await onSuccess?.(resp); } catch (e) { onFailure?.(e); }
    },
    modal: {
      ondismiss: () => onDismiss?.(),
    },
  });
  rzp.on("payment.failed", (resp) => onFailure?.(resp?.error || resp));
  rzp.open();
}
