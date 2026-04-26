// Shared finance constants. Single source of truth so /finance/balances
// and /finance/royalties cannot silently drift apart.
export const PLATFORM_FEE_RATE = 0.15;

export const PAID_PAYOUT_STATUSES = ["approved", "completed", "paid"] as const;
export const PENDING_PAYOUT_STATUS = "pending" as const;
