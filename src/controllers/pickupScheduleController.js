import supabase from '../config/db.js';
import response from '../helpers/responses.js';
import { invalidate } from '../utils/cache.js';
import { invalidateForRequest, invalidateForPartnerStock } from '../utils/invalidation.js';

/**
 * ============================================
 * PICKUP SCHEDULE CONTROLLER (v2 - Cleanup)
 * ============================================
 * 
 * DEPRECATED FUNCTIONS REMOVED:
 * ❌ createPickupSchedule() - Use POST /allocation/request/:id/confirm-with-free-stock instead
 * ❌ getPickupScheduleById() - Not used by frontend
 * ❌ cancelPickupSchedule() - Not used by frontend
 * 
 * ACTIVE FUNCTIONS:
 * ✅ getPickupSchedules() - GET /pickup-schedules (list all schedules)
 * ✅ confirmPickup() - POST /pickup-schedules/:id/confirm (verify with code)
 * 
 * IMPORTANT: For creating pickup schedules with allocation/free stock,
 * use the unified endpoint in allocationController:
 * POST /allocation/request/:id/confirm-with-free-stock
 */

// Get pickup schedules
export const getPickupSchedules = async (req, res) => {
  try {
    const { status, date, userId, userType } = req.query;

    let query = supabase
      .from('pickup_schedules')
      .select('*, pmi:pmi_id(institution_name, address, phone_number), hospital:hospital_id(institution_name, address, phone_number), request:request_id(patient_name, blood_type, quantity, urgency_level)')
      .order('pickup_date', { ascending: true });

    // Filter by user role
    if (userId && userType) {
      if (userType === 'pmi') {
        query = query.eq('pmi_id', userId);
      } else if (userType === 'hospital') {
        query = query.eq('hospital_id', userId);
      }
    }

    // Filter by status
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by date
    if (date) {
      query = query.eq('pickup_date', date);
    }

    const { data: schedules, error } = await query;

    if (error) {
      console.error('Error fetching pickup schedules:', error);
      return response.sendServerError(res, 'Gagal memuat jadwal penjemputan');
    }

    return response.sendSuccess(res, {
      message: 'Daftar jadwal penjemputan berhasil dimuat',
      data: schedules
    });

  } catch (error) {
    console.error('Error in getPickupSchedules:', error);
    return response.sendServerError(res, 'Terjadi kesalahan yang tidak terduga');
  }
};

// Get pickup schedule by ID - DEPRECATED
// ✅ Use: GET /pickup-schedules (returns list of all schedules)
// This endpoint was not called by frontend and is removed for code cleanliness


// Confirm pickup with unique code and sample verification
export const confirmPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      uniqueCode, 
      pmiId,
      sample_verified,          // NEW: Boolean (required)
      sample_test_result,       // NEW: 'compatible' or 'incompatible'
      sample_verification_notes // NEW: Optional text from lab
    } = req.body;

    if (!uniqueCode || !pmiId) {
      return response.sendBadRequest(res, 'Kode unik dan ID PMI wajib diisi');
    }

    // Validate sample verification is required
    if (sample_verified !== true) {
      return response.sendBadRequest(res, 'Verifikasi sampel darah pasien wajib dilakukan sebelum penjemputan dikonfirmasi');
    }

    // Validate test result is provided
    if (!sample_test_result || !['compatible', 'incompatible'].includes(sample_test_result)) {
      return response.sendBadRequest(res, 'Hasil uji sampel (compatible/incompatible) wajib diisi');
    }

    // Get pickup schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('pickup_schedules')
      .select('*, request:request_id(id, status)')
      .eq('id', id)
      .single();

    if (scheduleError || !schedule) {
      return response.sendNotFound(res, 'Jadwal penjemputan tidak ditemukan');
    }

    // Verify PMI is the owner
    if (schedule.pmi_id !== pmiId) {
      return response.sendForbidden(res, 'Anda tidak berwenang untuk mengonfirmasi penjemputan ini');
    }

    // Verify status
    if (schedule.status === 'completed') {
      return response.sendBadRequest(res, 'Penjemputan ini sudah selesai');
    }

    // Verify unique code
    if (schedule.unique_code !== uniqueCode.toUpperCase().trim()) {
      return response.sendBadRequest(res, 'Kode unik tidak valid');
    }

    // ============================================
    // HANDLE INCOMPATIBLE SAMPLE
    // ============================================
    if (sample_test_result === 'incompatible') {
      console.log(`Sample incompatible for pickup ${id}, cancelling pickup and rejecting request`);

      // ============================================
      // ROLLBACK STOCK ALLOCATIONS AND FREE STOCK
      // ============================================
      
      // 1. Rollback Allocated Stock (blood_allocation)
      // Find all allocations for this request
      const { data: allocations, error: allocError } = await supabase
        .from('blood_allocation')
        .select('id, quantity_allocated, blood_stock_id, blood_stock:blood_stock(id, quantity, institution_id, blood_type)')
        .eq('blood_request_id', schedule.request_id);

      if (allocError) {
        console.error('Error fetching allocations for rollback:', allocError);
      } else if (allocations && allocations.length > 0) {
        console.log(`🔄 Rolling back ${allocations.length} allocations...`);

        for (const alloc of allocations) {
          // Free the blood_stock - change status to 'available' (not reserved anymore)
          const { error: stockUpdateError } = await supabase
            .from('blood_stock')
            .update({
              status: 'available',
              reserved_by: null,
              reserved_at: null,
              reservation_expires: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', alloc.blood_stock_id);

          if (stockUpdateError) {
            console.error(`❌ Error freeing blood_stock ${alloc.blood_stock_id}:`, stockUpdateError);
          } else {
            console.log(`✅ Freed blood_stock ${alloc.blood_stock_id}: status → available, cleared reservation`);
          }

          // Log rollback to history
          await supabase
            .from('blood_stock_history')
            .insert({
              institution_id: alloc.blood_stock.institution_id,
              blood_type: alloc.blood_stock.blood_type,
              change_type: 'add',
              quantity_change: alloc.quantity_allocated,
              previous_quantity: 0,
              new_quantity: alloc.quantity_allocated,
              notes: `Rollback allocation: Sample tidak compatible untuk request #${schedule.request_id.substring(0, 8)}. Stock dikembalikan ke available.`,
              created_by: pmiId
            });
        }

        // Hard delete all allocations for this request
        const { error: deleteError } = await supabase
          .from('blood_allocation')
          .delete()
          .eq('blood_request_id', schedule.request_id);

        if (deleteError) {
          console.error(`❌ Error deleting allocations:`, deleteError);
        } else {
          console.log(`✅ Deleted ${allocations.length} allocation records (temporary data cleared)`);
        }
      }

      // 2. Rollback Free Stock (blood_stock)
      // Find all free stocks that were used for this request
      const requestIdPattern = `%${schedule.request_id.substring(0, 8)}%`;
      const { data: freeStocks, error: freeStockError } = await supabase
        .from('blood_stock')
        .select('id, quantity, used_for, institution_id, blood_type')
        .eq('status', 'used')
        .like('used_for', requestIdPattern);

      if (freeStockError) {
        console.error('Error fetching free stocks for rollback:', freeStockError);
      } else if (freeStocks && freeStocks.length > 0) {
        console.log(`🔄 Rolling back ${freeStocks.length} free stock records...`);

        for (const stock of freeStocks) {
          // Get the history entry to find out how much quantity was reduced
          const historyPattern = `%Free stock digunakan untuk blood request #${schedule.request_id.substring(0, 8)}%`;
          const { data: historyEntries, error: historyError } = await supabase
            .from('blood_stock_history')
            .select('quantity_change, previous_quantity, new_quantity')
            .eq('institution_id', stock.institution_id)
            .eq('blood_type', stock.blood_type)
            .eq('change_type', 'used')
            .like('notes', historyPattern)
            .order('created_at', { ascending: false })
            .limit(1);

          if (historyError || !historyEntries || historyEntries.length === 0) {
            console.warn(`⚠️ No history found for stock ${stock.id}, cannot restore quantity precisely`);
            // Fallback: just restore status without changing quantity
            const { error: stockRestoreError } = await supabase
              .from('blood_stock')
              .update({
                status: 'available',
                used_for: null,
                used_at: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', stock.id);

            if (stockRestoreError) {
              console.error(`❌ Error restoring free stock ${stock.id}:`, stockRestoreError);
            } else {
              console.log(`✅ Restored free stock ${stock.id}: status → available (quantity unchanged)`);
            }
          } else {
            // Restore quantity from history
            const history = historyEntries[0];
            const restoredQuantity = stock.quantity + history.quantity_change;

            const { error: stockRestoreError } = await supabase
              .from('blood_stock')
              .update({
                quantity: restoredQuantity,
                status: 'available',
                used_for: null,
                used_at: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', stock.id);

            if (stockRestoreError) {
              console.error(`❌ Error restoring free stock ${stock.id}:`, stockRestoreError);
            } else {
              console.log(`✅ Restored free stock ${stock.id}: quantity ${stock.quantity} → ${restoredQuantity}, status → available`);
              
              // Log history for the rollback
              await supabase
                .from('blood_stock_history')
                .insert({
                  institution_id: stock.institution_id,
                  blood_type: stock.blood_type,
                  change_type: 'add',
                  quantity_change: history.quantity_change,
                  previous_quantity: stock.quantity,
                  new_quantity: restoredQuantity,
                  notes: `Rollback: Sample tidak compatible untuk request #${schedule.request_id.substring(0, 8)}. Stock dikembalikan.`,
                  created_by: pmiId
                });
            }
          }
        }
      }

      console.log('✅ Stock rollback completed');

      // ============================================
      // UPDATE PICKUP AND REQUEST STATUS
      // ============================================

      // Update pickup schedule to cancelled
      const { error: cancelError } = await supabase
        .from('pickup_schedules')
        .update({
          status: 'cancelled',
          sample_verified: true,
          sample_test_result: 'incompatible',
          sample_verification_notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (cancelError) {
        console.error('Error cancelling pickup:', cancelError);
        return response.sendServerError(res, 'Gagal membatalkan penjemputan');
      }

      // Update blood request to rejected
      const rejectionReason = `Sample darah pasien tidak compatible setelah uji cross-match.${sample_verification_notes ? ' ' + sample_verification_notes : ''}`;
      
      const { error: rejectError } = await supabase
        .from('blood_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', schedule.request_id);

      if (rejectError) {
        console.error('Error rejecting request:', rejectError);
        return response.sendServerError(res, 'Gagal menolak permintaan');
      }

      // Invalidate cache
      await invalidateForRequest(schedule.request_id, { includeStock: true });
      await invalidateForPartnerStock(pmiId);

      return response.sendSuccess(res, {
        message: 'Penjemputan dibatalkan karena sampel darah tidak kompatibel. Stok darah dikembalikan. Permintaan ditolak.',
        data: {
          pickup_status: 'cancelled',
          request_status: 'rejected',
          rejection_reason: rejectionReason,
          rollback: {
            allocations_restored: allocations?.length || 0,
            free_stocks_restored: freeStocks?.length || 0
          }
        }
      });
    }

    // ============================================
    // HANDLE COMPATIBLE SAMPLE - PROCEED WITH PICKUP
    // ============================================
    console.log(`✅ Sample compatible for pickup ${id}, proceeding with pickup confirmation`);


    // Update pickup schedule status with sample verification
    const { error: updateError } = await supabase
      .from('pickup_schedules')
      .update({
        status: 'completed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: pmiId,
        sample_verified: true,
        sample_test_result: 'compatible',
        sample_verification_notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating pickup schedule:', updateError);
      return response.sendServerError(res, 'Gagal mengonfirmasi penjemputan');
    }

    // ✅ Get blood stocks yang digunakan untuk record history (jika dari free_stock)
    const searchPattern = `Blood Request #${schedule.request_id.substring(0, 8)}`;
    console.log(`🔍 Looking for used free stocks with pattern: "${searchPattern}"`);

    const { data: usedStocks, error: queryError } = await supabase
      .from('blood_stock')
      .select('id, institution_id, quantity, blood_type')
      .eq('used_for', searchPattern)
      .eq('status', 'used');

    console.log(`📊 Query result:`, {
      pattern: searchPattern,
      count: usedStocks?.length || 0,
      usedStocks,
      queryError
    });

    if (usedStocks && usedStocks.length > 0) {
      for (const stock of usedStocks) {
        // ✅ Record to blood_stock_history (free stock usage)
        // Note: Allocation pickups are already recorded in blood_stock_history via RPC function
        const { error: historyError } = await supabase
          .from('blood_stock_history')
          .insert({
            institution_id: stock.institution_id,
            blood_type: stock.blood_type,
            change_type: 'used',
            quantity_change: stock.quantity,
            previous_quantity: stock.quantity,
            new_quantity: 0,
            notes: `Free stock digunakan dan dikonfirmasi dengan kode unik untuk request #${schedule.request_id.substring(0, 8)}`,
            created_by: stock.institution_id  // ✅ Set to institution_id yang punya stok (from FK constraint)
          });

        if (historyError) {
          console.error(`❌ Error recording blood_stock_history for free stock ${stock.id}:`, {
            code: historyError.code,
            message: historyError.message,
            details: historyError.details
          });
          // Don't throw - let it continue to next stock
        } else {
          console.log(`✅ Blood stock history recorded for free stock ${stock.id}`);
        }
      }
    } else {
      console.warn(`⚠️ No additional free stocks found for pattern: "${searchPattern}". Allocation pickups already recorded via RPC.`);
    }

    // Update blood request status to 'completed'
    const { error: requestError } = await supabase
      .from('blood_requests')
      .update({
        status: 'completed',
        fulfilled_by: pmiId,
        fulfilled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', schedule.request_id);

    if (requestError) {
      console.error('Error updating request status:', requestError);
      return response.sendServerError(res, 'Gagal memperbarui status permintaan');
    }

    // Hard delete allocations - no longer needed after pickup completed
    // Audit trail is preserved in blood_stock_history and pickup_schedules
    const { error: deleteAllocError } = await supabase
      .from('blood_allocation')
      .delete()
      .eq('blood_request_id', schedule.request_id);

    if (deleteAllocError) {
      console.warn('⚠️ Could not delete allocations:', deleteAllocError.message);
    } else {
      console.log('✅ Allocation records deleted (temporary data cleared)');
    }

    // Centralized invalidation
    await invalidateForRequest(schedule.request_id, { includeStock: true });
    await invalidateForPartnerStock(pmiId);

    // Get updated schedule
    const { data: updatedSchedule, error: fetchError } = await supabase
      .from('pickup_schedules')
      .select('*, pmi:pmi_id(institution_name), hospital:hospital_id(institution_name), request:request_id(patient_name, blood_type, quantity)')
      .eq('id', id)
      .single();

    // Ensure fulfillment request and campaign are completed after pickup confirmation
    try {
      const { data: fr } = await supabase
        .from('fulfillment_requests')
        .select('id, campaign_id')
        .eq('blood_request_id', schedule.request_id)
        .single();

      if (fr?.id) {
        await supabase
          .from('fulfillment_requests')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', fr.id);
      }
      if (fr?.campaign_id) {
        await supabase
          .from('blood_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', fr.campaign_id);
      }
    } catch (e) {
      console.warn('⚠️ Could not complete fulfillment/campaign on pickup confirmation:', e?.message);
    }

    if (fetchError) {
      return response.sendSuccess(res, {
        message: 'Penjemputan berhasil dikonfirmasi',
        data: null
      });
    }

    return response.sendSuccess(res, {
      message: 'Penjemputan berhasil dikonfirmasi. Permintaan ditandai selesai.',
      data: updatedSchedule
    });

  } catch (error) {
    console.error('Error in confirmPickup:', error);
    return response.sendServerError(res, 'Terjadi kesalahan yang tidak terduga');
  }
};

// Cancel pickup schedule - DEPRECATED
// ✅ Reason: Not called by frontend, no cancel functionality implemented
// This endpoint is removed for code cleanliness
