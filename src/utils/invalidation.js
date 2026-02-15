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

    // Years to invalidate (current year and previous years) 
    const currentYear = new Date().getFullYear();
    const yearsToInvalidate = [currentYear, currentYear - 1, currentYear - 2];

    const keys = [
      `request:${requestId}`,
      requesterId ? `requests:by_requester:${requesterId}` : null,
      partnerId ? `requests:by_partner:${partnerId}` : null,
      requesterId ? `dashboard:rs:${requesterId}:summary` : null,
      requesterId ? `dashboard:rs:${requesterId}:trend:requests:30` : null,
      requesterId ? `dashboard:rs:${requesterId}:charts` : null,
      partnerId ? `dashboard:pmi:${partnerId}:summary` : null,
      partnerId ? `dashboard:pmi:${partnerId}:trend:requests:30` : null,
      partnerId ? `dashboard:pmi:${partnerId}:charts` : null,
      // Year-specific chart caches
      ...yearsToInvalidate.flatMap(year => [
        requesterId ? `dashboard:rs:${requesterId}:charts:${year}` : null,
        partnerId ? `dashboard:pmi:${partnerId}:charts:${year}` : null,
      ]).filter(Boolean),
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

/**
 * Invalidate all chart caches for an institution (including year-specific ones)
 * Use this when you want to clear all chart data for a hospital/PMI
 */
export async function invalidateChartsForInstitution(institutionId, institutionType = 'rs') {
  try {
    const prefix = institutionType === 'pmi' ? 'dashboard:pmi' : 'dashboard:rs';
    
    // Base chart cache
    const baseKey = `${prefix}:${institutionId}:charts`;
    
    // Year-specific chart caches (clear more years for thorough cleanup)
    const currentYear = new Date().getFullYear();
    const yearsToInvalidate = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
    
    const keys = [
      baseKey,
      ...yearsToInvalidate.map(year => `${baseKey}:${year}`)
    ];
    
    await invalidate(keys);
    console.log(`[cache] Invalidated ${keys.length} chart caches for ${institutionType} ${institutionId}`);
  } catch (e) {
    console.warn('[cache] invalidateChartsForInstitution failed:', e?.message);
  }
}
