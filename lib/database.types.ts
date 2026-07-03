// Hand-authored to match supabase/migrations/0001_init.sql.
// On a live project, regenerate with: supabase gen types typescript --local > lib/database.types.ts

export type OrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PROCESSING"
  | "PAID"
  | "FULFILLED"
  | "SETTLED"
  | "FAILED"
  | "REFUNDED"
  | "DISPUTED";
export type KycStatus = "pending" | "approved" | "rejected";
export type ListingStatus = "draft" | "active" | "archived";
export type PayoutStatus = "pending" | "in_transit" | "completed" | "failed" | "stubbed";
export type JobStatus = "pending" | "processing" | "done" | "failed";
/** Who/what advanced an order, recorded on every order_events audit row. */
export type OrderEventSource = "webhook" | "cron" | "reconcile" | "manual";

type Timestamps = { created_at: string };
type Rel = { Relationships: [] };

export interface Database {
  public: {
    Tables: {
      sellers: {
        Row: {
          id: string;
          supabase_user_id: string;
          whop_company_id: string | null;
          email: string;
          kyc_status: KycStatus;
          payout_ready: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          supabase_user_id: string;
          whop_company_id?: string | null;
          email: string;
          kyc_status?: KycStatus;
          payout_ready?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sellers"]["Insert"]>;
      } & Rel;
      buyers: {
        Row: { id: string; supabase_user_id: string; email: string } & Timestamps;
        Insert: { id?: string; supabase_user_id: string; email: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["buyers"]["Insert"]>;
      } & Rel;
      listings: {
        Row: {
          id: string;
          seller_id: string;
          title: string;
          description: string | null;
          price_cents: number;
          currency: string;
          whop_product_id: string | null;
          whop_plan_id: string | null;
          status: ListingStatus;
        } & Timestamps;
        Insert: {
          id?: string;
          seller_id: string;
          title: string;
          description?: string | null;
          price_cents: number;
          currency?: string;
          whop_product_id?: string | null;
          whop_plan_id?: string | null;
          status?: ListingStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
      } & Rel;
      orders: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
          status: OrderStatus;
          whop_checkout_config_id: string | null;
          whop_payment_id: string | null;
          whop_membership_id: string | null;
          amount_cents: number;
          application_fee_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
          status?: OrderStatus;
          whop_checkout_config_id?: string | null;
          whop_payment_id?: string | null;
          whop_membership_id?: string | null;
          amount_cents: number;
          application_fee_cents?: number;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
      } & Rel;
      order_events: {
        Row: {
          id: string;
          order_id: string;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          reason: string;
          source: OrderEventSource;
          detail: unknown | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: OrderStatus | null;
          to_status: OrderStatus;
          reason: string;
          source: OrderEventSource;
          detail?: unknown | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_events"]["Insert"]>;
      } & Rel;
      payouts: {
        Row: {
          id: string;
          order_id: string;
          seller_id: string;
          whop_transfer_id: string | null;
          whop_withdrawal_id: string | null;
          idempotence_key: string;
          amount_cents: number;
          status: PayoutStatus;
          error_code: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          order_id: string;
          seller_id: string;
          whop_transfer_id?: string | null;
          whop_withdrawal_id?: string | null;
          idempotence_key: string;
          amount_cents: number;
          status?: PayoutStatus;
          error_code?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payouts"]["Insert"]>;
      } & Rel;
      webhook_events: {
        Row: {
          id: string;
          whop_webhook_id: string;
          event_type: string;
          payload: unknown;
          signature_verified: boolean;
          received_at: string;
          processed_at: string | null;
          process_error: string | null;
        };
        Insert: {
          id?: string;
          whop_webhook_id: string;
          event_type: string;
          payload: unknown;
          signature_verified?: boolean;
          received_at?: string;
          processed_at?: string | null;
          process_error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["webhook_events"]["Insert"]>;
      } & Rel;
      outbox_jobs: {
        Row: {
          id: string;
          kind: string;
          ref_id: string;
          run_after: string;
          attempts: number;
          last_error: string | null;
          status: JobStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          kind: string;
          ref_id: string;
          run_after?: string;
          attempts?: number;
          last_error?: string | null;
          status?: JobStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outbox_jobs"]["Insert"]>;
      } & Rel;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      order_status: OrderStatus;
      kyc_status: KycStatus;
      listing_status: ListingStatus;
      payout_status: PayoutStatus;
      job_status: JobStatus;
    };
  };
}
