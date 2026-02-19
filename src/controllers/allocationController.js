import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import notificationService from "../services/notificationService.js";
import { invalidate } from "../utils/cache.js";
import { invalidateForRequest, invalidateForPartnerStock } from "../utils/invalidation.js";

/**
 * Get available blood for a specific blood request (for pickup scheduling)
 * Uses RPC function: get_available_blood_for_request()
 */
const getAvailableBloodForRequest = async (req, res) => {
  const { blood_request_id } = req.params;

  try {
    if (!blood_request_id) {
      return response.sendBadRequest(res, "blood_request_id is required");
    }


    // Get blood request details first
    const { data: request, error: requestError } = await supabase
      .from("blood_requests")
      .select("id, blood_type, quantity, status")
      .eq("id", blood_request_id)
      .single();

    if (requestError || !request) {
      return response.sendNotFound(res, "Blood request not found");
    }

    // Call RPC function to get available blood
    const { data: availableBlood, error: rpcError } = await supabase
      .rpc('get_available_blood_for_request', {
        p_request_id: blood_request_id,
        p_blood_type: request.blood_type
      });

    if (rpcError) {
      console.error("❌ RPC Error:", rpcError);
      return response.sendBadRequest(res, rpcError.message);
    }


    // Calculate summary
    const totalAvailable = availableBlood?.reduce((sum, b) => sum + b.quantity_available, 0) || 0;
    const totalNeeded = request.quantity;
    const pending = Math.max(0, totalNeeded - totalAvailable);

    return response.sendSuccess(res, {
      message: "Berhasil memuat darah yang tersedia",
      data: {
        request: {
          id: request.id,
          blood_type: request.blood_type,
          quantity_needed: totalNeeded,
          quantity_available: totalAvailable,
          quantity_pending: pending,
          status: request.status
        },
        allocations: availableBlood.map(b => ({
          allocation_id: b.stock_id,
          quantity_available: b.quantity_available,
          fulfillment_id: b.fulfillment_id,
          batch_number: b.batch_number,
          expiry_date: b.expiry_date
        })),
        summary: {
          total_allocations: availableBlood?.length || 0,
          total_available: totalAvailable,
          total_needed: totalNeeded,
          can_complete_pickup: totalAvailable >= totalNeeded,
          pending_quantity: pending
        }
      }
    });
  } catch (error) {
    console.error("❌ Error getting available blood:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get pending pickups for a blood request
 * Uses RPC function: get_pending_pickup_for_request()
 */
const getPendingPickupsForRequest = async (req, res) => {
  const { blood_request_id } = req.params;

  try {
    if (!blood_request_id) {
      return response.sendBadRequest(res, "blood_request_id is required");
    }

    console.log(`🔍 getPendingPickupsForRequest: request_id=${blood_request_id}`);

    // Call RPC function
    const { data: pendingPickups, error: rpcError } = await supabase
      .rpc('get_pending_pickup_for_request', {
        p_request_id: blood_request_id
      });

    if (rpcError) {
      console.error("❌ RPC Error:", rpcError);
      return response.sendBadRequest(res, rpcError.message);
    }

    const totalPending = pendingPickups?.reduce((sum, p) => sum + p.quantity_pending, 0) || 0;

    return response.sendSuccess(res, {
      message: "Berhasil memuat daftar pickup yang menunggu",
      data: {
        pending_pickups: pendingPickups.map(p => ({
          allocation_id: p.allocation_id,
          quantity_pending: p.quantity_pending,
          fulfillment_id: p.fulfillment_id,
          batch_number: p.batch_number
        })),
        summary: {
          total_pending_allocations: pendingPickups?.length || 0,
          total_pending_quantity: totalPending
        }
      }
    });
  } catch (error) {
    console.error("❌ Error getting pending pickups:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Confirm pickup for an allocation
 * Updates allocation status and quantity_picked_up
 * Uses RPC function: complete_allocation_pickup()
 */
/**
 * Cancel an allocation
 * Uses RPC function: cancel_allocation()
 */
const cancelAllocation = async (req, res) => {
  const { allocation_id } = req.params;
  const { reason } = req.body;

  try {
    if (!allocation_id) {
      return response.sendBadRequest(res, "allocation_id is required");
    }

    console.log(`❌ cancelAllocation: allocation=${allocation_id}, reason=${reason}`);

    // Get allocation details
    const { data: allocation, error: fetchError } = await supabase
      .from("blood_allocation")
      .select("*")
      .eq("id", allocation_id)
      .single();

    if (fetchError || !allocation) {
      return response.sendNotFound(res, "Allocation not found");
    }

    // Check if already cancelled or picked up
    if (allocation.status === "cancelled") {
      return response.sendBadRequest(res, "Allocation already cancelled");
    }

    if (allocation.status === "picked_up") {
      return response.sendBadRequest(res, "Cannot cancel allocation that is already picked up");
    }

    // Call RPC function to cancel
    const { data: result, error: rpcError } = await supabase
      .rpc('cancel_allocation', {
        p_allocation_id: allocation_id,
        p_reason: reason || null
      });

    if (rpcError) {
      console.error("❌ RPC Error:", rpcError);
      return response.sendBadRequest(res, rpcError.message);
    }

    // Get updated allocation
    const { data: cancelled } = await supabase
      .from("blood_allocation")
      .select("*")
      .eq("id", allocation_id)
      .single();

    console.log(`✅ Allocation cancelled:`, {
      id: allocation_id,
      status: cancelled.status,
      reason: cancelled.cancellation_reason
    });

    return response.sendSuccess(res, {
      message: "Alokasi berhasil dibatalkan",
      data: {
        allocation: {
          id: cancelled.id,
          status: cancelled.status,
          cancellation_reason: cancelled.cancellation_reason,
          cancelled_at: cancelled.cancelled_at
        }
      }
    });
  } catch (error) {
    console.error("❌ Error cancelling allocation:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get allocation history for a blood request
 * Shows all allocations (active, picked up, cancelled, expired)
 */
const getAllocationHistoryForRequest = async (req, res) => {
  const { blood_request_id } = req.params;

  try {
    if (!blood_request_id) {
      return response.sendBadRequest(res, "blood_request_id is required");
    }

    console.log(`📋 getAllocationHistoryForRequest: request_id=${blood_request_id}`);

    const { data: allocations, error: queryError } = await supabase
      .from("blood_allocation")
      .select(`
        *,
        blood_stock:blood_stock(
          id,
          batch_number,
          blood_type,
          expiry_date,
          quantity,
          status
        ),
        fulfillment_request:fulfillment_requests(
          id,
          patient_name,
          blood_type
        )
      `)
      .eq("blood_request_id", blood_request_id)
      .order("allocated_at", { ascending: false });

    if (queryError) {
      return response.sendBadRequest(res, queryError.message);
    }

    // Summarize by status
    const summary = {
      total_allocated: 0,
      total_picked_up: 0,
      total_pending: 0,
      total_cancelled: 0,
      total_expired: 0,
      by_status: {}
    };

    allocations.forEach(alloc => {
      summary.total_allocated += alloc.quantity_allocated;
      summary.total_picked_up += alloc.quantity_picked_up;
      summary.total_pending += Math.max(0, alloc.quantity_allocated - alloc.quantity_picked_up);

      if (alloc.status === "cancelled") summary.total_cancelled += alloc.quantity_allocated;
      if (alloc.status === "expired") summary.total_expired += alloc.quantity_allocated;

      if (!summary.by_status[alloc.status]) {
        summary.by_status[alloc.status] = 0;
      }
      summary.by_status[alloc.status]++;
    });

    return response.sendSuccess(res, {
      message: "Riwayat alokasi berhasil dimuat",
      data: {
        allocations: allocations.map(a => ({
          id: a.id,
          quantity_allocated: a.quantity_allocated,
          quantity_picked_up: a.quantity_picked_up,
          quantity_pending: a.quantity_allocated - a.quantity_picked_up,
          status: a.status,
          batch_number: a.blood_stock.batch_number,
          expiry_date: a.blood_stock.expiry_date,
          fulfillment_patient: a.fulfillment_request?.patient_name,
          allocated_at: a.allocated_at,
          picked_up_at: a.picked_up_at,
          cancelled_at: a.cancelled_at
        })),
        summary
      }
    });
  } catch (error) {
    console.error("❌ Error getting allocation history:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get blood with free stock option (flexible source)
 * Returns both allocated blood + free stock that can be used together
 * Used for pickup scheduling when multiple sources are available
 */
const getBloodWithFreeStock = async (req, res) => {
  const { blood_request_id } = req.params;

  try {
    if (!blood_request_id) {
      return response.sendBadRequest(res, "blood_request_id is required");
    }

    console.log(`🔍 getBloodWithFreeStock: request_id=${blood_request_id}`);

    // Get blood request details and PMI info
    const { data: request, error: requestError } = await supabase
      .from("blood_requests")
      .select("id, blood_type, component_type, quantity, status, requester_id, partner_id")
      .eq("id", blood_request_id)
      .single();

    if (requestError || !request) {
      console.error("❌ Request Error:", requestError);
      return response.sendNotFound(res, "Blood request not found");
    }

    // Determine PMI - either partner_id (hospital requests) or requester_id (PMI internal requests)
    const pmiId = request.partner_id || request.requester_id;
    if (!pmiId) {
      return response.sendBadRequest(res, "Cannot determine PMI for this request");
    }

    console.log(`📍 PMI for this request: ${pmiId}`);
    console.log(`🩸 Request requires: ${request.blood_type} ${request.component_type || 'WB'}`);

    // Default to WB if component_type not specified (backward compatibility)
    const requiredComponentType = request.component_type || 'WB';

    // ✅ OPTIMIZED: Fetch allocated blood and free stock in parallel
    const [
      { data: allocatedBlood, error: allocError },
      { data: freeStock, error: stockError }
    ] = await Promise.all([
      // Get allocated blood (both allocated and partial_pickup status) - FROM ALL REQUESTS in this PMI
      supabase
        .from("blood_allocation")
        .select(`
          id,
          blood_request_id,
          quantity_allocated,
          quantity_picked_up,
          blood_stock!blood_allocation_blood_stock_id_fkey(
            id,
            batch_number,
            blood_type,
            component_type,
            expiry_date,
            quantity,
            status,
            institution_id
          ),
          fulfillment_request:fulfillment_requests(
            id,
            patient_name,
            blood_type
          )
        `)
        .eq("blood_stock.institution_id", pmiId)
        .eq("blood_stock.blood_type", request.blood_type)
        .eq("blood_stock.component_type", requiredComponentType)
        .in("status", ["allocated", "partial_pickup"]),
      
      // Get free stock (not in allocation, correct blood type + component type, available status, from correct PMI)
      supabase
        .from("blood_stock")
        .select(`
          id,
          batch_number,
          blood_type,
          component_type,
          expiry_date,
          quantity,
          institution_id,
          donation_id,
          created_at
        `)
        .eq("blood_type", request.blood_type)
        .eq("component_type", requiredComponentType)
        .eq("status", "available")
        .eq("institution_id", pmiId)
    ]);

    if (allocError) {
      console.error("❌ Error fetching allocations:", allocError);
      return response.sendBadRequest(res, allocError.message);
    }

    if (stockError) {
      console.error("❌ Error fetching free stock:", stockError);
      return response.sendBadRequest(res, stockError.message);
    }

    // ✅ DEBUG: Log allocation details  
    console.log(`📊 Total allocations in PMI ${pmiId}:`, allocatedBlood?.length || 0);
    
    allocatedBlood?.forEach(a => {
      console.log(`   - Allocation ${a.id} (request: ${a.blood_request_id}):`);
      console.log(`     quantity_allocated: ${a.quantity_allocated}`);
      console.log(`     quantity_picked_up: ${a.quantity_picked_up}`);
      console.log(`     quantity_pending: ${a.quantity_allocated - a.quantity_picked_up}`);
      console.log(`     blood_stock_id: ${a.blood_stock.id}`);
      console.log(`     blood_stock.quantity: ${a.blood_stock.quantity}`);
      console.log(`     blood_stock.status: ${a.blood_stock.status}`);
    });

    // Calculate used stock IDs from allocations
    const usedStockIds = (allocatedBlood || []).map(a => a.blood_stock.id);

    console.log(`🔍 Used Stock IDs from allocations:`, usedStockIds);
    console.log(`📊 Total available stock in blood_stock:`, freeStock?.length || 0);
    console.log(`📊 All available stock in PMI ${pmiId}:`);
    freeStock?.forEach(s => {
      console.log(`   - Stock ${s.id}: ${s.quantity} kantong, batch: ${s.batch_number}, status: available`);
    });

    // Filter out stocks that are already allocated
    const availableFreeStock = (freeStock || []).filter(
      s => {
        const isAllocated = usedStockIds.includes(s.id);
        console.log(`   - Stock ${s.id} (${s.quantity} kantong): ${isAllocated ? 'ALLOCATED' : 'FREE'}`);
        return !isAllocated;
      }
    );

    // ✅ DEBUG: Log free stock details
    console.log(`📊 Free stock from PMI ${pmiId}:`, availableFreeStock?.length || 0);
    availableFreeStock?.forEach(s => {
      console.log(`   ✅ Free stock ${s.id}: ${s.quantity} kantong, batch: ${s.batch_number}`);
    });

    // Calculate summary
    // totalAllocated = only for THIS request
    const allocationsForThisRequest = allocatedBlood?.filter(a => a.blood_request_id === blood_request_id) || [];
    const totalAllocated = allocationsForThisRequest.reduce(
      (sum, a) => sum + (a.quantity_allocated - a.quantity_picked_up),
      0
    ) || 0;

    const totalFreeStock = availableFreeStock?.reduce(
      (sum, s) => sum + s.quantity,
      0
    ) || 0;

    const totalAvailable = totalAllocated + totalFreeStock;
    const quantityNeeded = request.quantity;
    const canComplete = totalAvailable >= quantityNeeded;

    console.log(`✅ Blood sources found:`, {
      request_id: blood_request_id,
      allocations_for_this_request: allocationsForThisRequest.length,
      total_allocations_in_pmi: allocatedBlood?.length || 0,
      from_allocation: totalAllocated,
      from_free_stock: totalFreeStock,
      total_available: totalAvailable,
      needed: quantityNeeded,
      can_complete: canComplete
    });

    console.log(`📊 Allocations for THIS request:`, allocationsForThisRequest.length);
    allocationsForThisRequest.forEach(a => {
      console.log(`  - Allocation ${a.id}: ${a.quantity_allocated - a.quantity_picked_up} available (patient: ${a.fulfillment_request?.patient_name})`);
    });

    return response.sendSuccess(res, {
      message: "Berhasil memuat data darah dan stok bebas",
      data: {
        request: {
          id: request.id,
          blood_type: request.blood_type,
          component_type: requiredComponentType,
          quantity_needed: quantityNeeded,
          status: request.status
        },
        allocations: allocationsForThisRequest.map(a => ({
          allocation_id: a.id,
          quantity_allocated: a.quantity_allocated,
          quantity_picked_up: a.quantity_picked_up,
          quantity_pending: a.quantity_allocated - a.quantity_picked_up,
          batch_number: a.blood_stock.batch_number,
          expiry_date: a.blood_stock.expiry_date,
          fulfillment_patient: a.fulfillment_request?.patient_name,
          source: "allocation",
          warning: null
        })),
        free_stock: (availableFreeStock || []).map(s => ({
          stock_id: s.id,
          quantity: s.quantity,
          batch_number: s.batch_number,
          expiry_date: s.expiry_date,
          source: "free_stock",
          warning: "Stok ini belum dialokasikan. Akan dipakai untuk request ini jika diambil."
        })),
        summary: {
          total_from_allocation: totalAllocated,
          total_from_free_stock: totalFreeStock,
          total_available: totalAvailable,
          quantity_needed: quantityNeeded,
          allocation_count: allocatedBlood?.length || 0,
          free_stock_count: availableFreeStock?.length || 0,
          can_complete_pickup: canComplete,
          note: canComplete 
            ? "Kedua sumber akan diambil secara bersamaan untuk melengkapi kebutuhan darah."
            : `Masih kurang ${quantityNeeded - totalAvailable} unit darah.`
        }
      }
    });

  } catch (error) {
    console.error("❌ Error getting blood with free stock:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Confirm pickup with both allocated + free stock
 * Creates single pickup_schedule for all sources
 * Updates allocations + blood_stock status
 */
const confirmPickupWithFreeStock = async (req, res) => {
  const { blood_request_id } = req.params;
  const { 
    pickupDate, 
    pickupTime,
    notes,        // Catatan dari PMI untuk rumah sakit
    allocations,  // Array of { allocation_id, quantity_picked_up }
    free_stock    // Array of { stock_id, quantity_picked_up }
  } = req.body;

  try {
    // Validate inputs
    if (!blood_request_id || !pickupDate || !pickupTime) {
      return response.sendBadRequest(res, 
        "blood_request_id, pickupDate, and pickupTime are required");
    }

    if (!Array.isArray(allocations) || !Array.isArray(free_stock)) {
      return response.sendBadRequest(res, 
        "allocations and free_stock must be arrays");
    }

    console.log(`📦 confirmPickupWithFreeStock:`, {
      request_id: blood_request_id,
      allocations: allocations.length,
      free_stock: free_stock.length,
      pickup_date: pickupDate,
      allocations_detail: allocations,
      free_stock_detail: free_stock
    });

    // Get request details
    const { data: request, error: requestError } = await supabase
      .from("blood_requests")
      .select("id, blood_type, quantity, requester_id")
      .eq("id", blood_request_id)
      .single();

    if (requestError || !request) {
      console.error("❌ Request not found:", requestError);
      return response.sendNotFound(res, "Blood request not found");
    }
    
    console.log(`✅ Request found:`, {
      id: request.id,
      blood_type: request.blood_type,
      quantity_needed: request.quantity
    });

    // Validate allocation inputs
    for (const alloc of allocations) {
      if (!alloc.allocation_id || !alloc.quantity_picked_up || alloc.quantity_picked_up <= 0) {
        return response.sendBadRequest(res, 
          "Each allocation must have allocation_id and quantity_picked_up > 0");
      }
    }

    // Validate free_stock inputs
    for (const stock of free_stock) {
      if (!stock.stock_id || !stock.quantity_picked_up || stock.quantity_picked_up <= 0) {
        return response.sendBadRequest(res, 
          "Each free_stock must have stock_id and quantity_picked_up > 0");
      }
    }

    // Calculate totals
    const totalFromAllocations = allocations.reduce(
      (sum, a) => sum + a.quantity_picked_up, 0
    );
    const totalFromFreeStock = free_stock.reduce(
      (sum, s) => sum + s.quantity_picked_up, 0
    );
    const grandTotal = totalFromAllocations + totalFromFreeStock;

    if (grandTotal < request.quantity) {
      return response.sendBadRequest(res, 
        `Total pickup (${grandTotal}) must be at least ${request.quantity}`);
    }

    console.log(`📊 Pickup summary:`, {
      from_allocations: totalFromAllocations,
      from_free_stock: totalFromFreeStock,
      total: grandTotal,
      needed: request.quantity
    });

    // Create pickup_schedule
    // Generate unique code
    let uniqueCode;
    let codeExists = true;
    
    const generateUniqueCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };
    
    while (codeExists) {
      uniqueCode = generateUniqueCode();
      const { data: existingCode } = await supabase
        .from('pickup_schedules')
        .select('id')
        .eq('unique_code', uniqueCode)
        .maybeSingle();
      
      codeExists = !!existingCode;
    }
    
    // Get hospital and PMI info for pickup location
    const { data: hospital } = await supabase
      .from("institutions")
      .select("id, institution_name, address")
      .eq("id", request.requester_id)
      .single();
    
    if (!hospital) {
      console.error("❌ Hospital not found for requester_id:", request.requester_id);
      return response.sendBadRequest(res, "Hospital information not found");
    }
    
    // Get the PMI (from allocation if exists, otherwise from free_stock)
    let pmiId;
    
    if (allocations.length > 0) {
      // Get PMI from allocation
      const { data: pmiData } = await supabase
        .from("blood_allocation")
        .select("blood_stock(institution_id)")
        .eq("id", allocations[0].allocation_id)
        .single();
      
      if (!pmiData?.blood_stock?.institution_id) {
        console.error("❌ PMI not found for allocation:", allocations[0].allocation_id);
        return response.sendBadRequest(res, "PMI information not found");
      }
      
      pmiId = pmiData.blood_stock.institution_id;
    } else if (free_stock.length > 0) {
      // Get PMI from free_stock
      const { data: stockData } = await supabase
        .from("blood_stock")
        .select("institution_id")
        .eq("id", free_stock[0].stock_id)
        .single();
      
      if (!stockData?.institution_id) {
        console.error("❌ PMI not found for free_stock:", free_stock[0].stock_id);
        return response.sendBadRequest(res, "PMI information not found");
      }
      
      pmiId = stockData.institution_id;
    } else {
      return response.sendBadRequest(res, "Must have at least allocation or free_stock");
    }
    const hospitalId = hospital.id;
    const pickupLocation = hospital.institution_name || hospital.address || "Hospital Location";

    // Prepare notes with sample instruction
    const sampleInstruction = `
⚠️ INSTRUKSI PENTING:
• Bawa SAMPEL DARAH PASIEN untuk uji cross-match
• PMI akan verifikasi sample sebelum menyerahkan darah
• Bawa identitas pasien dan surat rujukan
${notes ? '\nCatatan PMI:\n' + notes : ''}`.trim();

    console.log(`📍 Creating pickup schedule with:`, {
      unique_code: uniqueCode,
      pmi_id: pmiId,
      hospital_id: hospitalId,
      pickup_location: pickupLocation
    });

    const { data: pickupSchedule, error: scheduleError } = await supabase
      .from("pickup_schedules")
      .insert({
        request_id: blood_request_id,
        pmi_id: pmiId,
        hospital_id: hospitalId,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
        pickup_location: pickupLocation,
        unique_code: uniqueCode,
        status: "scheduled",
        notes: sampleInstruction
      })
      .select("id")
      .single();

    if (scheduleError || !pickupSchedule) {
      console.error("❌ Error creating pickup schedule:", scheduleError);
      console.error("Schedule error details:", {
        column_error: scheduleError?.message,
        inserted_data: {
          request_id: blood_request_id,
          pmi_id: pmiId,
          hospital_id: hospitalId,
          pickup_date: pickupDate,
          pickup_time: pickupTime,
          pickup_location: pickupLocation
        }
      });
      return response.sendBadRequest(res, "Failed to create pickup schedule");
    }

    console.log(`✅ Pickup schedule created:`, {
      id: pickupSchedule.id,
      pickup_code: uniqueCode,
      from_allocation: totalFromAllocations,
      from_free_stock: totalFromFreeStock,
      total: grandTotal
    });

    // If there is a fulfillment/campaign for this request, mark fulfillment as fulfilled
    try {
      const { data: fr } = await supabase
        .from('fulfillment_requests')
        .select('id, campaign_id')
        .eq('blood_request_id', blood_request_id)
        .single();

      if (fr?.id) {
        await supabase
          .from('fulfillment_requests')
          .update({
            status: 'fulfilled',
            quantity_collected: Math.min(grandTotal, request.quantity),
            updated_at: new Date().toISOString()
          })
          .eq('id', fr.id);
      }
      // Note: Campaign completion happens on pickup confirmation.
    } catch (e) {
      console.warn('⚠️ Could not complete fulfillment/campaign on pickup creation:', e?.message);
    }

    // ✅ OPTIMIZED: Pre-fetch all allocation data before processing
    const allocationIds = allocations.map(a => a.allocation_id);
    const { data: allocsBefore } = await supabase
      .from("blood_allocation")
      .select("id, quantity_allocated, quantity_picked_up, blood_stock_id, status, blood_stock:blood_stock(id, institution_id, blood_type)")
      .in("id", allocationIds);

    // Create a map for quick lookup
    const allocsBeforeMap = new Map(allocsBefore?.map(a => [a.id, a]) || []);

    // ✅ OPTIMIZED: Update all allocations in parallel
    const allocationUpdatePromises = allocations.map(async (alloc) => {
      const allocBefore = allocsBeforeMap.get(alloc.allocation_id);
      
      console.log(`📊 Allocation state BEFORE pickup:`, {
        allocation_id: alloc.allocation_id,
        quantity_allocated: allocBefore?.quantity_allocated,
        quantity_picked_up: allocBefore?.quantity_picked_up,
        quantity_pending: allocBefore ? (allocBefore.quantity_allocated - allocBefore.quantity_picked_up) : null,
        status: allocBefore?.status,
        trying_to_pick: alloc.quantity_picked_up
      });

      const { error: updateError } = await supabase
        .rpc('complete_allocation_pickup', {
          p_allocation_id: alloc.allocation_id,
          p_quantity_picked_up: alloc.quantity_picked_up
        });

      if (updateError) {
        console.error(`❌ Error updating allocation ${alloc.allocation_id}:`, updateError);
        throw updateError;
      }

      return {
        allocation_id: alloc.allocation_id,
        success: true,
        blood_stock: allocBefore?.blood_stock,
        quantity_picked_up: alloc.quantity_picked_up,
        quantity_allocated: allocBefore?.quantity_allocated
      };
    });

    const allocationUpdates = await Promise.all(allocationUpdatePromises);

    // ✅ OPTIMIZED: Get updated stock statuses in batch
    const stockIds = allocationUpdates.map(u => u.blood_stock?.id).filter(Boolean);
    const { data: updatedStocks } = await supabase
      .from("blood_stock")
      .select("id, status")
      .in("id", stockIds);
    
    const stockStatusMap = new Map(updatedStocks?.map(s => [s.id, s.status]) || []);

    // ✅ OPTIMIZED: Batch insert history records
    const historyRecords = allocationUpdates
      .filter(update => {
        const stockId = update.blood_stock?.id;
        return stockId && stockStatusMap.get(stockId) === 'used';
      })
      .map(update => ({
        institution_id: update.blood_stock.institution_id,
        blood_type: update.blood_stock.blood_type,
        change_type: "used",
        quantity_change: update.quantity_picked_up,
        previous_quantity: update.quantity_allocated || 0,
        new_quantity: (update.quantity_allocated || 0) - update.quantity_picked_up,
        notes: `Allocation di-pickup dan dikonfirmasi dengan kode unik untuk request #${blood_request_id.substring(0, 8)}`,
        created_by: update.blood_stock.institution_id
      }));

    if (historyRecords.length > 0) {
      const { error: historyError } = await supabase
        .from("blood_stock_history")
        .insert(historyRecords);

      if (historyError) {
        console.error(`❌ Error batch inserting allocation history:`, historyError);
      } else {
        console.log(`✅ ${historyRecords.length} allocation history records inserted`);
      }
    }

    console.log(`✅ ${allocationUpdates.length} allocations updated`);

    // ✅ OPTIMIZED: Pre-fetch all free stock data before processing
    const freeStockIds = free_stock.map(s => s.stock_id);
    const { data: stocksBefore } = await supabase
      .from("blood_stock")
      .select("id, quantity, status, institution_id")
      .in("id", freeStockIds);

    const stocksBeforeMap = new Map(stocksBefore?.map(s => [s.id, s]) || []);

    // ✅ OPTIMIZED: Update all free stocks in parallel
    const freeStockUpdatePromises = free_stock.map(async (stock) => {
      const stockBefore = stocksBeforeMap.get(stock.stock_id);

      console.log(`📊 Free stock before update:`, {
        stock_id: stock.stock_id,
        quantity_before: stockBefore?.quantity,
        quantity_to_pick_up: stock.quantity_picked_up
      });

      // Calculate new quantity after pickup
      const newQuantity = Math.max(0, (stockBefore?.quantity || 0) - stock.quantity_picked_up);
      const newStatus = newQuantity === 0 ? "used" : "available";

      const { data: updated, error: updateError } = await supabase
        .from("blood_stock")
        .update({ 
          quantity: newQuantity,
          status: newStatus,
          used_for: `Blood Request #${blood_request_id.substring(0, 8)}`,
          used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", stock.stock_id)
        .select("id, quantity, status")
        .single();

      if (updateError) {
        console.error(`❌ Error updating free stock ${stock.stock_id}:`, updateError);
        throw updateError;
      }

      console.log(`📊 Free stock after update:`, {
        stock_id: stock.stock_id,
        quantity_after: updated?.quantity,
        status_after: updated?.status
      });

      return {
        stock_id: stock.stock_id,
        success: true,
        institution_id: stockBefore?.institution_id,
        quantity_before: stockBefore?.quantity || 0,
        quantity_change: stock.quantity_picked_up,
        new_quantity: newQuantity
      };
    });

    const freeStockUpdates = await Promise.all(freeStockUpdatePromises);

    // ✅ OPTIMIZED: Batch insert free stock history records
    const freeStockHistoryRecords = freeStockUpdates.map(update => ({
      institution_id: update.institution_id,
      blood_type: request.blood_type,
      change_type: "used",
      quantity_change: update.quantity_change,
      previous_quantity: update.quantity_before,
      new_quantity: update.new_quantity,
      notes: `Free stock digunakan untuk blood request #${blood_request_id.substring(0, 8)} - Pickup jadwal: ${pickupDate}`,
      created_by: update.institution_id
    }));

    if (freeStockHistoryRecords.length > 0) {
      const { error: historyError } = await supabase
        .from("blood_stock_history")
        .insert(freeStockHistoryRecords);

      if (historyError) {
        console.error(`❌ Error batch inserting free stock history:`, historyError);
      } else {
        console.log(`✅ ${freeStockHistoryRecords.length} free stock history records inserted`);
      }
    }

    console.log(`✅ ${freeStockUpdates.length} free stocks marked as used`);

    // Update blood request status to 'pickup_scheduled' (pickup schedule created)
    const { data: requestData } = await supabase
      .from("blood_requests")
      .select("quantity")
      .eq("id", blood_request_id)
      .single();

    if (requestData && grandTotal >= requestData.quantity) {
      await supabase
        .from("blood_requests")
        .update({ 
          status: "pickup_scheduled",
          updated_at: new Date().toISOString()
        })
        .eq("id", blood_request_id);

      console.log(`✅ Blood request marked as PICKUP_SCHEDULED`);

      // Send notification with sample instruction
      try {
        if (request.requester_id) {
          await notificationService.notify({
            institutionId: request.requester_id,
            type: "request",
            title: "Darah Siap Diambil!",
            message: `Darah ${request.blood_type} telah disiapkan (${grandTotal} unit). Jadwal pickup: ${pickupDate} jam ${pickupTime}. ⚠️ PENTING: Bawa sampel darah pasien untuk uji cross-match saat pickup.`,
            priority: "high",
            relatedId: blood_request_id,
            relatedType: "blood_request"
          });
        }
      } catch (notifError) {
        console.error("⚠️ Failed to send notification:", notifError);
      }
    }

    // Invalidate related caches via centralized helpers
    await invalidateForRequest(blood_request_id, { includeStock: true });
    if (pmiId) await invalidateForPartnerStock(pmiId);

    return response.sendSuccess(res, {
      message: "Pickup dengan sumber gabungan berhasil dikonfirmasi",
      data: {
        pickup_schedule: {
          id: pickupSchedule.id,
          pickup_code: uniqueCode,
          pickup_date: pickupDate,
          pickup_time: pickupTime,
          total_quantity: grandTotal
        },
        sources: {
          allocations: allocationUpdates.length,
          free_stock: freeStockUpdates.length
        },
        summary: {
          from_allocations: totalFromAllocations,
          from_free_stock: totalFromFreeStock,
          total_received: grandTotal,
          quantity_needed: request.quantity,
          all_sources_used: true
        }
      }
    });

  } catch (error) {
    console.error("❌ Error confirming pickup with free stock:", error);
    return response.sendServerError(res, error.message);
  }
};

export default {
  getAvailableBloodForRequest,
  getPendingPickupsForRequest,
  cancelAllocation,
  getAllocationHistoryForRequest,
  getBloodWithFreeStock,
  confirmPickupWithFreeStock
};
