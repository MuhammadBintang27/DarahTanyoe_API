import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import notificationService from "../services/notificationService.js";

/**
 * Extract latitude & longitude dari PostGIS location field (EWKB binary format)
 * Handles:
 * - EWKB binary string format: "0101000020E61000004C2622F38AD75740594F9CF8B9461640"
 * - WKT format: "POINT(95.367856 5.569069)"
 * - GeoJSON format: {type: "Point", coordinates: [lng, lat]}
 */
const extractCoordinatesFromLocation = (location) => {
  if (!location) return null;

  try {
    console.log(`📍 Extracting coordinates from location, type: ${typeof location}`);
    
    // Format 1: WKT "POINT(longitude latitude)"
    if (typeof location === 'string') {
      // Try WKT format first
      const wktMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
      if (wktMatch) {
        const result = {
          longitude: parseFloat(wktMatch[1]),
          latitude: parseFloat(wktMatch[2])
        };
        console.log(`✅ WKT parsed: lon=${result.longitude}, lat=${result.latitude}`);
        return result;
      }

      // Try EWKB hex format (any valid hex string with length 40+)
      // EWKB is: 1 byte endian + 4 bytes geometry type + 8 bytes SRID (optional) + 8 bytes lon + 8 bytes lat
      if (/^[0-9a-f]+$/i.test(location) && location.length >= 40) {
        console.log(`🔄 EWKB hex detected, length: ${location.length}`);
        try {
          const buffer = Buffer.from(location, 'hex');
          console.log(`📦 Buffer created, length: ${buffer.length} bytes`);
          
          const endian = buffer[0]; // 0 = big, 1 = little
          const littleEndian = endian === 1;
          console.log(`🔀 Endian: ${littleEndian ? 'little' : 'big'}`);
          
          // Coordinates start at byte 9 (after SRID and geometry type)
          // Each coordinate is 8 bytes (double precision)
          if (buffer.length >= 25) {
            const longitude = buffer.readDoubleLE(9);
            const latitude = buffer.readDoubleLE(17);
            console.log(`✅ EWKB parsed: lon=${longitude}, lat=${latitude}`);
            return {
              longitude,
              latitude
            };
          } else {
            console.warn(`⚠️ Buffer too short: ${buffer.length} bytes, need 25+`);
          }
        } catch (bufferError) {
          console.error(`❌ Failed to parse EWKB buffer:`, bufferError.message);
        }
      }
    }

    // Format 2: GeoJSON {type: "Point", coordinates: [lng, lat]}
    if (typeof location === 'object' && location.type === 'Point' && Array.isArray(location.coordinates)) {
      const result = {
        longitude: location.coordinates[0],
        latitude: location.coordinates[1]
      };
      console.log(`✅ GeoJSON parsed: lon=${result.longitude}, lat=${result.latitude}`);
      return result;
    }

    console.warn(`⚠️ Location format not recognized: ${typeof location === 'string' ? location.substring(0, 50) : location}`);
  } catch (e) {
    console.error('❌ Error extracting coordinates from location:', e.message);
  }

  return null;
};

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

              // ✅ Auto-activate campaign once donors are found and confirmations created
              await supabase
                .from("blood_campaigns")
                .update({ status: 'active' })
                .eq("id", newCampaign.id);

              console.log("✅ Campaign activated automatically:", newCampaign.id);

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
      message: "Campaign berhasil dibuat",
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

    // Extract coordinates from campaign_location if available
    try {
      if (data.campaign_location) {
        const coords = extractCoordinatesFromLocation(data.campaign_location);
        if (coords) {
          data.latitude = coords.latitude;
          data.longitude = coords.longitude;
        }
      }
    } catch (coordError) {
      console.warn('⚠️ Failed to extract coordinates:', coordError);
    }

    return response.sendSuccess(res, {
      message: "Detail campaign berhasil dimuat",
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
      message: "Campaign berhasil diperbarui",
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
      message: "Campaign berhasil diaktifkan",
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
      message: "Campaign berhasil dibatalkan",
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
      message: "Berhasil terdaftar dalam campaign",
      data: registration
    });
  } catch (error) {
    console.error("Error registering to campaign:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Get nearest campaigns for a donor
 * Returns campaigns within specified radius, sorted by distance
 */
const getNearestCampaigns = async (req, res) => {
  const { userId } = req.params;
  const { radiusKm = 20, bloodType } = req.query;

  try {
    // Get user location
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("location, blood_type")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      console.log("❌ User not found:", userId);
      return response.sendBadRequest(res, "User not found");
    }

    if (!userData.location) {
      console.log("❌ User location not set for user:", userId);
      return response.sendBadRequest(res, "User location not set");
    }

    console.log("✅ User found:", userId);
    console.log("📍 User location:", userData.location);

    // Get campaign IDs that user already received notifications for
    // ✅ EXCLUDE: Campaigns where donor already completed OR campaigns already completed
    const { data: notifiedCampaigns, error: notifiedError } = await supabase
      .from("donor_confirmations")
      .select("fulfillment_requests(campaign_id)")
      .eq("donor_id", userId)
      .not("status", "eq", "pending_notification") // Got actual notifications
      .not("status", "eq", "completed")  // ✅ EXCLUDE: Donor already completed
      .not("status", "eq", "code_verified"); // ✅ EXCLUDE: Donor already checked in

    const campaignIds = (notifiedCampaigns || [])
      .map(dc => dc.fulfillment_requests?.campaign_id)
      .filter(id => id !== null);

    console.log(`📬 User received notifications for ${campaignIds.length} campaigns`);

    if (campaignIds.length === 0) {
      console.log("ℹ️ User has no notified campaigns yet");
      return response.sendSuccess(res, {
        message: "No nearby campaigns with notifications yet",
        data: [],
        count: 0,
        user_location: {
          latitude: userData.location.coordinates ? userData.location.coordinates[1] : userData.location.lat,
          longitude: userData.location.coordinates ? userData.location.coordinates[0] : userData.location.lon
        }
      });
    }

    console.log(`📋 Campaign IDs to query:`, campaignIds);

    // Get only campaigns that user received notifications for
    let query = supabase
      .from("blood_campaigns")
      .select(`
        *,
        organizer:institutions!blood_campaigns_organizer_id_fkey(
          id,
          institution_name,
          institution_type,
          address,
          phone_number
        ),
        related_blood_request:blood_requests!blood_campaigns_related_request_fkey(
          id,
          blood_type,
          quantity,
          patient_name,
          urgency_level
        )
      `)
      .in("id", campaignIds)
      .eq("status", "active")  // ✅ Only active campaigns
      .order("created_at", { ascending: false }); // Sort newest first

    // Filter by blood type if needed
    if (bloodType) {
      query = query.eq("blood_type", bloodType);
    }

    const { data: campaigns, error: campaignsError } = await query;

    if (campaignsError) {
      console.log("❌ Query error:", campaignsError);
      return response.sendServerError(res, campaignsError.message);
    }

    console.log("📊 Campaigns found with status='active':", campaigns?.length || 0);
    if (campaigns && campaigns.length > 0) {
      campaigns.forEach(c => {
        console.log(`  ✅ ${c.id} - ${c.title} (status: ${c.status})`);
      });
    }

    // Extract coordinates from campaign_location for each campaign
    const nearestCampaigns = campaigns
      .filter(c => c !== null)
      .map(campaign => {
        try {
          if (campaign.campaign_location) {
            const coords = extractCoordinatesFromLocation(campaign.campaign_location);
            if (coords) {
              campaign.latitude = coords.latitude;
              campaign.longitude = coords.longitude;
            }
          }
        } catch (e) {
          console.warn(`⚠️ Failed to extract coordinates for campaign ${campaign.id}:`, e.message);
        }
        return campaign;
      });

    console.log("✅ Final campaigns found:", nearestCampaigns.length);
    nearestCampaigns.forEach(c => {
      console.log(`  📍 ${c.title}`);
    });

    // Extract user coordinates for response
    let userLon, userLat;
    if (userData.location.coordinates) {
      [userLon, userLat] = userData.location.coordinates;
    } else {
      userLon = userData.location.lon || userData.location.longitude;
      userLat = userData.location.lat || userData.location.latitude;
    }

    return response.sendSuccess(res, {
      message: "Campaigns retrieved successfully",
      data: nearestCampaigns,
      count: nearestCampaigns.length,
      user_location: {
        latitude: userLat,
        longitude: userLon
      }
    });
  } catch (error) {
    console.error("Get nearest campaigns error:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Debug endpoint - Check all campaigns and their status
 */
const debugCampaigns = async (req, res) => {
  try {
    const { data: campaigns } = await supabase
      .from("blood_campaigns")
      .select("id, title, status, campaign_location, location, address");

    const { data: users } = await supabase
      .from("users")
      .select("id, email, location, blood_type");

    console.log("\n📊 === CAMPAIGN DEBUG ===");
    console.log("Total campaigns:", campaigns?.length || 0);
    campaigns?.forEach(c => {
      console.log(`  ${c.id} | ${c.title.substring(0, 30)} | status: ${c.status} | location: ${c.campaign_location ? 'SET' : 'EMPTY'} | ${c.location}`);
    });

    console.log("\n👥 === USER LOCATIONS ===");
    console.log("Total users:", users?.length || 0);
    users?.forEach(u => {
      console.log(`  ${u.id} | ${u.email} | ${u.blood_type} | location: ${u.location ? 'SET' : 'EMPTY'}`);
    });

    return response.sendSuccess(res, {
      message: "Debug info",
      campaigns: campaigns?.map(c => ({
        id: c.id,
        title: c.title,
        status: c.status,
        location: c.location,
        has_coordinates: !!c.campaign_location
      })),
      users: users?.map(u => ({
        id: u.id,
        email: u.email,
        blood_type: u.blood_type,
        has_location: !!u.location
      }))
    });
  } catch (error) {
    console.error("Debug error:", error);
    return response.sendServerError(res, error.message);
  }
};

export default {
  createCampaign,
  getAllCampaigns,
  getCampaignById,
  getNearestCampaigns,
  updateCampaign,
  activateCampaign,
  cancelCampaign,
  registerToCampaign,
  debugCampaigns
};
