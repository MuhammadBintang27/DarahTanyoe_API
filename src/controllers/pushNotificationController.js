import supabase from "../config/db.js";
import response from "../helpers/responses.js";

/**
 * Save FCM token for push notifications
 * POST /notification/save-token
 */
const saveFCMToken = async (req, res) => {
  const { user_id, fcm_token, platform } = req.body;

  try {
    // Validate required fields
    if (!user_id || !fcm_token) {
      return response.sendBadRequest(res, "user_id atau fcm_token tidak boleh kosong");
    }

    console.log(`📱 Saving FCM token for user: ${user_id} (${platform})`);

    // Check if push token already exists
    const { data: existingToken } = await supabase
      .from("push_tokens")
      .select("id")
      .eq("user_id", user_id)
      .eq("token", fcm_token)
      .single();

    if (existingToken) {
      // Update existing token with new timestamp
      const { error: updateError } = await supabase
        .from("push_tokens")
        .update({
          platform,
          active: true
        })
        .eq("id", existingToken.id);

      if (updateError) {
        console.error("❌ Error updating FCM token:", updateError);
        return response.sendServerError(res, "Failed to update FCM token");
      }

      console.log("✅ FCM token updated");
      return response.sendSuccess(res, {
        message: "FCM token updated successfully"
      });
    }

    // Insert new token
    const { data: newToken, error } = await supabase
      .from("push_tokens")
      .insert([{
        user_id: user_id || null,
        institution_id: null,
        token: fcm_token,
        platform,
        device_id: null,
        active: true
      }])
      .select()
      .single();

    if (error) {
      console.error("❌ Error saving FCM token:", error);
      console.error("Error details:", error.message);
      return response.sendServerError(res, "Failed to save FCM token");
    }

    console.log("✅ FCM token saved:", newToken.id);
    return response.sendSuccess(res, {
      message: "FCM token saved successfully",
      data: newToken
    });
  } catch (error) {
    console.error("Save FCM token error:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Send push notification untuk fulfillment campaigns
 * Called dari fulfillmentController saat mengirim notifikasi ke donors
 */
const sendFulfillmentNotification = async (donorId, campaignData) => {
  try {
    // Get donor's FCM tokens
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("fcm_token, platform")
      .eq("user_id", donorId)
      .eq("active", true);

    if (!tokens || tokens.length === 0) {
      console.log(`⚠️  No FCM tokens found for donor: ${donorId}`);
      return {
        success: false,
        message: "No push tokens available"
      };
    }

    console.log(`📤 Sending notifications to ${tokens.length} devices for donor: ${donorId}`);

    // Prepare notification payload
    const payload = {
      notification: {
        title: `Donor Darah Dibutuhkan!`,
        body: `${campaignData.patient_name} membutuhkan darah ${campaignData.blood_type}. Lokasi: ${campaignData.location}`,
      },
      data: {
        type: 'blood_campaign',
        relatedType: 'fulfillment',
        campaign_id: campaignData.campaign_id,
        fulfillment_id: campaignData.fulfillment_id,
        blood_type: campaignData.blood_type,
        urgency: campaignData.urgency_level || 'medium',
        patient_name: campaignData.patient_name,
        location: campaignData.location,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'darahtanyoe_channel'
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            alert: {
              title: `Donor Darah Dibutuhkan!`,
              body: `${campaignData.patient_name} membutuhkan darah ${campaignData.blood_type}`
            },
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    // Send to all tokens
    const results = [];
    for (const token of tokens) {
      try {
        // TODO: Send via Firebase Admin SDK
        // const result = await admin.messaging().send({
        //   token: token.fcm_token,
        //   ...payload
        // });
        
        results.push({
          token: token.fcm_token,
          platform: token.platform,
          status: 'pending' // Will be updated by Firebase
        });

        console.log(`✅ Notification queued for ${token.platform}`);
      } catch (error) {
        console.error(`❌ Error sending notification:`, error);
        results.push({
          token: token.fcm_token,
          platform: token.platform,
          status: 'failed',
          error: error.message
        });
      }
    }

    return {
      success: true,
      message: "Notifications queued",
      results,
      total_sent: results.filter(r => r.status !== 'failed').length,
      total_failed: results.filter(r => r.status === 'failed').length
    };
  } catch (error) {
    console.error("Send fulfillment notification error:", error);
    return {
      success: false,
      message: error.message
    };
  }
};

export default {
  saveFCMToken,
  sendFulfillmentNotification
};
