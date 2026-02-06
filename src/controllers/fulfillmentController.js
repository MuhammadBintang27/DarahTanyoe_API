import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import notificationService from "../services/notificationService.js";
import { invalidate } from "../utils/cache.js";
import { invalidateForRequest } from "../utils/invalidation.js";

/**
 * Step 1: Search and Create Campaign
 * Finds eligible donors and creates campaign WITHOUT sending notifications
 * Returns list of eligible donors for UI to show slider
 */
const searchAndCreateCampaign = async (req, res) => {
  const {
    blood_request_id,
    pmi_id,
    patient_name,
    blood_type,
    quantity_needed,
    urgency_level = 'medium',
    search_radius_km = 20,
    target_donors
  } = req.body;

  console.log("🔵 searchAndCreateCampaign called with:", req.body);

  try {
    // Validate required fields
    if (!blood_request_id || !pmi_id || !patient_name || !blood_type || !quantity_needed) {
      console.log("❌ Validation failed:", { blood_request_id, pmi_id, patient_name, blood_type, quantity_needed });
      return response.sendBadRequest(res, "Missing required fields");
    }

    // Get PMI location for donor search
    const { data: pmiData, error: pmiError } = await supabase
      .from("institutions")
      .select(`
        id, 
        institution_name, 
        location,
        address, 
        phone_number
      `)
      .eq("id", pmi_id)
      .single();

    if (pmiError || !pmiData) {
      return response.sendBadRequest(res, "PMI not found");
    }

    if (!pmiData.location) {
      return response.sendBadRequest(res, "PMI location not set. Please update institution location first.");
    }

    // Check if fulfillment request already exists for this blood request
    const { data: existingFulfillment } = await supabase
      .from("fulfillment_requests")
      .select("id")
      .eq("blood_request_id", blood_request_id)
      .single();

    if (existingFulfillment) {
      return response.sendBadRequest(res, "Fulfillment request already exists for this blood request");
    }

    // Create fulfillment request
    const { data: fulfillmentRequest, error: fulfillmentError } = await supabase
      .from("fulfillment_requests")
      .insert([{
        blood_request_id,
        pmi_id,
        patient_name,
        blood_type,
        quantity_needed,
        urgency_level,
        search_radius_km,
        target_donors,
        status: 'initiated'
      }])
      .select()
      .single();

    if (fulfillmentError) {
      return response.sendBadRequest(res, fulfillmentError.message);
    }

    // ✅ Create blood_campaign record for fulfillment (type='fulfillment')
    console.log("📋 Creating blood_campaign record for fulfillment...");
    
    const campaignPayload = {
      type: 'fulfillment',
      organizer_id: pmi_id,
      title: `Donor Darah untuk Pasien ${patient_name}`,
      description: `Membutuhkan donor darah ${blood_type} untuk pasien ${patient_name}`,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      target_quantity: quantity_needed,
      target_donors: target_donors || 50,
      location: pmiData.institution_name,
      address: pmiData.address || "PMI Location",
      campaign_location: pmiData.location,
      contact_person: pmiData.institution_name,
      contact_phone: pmiData.phone_number || "0000000000",
      status: 'active',
      registration_required: false,
      related_request: blood_request_id
    };

    const { data: newCampaign, error: campaignError } = await supabase
      .from("blood_campaigns")
      .insert([campaignPayload])
      .select()
      .single();

    if (campaignError) {
      console.error("❌ Error creating campaign:", campaignError);
      return response.sendInternalServerError(res, "Failed to create campaign");
    }

    const campaignId = newCampaign.id;
    console.log("✅ Campaign created:", campaignId);

    // Update fulfillment request with campaign link - keep status as 'initiated' until user clicks "Cari Pendonor"
    await supabase
      .from("fulfillment_requests")
      .update({
        campaign_id: campaignId
      })
      .eq("id", fulfillmentRequest.id);

    // Update blood_request status to in_fulfillment
    await supabase
      .from("blood_requests")
      .update({ status: 'in_fulfillment' })
      .eq("id", blood_request_id);

    // Invalidate related caches (lists + dashboards)
    await invalidateForRequest(blood_request_id);

    // Return eligible donors list + campaign info for UI slider
    return response.sendSuccess(res, {
      fulfillment_id: fulfillmentRequest.id,
      campaign_id: campaignId,
      pmi_info: {
        id: pmiData.id,
        institution_name: pmiData.institution_name,
        address: pmiData.address
      },
      patient_name,
      blood_type,
      quantity_needed,
      message: `Kampanye berhasil dibuat. Silakan klik "Cari Pendonor" untuk mencari donor potensial.`
    });

  } catch (error) {
    console.error("❌ Error in searchAndCreateCampaign:", error);
    return response.sendInternalServerError(res, error.message);
  }
};

/**
 * Search Eligible Donors (for existing fulfillment request)
 * Called from pemenuhan page when user clicks "Cari Pendonor"
 */
const searchEligibleDonorsForFulfillment = async (req, res) => {
  const { fulfillment_id } = req.params;

  console.log("🔍 searchEligibleDonorsForFulfillment called for fulfillment_id:", fulfillment_id);

  try {
    // Get fulfillment request details
    const { data: fulfillmentRequest, error: fulfillmentError } = await supabase
      .from("fulfillment_requests")
      .select("blood_request_id, patient_name, blood_type, urgency_level, pmi_id, search_radius_km, status")
      .eq("id", fulfillment_id)
      .single();

    if (fulfillmentError || !fulfillmentRequest) {
      return response.sendBadRequest(res, "Fulfillment request not found");
    }

    // Check if already has pending_notification donors (from previous search)
    const { data: existingPendingDonors } = await supabase
      .from("donor_confirmations")
      .select("id, donor_id")
      .eq("fulfillment_request_id", fulfillment_id)
      .eq("status", "pending_notification");

    if (existingPendingDonors && existingPendingDonors.length > 0) {
      // Already searched, but need to get donor details with names
      console.log(`📋 Found ${existingPendingDonors.length} existing pending notification donors`);
      
      const donorIds = existingPendingDonors.map(d => d.donor_id);
      console.log('🔍 Fetching donor details for existing pending donors:', donorIds);
      
      const { data: donorDetails, error: detailsError } = await supabase
        .from('users')
        .select('id, full_name, phone_number, blood_type')
        .in('id', donorIds);
      
      // Also fetch distance_km from donor_confirmations
      const { data: confirmationDistances } = await supabase
        .from('donor_confirmations')
        .select('donor_id, distance_km')
        .eq('fulfillment_request_id', fulfillment_id)
        .eq('status', 'pending_notification');

      console.log('📋 Donor details fetched:', donorDetails);
      console.log('❌ Donor details error:', detailsError);

      let donorsWithDetails = existingPendingDonors;
      if (!detailsError && donorDetails) {
        donorsWithDetails = existingPendingDonors.map(existing => {
          const donorDetail = donorDetails.find(d => d.id === existing.donor_id);
          const distanceData = confirmationDistances?.find(d => d.donor_id === existing.donor_id);
          return {
            ...existing,
            full_name: donorDetail?.full_name || 'Unknown',
            phone_number: donorDetail?.phone_number,
            blood_type: donorDetail?.blood_type,
            distance_km: distanceData?.distance_km
          };
        });
      }
      
      console.log('✅ Returning existing pending donors with names and distances:', donorsWithDetails);
      return response.sendSuccess(res, {
        eligible_donors_count: donorsWithDetails.length,
        eligible_donors: donorsWithDetails,
        message: `Sudah ditemukan ${donorsWithDetails.length} donor potensial sebelumnya`
      });
    }

    // Get PMI location
    const { data: pmiData } = await supabase
      .from("institutions")
      .select("id, institution_name, location, address, phone_number")
      .eq("id", fulfillmentRequest.pmi_id)
      .single();

    if (!pmiData?.location) {
      return response.sendBadRequest(res, "PMI location not set");
    }

    // Get ALL donors that already have confirmations for this fulfillment (to exclude them)
    const { data: alreadyNotifiedDonors } = await supabase
      .from("donor_confirmations")
      .select("donor_id")
      .eq("fulfillment_request_id", fulfillment_id);

    const alreadyNotifiedDonorIds = alreadyNotifiedDonors?.map(d => d.donor_id) || [];
    console.log(`⚠️ Excluding ${alreadyNotifiedDonorIds.length} donors that already have confirmations`);

    // Find eligible donors
    const { data: allEligibleDonors, error: donorError } = await supabase
      .rpc('find_eligible_donors_simplified', {
        p_blood_type: fulfillmentRequest.blood_type,
        p_pmi_location: pmiData.location,
        p_radius_km: fulfillmentRequest.search_radius_km || 20,
        p_urgency_level: fulfillmentRequest.urgency_level || 'medium',
        p_min_score: 40.0,
        p_limit: 100
      });

    if (donorError) {
      console.error("Error finding eligible donors:", donorError);
      return response.sendBadRequest(res, "Failed to search donors");
    }

    // Filter out donors that are already in confirmations
    const eligibleDonorsFiltered = (allEligibleDonors || []).filter(
      donor => !alreadyNotifiedDonorIds.includes(donor.donor_id) // RPC returns 'donor_id'
    );

    // Get full donor details with names for frontend display
    let eligibleDonors = [];
    if (eligibleDonorsFiltered && eligibleDonorsFiltered.length > 0) {
      const donorIds = eligibleDonorsFiltered.map(d => d.donor_id);
      
      console.log('🔍 Fetching donor details for IDs:', donorIds);
      
      const { data: donorDetails, error: detailsError } = await supabase
        .from('users')
        .select('id, full_name, phone_number, blood_type')
        .in('id', donorIds);

      console.log('📋 Donor details fetched:', donorDetails);
      console.log('❌ Donor details error:', detailsError);

      if (detailsError) {
        console.error('Error fetching donor details:', detailsError);
        // Fallback to basic data without names
        eligibleDonors = eligibleDonorsFiltered;
      } else {
        // Merge eligible donor data with full names
        eligibleDonors = eligibleDonorsFiltered.map(eligible => {
          console.log(`🔍 RPC data for ${eligible.donor_id}:`, eligible);
          const donorDetail = donorDetails.find(d => d.id === eligible.donor_id);
          const merged = {
            ...eligible,
            full_name: donorDetail?.full_name || 'Unknown',
            phone_number: donorDetail?.phone_number,
            blood_type: donorDetail?.blood_type || eligible.blood_type
          };
          console.log(`✅ Merged donor ${eligible.donor_id}:`, merged);
          return merged;
        });
      }
    } else {
      eligibleDonors = eligibleDonorsFiltered;
    }
    
    console.log('📊 Final eligible donors with details:', eligibleDonors);

    const donorsFound = eligibleDonors.length;
    console.log(`🎯 Found ${donorsFound} NEW eligible donors (after excluding ${alreadyNotifiedDonorIds.length} already notified)`);

    // Create donor confirmations with pending_notification status
    if (eligibleDonors && eligibleDonors.length > 0) {
      const confirmations = eligibleDonors.map(donor => ({
        fulfillment_request_id: fulfillment_id,
        donor_id: donor.donor_id, // RPC returns 'donor_id'
        status: 'pending_notification',
        distance_km: donor.distance_km, // RPC returns 'distance_km'
        code_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }));

      await supabase
        .from("donor_confirmations")
        .insert(confirmations);
    }

    // Update fulfillment status
    // Only update status if donors found, otherwise keep current status
    if (donorsFound > 0) {
      await supabase
        .from("fulfillment_requests")
        .update({ 
          status: 'donors_found',
          target_donors: donorsFound
        })
        .eq("id", fulfillment_id);
    } else {
      // No donors found, just update target_donors count but keep status as is
      await supabase
        .from("fulfillment_requests")
        .update({ 
          target_donors: 0
        })
        .eq("id", fulfillment_id);
    }

    return response.sendSuccess(res, {
      eligible_donors_count: donorsFound,
      eligible_donors: eligibleDonors || [],
      message: `Ditemukan ${donorsFound} donor potensial`
    });

  } catch (error) {
    console.error("❌ Error in searchEligibleDonorsForFulfillment:", error);
    return response.sendBadRequest(res, error.message);
  }
};

/**
 * Step 2: Send Notifications to Selected Donors
 * Sends notifications only to the selected number of nearest donors
 */
const sendNotificationsToSelectedDonors = async (req, res) => {
  const { campaign_id, fulfillment_id, donor_count } = req.body;

  console.log("📧 sendNotificationsToSelectedDonors called with:", { campaign_id, fulfillment_id, donor_count });

  try {
    // Validate
    if (!campaign_id || !fulfillment_id || !donor_count || donor_count < 1) {
      return response.sendBadRequest(res, "Missing or invalid campaign_id, fulfillment_id, or donor_count");
    }

    // Get fulfillment request details
    const { data: fulfillmentRequest, error: fulfillmentError } = await supabase
      .from("fulfillment_requests")
      .select("patient_name, blood_type, urgency_level, pmi_id")
      .eq("id", fulfillment_id)
      .single();

    if (fulfillmentError || !fulfillmentRequest) {
      return response.sendBadRequest(res, "Fulfillment request not found");
    }

    // Get pending donor confirmations
    const { data: donorConfirmations, error: confirmError } = await supabase
      .from("donor_confirmations")
      .select(`
        id,
        donor_id,
        distance_km
      `)
      .eq("fulfillment_request_id", fulfillment_id)
      .eq("status", 'pending_notification')
      .limit(donor_count);

    if (confirmError) {
      console.error("❌ Error fetching donor confirmations:", confirmError);
      return response.sendBadRequest(res, "Failed to fetch donor list");
    }

    if (!donorConfirmations || donorConfirmations.length === 0) {
      return response.sendBadRequest(res, "No pending donors found to notify");
    }

    const selectedCount = donorConfirmations.length;
    console.log(`📬 Sending notifications to ${selectedCount} donors...`);

    // Get PMI info for distance display
    const { data: pmiData } = await supabase
      .from("institutions")
      .select("institution_name")
      .eq("id", fulfillmentRequest.pmi_id)
      .single();

    // Send notifications to selected donors
    let notifiedCount = 0;
    const notificationIds = [];

    for (const confirmation of donorConfirmations) {
      try {
        const notification = await notificationService.notify({
          userId: confirmation.donor_id,
          type: 'campaign',
          title: 'Donor Darah Dibutuhkan!',
          message: `Pasien ${fulfillmentRequest.patient_name} membutuhkan donor darah ${fulfillmentRequest.blood_type}. Jarak Anda: ${confirmation.distance_km?.toFixed(1) || '?'} km dari ${pmiData?.institution_name || 'PMI'}.`,
          priority: fulfillmentRequest.urgency_level === 'critical' || fulfillmentRequest.urgency_level === 'high' ? 'high' : 'medium',
          relatedId: campaign_id,
          relatedType: 'blood_campaign',
          metadata: {
            confirmationId: confirmation.id  // ✅ ADD THIS
          }
        });

        if (notification && notification.notificationId) {
          notificationIds.push({
            id: confirmation.id,
            notificationId: notification.notificationId
          });
          notifiedCount++;
        }
      } catch (notifError) {
        console.error(`❌ Failed to notify donor ${confirmation.donor_id}:`, notifError);
      }
    }

    // Batch update confirmations with notification info
    if (notificationIds.length > 0) {
      for (const notif of notificationIds) {
        await supabase
          .from("donor_confirmations")
          .update({
            status: 'pending',
            notification_id: notif.notificationId,
            notified_at: new Date().toISOString()
          })
          .eq("id", notif.id);
      }
    }

    console.log(`📧 Successfully notified ${notifiedCount} donors`);

    return response.sendSuccess(res, {
      campaign_id,
      fulfillment_id,
      notified_count: notifiedCount,
      total_selected: selectedCount,
      message: `Notifikasi berhasil dikirim ke ${notifiedCount} dari ${selectedCount} donor terpilih`
    });

  } catch (error) {
    console.error("❌ Error in sendNotificationsToSelectedDonors:", error);
    return response.sendBadRequest(res, error.message);
  }
};

/**
 * Create Fulfillment Request (Legacy - kept for backward compatibility)
 * For backward compatibility: calls searchAndCreateCampaign then auto-notifies all donors
 */
const createFulfillmentRequest = async (req, res) => {
  try {
    // Step 1: Search and create campaign
    const searchRes = await new Promise((resolve, reject) => {
      const mockRes = {
        statusCode: 200,
        json: null,
        send: function() { resolve(this.json); }
      };
      
      // Override response helper to capture result
      const originalSend = response.sendSuccess;
      response.sendSuccess = (res, data) => {
        mockRes.json = data;
        resolve(data);
      };
      
      searchAndCreateCampaign(req, mockRes).then(() => {
        response.sendSuccess = originalSend;
      }).catch(reject);
    });

    if (!searchRes || !searchRes.campaign_id) {
      return response.sendBadRequest(res, "Failed to search and create campaign");
    }

    // Step 2: Auto-notify all eligible donors (backward compatible behavior)
    const notifyRes = await new Promise((resolve, reject) => {
      const notifyReq = {
        body: {
          campaign_id: searchRes.campaign_id,
          fulfillment_id: searchRes.fulfillment_id,
          donor_count: searchRes.eligible_donors_count // Notify all
        }
      };
      
      const mockRes = {
        statusCode: 200,
        json: null,
        send: function() { resolve(this.json); }
      };

      const originalSend = response.sendSuccess;
      response.sendSuccess = (res, data) => {
        mockRes.json = data;
        resolve(data);
      };

      sendNotificationsToSelectedDonors(notifyReq, mockRes).then(() => {
        response.sendSuccess = originalSend;
      }).catch(reject);
    });

    // Return combined result
    return response.sendSuccess(res, {
      message: "Fulfillment request created and notifications sent",
      data: {
        campaign_id: searchRes.campaign_id,
        fulfillment_id: searchRes.fulfillment_id,
        eligible_donors: searchRes.eligible_donors_count,
        notified_donors: notifyRes.notified_count
      }
    });

  } catch (error) {
    console.error("Error in createFulfillmentRequest:", error);
    return response.sendInternalServerError(res, error.message);
  }
};

/**
 * Get all fulfillment requests
 */
const getAllFulfillmentRequests = async (req, res) => {
  const { pmi_id, status, blood_type } = req.query;

  try {
    let query = supabase
      .from("fulfillment_requests")
      .select(`
        *,
        blood_request:blood_requests!fulfillment_requests_blood_request_id_fkey(*),
        campaign:blood_campaigns!fulfillment_requests_campaign_id_fkey(*),
        pmi:institutions!fulfillment_requests_pmi_id_fkey(
          id,
          institution_name
        ),
        donor_confirmations(id, status)
      `)
      .order("created_at", { ascending: false });

    if (pmi_id) query = query.eq("pmi_id", pmi_id);
    if (status) query = query.eq("status", status);
    if (blood_type) query = query.eq("blood_type", blood_type);

    let { data, error } = await query;

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    // Add confirmation statistics to each fulfillment request
    data = data.map(fulfillment => ({
      ...fulfillment,
      confirmation_stats: {
        total: fulfillment.donor_confirmations?.length || 0,
        notified: fulfillment.donor_confirmations?.filter(c => c.status === 'pending')?.length || 0,
        confirmed: fulfillment.donor_confirmations?.filter(c => c.status === 'confirmed')?.length || 0,
        code_verified: fulfillment.donor_confirmations?.filter(c => c.status === 'code_verified')?.length || 0,
        completed: fulfillment.donor_confirmations?.filter(c => c.status === 'completed')?.length || 0,
        rejected: fulfillment.donor_confirmations?.filter(c => c.status === 'rejected')?.length || 0
      }
    }));

    return response.sendSuccess(res, { 
      message: "Fulfillment requests retrieved successfully", 
      data 
    });
  } catch (error) {
    console.error("Error getting fulfillment requests:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get fulfillment request by ID
 */
const getFulfillmentRequestById = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("fulfillment_requests")
      .select(`
        *,
        blood_request:blood_requests!fulfillment_requests_blood_request_id_fkey(*),
        campaign:blood_campaigns!fulfillment_requests_campaign_id_fkey(*),
        pmi:institutions!fulfillment_requests_pmi_id_fkey(
          id,
          institution_name,
          location
        ),
        donor_confirmations(
          *,
          donor:users!donor_confirmations_donor_id_fkey(
            id,
            full_name,
            phone_number,
            blood_type,
            location
          )
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      return response.sendNotFound(res, "Fulfillment request not found");
    }

    // Add confirmation statistics
    const confirmationStats = {
      total: data.donor_confirmations?.length || 0,
      notified: data.donor_confirmations?.filter(c => c.status === 'pending')?.length || 0,
      confirmed: data.donor_confirmations?.filter(c => c.status === 'confirmed')?.length || 0,
      code_verified: data.donor_confirmations?.filter(c => c.status === 'code_verified')?.length || 0,
      completed: data.donor_confirmations?.filter(c => c.status === 'completed')?.length || 0,
      rejected: data.donor_confirmations?.filter(c => c.status === 'rejected')?.length || 0
    };

    // Calculate fulfillment status (read-only, no modifications)
    const quantity_collected = data.quantity_collected || 0;
    const target_quantity = data.quantity_needed || 0;
    const is_fulfilled = quantity_collected >= target_quantity;

    return response.sendSuccess(res, {
      message: "Fulfillment request retrieved successfully",
      data: {
        ...data,
        confirmation_stats: confirmationStats,
        is_fulfilled: is_fulfilled,
        can_search_more_donors: !is_fulfilled
      }
    });
  } catch (error) {
    console.error("Error getting fulfillment request:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Update fulfillment request status
 */
const updateFulfillmentStatus = async (req, res) => {
  const { id } = req.params;
  const { status, quantity_collected, notes } = req.body;

  try {
    // First get current fulfillment to check campaign_id
    const { data: fulfillment, error: fetchError } = await supabase
      .from("fulfillment_requests")
      .select("*, campaign_id")
      .eq("id", id)
      .single();

    if (fetchError || !fulfillment) {
      return response.sendBadRequest(res, "Fulfillment request not found");
    }

    const updateData = { status };
    if (quantity_collected !== undefined) updateData.quantity_collected = quantity_collected;
    if (notes) updateData.notes = notes;
    if (status === 'fulfilled' || status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }
    if (status === 'cancelled') {
      updateData.cancelled_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("fulfillment_requests")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    // ✅ SYNC: Call helper to sync campaign status
    if (status === 'fulfilled' || status === 'cancelled') {
      await syncCampaignStatus(id, status);
    }

    return response.sendSuccess(res, {
      message: "Fulfillment request updated successfully",
      data
    });
  } catch (error) {
    console.error("Error updating fulfillment request:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get donor confirmations for a fulfillment request
 */
const getDonorConfirmations = async (req, res) => {
  const { fulfillment_id } = req.params;
  const { status } = req.query;

  try {
    let query = supabase
      .from("donor_confirmations")
      .select(`
        *,
        donor:users!donor_confirmations_donor_id_fkey(
          id,
          full_name,
          phone_number,
          blood_type,
          address,
          location,
          total_donations,
          completion_rate
        )
      `)
      .eq("fulfillment_request_id", fulfillment_id)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    return response.sendSuccess(res, {
      message: "Donor confirmations retrieved successfully",
      data
    });
  } catch (error) {
    console.error("Error getting donor confirmations:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * ✅ NEW: Get donor confirmations by donor ID (for donor history page)
 * Called from: Transaksi page (donor history view)
 * Status mapping: 'active' includes confirmed & code_verified (waiting for donation completion)
 *                 'completed' includes completed, rejected, expired, failed
 */
const getDonorConfirmationsByDonorId = async (req, res) => {
  const { donor_id } = req.params;
  const { status } = req.query;

  try {
    if (!donor_id) {
      return response.sendBadRequest(res, "donor_id is required");
    }

    console.log(`📋 getDonorConfirmationsByDonorId: donor_id=${donor_id}, status=${status}`);

    let query = supabase
      .from("donor_confirmations")
      .select(`
        *,
        fulfillment_request:fulfillment_requests(
          id,
          campaign_id,
          patient_name,
          blood_type,
          created_at,
          quantity_needed,
          quantity_collected,
          campaign:blood_campaigns!fulfillment_requests_campaign_id_fkey(
            id,
            title,
            location,
            address,
            campaign_location,
            description
          )
        )
      `)
      .eq("donor_id", donor_id)
      .order("created_at", { ascending: false });

    // Map status query to actual confirmation statuses
    if (status === "active") {
      // Active: confirmed or code_verified (waiting for completion)
      query = query.in("status", ["confirmed", "code_verified"]);
    } else if (status === "completed") {
      // Completed: completed, rejected, expired, failed
      query = query.in("status", ["completed", "rejected", "expired", "failed"]);
    }

    const { data, error } = await query;

    if (error) {
      console.error("❌ Database error:", error);
      return response.sendBadRequest(res, error.message);
    }

    console.log(`✅ Retrieved ${data?.length || 0} confirmations`);

    return response.sendSuccess(res, {
      message: "Donor confirmations retrieved successfully",
      data: data || []
    });
  } catch (error) {
    console.error("❌ Error getting donor confirmations:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Verify donor unique code
 */
const verifyDonorCode = async (req, res) => {
  const { unique_code, pmi_id } = req.body;

  try {
    if (!unique_code || !pmi_id) {
      return response.sendBadRequest(res, "unique_code and pmi_id are required");
    }

    // Find confirmation by code
    const { data: confirmation, error: findError } = await supabase
      .from("donor_confirmations")
      .select(`
        *,
        fulfillment:fulfillment_requests(*),
        donor:users!donor_confirmations_donor_id_fkey(
          id,
          full_name,
          phone_number,
          blood_type
        )
      `)
      .eq("unique_code", unique_code)
      .single();

    if (findError || !confirmation) {
      return response.sendNotFound(res, "Invalid code - Code not found");
    }

    // Check if code is already verified
    if (confirmation.code_verified) {
      return response.sendBadRequest(res, "Code already verified");
    }

    // Check if code is expired
    const now = new Date();
    const expiresAt = new Date(confirmation.code_expires_at);
    if (now > expiresAt) {
      await supabase
        .from("donor_confirmations")
        .update({ status: "expired" })
        .eq("id", confirmation.id);

      return response.sendBadRequest(res, "Code expired");
    }

    // Verify PMI matches
    if (confirmation.fulfillment.pmi_id !== pmi_id) {
      console.log(`❌ PMI Mismatch: Expected ${confirmation.fulfillment.pmi_id}, Got ${pmi_id}`);
      return response.sendBadRequest(
        res, 
        `Code not valid for this PMI. This code belongs to fulfillment request created by another PMI. Expected PMI ID: ${confirmation.fulfillment.pmi_id}, Your PMI ID: ${pmi_id}`
      );
    }

    // Update confirmation to 'code_verified' status (intermediate state)
    const { data: updated, error: updateError } = await supabase
      .from("donor_confirmations")
      .update({
        code_verified: true,
        code_verified_at: new Date().toISOString(),
        verified_by: pmi_id,
        status: "code_verified",  // ✅ NEW: Intermediate status between confirmed and completed
        confirmed_at: new Date().toISOString(),
        check_in_time: new Date().toISOString()
      })
      .eq("id", confirmation.id)
      .select(`
        *,
        fulfillment:fulfillment_requests(*),
        donor:users!donor_confirmations_donor_id_fkey(
          id,
          full_name,
          phone_number,
          blood_type
        )
      `)
      .single();

    if (updateError) {
      return response.sendBadRequest(res, updateError.message);
    }

    // ✅ NEW: Check if campaign is now fulfilled based on QUANTITY
    let campaignFulfilled = false;
    try {
      const { data: fulfillmentData } = await supabase
        .from("fulfillment_requests")
        .select("quantity_collected, target_quantity, campaign_id")
        .eq("id", confirmation.fulfillment_request_id)
        .single();

      if (fulfillmentData) {
        const { quantity_collected, target_quantity, campaign_id } = fulfillmentData;
        
        console.log(`📊 Campaign ${campaign_id}: ${quantity_collected}/${target_quantity} units collected`);

        // Check if quantity target reached
        if (quantity_collected >= target_quantity) {
          // ✅ Update campaign to 'completed' AND update current_quantity
          const { error: campaignError } = await supabase
            .from("blood_campaigns")
            .update({ 
              status: 'completed',
              current_quantity: quantity_collected,
              completed_at: new Date().toISOString()
            })
            .eq("id", campaign_id);

          if (!campaignError) {
            console.log(`✅ Campaign ${campaign_id} FULFILLED with ${quantity_collected}/${target_quantity} units!`);
            campaignFulfilled = true;
          } else {
            console.warn(`⚠️ Failed to update campaign status: ${campaignError.message}`);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error checking campaign fulfillment: ${error.message}`);
    }

    return response.sendSuccess(res, {
      message: "Code verified successfully",
      data: {
        confirmation: updated,
        valid: true,
        campaignFulfilled: campaignFulfilled
      }
    });
  } catch (error) {
    console.error("Error verifying donor code:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Helper: Sync campaign status with fulfillment status
 * Updates blood_campaigns based on fulfillment_requests status change
 */
const syncCampaignStatus = async (fulfillmentId, newStatus) => {
  try {
    // Get fulfillment with campaign_id
    const { data: fulfillment } = await supabase
      .from("fulfillment_requests")
      .select("campaign_id, blood_request_id")
      .eq("id", fulfillmentId)
      .single();

    if (!fulfillment) {
      console.warn(`⚠️ Fulfillment ${fulfillmentId} not found for sync`);
      return;
    }

    let campaignId = fulfillment.campaign_id;

    // Fallback: find campaign by blood_request_id
    if (!campaignId && fulfillment.blood_request_id) {
      const { data: campaign } = await supabase
        .from("blood_campaigns")
        .select("id")
        .eq("related_request", fulfillment.blood_request_id)
        .single();

      if (campaign) {
        campaignId = campaign.id;
        console.log(`🔍 Found campaign ${campaignId} via related_request fallback`);
      }
    }

    // Update campaign status
    if (campaignId) {
      const updateData = {};

      if (newStatus === 'fulfilled') {
        updateData.status = 'completed';
      } else if (newStatus === 'cancelled') {
        updateData.status = 'cancelled';
      }

      const { error } = await supabase
        .from("blood_campaigns")
        .update(updateData)
        .eq("id", campaignId);

      if (error) {
        console.warn(`⚠️ Failed to sync campaign ${campaignId}: ${error.message}`);
      } else {
        console.log(`✅ Campaign ${campaignId} synced to status '${updateData.status || newStatus}'`);
      }
    }
  } catch (error) {
    console.error(`⚠️ Error in syncCampaignStatus: ${error.message}`);
  }
};

/**
 * Complete donation from fulfillment
 */
const completeDonation = async (req, res) => {
  const {
    confirmation_id,
    pmi_id,
    quantity,
    notes,
    medical_notes,
    health_screening
  } = req.body;

  try {
    if (!confirmation_id || !pmi_id || !quantity) {
      return response.sendBadRequest(res, "confirmation_id, pmi_id, and quantity are required");
    }

    // Get confirmation details
    const { data: confirmation, error: confirmError } = await supabase
      .from("donor_confirmations")
      .select(`
        *,
        fulfillment:fulfillment_requests(*),
        donor:users!donor_confirmations_donor_id_fkey(*)
      `)
      .eq("id", confirmation_id)
      .single();

    if (confirmError || !confirmation) {
      return response.sendNotFound(res, "Confirmation not found");
    }

    // Check if code is verified (must be in 'code_verified' status)
    if (confirmation.status !== "code_verified") {
      return response.sendBadRequest(res, `Code must be verified first. Current status: ${confirmation.status}`);
    }

    // Check if already completed
    if (confirmation.status === "completed") {
      return response.sendBadRequest(res, "Donation already completed");
    }

    // Create donation record
    const { data: donation, error: donationError } = await supabase
      .from("donations")
      .insert({
        donor_id: confirmation.donor_id,
        institution_id: pmi_id,
        blood_type: confirmation.fulfillment.blood_type,
        quantity,
        donation_date: new Date().toISOString(),
        status: "completed",
        notes,
        medical_notes,
        health_screening
      })
      .select()
      .single();

    if (donationError) {
      return response.sendBadRequest(res, donationError.message);
    }

    // Update confirmation to 'completed' status (final state)
    const { data: updated, error: updateError } = await supabase
      .from("donor_confirmations")
      .update({
        status: "completed",  // ✅ Status berubah dari code_verified → completed
        donation_id: donation.id,
        donation_completed_at: new Date().toISOString(),
        check_out_time: new Date().toISOString()
      })
      .eq("id", confirmation_id)
      .select(`
        *,
        donation:donations!donor_confirmations_donation_id_fkey(*)
      `)
      .single();

    if (updateError) {
      return response.sendBadRequest(res, updateError.message);
    }

    // ✅ NEW: Create allocation entry BEFORE updating quantity_collected (Opsi 2)
    console.log(`🔍 Allocation creation check:`);
    console.log(`   - fulfillment_request_id: ${confirmation.fulfillment_request_id}`);
    console.log(`   - fulfillment.quantity_needed: ${confirmation.fulfillment.quantity_needed}`);
    console.log(`   - fulfillment.quantity_collected (BEFORE update): ${confirmation.fulfillment.quantity_collected || 0}`);
    console.log(`   - quantity (donation): ${quantity}`);
    
    if (confirmation.fulfillment_request_id) {
      try {
        // Calculate allocation BEFORE we update quantity_collected
        const already_allocated = confirmation.fulfillment.quantity_collected || 0;
        const can_allocate = Math.min(
          quantity,
          confirmation.fulfillment.quantity_needed - already_allocated
        );

        console.log(`   - Can allocate: ${can_allocate}`);

        if (can_allocate > 0) {
          // We'll create allocation after blood_stock is created
          // Store this info to use later
          var allocationPending = {
            blood_request_id: confirmation.fulfillment.blood_request_id,
            fulfillment_request_id: confirmation.fulfillment_request_id,
            quantity_to_allocate: can_allocate
          };
          console.log(`✅ Allocation scheduled: ${can_allocate} kantong will be allocated`);
        }
      } catch (error) {
        console.error(`⚠️ Error in allocation calculation:`, error);
      }
    }

    // Update fulfillment request quantity
    const newQuantity = (confirmation.fulfillment.quantity_collected || 0) + quantity;
    const newCompletedDonors = (confirmation.fulfillment.completed_donors || 0) + 1;
    
    // Check if fulfillment is now complete
    const isFulfilled = newQuantity >= confirmation.fulfillment.quantity_needed;
    
    // Always update quantity and completed_donors
    await supabase
      .from("fulfillment_requests")
      .update({
        quantity_collected: newQuantity,
        completed_donors: newCompletedDonors
      })
      .eq("id", confirmation.fulfillment_request_id);

    console.log(`📊 Fulfillment #${confirmation.fulfillment_request_id} progress: quantity=${newQuantity}/${confirmation.fulfillment.quantity_needed}`);

    // If fulfilled, update status to 'fulfilled' and sync campaign
    if (isFulfilled && confirmation.fulfillment.status === 'donors_found') {
      console.log(`✅ Fulfillment #${confirmation.fulfillment_request_id} is complete! Updating status to 'fulfilled'...`);
      
      // Update fulfillment status
      await supabase
        .from("fulfillment_requests")
        .update({
          status: 'fulfilled',
          completed_at: new Date().toISOString()
        })
        .eq("id", confirmation.fulfillment_request_id);

      // Sync campaign status
      await syncCampaignStatus(confirmation.fulfillment_request_id, 'fulfilled');
    }

    // ✅ Also update campaign quantity regardless of status
    let campaignId = confirmation.fulfillment.campaign_id;
    
    // Fallback: if no campaign_id, try to find campaign by blood_request_id
    if (!campaignId && confirmation.fulfillment.blood_request_id) {
      const { data: campaign } = await supabase
        .from("blood_campaigns")
        .select("id")
        .eq("related_request", confirmation.fulfillment.blood_request_id)
        .single();
      
      if (campaign) {
        campaignId = campaign.id;
        console.log(`🔍 Found campaign ${campaignId} via related_request fallback`);
      }
    }

    if (campaignId) {
      // Use quantity_needed as target (not target_quantity)
      const fulfillmentTarget = confirmation.fulfillment.quantity_needed || confirmation.fulfillment.target_quantity;
      
      const { error: campaignError } = await supabase
        .from("blood_campaigns")
        .update({
          current_quantity: newQuantity,
          current_donors: newCompletedDonors,
          status: newQuantity >= fulfillmentTarget ? 'completed' : 'active',
          completed_at: newQuantity >= fulfillmentTarget ? new Date().toISOString() : null
        })
        .eq("id", campaignId);

      if (!campaignError) {
        const isFulfilled = newQuantity >= fulfillmentTarget;
        if (isFulfilled) {
          console.log(`✅ Campaign ${campaignId} FULFILLED! quantity=${newQuantity}/${fulfillmentTarget}. Status changed to 'completed'`);
        } else {
          console.log(`📊 Campaign ${campaignId} progress: quantity=${newQuantity}/${fulfillmentTarget}`);
        }
      } else {
        console.warn(`⚠️ Failed to update campaign: ${campaignError.message}`);
      }
    }

    // Add blood to stock
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 35); // Default 35 days expiry
    
    const batchNumber = `BATCH-${confirmation.fulfillment.blood_type}-${Date.now()}`;
    
    const { data: bloodStock, error: stockError } = await supabase
      .from("blood_stock")
      .insert({
        institution_id: pmi_id,
        donation_id: donation.id,
        blood_type: confirmation.fulfillment.blood_type,
        quantity,
        expiry_date: expiryDate.toISOString().split('T')[0],
        batch_number: batchNumber,
        collection_date: new Date().toISOString().split('T')[0],
        status: 'available',
        component_type: 'whole_blood'
      })
      .select()
      .single();

    if (stockError) {
      console.error("⚠️ Failed to add blood stock:", stockError);
    } else {
      console.log(`✅ Added blood stock: ${quantity} kantong ${confirmation.fulfillment.blood_type}, batch: ${batchNumber}`);
      
      // Get current total stock for this blood type BEFORE adding (exclude the one just inserted)
      const { data: currentStock } = await supabase
        .from("blood_stock")
        .select("quantity")
        .eq("institution_id", pmi_id)
        .eq("blood_type", confirmation.fulfillment.blood_type)
        .eq("status", "available")
        .neq("id", bloodStock.id); // Exclude the newly inserted record
      
      const previousQuantity = currentStock?.reduce((sum, item) => sum + item.quantity, 0) || 0;
      const newTotalQuantity = previousQuantity + quantity;
      
      // Insert to blood_stock_history
      await supabase
        .from("blood_stock_history")
        .insert({
          institution_id: pmi_id,
          blood_type: confirmation.fulfillment.blood_type,
          change_type: 'add',
          quantity_change: quantity,
          previous_quantity: previousQuantity,
          new_quantity: newTotalQuantity,
          notes: `Donasi dari ${confirmation.donor.full_name} - Batch: ${batchNumber}`,
          created_by: pmi_id
        });
      
      console.log(`📝 History recorded: ${previousQuantity} → ${newTotalQuantity} kantong`);
    }

    // ✅ NEW: Create allocation entry (Opsi 2 - explicit allocation tracking)
    // Use the calculated allocation from earlier (before quantity_collected was updated)
    if (bloodStock && allocationPending) {
      try {
        console.log(`📝 Creating allocation with blood_stock ${bloodStock.id}...`);
        const { data: allocation, error: allocError } = await supabase
          .from("blood_allocation")
          .insert({
            blood_request_id: allocationPending.blood_request_id,
            fulfillment_request_id: allocationPending.fulfillment_request_id,
            blood_stock_id: bloodStock.id,
            quantity_allocated: allocationPending.quantity_to_allocate,
            status: 'allocated'
          })
          .select()
          .single();

        if (!allocError && allocation) {
          console.log(`✅ Created allocation: ${allocationPending.quantity_to_allocate} kantong allocated`);
        } else {
          console.error(`❌ Failed to create allocation:`, allocError);
        }
      } catch (error) {
        console.error(`❌ Error creating allocation:`, error);
      }
    } else {
      console.log(`⚠️ Skipping allocation: bloodStock=${!!bloodStock}, allocationPending=${!!allocationPending}`);
    }

    // Check if fulfillment is complete and update blood_request status
    const { data: bloodRequest, error: requestError } = await supabase
      .from("blood_requests")
      .select("id, quantity, status")
      .eq("id", confirmation.fulfillment.blood_request_id)
      .single();

    if (!requestError && bloodRequest) {
      // Check available stock for this blood type at this PMI
      const { data: availableStock } = await supabase
        .from("blood_stock")
        .select("quantity")
        .eq("institution_id", pmi_id)
        .eq("blood_type", confirmation.fulfillment.blood_type)
        .eq("status", "available");

      const totalStock = availableStock?.reduce((sum, item) => sum + item.quantity, 0) || 0;

      console.log(`📊 Stock check: ${totalStock} available vs ${bloodRequest.quantity} needed`);

      // If stock is now sufficient and request is in_fulfillment, mark as ready (approved)
      if (totalStock >= bloodRequest.quantity && bloodRequest.status === 'in_fulfillment') {
        await supabase
          .from("blood_requests")
          .update({ status: 'ready' })
          .eq("id", bloodRequest.id);

        console.log(`✅ Blood request ${bloodRequest.id} marked as READY - stock sufficient!`);

        // Notify hospital that blood is ready
        const { data: requester } = await supabase
          .from("blood_requests")
          .select("requester_id, patient_name")
          .eq("id", bloodRequest.id)
          .single();

        if (requester) {
          try {
            await notificationService.notify({
              institutionId: requester.requester_id,
              type: 'request',
              title: 'Darah Siap Diambil!',
              message: `Darah ${confirmation.fulfillment.blood_type} untuk pasien ${requester.patient_name} telah siap. Silakan jadwalkan pengambilan.`,
              priority: 'high',
              relatedId: bloodRequest.id,
              relatedType: 'blood_request'
            });
          } catch (notifError) {
            console.error("Failed to send hospital notification:", notifError);
          }
        }
      }
    }

    // Send notification to donor
    try {
      await notificationService.notify({
        userId: confirmation.donor_id,
        type: 'donation',
        title: 'Terima Kasih atas Donasi Anda!',
        message: `Donasi darah Anda sebanyak ${quantity} kantong telah berhasil dicatat. Terima kasih telah menyelamatkan nyawa!`,
        priority: 'medium',
        relatedId: donation.id,
        relatedType: 'donation'
      });
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }

    // ✅ NEW: Get allocation info if exists (Opsi 2)
    let allocation = null;
    if (confirmation.fulfillment_request_id) {
      const { data: alloc } = await supabase
        .from("blood_allocation")
        .select("*")
        .eq("fulfillment_request_id", confirmation.fulfillment_request_id)
        .eq("blood_stock_id", bloodStock?.id)
        .single();
      
      allocation = alloc;
    }

    return response.sendSuccess(res, {
      message: "Donation completed successfully",
      data: {
        donation,
        confirmation: updated,
        blood_stock: bloodStock,
        allocation,  // ✅ NEW: Include allocation info
        request_status_updated: bloodRequest?.status === 'in_fulfillment',
        quantity_collected: newQuantity,
        quantity_still_needed: Math.max(0, confirmation.fulfillment.quantity_needed - newQuantity)
      }
    });
  } catch (error) {
    console.error("Error completing donation:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Initiate fulfillment (search and notify donors)
 */
const initiateFulfillment = async (req, res) => {
  const { fulfillment_id } = req.params;

  try {
    // Get fulfillment request
    const { data: fulfillment, error: fulfillmentError } = await supabase
      .from("fulfillment_requests")
      .select(`
        *,
        pmi:institutions!fulfillment_requests_pmi_id_fkey(
          id,
          institution_name,
          location
        )
      `)
      .eq("id", fulfillment_id)
      .single();

    if (fulfillmentError || !fulfillment) {
      return response.sendNotFound(res, "Fulfillment request not found");
    }

    if (!fulfillment.pmi.location) {
      return response.sendBadRequest(res, "PMI location not set");
    }

    // Find eligible donors
    const { data: eligibleDonors, error: donorError } = await supabase
      .rpc('find_eligible_donors_simplified', {
        p_blood_type: fulfillment.blood_type,
        p_pmi_location: fulfillment.pmi.location,
        p_radius_km: fulfillment.search_radius_km,
        p_urgency_level: fulfillment.urgency_level,
        p_min_score: 40.0,
        p_limit: fulfillment.target_donors || 100
      });

    if (donorError) {
      return response.sendBadRequest(res, donorError.message);
    }

    const donorsFound = eligibleDonors?.length || 0;

    // Update fulfillment status
    const currentRetryCount = fulfillment.retry_count || 0;
    
    await supabase
      .from("fulfillment_requests")
      .update({
        status: donorsFound > 0 ? 'donors_found' : 'failed',
        target_donors: donorsFound,
        retry_count: currentRetryCount + 1
      })
      .eq("id", fulfillment_id);

    console.log(`✅ Fulfillment updated: status=${donorsFound > 0 ? 'donors_found' : 'failed'}, retry_count=${currentRetryCount + 1}`);

    // Create/update donor confirmations
    if (eligibleDonors && eligibleDonors.length > 0) {
      const confirmations = eligibleDonors.map(donor => ({
        fulfillment_request_id: fulfillment_id,
        campaign_id: fulfillment.campaign_id,
        donor_id: donor.donor_id, // RPC returns 'donor_id'
        status: 'pending',
        distance_km: donor.distance_km, // RPC returns 'distance_km'
        code_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }));

      await supabase
        .from("donor_confirmations")
        .upsert(confirmations, { onConflict: 'fulfillment_request_id,donor_id' });

      // Send notifications
      for (const donor of eligibleDonors.slice(0, 50)) {
        try {
          const notification = await notificationService.notify({
            userId: donor.donor_id,
            type: 'campaign',
            title: 'Donor Darah Dibutuhkan!',
            message: `Pasien ${fulfillment.patient_name} membutuhkan donor darah ${fulfillment.blood_type}. Jarak Anda: ${donor.distance_km.toFixed(1)} km.`,
            priority: fulfillment.urgency_level === 'critical' || fulfillment.urgency_level === 'high' ? 'high' : 'medium',
            relatedId: fulfillment.campaign_id || fulfillment_id,
            relatedType: fulfillment.campaign_id ? 'blood_campaign' : 'fulfillment_request'
          });

          // Update donor confirmation with notification info
          if (notification && notification.notificationId) {
            await supabase
              .from("donor_confirmations")
              .update({
                notification_id: notification.notificationId,
                notified_at: new Date().toISOString()
              })
              .eq("fulfillment_request_id", fulfillment_id)
              .eq("donor_id", donor.donor_id);
          }
        } catch (notifError) {
          console.error(`Failed to notify donor ${donor.donor_id}:`, notifError);
        }
      }
    }

    return response.sendSuccess(res, {
      message: "Fulfillment initiated successfully",
      data: {
        donors_found: donorsFound,
        eligible_donors: eligibleDonors?.slice(0, 20) || []
      }
    });
  } catch (error) {
    console.error("Error initiating fulfillment:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Donor Confirm (Pendonor setuju untuk donor)
 * Status: pending → confirmed
 * Code dihasilkan otomatis oleh trigger database
 */
const donorConfirm = async (req, res) => {
  const { confirmation_id, campaign_id, donor_id } = req.body;

  try {
    // Must have donor_id
    if (!donor_id) {
      return response.sendBadRequest(res, "donor_id is required");
    }

    // Must have either confirmation_id OR campaign_id
    if (!confirmation_id && !campaign_id) {
      return response.sendBadRequest(res, "Either confirmation_id or campaign_id is required");
    }

    let confirmation;

    // Case 1: User coming from NOTIFICATION - has confirmation_id
    if (confirmation_id) {
      const { data: foundConfirmation, error: findError } = await supabase
        .from("donor_confirmations")
        .select(`
          *,
          fulfillment:fulfillment_requests(*),
          donor:users!donor_confirmations_donor_id_fkey(
            id,
            full_name,
            phone_number,
            blood_type
          )
        `)
        .eq("id", confirmation_id)
        .single();

      if (findError || !foundConfirmation) {
        return response.sendNotFound(res, "Confirmation not found");
      }

      // Verify donor owns this confirmation
      if (foundConfirmation.donor_id !== donor_id) {
        return response.sendBadRequest(res, "Unauthorized - You are not the donor for this confirmation");
      }

      // Check if already confirmed
      if (foundConfirmation.status !== 'pending') {
        return response.sendBadRequest(res, `Confirmation is already ${foundConfirmation.status}`);
      }

      confirmation = foundConfirmation;
    } else {
      // Case 2: User coming from "PERMINTAAN TERDEKAT" (direct access) - has campaign_id
      // Need to find or create confirmation for this campaign + donor
      
      console.log("🔍 [DEBUG] Looking for campaign with ID:", campaign_id);
      
      // First, get the fulfillment request from campaign
      // NOTE: fulfillment_requests has campaign_id, NOT the other way around
      const { data: fulfillment, error: fulfillError } = await supabase
        .from("fulfillment_requests")
        .select(`
          id,
          blood_request_id,
          pmi_id,
          patient_name,
          blood_type,
          quantity_needed,
          urgency_level
        `)
        .eq("campaign_id", campaign_id)
        .single();

      console.log("🔍 [DEBUG] Fulfillment lookup result:", { fulfillment, fulfillError });
      
      // If not found, try to get list to see what fulfillments exist
      if (!fulfillment) {
        const { data: allFulfillments } = await supabase
          .from("fulfillment_requests")
          .select("id, campaign_id, patient_name")
          .limit(5);
        console.log("❌ [DEBUG] Fulfillment not found. Sample fulfillments in DB:", allFulfillments);
      }

      if (fulfillError || !fulfillment) {
        console.log("❌ [DEBUG] Fulfillment not found - fulfillError:", fulfillError);
        return response.sendBadRequest(res, `Fulfillment request not found for campaign ID: ${campaign_id}`);
      }

      const fulfillment_request_id = fulfillment.id;
      console.log("✅ [DEBUG] Fulfillment found - ID:", fulfillment_request_id);

      // Check if confirmation already exists for this donor + fulfillment
      const { data: existingConfirmation } = await supabase
        .from("donor_confirmations")
        .select(`
          *,
          fulfillment:fulfillment_requests(*),
          donor:users!donor_confirmations_donor_id_fkey(
            id,
            full_name,
            phone_number,
            blood_type
          )
        `)
        .eq("fulfillment_request_id", fulfillment_request_id)
        .eq("donor_id", donor_id)
        .single();

      if (existingConfirmation && !existingConfirmation.error) {
        console.log("✅ [DEBUG] Found existing confirmation:", existingConfirmation);
        confirmation = existingConfirmation;
        
        // If already confirmed, just return the existing code
        if (confirmation.status === 'confirmed') {
          return response.sendSuccess(res, {
            message: "You have already confirmed. Your unique code is ready.",
            data: {
              confirmationId: confirmation.id,
              donorName: confirmation.donor.full_name,
              bloodType: confirmation.donor.blood_type,
              uniqueCode: confirmation.unique_code,
              codeGeneratedAt: confirmation.code_generated_at,
              codeExpiresAt: confirmation.code_expires_at,
              instructions: "Silakan datang ke PMI dengan kode unik ini untuk verifikasi dan donasi."
            }
          });
        }
      } else {
        // ❌ NO CREATE - Confirmation MUST exist from pre-check
        console.log("❌ [DEBUG] No confirmation found. Must call pre-check endpoint first.");
        return response.sendBadRequest(res, 
          "Confirmation not found. Please refresh the page or call pre-check endpoint first.");
      }
    }

    // Check if code is expired (for existing confirmations)
    if (confirmation && confirmation.code_expires_at) {
      const now = new Date();
      const expiresAt = new Date(confirmation.code_expires_at);
      if (now > expiresAt) {
        await supabase
          .from("donor_confirmations")
          .update({ status: "expired" })
          .eq("id", confirmation.id);

        return response.sendBadRequest(res, "Confirmation expired - Please wait for a new notification");
      }
    }

    // Update confirmation to 'confirmed' - trigger akan auto-generate code
    const { data: updated, error: updateError } = await supabase
      .from("donor_confirmations")
      .update({
        status: "confirmed"
        // unique_code dan code_generated_at akan di-set oleh trigger
      })
      .eq("id", confirmation.id)
      .select(`
        *,
        fulfillment:fulfillment_requests(*),
        donor:users!donor_confirmations_donor_id_fkey(
          id,
          full_name,
          phone_number,
          blood_type
        )
      `)
      .single();

    if (updateError) {
      console.error("Error confirming donation:", updateError);
      return response.sendBadRequest(res, updateError.message);
    }

    console.log(`✅ Donor ${confirmation.donor.full_name} confirmed!`);
    console.log(`   - Code: ${updated.unique_code}`);
    console.log(`   - Expires at: ${updated.code_expires_at}`);
    console.log(`   - Blood type: ${updated.donor.blood_type}`);

    return response.sendSuccess(res, {
      message: "Confirmation accepted successfully. Your unique code has been generated.",
      data: {
        confirmationId: updated.id,
        donorName: updated.donor.full_name,
        bloodType: updated.donor.blood_type,
        uniqueCode: updated.unique_code,
        codeGeneratedAt: updated.code_generated_at,
        codeExpiresAt: updated.code_expires_at,
        instructions: "Silakan datang ke PMI dengan kode unik ini untuk verifikasi dan donasi."
      }
    });
  } catch (error) {
    console.error("Error in donorConfirm:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Donor Reject (Pendonor menolak untuk donor)
 */
const donorReject = async (req, res) => {
  const { confirmation_id, donor_id, rejection_reason } = req.body;

  try {
    if (!confirmation_id || !donor_id) {
      return response.sendBadRequest(res, "confirmation_id and donor_id are required");
    }

    // Get confirmation details
    const { data: confirmation, error: findError } = await supabase
      .from("donor_confirmations")
      .select("*")
      .eq("id", confirmation_id)
      .single();

    if (findError || !confirmation) {
      return response.sendNotFound(res, "Confirmation not found");
    }

    // Verify donor owns this confirmation
    if (confirmation.donor_id !== donor_id) {
      return response.sendBadRequest(res, "Unauthorized - You are not the donor for this confirmation");
    }

    // Check if already processed
    if (confirmation.status !== 'pending') {
      return response.sendBadRequest(res, `Cannot reject - status is already ${confirmation.status}`);
    }

    // Update confirmation to 'rejected'
    const { data: updated, error: updateError } = await supabase
      .from("donor_confirmations")
      .update({
        status: "rejected",
        rejection_reason: rejection_reason || "Donor declined"
      })
      .eq("id", confirmation_id)
      .select()
      .single();

    if (updateError) {
      return response.sendBadRequest(res, updateError.message);
    }

    console.log(`❌ Donor ${donor_id} rejected confirmation`);

    return response.sendSuccess(res, {
      message: "Confirmation rejected successfully",
      data: {
        confirmationId: updated.id,
        status: updated.status
      }
    });
  } catch (error) {
    console.error("Error in donorReject:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Pre-check/Pre-create Confirmation
 * Called when user opens DetailPermintaanDarah from "Permintaan Terdekat"
 * Creates confirmation with 'pending_notification' status BEFORE form submit
 */
const preCheckConfirmation = async (req, res) => {
  const { campaign_id, donor_id } = req.query;

  try {
    // Validate required params
    if (!campaign_id || !donor_id) {
      return response.sendBadRequest(res, "campaign_id and donor_id are required");
    }

    console.log("🔍 [DEBUG] Pre-check called for:", { campaign_id, donor_id });

    // Get fulfillment from campaign
    const { data: fulfillment, error: fulfillError } = await supabase
      .from("fulfillment_requests")
      .select("id, blood_type, quantity_needed, urgency_level")
      .eq("campaign_id", campaign_id)
      .single();

    if (fulfillError || !fulfillment) {
      console.log("❌ [DEBUG] Campaign/fulfillment not found");
      return response.sendBadRequest(res, "Campaign not found");
    }

    console.log("✅ [DEBUG] Fulfillment found:", fulfillment.id);

    // Check if confirmation already exists
    const { data: existingConfirmation } = await supabase
      .from("donor_confirmations")
      .select("id, status")
      .eq("fulfillment_request_id", fulfillment.id)
      .eq("donor_id", donor_id)
      .single();

    // If already exists, return the ID
    if (existingConfirmation && !existingConfirmation.error) {
      console.log("✅ [DEBUG] Confirmation already exists:", existingConfirmation.id);
      return response.sendSuccess(res, {
        message: "Confirmation already exists",
        data: {
          confirmationId: existingConfirmation.id,
          isNew: false
        }
      });
    }

    // Create NEW confirmation with 'pending_notification' status
    console.log("🔍 [DEBUG] Creating new confirmation with status 'pending_notification'");

    const { data: newConfirmation, error: createError } = await supabase
      .from("donor_confirmations")
      .insert({
        fulfillment_request_id: fulfillment.id,
        donor_id: donor_id,
        status: 'pending_notification',  // ✅ STATUS: pending_notification (pre-created)
        notification_id: null,
        notified_at: null,
        distance_km: null  // Will be set if needed later
      })
      .select("id")
      .single();

    if (createError) {
      console.error("❌ [DEBUG] Error creating confirmation:", createError);
      return response.sendBadRequest(res, "Failed to create confirmation");
    }

    console.log("✅ [DEBUG] New confirmation created:", newConfirmation.id);

    return response.sendSuccess(res, {
      message: "Confirmation prepared successfully",
      data: {
        confirmationId: newConfirmation.id,
        isNew: true
      }
    });

  } catch (error) {
    console.error("Error in preCheckConfirmation:", error);
    return response.sendServerError(res, error.message);
  }
};

export default {
  searchAndCreateCampaign,
  searchEligibleDonorsForFulfillment,
  sendNotificationsToSelectedDonors,
  createFulfillmentRequest,
  getAllFulfillmentRequests,
  getFulfillmentRequestById,
  updateFulfillmentStatus,
  getDonorConfirmations,
  getDonorConfirmationsByDonorId,  // ✅ NEW: Get confirmations by donor ID
  verifyDonorCode,
  completeDonation,
  initiateFulfillment,
  donorConfirm,
  donorReject,
  preCheckConfirmation
};
