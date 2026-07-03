/**
 * Structured JSON logger for the money paths (webhooks, orders, payouts, cron).
 *
 * Why this exists: everything downstream (Vercel log drains, Datadog, BetterStack,
 * `vercel logs`, `supabase` logs) can ingest one-line JSON on stdout/stderr. Before
 * this, the app persisted final state to the DB but emitted NO application logs —
 * so ops could see *what* an order/payout/webhook is, but never *why* it got there
 * or how long it took. Every log line carries structured fields (order_id,
 * payment_id, webhook_id, event_type, latency_ms, err) so they're greppable and
 * correlatable across a single payment's lifecycle.
 *
 * Runtime-agnostic: only uses console + process.env, so it's safe from route
 * handlers, server actions, server components, and the cron.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** LOG_LEVEL gates output (default "info"). Set LOG_LEVEL=debug for verbose tracing. */
const threshold = RANK[(process.env.LOG_LEVEL as LogLevel) ?? "info"] ?? RANK.info;

/** Deployment environment tag, so prod/preview/dev lines are distinguishable. */
const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

type Fields = Record<string, unknown>;

/**
 * Normalize a thrown value into flat, greppable fields. An `err` field anywhere in
 * a log call is expanded into err/err_name/err_status rather than dumped as an
 * opaque object (so a Whop APIError's HTTP status survives into the log).
 */
export function errFields(e: unknown): Fields {
  if (e instanceof Error) {
    const status = (e as { status?: number }).status;
    return {
      err: e.message,
      err_name: e.name,
      ...(typeof status === "number" ? { err_status: status } : {}),
    };
  }
  return { err: String(e) };
}

function normalize(fields: Fields): Fields {
  if ("err" in fields && !(typeof fields.err === "string")) {
    const { err, ...rest } = fields;
    return { ...rest, ...errFields(err) };
  }
  return fields;
}

function emit(level: LogLevel, msg: string, bindings: Fields, fields: Fields) {
  if (RANK[level] < threshold) return;
  const rec = {
    level,
    msg,
    time: new Date().toISOString(),
    env: ENV,
    ...bindings,
    ...normalize(fields),
  };
  const line = JSON.stringify(rec);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  /** Return a logger that stamps every line with `bindings` (e.g. a webhook_id). */
  child(bindings: Fields): Logger;
}

function make(bindings: Fields): Logger {
  return {
    debug: (msg, fields = {}) => emit("debug", msg, bindings, fields),
    info: (msg, fields = {}) => emit("info", msg, bindings, fields),
    warn: (msg, fields = {}) => emit("warn", msg, bindings, fields),
    error: (msg, fields = {}) => emit("error", msg, bindings, fields),
    child: (extra) => make({ ...bindings, ...extra }),
  };
}

export const log = make({ service: "creatorjobs" });
