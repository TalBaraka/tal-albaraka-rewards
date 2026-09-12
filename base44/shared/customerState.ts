// Shared customer-state serializer used by all prize functions.
// Computes the effective prize status (an "available" prize past its
// expiry window reads as "expired" even before the record is updated).
export function customerState(customer: any) {
  const now = Date.now();
  let prize_status = customer?.prize_status || "none";
  const expiresMs = customer?.prize_expires_at
    ? new Date(customer.prize_expires_at).getTime()
    : null;

  if (prize_status === "available" && expiresMs && now > expiresMs) {
    prize_status = "expired";
  }

  return {
    id: customer.id,
    name: customer.name,
    approved_count: customer.approved_count || 0,
    game_selected: customer.game_selected || null,
    prize_status,
    prize_awarded_at: customer.prize_awarded_at || null,
    prize_expires_at: customer.prize_expires_at || null,
    prize_used_at: customer.prize_used_at || null,
    remaining_seconds:
      prize_status === "available" && expiresMs
        ? Math.max(0, Math.floor((expiresMs - now) / 1000))
        : 0
  };
}