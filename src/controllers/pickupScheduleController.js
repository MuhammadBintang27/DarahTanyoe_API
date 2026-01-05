import supabase from '../config/db.js';

const successResponse = (res, data, message, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const errorResponse = (res, message, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message
  });
};

// Generate unique 8-character code
function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create pickup schedule
export const createPickupSchedule = async (req, res) => {
  try {
    const { requestId, pickupDate, pickupTime, notes, pmiId } = req.body;

    // Validate required fields
    if (!requestId || !pickupDate || !pickupTime || !pmiId) {
      return errorResponse(res, 'Request ID, pickup date, pickup time, and PMI ID are required', 400);
    }

    // Get request details
    const { data: request, error: requestError } = await supabase
      .from('blood_requests')
      .select('*, requester:requester_id(institution_name, address)')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      return errorResponse(res, 'Request not found', 404);
    }

    // Validate request is approved/ready and PMI is the partner
    if (!['approved', 'ready'].includes(request.status)) {
      return errorResponse(res, 'Request must be approved or ready before creating pickup schedule', 400);
    }

    if (request.partner_id !== pmiId) {
      return errorResponse(res, 'You are not the partner for this request', 403);
    }

    // Get PMI details
    const { data: pmi, error: pmiError } = await supabase
      .from('institutions')
      .select('institution_name, address')
      .eq('id', pmiId)
      .single();

    if (pmiError || !pmi) {
      return errorResponse(res, 'PMI not found', 404);
    }

    // Check if pickup schedule already exists for this request
    const { data: existingSchedule } = await supabase
      .from('pickup_schedules')
      .select('id')
      .eq('request_id', requestId)
      .maybeSingle();

    if (existingSchedule) {
      return errorResponse(res, 'Pickup schedule already exists for this request', 400);
    }

    // Check blood stock availability
    const { data: stock, error: stockError } = await supabase
      .from('blood_stock')
      .select('id, quantity')
      .eq('institution_id', pmiId)
      .eq('blood_type', request.blood_type)
      .eq('status', 'available')
      .gte('expiry_date', new Date().toISOString())
      .order('expiry_date', { ascending: true });

    if (stockError) {
      console.error('Error fetching blood stock:', stockError);
      return errorResponse(res, 'Error checking blood stock', 500);
    }

    // Calculate total available stock
    const totalStock = stock.reduce((sum, item) => sum + item.quantity, 0);

    if (totalStock < request.quantity) {
      return errorResponse(res, 'Insufficient blood stock for this request', 400);
    }

    // Generate unique code
    let uniqueCode;
    let codeExists = true;
    
    while (codeExists) {
      uniqueCode = generateUniqueCode();
      const { data } = await supabase
        .from('pickup_schedules')
        .select('id')
        .eq('unique_code', uniqueCode)
        .maybeSingle();
      
      codeExists = !!data;
    }

    // Reduce blood stock (FIFO - First In First Out based on expiry date)
    let remainingQuantity = request.quantity;
    const stockUpdates = [];
    const stockHistory = [];

    for (const stockItem of stock) {
      if (remainingQuantity <= 0) break;

      const deductQuantity = Math.min(stockItem.quantity, remainingQuantity);
      const newQuantity = stockItem.quantity - deductQuantity;

      stockUpdates.push({
        id: stockItem.id,
        quantity: newQuantity,
        status: newQuantity === 0 ? 'used' : 'available',
        used_at: newQuantity === 0 ? new Date().toISOString() : null,
        used_for: `Blood Request #${request.id.substring(0, 8)}`
      });

      stockHistory.push({
        institution_id: pmiId,
        blood_type: request.blood_type,
        change_type: 'used',
        quantity_change: deductQuantity,
        previous_quantity: stockItem.quantity,
        new_quantity: newQuantity,
        notes: `Used for pickup schedule - Request #${request.id.substring(0, 8)}`,
        created_by: pmiId
      });

      remainingQuantity -= deductQuantity;
    }

    // Update stock in database
    for (const update of stockUpdates) {
      const { error: updateError } = await supabase
        .from('blood_stock')
        .update({
          quantity: update.quantity,
          status: update.status,
          used_at: update.used_at,
          used_for: update.used_for,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.id);

      if (updateError) {
        console.error('Error updating stock:', updateError);
        return errorResponse(res, 'Error updating blood stock', 500);
      }
    }

    // Insert stock history
    const { error: historyError } = await supabase
      .from('blood_stock_history')
      .insert(stockHistory);

    if (historyError) {
      console.error('Error inserting stock history:', historyError);
      // Continue even if history fails
    }

    // Create pickup schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('pickup_schedules')
      .insert({
        request_id: requestId,
        pmi_id: pmiId,
        hospital_id: request.requester_id,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
        pickup_location: pmi.address,
        unique_code: uniqueCode,
        status: 'scheduled',
        notes
      })
      .select('*, pmi:pmi_id(institution_name, address), hospital:hospital_id(institution_name, address), request:request_id(patient_name, blood_type, quantity)')
      .single();

    if (scheduleError) {
      console.error('Error creating pickup schedule:', scheduleError);
      return errorResponse(res, 'Error creating pickup schedule', 500);
    }

    // Update request status to 'pickup_scheduled'
    const { data: updatedRequest, error: requestUpdateError } = await supabase
      .from('blood_requests')
      .update({ 
        status: 'pickup_scheduled',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (requestUpdateError) {
      console.error('Error updating request status:', requestUpdateError);
      return errorResponse(res, 'Error updating request status', 500);
    }

    console.log(`✅ Pickup schedule created and request updated to 'pickup_scheduled'`);
    console.log(`   - Schedule ID: ${schedule.id}`);
    console.log(`   - Request ID: ${requestId}`);
    console.log(`   - Pickup Date: ${pickupDate} at ${pickupTime}`);

    return successResponse(
      res, 
      {
        schedule,
        updatedRequest
      }, 
      'Pickup schedule created successfully. Blood stock has been reserved.', 
      201
    );

  } catch (error) {
    console.error('Error in createPickupSchedule:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

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
      return errorResponse(res, 'Error fetching pickup schedules', 500);
    }

    return successResponse(res, schedules, 'Pickup schedules retrieved successfully');

  } catch (error) {
    console.error('Error in getPickupSchedules:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Get pickup schedule by ID
export const getPickupScheduleById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: schedule, error } = await supabase
      .from('pickup_schedules')
      .select('*, pmi:pmi_id(institution_name, address, phone_number), hospital:hospital_id(institution_name, address, phone_number), request:request_id(patient_name, blood_type, quantity, urgency_level)')
      .eq('id', id)
      .single();

    if (error || !schedule) {
      return errorResponse(res, 'Pickup schedule not found', 404);
    }

    return successResponse(res, schedule, 'Pickup schedule retrieved successfully');

  } catch (error) {
    console.error('Error in getPickupScheduleById:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Confirm pickup with unique code
export const confirmPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const { uniqueCode, pmiId } = req.body;

    if (!uniqueCode || !pmiId) {
      return errorResponse(res, 'Unique code and PMI ID are required', 400);
    }

    // Get pickup schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('pickup_schedules')
      .select('*, request:request_id(id, status)')
      .eq('id', id)
      .single();

    if (scheduleError || !schedule) {
      return errorResponse(res, 'Pickup schedule not found', 404);
    }

    // Verify PMI is the owner
    if (schedule.pmi_id !== pmiId) {
      return errorResponse(res, 'You are not authorized to confirm this pickup', 403);
    }

    // Verify status
    if (schedule.status === 'completed') {
      return errorResponse(res, 'This pickup has already been completed', 400);
    }

    // Verify unique code
    if (schedule.unique_code !== uniqueCode.toUpperCase().trim()) {
      return errorResponse(res, 'Invalid unique code', 400);
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
      return errorResponse(res, 'Error confirming pickup', 500);
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
      return errorResponse(res, 'Error updating request status', 500);
    }

    // Get updated schedule
    const { data: updatedSchedule, error: fetchError } = await supabase
      .from('pickup_schedules')
      .select('*, pmi:pmi_id(institution_name), hospital:hospital_id(institution_name), request:request_id(patient_name, blood_type, quantity)')
      .eq('id', id)
      .single();

    if (fetchError) {
      return successResponse(res, null, 'Pickup confirmed successfully');
    }

    return successResponse(res, updatedSchedule, 'Pickup confirmed successfully. Request marked as completed.');

  } catch (error) {
    console.error('Error in confirmPickup:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};

// Cancel pickup schedule
export const cancelPickupSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, userId } = req.body;

    if (!userId) {
      return errorResponse(res, 'User ID is required', 400);
    }

    const { data: schedule, error: scheduleError } = await supabase
      .from('pickup_schedules')
      .select('*')
      .eq('id', id)
      .single();

    if (scheduleError || !schedule) {
      return errorResponse(res, 'Pickup schedule not found', 404);
    }

    // Verify user is PMI or Hospital
    if (schedule.pmi_id !== userId && schedule.hospital_id !== userId) {
      return errorResponse(res, 'You are not authorized to cancel this pickup', 403);
    }

    if (schedule.status === 'completed') {
      return errorResponse(res, 'Cannot cancel completed pickup', 400);
    }

    // Update pickup schedule
    const { error: updateError } = await supabase
      .from('pickup_schedules')
      .update({
        status: 'cancelled',
        notes: reason || schedule.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error cancelling pickup schedule:', updateError);
      return errorResponse(res, 'Error cancelling pickup schedule', 500);
    }

    // Update request status back to 'approved'
    const { error: requestError } = await supabase
      .from('blood_requests')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', schedule.request_id);

    if (requestError) {
      console.error('Error updating request status:', requestError);
      // Continue anyway
    }

    return successResponse(res, null, 'Pickup schedule cancelled successfully');

  } catch (error) {
    console.error('Error in cancelPickupSchedule:', error);
    return errorResponse(res, 'Internal server error', 500);
  }
};
