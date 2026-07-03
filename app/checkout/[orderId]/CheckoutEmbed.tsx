"use client";

import { WhopCheckoutEmbed } from "@whop/checkout/react";

/**
 * Whop's drop-in embedded checkout (Chunk 4). We pass the plan + our session
 * (which carries metadata.order_id) and run it against the sandbox. On success
 * Whop redirects the top frame to `returnUrl?status=success`.
 */
export function CheckoutEmbed({
  planId,
  sessionId,
  returnUrl,
}: {
  planId: string;
  sessionId: string;
  returnUrl: string;
}) {
  return (
    <WhopCheckoutEmbed
      planId={planId}
      sessionId={sessionId}
      environment="sandbox"
      returnUrl={returnUrl}
    />
  );
}
