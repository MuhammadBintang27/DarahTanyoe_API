import supabase from "../config/db.js";
import { invalidate } from "./cache.js";

/**
 * Centralized cache invalidation helpers
 * Use these to avoid repeating key construction in controllers
 */

/**
 * Invalidate caches related to a blood request and its dashboards.
 * Options:
 * - includeStock: also invalidate partner stock snapshots and institution cache
 */
export async function invalidateForRequest(requestId, options = {}) {
  const { includeStock = false } = options;

  try {
    const { data: req } = await supabase
      .from("blood_requests")
      .select("requester_id, partner_id")
      .eq("id", requestId)
      .single();

    const requesterId = req?.requester_id;
    const partnerId = req?.partner_id;

    const keys = [
      `request:${requestId}`,
      requesterId ? `requests:by_requester:${requesterId}` : null,
      partnerId ? `requests:by_partner:${partnerId}` : null,
      requesterId ? `dashboard:rs:${requesterId}:summary` : null,
      requesterId ? `dashboard:rs:${requesterId}:trend:requests:30` : null,
      partnerId ? `dashboard:pmi:${partnerId}:summary` : null,
      partnerId ? `dashboard:pmi:${partnerId}:trend:requests:30` : null,
      includeStock && partnerId ? `stock:snapshot:${partnerId}` : null,
      includeStock && partnerId ? `partners:institution:${partnerId}` : null,
      includeStock ? 'partners:with_stock' : null,
    ].filter(Boolean);

    if (keys.length) await invalidate(keys);
  } catch (e) {
    console.warn('[cache] invalidateForRequest failed:', e?.message);
  }
}

/**
 * Invalidate caches related to a PMI partner's stock
 */
export async function invalidateForPartnerStock(partnerId) {
  try {
    const keys = [
      partnerId ? `stock:snapshot:${partnerId}` : null,
      partnerId ? `partners:institution:${partnerId}` : null,
      'partners:with_stock'
    ].filter(Boolean);
    if (keys.length) await invalidate(keys);
  } catch (e) {
    console.warn('[cache] invalidateForPartnerStock failed:', e?.message);
  }
}
