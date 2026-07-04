# Written scenario answers

These are the four scenarios from the brief. For each one I have kept the fields they asked for: the type of issue, what I would actually say back to the customer, what I would do on our side, how urgent it is, what evidence I would collect, and whether it goes to engineering. Where it helps I point at the tooling in this app that I would really use to work the ticket.

## Scenario 1: a buyer paid, but the order still says pending

**Issue type.** State sync, and almost certainly not an outage.

**What I would tell the customer.** "Whop is not broken here. When a payment is authorized but has not settled yet it sits in a pending state, and we deliberately keep the order in PROCESSING until we get the verified payment.succeeded webhook, or read status paid straight from the API. It will flip on its own. If a webhook happened to get missed, our reconciliation job re-reads the payment from Whop and heals the order within a minute or so."

**Internal action.**
* Open the order in /admin, where it shows our status next to the live status and substatus pulled straight from `GET /payments/{id}`, with a flag when the two disagree.
* If Whop says paid but we do not, check the webhook panel to see whether the payment.succeeded event came in, whether the signature verified, and whether it processed.
* Hit re-check on the order, or Run reconciliation, to pull the truth from Whop and move the order along.

**Urgency.** Low to medium. It self-heals, so it only turns urgent if money is genuinely stuck.

**Evidence I would collect.** The payment id, the status and substatus from Whop, our order status and its updated timestamp, and the matching row in webhook_events (verified, processed, any error).

**Escalate to engineering?** Only if `GET /payments` clearly says paid but the payment.succeeded webhook never showed up at all, which would point at a Whop delivery problem. In that case I would send over the payment id and the delivery log.

## Scenario 2: the seller finished onboarding but still cannot withdraw

**Issue type.** Payout readiness, specifically a KYC gap. Getting through the form is not the same as being cleared to get paid.

**What I would tell the customer.** "Getting through the onboarding screens is not the same thing as being payout ready. A withdrawal needs the ledger's approval status to be approved and a connected payout account, with the money actually available rather than pending or reserved. One more thing worth knowing: payouts are turned off in the Whop sandbox, so a sandbox seller will correctly sit at not-payout-ready, and that is expected, not a bug."

**Internal action.**
* Open the seller's `/seller` → Payout setup panel, which surfaces the live payout-account status (`payout_accounts.retrieve`, e.g. connected / pending_verification / action_required / not_started) and any attached payout methods (`payout_methods.list`) right in the product, so I can see which of the two gates is failing without leaving the app.
* Pull `GET /ledger_accounts/{biz}` and check payments_approval_status and the payout account status, plus the balance split between available, pending, and reserved.
* Make sure a payout method is actually attached, and if KYC is not finished, hand the seller a fresh account-links link for the payouts portal.
* Confirm which environment we are in, because the sandbox can never produce a payout-ready seller, so this has to be validated in production.

**Urgency.** High, since it is blocking the launch.

**Evidence I would collect.** The ledger approval status, the payout account status, the balance breakdown, and the KYC or payout_account.status_updated events.

**Escalate to engineering?** Escalate to Whop if, in production, KYC is approved and the payout account is connected and the funds are available but a withdrawal still fails.

## Scenario 3: a connected seller returns 401 on every API call

**Issue type.** Authentication, or more likely an environment mix-up. This is not a permissions problem.

**What I would tell the customer.** "A 401 is an authentication problem, not an authorization one. By far the most common cause is an environment mix-up, meaning a sandbox key being sent at the production URL or the other way around, or a key that is missing, mistyped, or not carrying the Bearer prefix. If the key were valid but did not have the right scope you would get a 403 instead of a 401, so the status code itself tells us where to look. Quick heads up, I actually hit this exact thing on this build: the key I was first given turned out to be a production key, so it returned 401 on the sandbox and 200 on production."

**Internal action.**
* Hit our `/api/health`, which calls accounts.me and, when it fails, tells you whether it is a 401 (auth or environment) or a 403 (scope), with a hint.
* Confirm WHOP_BASE_URL matches the key's environment, and that the key is being sent server-side as `Authorization: Bearer ...`.
* If it turns out to actually be a 403, check the key's scopes for the operation, and regenerate the key if it was revoked.

**Urgency.** High, because it blocks every API call.

**Evidence I would collect.** The exact status code (401 versus 403), the failing request with the headers redacted, the key's environment, the API base URL, and the endpoint.

**Escalate to engineering?** Only if a key that is on the right environment, sent with Bearer, and carrying the right scope still comes back 401.

## Scenario 4: they want one dashboard, and without it the ops team is blind

**Issue type.** Observability, and it is solved on the product side.

**What I would tell the customer.** "That is exactly the /admin dashboard. One screen shows the orders with our status next to the live Whop payment status, with a flag when they disagree, the payout status with the transfer id and any hold or freeze reason, the webhook delivery with whether each event verified, processed, and errored, and an order-activity trail of every state transition with its reason and source. It is not just read-only: each order has per-row actions to re-check it against Whop, refund it (`payments.refund`), or retry a failed payment (`payments.retry`) — the resulting webhook then advances the order, so Whop stays the source of truth. There are counters across the top and a Run reconciliation button, and we emit structured JSON logs for the whole money path so it all lands in your log tooling for search and alerting."

**Internal action.** Ship /admin (service role, gated by an ADMIN_EMAILS allowlist) backed by webhook_events plus live Whop reads (payments, ledger_accounts), where the per-order refund/retry/re-check actions call Whop and the reconcile button runs the same idempotent sweep as the cron.

**Urgency.** Medium. It unblocks ops but it is not a live money incident.

**Evidence I would collect.** The dashboard itself, plus the reconciliation queue and counters.

**Escalate to engineering?** No, this is build-side. The natural follow-up is wiring the error logs into something like Slack for alerting.
