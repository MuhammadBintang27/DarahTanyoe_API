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
      return response.sendServerError(res, 'Error fetching pickup schedules');
    }

    return response.sendSuccess(res, {
      message: 'Pickup schedules retrieved successfully',
      data: schedules
    });

  } catch (error) {
    console.error('Error in getPickupSchedules:', error);
    return response.sendServerError(res, 'Internal server error');
  }
};

// Get pickup schedule by ID - DEPRECATED
// ✅ Use: GET /pickup-schedules (returns list of all schedules)
// This endpoint was not called by frontend and is removed for code cleanliness


// Confirm pickup with unique code
export const confirmPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const { uniqueCode, pmiId } = req.body;

    if (!uniqueCode || !pmiId) {
      return response.sendBadRequest(res, 'Unique code and PMI ID are required');
    }

    // Get pickup schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('pickup_schedules')
      .select('*, request:request_id(id, status)')
      .eq('id', id)
      .single();

    if (scheduleError || !schedule) {
      return response.sendNotFound(res, 'Pickup schedule not found');
    }

    // Verify PMI is the owner
    if (schedule.pmi_id !== pmiId) {
      return response.sendForbidden(res, 'You are not authorized to confirm this pickup');
    }

    // Verify status
    if (schedule.status === 'completed') {
      return response.sendBadRequest(res, 'This pickup has already been completed');
    }

    // Verify unique code
    if (schedule.unique_code !== uniqueCode.toUpperCase().trim()) {
      return response.sendBadRequest(res, 'Invalid unique code');
    }

    // Update pickup schedule status
    const { error: updateError } = await supabase
      .from('pickup_schedules')
      .update({
        status: 'completed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: pmiId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating pickup schedule:', updateError);
      return response.sendServerError(res, 'Error confirming pickup');
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
      return response.sendServerError(res, 'Error updating request status');
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
        message: 'Pickup berhasil dikonfirmasi',
        data: null
      });
    }

    return response.sendSuccess(res, {
      message: 'Pickup berhasil dikonfirmasi. Permintaan ditandai selesai.',
      data: updatedSchedule
    });

  } catch (error) {
    console.error('Error in confirmPickup:', error);
    return response.sendServerError(res, 'Internal server error');
  }
};

// Cancel pickup schedule - DEPRECATED
// ✅ Reason: Not called by frontend, no cancel functionality implemented
// This endpoint is removed for code cleanliness
