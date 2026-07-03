import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Container, Card, StatusBadge, btn } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CheckoutReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orderId } = await params;
  const { status } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, amount_cents")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) notFound();

  const failed = status === "error";

  return (
    <Container size="sm" className="py-16">
      <Card>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
          style={{ background: failed ? "#fee2e2" : "#dcfce7" }}
        >
          {failed ? "✕" : "✓"}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {failed ? "Payment not completed" : "Payment submitted"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {failed
            ? "The checkout reported an error. You can try again from the listing."
            : "We're confirming your payment with Whop. Your order is marked PAID only after the verified payment.succeeded webhook — never from this redirect alone."}
        </p>

        <div className="mt-5 flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-sm">
          <span className="font-mono text-muted">{order.id.slice(0, 8)}</span>
          <StatusBadge status={order.status} />
        </div>

        <div className="mt-5 flex gap-2">
          <Link href="/orders" className={btn("dark", "flex-1")}>
            View my orders
          </Link>
          <Link href="/marketplace" className={btn("outline", "flex-1")}>
            Keep browsing
          </Link>
        </div>
      </Card>
    </Container>
  );
}
