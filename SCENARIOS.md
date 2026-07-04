# Written scenario answers

These are the four scenarios from the brief, and for each one I have kept the fields they asked for — the type of issue, what I would actually say back to the customer, what I would do on our side, how urgent it is, what evidence I would collect, and whether it needs to go to engineering. Wherever it helps I point at the specific piece of tooling in this app that I would genuinely reach for to work the ticket.

## Scenario 1: a buyer paid, but the order still says pending

**Issue type.** This is really a state-synchronisation question rather than an outage, and it is almost certainly not a sign that anything on Whop's side is broken.

**What I would tell the customer.** "Whop is not broken here. When a payment has been authorised but has not settled yet it sits in a pending state, and we deliberately hold the order in PROCESSING until we either receive the verified payment.succeeded webhook or read a paid status straight from the API, so it moves forward on its own. If a webhook happened to get missed along the way, our reconciliation job re-reads the payment directly from Whop and heals the order within a minute or so, so nothing stays stuck for long."

**Internal action.** I would start by opening the order in /admin, where our status sits right next to the live status and substatus pulled straight from GET /payments/{id}, with a flag raised whenever the two disagree. If Whop is telling us the payment is paid but we have not caught up yet, I would look at the webhook panel to see whether the payment.succeeded event actually arrived, whether its signature verified, and whether it finished processing, and from there I would either hit re-check on the order or run the reconciliation sweep, both of which pull the truth from Whop and move the order along.

**Urgency.** I would treat this as low to medium, because the flow self-heals on its own and only becomes genuinely urgent if money turns out to be stuck somewhere rather than simply lagging behind for a moment.

**Evidence I would collect.** I would gather the payment id, the status and substatus that Whop is reporting, our own order status together with its updated timestamp, and the matching row in webhook_events that shows whether the event verified, processed, and carried any error.

**Escalate to engineering?** I would only escalate if GET /payments clearly says the charge is paid but the payment.succeeded webhook never arrived at all, since that would point at a genuine Whop delivery problem, and in that case I would hand over the payment id alongside the delivery log.

## Scenario 2: the seller finished onboarding but still cannot withdraw

**Issue type.** This is a payout-readiness problem, and specifically a gap in KYC, because getting all the way through the onboarding form is not the same thing as being cleared to actually get paid.

**What I would tell the customer.** "Getting through the onboarding screens is not the same thing as being payout ready. A withdrawal needs the ledger's approval status to read approved and a connected payout account, with the money genuinely available rather than sitting in a pending or reserved state. One more thing worth knowing is that payouts are turned off in the Whop sandbox, so a sandbox seller will correctly sit at not-payout-ready, and that is expected behaviour rather than a bug."

**Internal action.** The first place I would look is the seller's own /seller Payout setup panel, which surfaces the live payout-account status from payout_accounts.retrieve — connected, pending_verification, action_required or not_started — alongside any attached payout methods from payout_methods.list, so I can see which of the two gates is actually failing without ever leaving the app. Beyond that I would pull GET /ledger_accounts/{biz} to read payments_approval_status and the payout-account status together with the balance split across available, pending and reserved, make sure a payout method is genuinely attached, and if KYC has not finished I would hand the seller a fresh account-links link for the payouts portal. Finally I would confirm which environment we are actually in, because the sandbox can never produce a payout-ready seller and so this ultimately has to be validated in production.

**Urgency.** I would rate this high, since it is holding up the customer's launch and there is real money waiting on the other side of it.

**Evidence I would collect.** I would collect the ledger approval status, the payout-account status, the full balance breakdown across available, pending and reserved, and the relevant KYC or payout_account.status_updated events.

**Escalate to engineering?** I would escalate to Whop only if, in production, KYC is approved and the payout account is connected and the funds are shown as available but a withdrawal still fails despite all three being in order.

## Scenario 3: a connected seller returns 401 on every API call

**Issue type.** This is an authentication problem, and in practice it is almost always an environment mix-up rather than anything to do with permissions.

**What I would tell the customer.** "A 401 is an authentication problem rather than an authorisation one, and by far the most common cause is an environment mix-up, meaning a sandbox key being sent at the production URL or the other way around, or a key that is missing, mistyped, or not carrying the Bearer prefix. If the key were valid but simply lacked the right scope you would get a 403 instead of a 401, so the status code itself already tells us where to look. As a quick heads up, I actually ran into this exact thing while building this, because the key I was first given turned out to be a production key, so it returned 401 on the sandbox and 200 on production until I swapped it out."

**Internal action.** I would start with our own /api/health endpoint, which calls accounts.me and, when it fails, tells you whether you are looking at a 401 for auth or environment or a 403 for scope, along with a short hint. From there I would confirm that WHOP_BASE_URL matches the key's environment and that the key is being sent server-side as Authorization: Bearer, and if it turned out to genuinely be a 403 I would check the key's scopes for the operation in question and regenerate the key if it had been revoked.

**Urgency.** I would treat this as high, because until it is resolved it blocks every single API call the customer tries to make.

**Evidence I would collect.** I would note the exact status code so we know whether it is a 401 or a 403, the failing request with its headers redacted, the environment the key belongs to, the API base URL it was sent to, and the specific endpoint being hit.

**Escalate to engineering?** I would only escalate if a key that is demonstrably on the correct environment, sent with the Bearer prefix, and carrying the right scope still comes back with a 401.

## Scenario 4: they want one dashboard, and without it the ops team is blind

**Issue type.** This is an observability need, and it is one we solve directly on the product side rather than something that has to go back to Whop.

**What I would tell the customer.** "That is exactly what the /admin dashboard is for. A single screen shows every order with our status set against the live Whop payment status and a flag whenever the two disagree, the payout status together with its transfer id and any hold or freeze reason, the webhook delivery showing whether each event verified, processed and errored, and a running order-activity trail of every state transition with its reason and source. It is not just something to look at either, because each order carries per-row actions to re-check it against Whop, refund it through payments.refund, or retry a failed payment through payments.retry, and since the resulting webhook is what actually advances the order, Whop stays the source of truth throughout. There are counters across the top for the numbers ops care about and a Run reconciliation button, and underneath all of it we emit structured JSON logs across the whole money path so everything also lands in your own log tooling for search and alerting."

**Internal action.** On our side this meant shipping /admin as a service-role view gated behind an ADMIN_EMAILS allowlist, backed by webhook_events together with live Whop reads of payments and ledger_accounts, where the per-order refund, retry and re-check actions call Whop directly and the reconcile button runs the very same idempotent sweep that the cron already runs on a schedule.

**Urgency.** I would call this medium, since it genuinely unblocks the ops team without being a live money incident in its own right.

**Evidence I would collect.** The main artefact here is the dashboard itself, together with the reconciliation queue and the counters that sit on top of it.

**Escalate to engineering?** No, this one is build-side, and the natural follow-up is wiring the error logs into something like Slack so the alerting side of it closes the loop.
