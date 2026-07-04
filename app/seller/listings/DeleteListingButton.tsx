"use client";

import { btn } from "@/components/ui";
import { deleteListing } from "./actions";

/** Small delete control with a confirm guard, posts to the deleteListing action. */
export function DeleteListingButton({ listingId, title }: { listingId: string; title: string }) {
  return (
    <form
      action={deleteListing}
      onSubmit={(e) => {
        if (!confirm(`Delete "${title}"? This removes it from the marketplace and Whop.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="listing_id" value={listingId} />
      <button className={btn("danger", "px-3 py-1.5 text-xs")}>Delete</button>
    </form>
  );
}
