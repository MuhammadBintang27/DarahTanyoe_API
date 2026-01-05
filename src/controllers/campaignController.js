import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import notificationService from "../services/notificationService.js";

/**
 * Create Blood Campaign
 * Creates a campaign and optionally initiates fulfillment request
 */
const createCampaign = async (req, res) => {
  const {
    organizer_id,
    title,
    description,
    campaign_image_url,
    start_date,
    end_date,
    target_quantity,
    target_donors,
    location,
    address,
    latitude,
    longitude,
    contact_person,
    contact_phone,
    requirements,
    incentives,
    max_participants,
    related_request_id,
    // Fulfillment fields (if this campaign is for fulfillment)
    create_fulfillment,
    blood_type,
    patient_name,
    urgency_level
  } = req.body;

  try {
    // Validate required fields
    if (!organizer_id || !title || !start_date || !end_date || !location || !address || !contact_person || !contact_phone) {
      return response.sendBadRequest(res, "Missing required fields");
    }

    // Convert coordinates to PostGIS format if provided
    let campaign_location = null;
    if (latitude && longitude) {
      campaign_location = `SRID=4326;POINT(${longitude} ${latitude})`;
    }

    // Create campaign
    const campaignData = {
      organizer_id,
      title,
      description,
      campaign_image_url,
      start_date,
      end_date,
      target_quantity,
      target_donors,
      location,
      address,
      campaign_location,
      contact_person,
      contact_phone,
      requirements,
      incentives,
      max_participants,
      related_request: related_request_id,
      status: 'draft' // Start as draft
    };

    const { data: newCampaign, error: campaignError } = await supabase
      .from("blood_campaigns")
      .insert([campaignData])
      .select(`
        *,
        organizer:institutions!blood_campaigns_organizer_id_fkey(
          id,
          institution_name,
          institution_type,
          location
        )
      `)
      .single();

    if (campaignError) {
      return response.sendBadRequest(res, campaignError.message);
    }

    let fulfillmentRequest = null;

    // Create fulfillment request if requested
    if (create_fulfillment && related_request_id && blood_type && patient_name) {
      try {
        // Get organizer location
        const { data: organizerData } = await supabase
          .from("institutions")
          .select("location")
          .eq("id", organizer_id)
          .single();

        if (!organizerData?.location) {
          console.warn("Organizer location not set. Skipping fulfillment request creation.");
        } else {
          // Create fulfillment request
          const { data: fulfillment, error: fulfillmentError } = await supabase
            .from("fulfillment_requests")
            .insert([{
              blood_request_id: related_request_id,
              campaign_id: newCampaign.id,
              pmi_id: organizer_id,
              patient_name,
              blood_type,
              quantity_needed: target_quantity || 1,
              urgency_level: urgency_level || 'medium',
              status: 'initiated',
              search_radius_km: 20,
              target_donors: target_donors || 50
            }])
            .select()
            .single();

          if (fulfillmentError) {
            console.error("Error creating fulfillment request:", fulfillmentError);
          } else {
            fulfillmentRequest = fulfillment;

            // Find eligible donors
            const { data: eligibleDonors, error: donorError } = await supabase
              .rpc('find_eligible_donors_simplified', {
                p_blood_type: blood_type,
                p_pmi_location: organizerData.location,
                p_radius_km: 20,
                p_urgency_level: urgency_level || 'medium',
                p_min_score: 40.0,
                p_limit: target_donors || 100
              });

            if (!donorError && eligibleDonors && eligibleDonors.length > 0) {
              // Update fulfillment status
              await supabase
                .from("fulfillment_requests")
                .update({
                  status: 'donors_found',
                  target_donors: eligibleDonors.length
                })
                .eq("id", fulfillment.id);

              // Create donor confirmations
              const confirmations = eligibleDonors.map(donor => ({
                fulfillment_request_id: fulfillment.id,
                campaign_id: newCampaign.id,
                donor_id: donor.donor_id,
                status: 'pending',
                code_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              }));

              await supabase
                .from("donor_confirmations")
                .insert(confirmations);

              // Send notifications to top donors
              for (const donor of eligibleDonors.slice(0, 50)) {
                try {
                  const notification = await notificationService.notify({
                    userId: donor.donor_id,
                    type: 'campaign',
                    title: 'Donor Darah Dibutuhkan!',
                    message: `${title}. Pasien ${patient_name} membutuhkan darah ${blood_type}. Lokasi: ${location}`,
                    priority: urgency_level === 'critical' || urgency_level === 'high' ? 'high' : 'medium',
                    relatedId: newCampaign.id,
                    relatedType: 'blood_campaign',
                    actionUrl: `/campaigns/${newCampaign.id}`,
                    actionLabel: 'Lihat Detail'
                  });

                  // Update donor confirmation with notification info
                  if (notification && notification.notificationId) {
                    await supabase
                      .from("donor_confirmations")
                      .update({
                        notification_id: notification.notificationId,
                        notified_at: new Date().toISOString()
                      })
                      .eq("campaign_id", newCampaign.id)
                      .eq("donor_id", donor.donor_id);
                  }
                } catch (notifError) {
                  console.error(`Failed to notify donor ${donor.donor_id}:`, notifError);
                }
              }
            }
          }
        }
      } catch (fulfillmentCreationError) {
        console.error("Error in fulfillment creation process:", fulfillmentCreationError);
      }
    }

    return response.sendSuccess(res, {
      message: "Campaign created successfully",
      data: {
        campaign: newCampaign,
        fulfillment_request: fulfillmentRequest
      }
    });

  } catch (error) {
    console.error("Error creating campaign:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get all campaigns
 */
const getAllCampaigns = async (req, res) => {
  const { organizer_id, status, blood_type } = req.query;

  try {
    let query = supabase
      .from("blood_campaigns")
      .select(`
        *,
        organizer:institutions!blood_campaigns_organizer_id_fkey(
          id,
          institution_name,
          institution_type
        ),
        related_blood_request:blood_requests!blood_campaigns_related_request_fkey(
          id,
          blood_type,
          quantity,
          urgency_level
        )
      `)
      .order("created_at", { ascending: false });

    if (organizer_id) query = query.eq("organizer_id", organizer_id);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    return response.sendSuccess(res, {
      message: "Campaigns retrieved successfully",
      data
    });
  } catch (error) {
    console.error("Error getting campaigns:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get campaign by ID
 */
const getCampaignById = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("blood_campaigns")
      .select(`
        *,
        organizer:institutions!blood_campaigns_organizer_id_fkey(
          id,
          institution_name,
          institution_type,
          phone_number,
          address
        ),
        related_blood_request:blood_requests!blood_campaigns_related_request_fkey(
          id,
          blood_type,
          quantity,
          patient_name,
          urgency_level,
          status
        ),
        registrations:campaign_registrations(
          id,
          attendance_confirmed,
          donation_completed,
          user:users!campaign_registrations_user_id_fkey(
            id,
            full_name,
            phone_number,
            blood_type
          )
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      return response.sendNotFound(res, "Campaign not found");
    }

    return response.sendSuccess(res, {
      message: "Campaign retrieved successfully",
      data
    });
  } catch (error) {
    console.error("Error getting campaign:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Update campaign
 */
const updateCampaign = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    // Convert coordinates if provided
    if (updateData.latitude && updateData.longitude) {
      updateData.campaign_location = `SRID=4326;POINT(${updateData.longitude} ${updateData.latitude})`;
      delete updateData.latitude;
      delete updateData.longitude;
    }

    const { data, error } = await supabase
      .from("blood_campaigns")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    return response.sendSuccess(res, {
      message: "Campaign updated successfully",
      data
    });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Activate campaign
 */
const activateCampaign = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("blood_campaigns")
      .update({ status: 'active' })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    return response.sendSuccess(res, {
      message: "Campaign activated successfully",
      data
    });
  } catch (error) {
    console.error("Error activating campaign:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Cancel campaign
 */
const cancelCampaign = async (req, res) => {
  const { id } = req.params;
  const { cancellation_reason } = req.body;

  try {
    const { data, error } = await supabase
      .from("blood_campaigns")
      .update({ 
        status: 'cancelled',
        notes: cancellation_reason 
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    // Notify registered donors
    const { data: registrations } = await supabase
      .from("campaign_registrations")
      .select("user_id")
      .eq("campaign_id", id);

    if (registrations) {
      for (const reg of registrations) {
        try {
          await notificationService.notify({
            userId: reg.user_id,
            type: 'campaign',
            title: 'Kampanye Dibatalkan',
            message: `Kampanye "${data.title}" telah dibatalkan. ${cancellation_reason || ''}`,
            priority: 'medium',
            relatedId: id,
            relatedType: 'blood_campaign'
          });
        } catch (notifError) {
          console.error(`Failed to notify user ${reg.user_id}:`, notifError);
        }
      }
    }

    return response.sendSuccess(res, {
      message: "Campaign cancelled successfully",
      data
    });
  } catch (error) {
    console.error("Error cancelling campaign:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Register user to campaign
 */
const registerToCampaign = async (req, res) => {
  const { campaign_id, user_id } = req.body;

  try {
    // Check if already registered
    const { data: existing } = await supabase
      .from("campaign_registrations")
      .select("id")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user_id)
      .single();

    if (existing) {
      return response.sendBadRequest(res, "Already registered to this campaign");
    }

    // Check campaign capacity
    const { data: campaign } = await supabase
      .from("blood_campaigns")
      .select("max_participants, current_participants")
      .eq("id", campaign_id)
      .single();

    if (campaign?.max_participants && campaign.current_participants >= campaign.max_participants) {
      return response.sendBadRequest(res, "Campaign is full");
    }

    // Create registration
    const { data: registration, error } = await supabase
      .from("campaign_registrations")
      .insert([{ campaign_id, user_id }])
      .select()
      .single();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    return response.sendSuccess(res, {
      message: "Registered to campaign successfully",
      data: registration
    });
  } catch (error) {
    console.error("Error registering to campaign:", error);
    return response.sendServerError(res, error.message);
  }
};

export default {
  createCampaign,
  getAllCampaigns,
  getCampaignById,
  updateCampaign,
  activateCampaign,
  cancelCampaign,
  registerToCampaign
};
