import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import notificationService from "../services/notificationService.js";
import { getOrSet } from "../utils/cache.js";
import { invalidateForRequest } from "../utils/invalidation.js";

const createPartner = async (req, res) => {
  const fb_ver = process.env.FACEBOOK_MESSAGE_VERSION;
  const fb_phone = process.env.FACEBOOK_PHONE_NUMBER_ID;

  console.log(fb_ver, fb_phone);
};

const getPatnerWithBloodStock = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  
  try {
    // Validate pagination params
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
    const offset = (pageNum - 1) * limitNum;
    
    const key = `partners:with_stock:page${pageNum}:limit${limitNum}`;
    const ttl = 600; // 10 minutes for relatively static list

    const result = await getOrSet(key, ttl, async () => {
      // Get total count
      const { count: totalCount } = await supabase
        .from("institutions")
        .select("*", { count: 'exact', head: true })
        .eq("active", true);

      // Get paginated institutions
      const { data: dataInstitutions, error } = await supabase
        .from("institutions")
        .select("id, institution_name, institution_type, address, phone_number, active")
        .eq("active", true)
        .order("institution_name")
        .range(offset, offset + limitNum - 1);

      if (error) {
        throw new Error(error.message);
      }

      // Get blood stock only for returned institutions
      const institutionIds = dataInstitutions.map(i => i.id);
      const { data: dataBloodStock, error: errorBloodStock } = await supabase
        .from("blood_stock")
        .select("institution_id, blood_type, component_type, quantity, expiry_date")
        .in("institution_id", institutionIds)
        .eq("status", "available");

      if (errorBloodStock) {
        throw new Error(errorBloodStock.message);
      }

      // Map institutions with their blood stock
      const institutions = dataInstitutions.map((institution) => {
        const bloodStock = dataBloodStock.filter(
          (stock) => stock.institution_id === institution.id
        );

        return {
          ...institution,
          blood_stock:
            bloodStock.length > 0
              ? bloodStock.map((stock) => ({
                  blood_type: stock.blood_type,
                  component_type: stock.component_type,
                  quantity: stock.quantity,
                  expiry_date: stock.expiry_date,
                }))
              : [],
        };
      });

      return {
        data: institutions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
          hasMore: offset + limitNum < totalCount
        }
      };
    });

    return response.sendSuccess(res, {
      message: "Berhasil memuat daftar institusi dengan stok darah",
      ...result
    });
  } catch (error) {
    console.error("Get institutions error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Get single institution with blood stock
const getInstitutionById = async (req, res) => {
  const { institutionId } = req.params;

  try {
    const key = `partners:institution:${institutionId}`;
    const ttl = 120; // 2 minutes snapshot

    const result = await getOrSet(key, ttl, async () => {
      // Get institution data
      const { data: institution, error: instError } = await supabase
        .from("institutions")
        .select("*")
        .eq("id", institutionId)
        .eq("active", true)
        .single();

      if (instError || !institution) {
        throw new Error("Institution not found");
      }

      // Get blood stock for this institution (raw data, frontend will aggregate)
      const { data: bloodStock, error: stockError } = await supabase
        .from("blood_stock")
        .select("blood_type, component_type, quantity, expiry_date, updated_at")
        .eq("institution_id", institutionId)
        .eq("status", "available")
        .order("blood_type", { ascending: true })
        .order("component_type", { ascending: true });

      if (stockError) {
        console.error("Error fetching blood stock:", stockError);
      }

      const blood_stock = bloodStock || [];

      return {
        ...institution,
        blood_stock,
      }
    })

    return response.sendSuccess(res, {
      data: result,
      message: "Berhasil memuat detail institusi dengan stok darah",
    });
  } catch (error) {
    console.error("Get institution error:", error);
    // Distinguish not found vs internal
    const msg = error?.message === 'Institution not found' ? 'Institusi tidak ditemukan' : 'Terjadi kesalahan yang tidak terduga'
    return error?.message === 'Institution not found'
      ? response.sendNotFound(res, msg)
      : response.sendInternalError(res, msg)
  }
};

// Approve blood request by PMI
const approveBloodRequest = async (req, res) => {
  const { requestId } = req.params;

  try {
    // Get request data with institution details
    const { data: requestData, error: requestError } = await supabase
      .from("blood_requests")
      .select(`
        *,
        requester:institutions!blood_requests_requester_id_fkey(
          id,
          institution_name,
          phone_number
        ),
        partner:institutions!blood_requests_partner_id_fkey(
          id,
          institution_name
        )
      `)
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      return response.sendNotFound(res, "Permintaan darah tidak ditemukan");
    }

    if (requestData.status !== "pending") {
      return response.sendBadRequest(
        res,
        "Hanya permintaan berstatus menunggu yang dapat disetujui"
      );
    }

    // Check blood stock availability
    const { data: stockData, error: stockError } = await supabase
      .from("blood_stock")
      .select("quantity")
      .eq("institution_id", requestData.partner_id)
      .eq("blood_type", requestData.blood_type)
      .eq("status", "available")
      .single();

    // Always update status to "approved" first
    // PMI will decide later to create pickup or campaign based on stock
    const { error: updateError } = await supabase
      .from("blood_requests")
      .update({ 
        status: "approved",
        approved_at: new Date(),
        updated_at: new Date() 
      })
      .eq("id", requestId);

    if (updateError) {
      return response.sendInternalError(res, "Gagal menyetujui permintaan");
    }

    // Generate unique pickup code
    const uniqueCode = `BR${Date.now().toString().slice(-8)}`;
    const { error: codeError } = await supabase
      .from("blood_requests")
      .update({ pickup_code: uniqueCode })
      .eq("id", requestId);

    if (codeError) {
      console.error("Error generating unique code:", codeError);
    }

    // 🔔 Send notification to hospital using notificationService
    const stockAvailable = stockData?.quantity || 0;
    const isStockSufficient = stockAvailable >= requestData.quantity;
    
    try {
      await notificationService.notify({
        institutionId: requestData.requester_id,
        type: 'request',
        title: 'Permintaan Darah Disetujui',
        message: `Permintaan darah ${requestData.blood_type} untuk pasien ${requestData.patient_name} telah disetujui oleh ${requestData.partner?.institution_name}. ${isStockSufficient ? `Darah siap diambil dengan kode: ${uniqueCode}` : 'PMI sedang memproses pemenuhan stok.'}`,
        priority: 'high',
        relatedId: requestId,
        relatedType: 'blood_request',
        metadata: {
          unique_code: uniqueCode,
          blood_type: requestData.blood_type,
          quantity: requestData.quantity,
          stock_available: stockAvailable,
          is_sufficient: isStockSufficient,
        },
        actionUrl: `/blood-requests/${requestId}`,
        actionLabel: 'Lihat Detail',
        sendEmail: true,
      });
    } catch (notifError) {
      console.error('❌ Failed to send notification:', notifError);
      // Don't fail the approval if notification fails
    }

    // Invalidate related caches (lists + dashboards)
    await invalidateForRequest(requestId);

    return response.sendSuccess(res, {
      message: "Permintaan darah berhasil disetujui",
      status: "approved",
      unique_code: uniqueCode,
      stock_info: {
        available: stockAvailable,
        requested: requestData.quantity,
        is_sufficient: isStockSufficient
      }
    });
  } catch (error) {
    console.error("Approve request error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Reject blood request by PMI
const rejectBloodRequest = async (req, res) => {
  const { requestId } = req.params;
  const { rejection_reason } = req.body;

  try {
    // Get request data with institution details
    const { data: requestData, error: requestError } = await supabase
      .from("blood_requests")
      .select(`
        *,
        requester:institutions!blood_requests_requester_id_fkey(
          id,
          institution_name
        ),
        partner:institutions!blood_requests_partner_id_fkey(
          id,
          institution_name
        )
      `)
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      return response.sendNotFound(res, "Permintaan darah tidak ditemukan");
    }

    if (requestData.status !== "pending") {
      return response.sendBadRequest(
        res,
        "Hanya permintaan berstatus menunggu yang dapat ditolak"
      );
    }

    // Update status to rejected
    const { error: updateError } = await supabase
      .from("blood_requests")
      .update({ 
        status: "rejected",
        rejection_reason: rejection_reason || "Tidak ada alasan",
        updated_at: new Date() 
      })
      .eq("id", requestId);

    if (updateError) {
      return response.sendInternalError(res, "Gagal menolak permintaan");
    }

    // 🔔 Send notification to hospital using notificationService
    try {
      await notificationService.notify({
        institutionId: requestData.requester_id,
        type: 'request',
        title: 'Permintaan Darah Ditolak',
        message: `Permintaan darah ${requestData.blood_type} untuk pasien ${requestData.patient_name} ditolak oleh ${requestData.partner?.institution_name}. Alasan: ${rejection_reason || 'Tidak ada alasan'}`,
        priority: 'high',
        relatedId: requestId,
        relatedType: 'blood_request',
        metadata: {
          blood_type: requestData.blood_type,
          quantity: requestData.quantity,
          rejection_reason: rejection_reason || 'Tidak ada alasan',
        },
        actionUrl: `/blood-requests/${requestId}`,
        actionLabel: 'Lihat Detail',
        sendEmail: true,
      });
    } catch (notifError) {
      console.error('❌ Failed to send notification:', notifError);
      // Don't fail the rejection if notification fails
    }

    // Invalidate related caches (lists + dashboards)
    await invalidateForRequest(requestId);

    return response.sendSuccess(res, {
      message: "Permintaan darah berhasil ditolak",
      status: "rejected"
    });
  } catch (error) {
    console.error("Reject request error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const confirmRequest = async (req, res) => {
  const { requestId } = req.params;
  const fb_ver = process.env.FACEBOOK_MESSAGE_VERSION;
  const fb_phone = process.env.FACEBOOK_PHONE_NUMBER_ID;
  const fb_access_token = process.env.FACEBOOK_ACCESS_TOKEN;

  try {
    const { data: requestData, error: requestError } = await supabase
      .from("blood_requests")
      .select(
        "id, patient_name, phone_number, blood_type, status, requester_id, partner_id, partners(name, longitude, latitude)"
      )
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      return response.sendNotFound(res, "Permintaan darah tidak ditemukan");
    }

    // Check if the request is in approved status before sending to donors
    if (requestData.status !== "approved") {
      return response.sendBadRequest(
        res,
        "Hanya permintaan berstatus disetujui yang dapat dikirim ke pendonor terdekat"
      );
    }

    const { patient_name, phone_number, blood_type } = requestData;
    const { name, longitude, latitude } = requestData.partners;
    const radius = 5000;

    // Get nearby users for notification
    const { data: nearbyUsers, error: nearbyError } = await supabase.rpc(
      "get_nearby_users",
      {
        target_long: parseFloat(longitude),
        target_lat: parseFloat(latitude),
        radius: parseFloat(radius),
      }
    );

    if (nearbyError) {
      console.error("Error fetching nearby users:", nearbyError);
      return response.sendInternalError(res, "Gagal memuat data pengguna terdekat");
    }

    // Mengirim Notifikasi WhatsApp ke Setiap User
    await Promise.all(
      nearbyUsers.map(async (user) => {
        try {
          //   const waPayload = {
          //     data: {
          //       body_variables: [
          //         user.full_name,
          //         patient_name,
          //         phone_number,
          //         blood_type,
          //         name,
          //       ],
          //     },
          //     recipients: [
          //       {
          //         whatsapp_number: user.phone_number,
          //         first_name: user.full_name,
          //         replace: false,
          //       },
          //     ],
          //   };
          const waPayload = {
            messaging_product: "whatsapp",
            to: user.phone_number,
            type: "template",
            template: {
              name: "darahtanyoe_permintaan_terdekat",
              language: {
                code: "en",
              },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: user.full_name },
                    { type: "text", text: patient_name },
                    { type: "text", text: phone_number },
                    { type: "text", text: blood_type },
                    { type: "text", text: name },
                  ],
                },
              ],
            },
          };

          //   const waResponse = await axios.post(
          //     "https://app.wanotifier.com/api/v1/notifications/bK4BD75Ybe?key=I4E2g6TmwOEymmWdKk5DKsrXW3NRdO",
          //     waPayload
          //   );
          const waResponse = await axios.post(
            `https://graph.facebook.com/${fb_ver}/${fb_phone}/messages`,
            waPayload,
            {
              headers: {
                Authorization: `Bearer ${fb_access_token}`,
                "Content-Type": "application/json",
              },
            }
          );
          

          console.log(
            `✅ WhatsApp notification sent to ${user.phone_number}:`,
            waResponse.data
          );
          // console.log(`📢 WhatsApp notification sent to ${user.phone_number}:`, waResponse.data);
        } catch (waError) {
          console.error(
            `❌ Error sending WhatsApp to ${user.phone_number}:`,
            waError.message
          );
        }
      })
    );

    // Menyimpan Notifikasi dalam Database
    const notifications = nearbyUsers.map((user) => ({
      user_id: user.id,
      title: "Ada permintaan darah di sekitar Anda.",
      message: "Ketuk untuk melihat informasi lebih lanjut.",
      type: "app",
      related_to: "request",
      is_read: false,
      created_at: new Date(),
    }));

    const { data: notificationData, error: notificationError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (notificationError) {
      console.error("Error saving notifications:", notificationError);
      return response.sendInternalError(res, "Gagal menyimpan notifikasi");
    }

    // Update request status to confirmed
    const { data, error } = await supabase
      .from("blood_requests")
      .update({
        status: "confirmed",
        updated_at: new Date(),
      })
      .eq("id", requestId)
      .select();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    // Invalidate related caches
    await invalidateForRequest(requestId);

    return response.sendSuccess(res, {
      data,
      message: "Permintaan darah berhasil dikonfirmasi",
    });
  } catch (error) {
    console.error("Confirm request error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

export default {
  createPartner,
  getPatnerWithBloodStock,
  getInstitutionById,
  confirmRequest,
  approveBloodRequest,
  rejectBloodRequest,
};
