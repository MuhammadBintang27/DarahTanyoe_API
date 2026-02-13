import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import { DateTime } from "luxon";
import notificationService from "../services/notificationService.js";
import { invalidate } from "../utils/cache.js";
import { extractCoordinatesFromLocation } from "../utils/coordinates.js";

const createBloodReq = async (req, res) => {
  const requestBody = req.body;

  try {
    // Remove deprecated fields
    const { expiry_date, needed_by, reason, ...cleanBody } = requestBody;
    
    const payload = {
      ...cleanBody,
      // Map reason to medical_condition if medical_condition not provided
      medical_condition: cleanBody.medical_condition || reason,
      // Set defaults
      unit_type: cleanBody.unit_type || 'kantong',
      urgency_level: cleanBody.urgency_level || 'medium',
    };
    
    const { data: newRequest, error } = await supabase
      .from("blood_requests")
      .insert([payload])
      .select(`
        *,
        requester:institutions!blood_requests_requester_id_fkey(
          id,
          institution_name,
          institution_type
        )
      `)
      .single();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    // 🔔 Send notification to PMI (partner)
    if (newRequest.partner_id) {
      try {
        await notificationService.notify({
          institutionId: newRequest.partner_id,
          type: 'request',
          title: 'Permintaan Darah Baru',
          message: `${newRequest.requester.institution_name} membutuhkan ${newRequest.quantity} kantong darah ${newRequest.blood_type}`,
          priority: newRequest.urgency_level === 'critical' || newRequest.urgency_level === 'high' ? 'high' : 'medium',
          relatedId: newRequest.id,
          relatedType: 'blood_request',
          metadata: {
            blood_type: newRequest.blood_type,
            quantity: newRequest.quantity,
            patient_name: newRequest.patient_name,
          },
          actionUrl: `/blood-requests/${newRequest.id}`,
          actionLabel: 'Lihat Detail',
          sendEmail: newRequest.urgency_level === 'critical',
        });
      } catch (notifError) {
        console.error('❌ Failed to send notification:', notifError);
        // Don't fail the request creation if notification fails
      }
    }

    // Invalidate relevant caches (lists + dashboard)
    try {
      const keys = [
        newRequest?.requester_id ? `requests:by_requester:${newRequest.requester_id}` : null,
        newRequest?.partner_id ? `requests:by_partner:${newRequest.partner_id}` : null,
        newRequest?.requester_id ? `dashboard:rs:${newRequest.requester_id}:summary` : null,
        newRequest?.partner_id ? `dashboard:pmi:${newRequest.partner_id}:summary` : null,
        newRequest?.requester_id ? `dashboard:rs:${newRequest.requester_id}:trend:requests:30` : null,
        newRequest?.partner_id ? `dashboard:pmi:${newRequest.partner_id}:trend:requests:30` : null,
      ].filter(Boolean)
      if (keys.length) await invalidate(keys)
    } catch (e) {
      console.warn('[cache] createBloodReq invalidate fail:', e?.message)
    }

    return response.sendCreated(res, {
      message: "Permintaan darah berhasil dibuat",
      data: { id: newRequest.id },
    });
  } catch (error) {
    console.error("Create blood request error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const getBloodRequestById = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("blood_requests")
      .select(`
        *,
        requester:institutions!blood_requests_requester_id_fkey(
          id,
          institution_name,
          institution_type,
          address,
          phone_number
        ),
        partner:institutions!blood_requests_partner_id_fkey(
          id,
          institution_name,
          institution_type
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      return response.sendBadRequest(res, error.message);
    }

    if (!data) {
      return response.sendNotFound(res, "Permintaan darah tidak ditemukan");
    }

    // Extract coordinates from PostGIS location if available
    if (data.location) {
      try {
        const coords = extractCoordinatesFromLocation(data.location);
        if (coords) {
          data.latitude = coords.latitude;
          data.longitude = coords.longitude;
        }
      } catch (e) {
        console.warn('Could not extract coordinates:', e.message);
      }
    }

    return response.sendSuccess(res, {
      data,
      message: "Detail permintaan darah berhasil dimuat",
    });
  } catch (error) {
    console.error("Get blood request error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const getBloodReqByUserId = async (req, res) => {
  const { requesterId } = req.params;
  const { page = 1, limit = 10, bloodType, partnerId, date, status } = req.query;

  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build base query for counting
    let countQuery = supabase
      .from("blood_requests")
      .select("*", { count: 'exact', head: true })
      .eq("requester_id", requesterId);

    // Apply filters to count query
    if (bloodType) countQuery = countQuery.eq("blood_type", bloodType);
    if (partnerId) countQuery = countQuery.eq("partner_id", partnerId);
    if (status) countQuery = countQuery.eq("status", status);
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      countQuery = countQuery.gte("created_at", startOfDay.toISOString())
                             .lte("created_at", endOfDay.toISOString());
    }

    // Count total items for pagination metadata
    const { count: totalItems, error: countError } = await countQuery;

    if (countError) {
      throw new Error(countError.message);
    }

    // Build data query with filters
    let dataQuery = supabase
      .from("blood_requests")
      .select(`
        *,
        requester:institutions!blood_requests_requester_id_fkey(
          id,
          institution_name,
          institution_type,
          address,
          phone_number
        ),
        partner:institutions!blood_requests_partner_id_fkey(
          id,
          institution_name,
          institution_type
        )
      `)
      .eq("requester_id", requesterId);

    // Apply filters to data query
    if (bloodType) dataQuery = dataQuery.eq("blood_type", bloodType);
    if (partnerId) dataQuery = dataQuery.eq("partner_id", partnerId);
    if (status) dataQuery = dataQuery.eq("status", status);
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      dataQuery = dataQuery.gte("created_at", startOfDay.toISOString())
                           .lte("created_at", endOfDay.toISOString());
    }

    dataQuery = dataQuery.order("created_at", { ascending: false })
                         .range(offset, offset + limitNum - 1);

    const { data, error } = await dataQuery;

    if (error) {
      throw new Error(error.message);
    }

    const totalPages = Math.ceil(totalItems / limitNum);

    return response.sendSuccess(res, {
      data,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      message: "Daftar permintaan darah berhasil dimuat",
    });
  } catch (error) {
    console.error("Get blood requests error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const getBloodReqByPartnerId = async (req, res) => {
  const { institutionId } = req.params;
  const { page = 1, limit = 10, bloodType, requesterId, date, status } = req.query;

  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build base query for counting
    let countQuery = supabase
      .from("blood_requests")
      .select("*", { count: 'exact', head: true })
      .eq("partner_id", institutionId);

    // Apply filters to count query
    if (bloodType) countQuery = countQuery.eq("blood_type", bloodType);
    if (requesterId) countQuery = countQuery.eq("requester_id", requesterId);
    if (status) countQuery = countQuery.eq("status", status);
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      countQuery = countQuery.gte("created_at", startOfDay.toISOString())
                             .lte("created_at", endOfDay.toISOString());
    }

    // Count total items for pagination metadata
    const { count: totalItems, error: countError } = await countQuery;

    if (countError) {
      throw new Error(countError.message);
    }

    // Build data query with filters
    let dataQuery = supabase
      .from("blood_requests")
      .select(`
        *,
        requester:institutions!blood_requests_requester_id_fkey(
          id,
          institution_name,
          institution_type,
          address,
          phone_number
        )
      `)
      .eq("partner_id", institutionId);

    // Apply filters to data query
    if (bloodType) dataQuery = dataQuery.eq("blood_type", bloodType);
    if (requesterId) dataQuery = dataQuery.eq("requester_id", requesterId);
    if (status) dataQuery = dataQuery.eq("status", status);
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      dataQuery = dataQuery.gte("created_at", startOfDay.toISOString())
                           .lte("created_at", endOfDay.toISOString());
    }

    dataQuery = dataQuery.order("created_at", { ascending: false })
                         .range(offset, offset + limitNum - 1);

    const { data: bloodRequests, error: bloodRequestsError } = await dataQuery;

    if (bloodRequestsError) {
      throw new Error(bloodRequestsError.message);
    }

    const totalPages = Math.ceil(totalItems / limitNum);

    return response.sendSuccess(res, {
      data: bloodRequests,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      message: "Daftar permintaan darah berhasil dimuat",
    });
  } catch (error) {
    console.error("Get blood requests error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const getNearbyBloodRequests = async (req, res) => {
  const { user_id } = req.params;
  const radius = 10000;

  try {
    // const { data: cancelledRequests, error: cancelError } = await supabase
    //   .from("blood_requests")
    //   .update({ status: "cancelled" })
    //   .lt("expiry_date", new Date().toISOString())
    //   .neq("status", "cancelled")
    //   .select(); // biar kita bisa tahu datanya apa aja

    // if (cancelError) {
    //   console.error(
    //     "Error cancelling expired blood requests:",
    //     cancelError.message
    //   );
    // } else if (cancelledRequests.length > 0) {
    //   console.log("✅ Auto-cancelled requests:", cancelledRequests);
    // } else {
    //   console.log("ℹ️ No expired blood requests to cancel.");
    // }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("location")
      .eq("id", user_id)
      .single();

    if (userError || !userData) {
      return response.sendNotFound(res, "Pengguna tidak ditemukan");
    }

    const { data: locationData, error: locationError } = await supabase.rpc(
      "st_asgeojson",
      { geom: userData.location }
    );

    if (locationError || !locationData) {
      return response.sendInternalError(res, "Gagal mendapatkan lokasi pengguna");
    }

    const userLocation = JSON.parse(locationData);
    const userLongitude = userLocation.coordinates[0];
    const userLatitude = userLocation.coordinates[1];

    const { data: nearbyRequests, error: nearbyError } = await supabase.rpc(
      "get_nearby_blood_requests",
      {
        user_long: userLongitude,
        user_lat: userLatitude,
        radius: radius,
      }
    );

    if (nearbyError) {
      console.error("Error fetching nearby blood requests:", nearbyError);
      return response.sendInternalError(
        res,
        "Gagal mengambil permintaan darah terdekat"
      );
    }

    return response.sendSuccess(res, {
      data: nearbyRequests,
      message: "Permintaan darah terdekat berhasil dimuat",
    });
  } catch (error) {
    console.error("Error retrieving nearby blood requests:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const patchBloodRequestStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return response.sendBadRequest(res, "Status harus diisi");
  }

  const validStatuses = [
    "pending",
    "cancelled",
    "completed",
    "ready",
    "confirmed",
  ];
  if (!validStatuses.includes(status)) {
    return response.sendBadRequest(res, "Nilai status tidak valid");
  }

  try {
    // Fetch request to know which caches to invalidate
    const { data: reqData, error: fetchErr } = await supabase
      .from('blood_requests')
      .select('id, requester_id, partner_id')
      .eq('id', id)
      .single()

    if (fetchErr || !reqData) {
      return response.sendNotFound(res, 'Permintaan darah tidak ditemukan')
    }

    const { error } = await supabase
      .from("blood_requests")
      .update({ status })
      .eq("id", id);

    if (error) {
      return response.sendInternalError(res, error.message);
    }

    // Invalidate caches (lists + dashboard)
    try {
      const keys = [
        `request:${id}`,
        reqData?.requester_id ? `requests:by_requester:${reqData.requester_id}` : null,
        reqData?.partner_id ? `requests:by_partner:${reqData.partner_id}` : null,
        reqData?.requester_id ? `dashboard:rs:${reqData.requester_id}:summary` : null,
        reqData?.partner_id ? `dashboard:pmi:${reqData.partner_id}:summary` : null,
        reqData?.requester_id ? `dashboard:rs:${reqData.requester_id}:trend:requests:30` : null,
        reqData?.partner_id ? `dashboard:pmi:${reqData.partner_id}:trend:requests:30` : null,
      ].filter(Boolean)
      if (keys.length) await invalidate(keys)
    } catch (e) {
      console.warn('[cache] patchBloodRequestStatus invalidate fail:', e?.message)
    }

    return response.sendSuccess(res, {
      message: "Status permintaan darah berhasil diperbarui",
    });
  } catch (error) {
    console.error("Update blood request status error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const verifyUniqueCode = async (req, res) => {
  const { id } = req.params;
  const { unique_code } = req.body;

  try {
    const { data, error } = await supabase
      .from("blood_requests")
      .select("id")
      .eq("id", id)
      .eq("unique_code", unique_code);

    if (error) {
      return response.sendInternalError(res, error.message);
    }

    if (data.length === 0) {
      return response.sendNotFound(res, "Kode unik tidak ditemukan");
    }

    return response.sendSuccess(res, {
      data,
      message: "Kode unik berhasil diverifikasi",
    });
  } catch (error) {
    console.error("Verify unique code error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

export default {
  createBloodReq,
  getBloodReqByUserId,
  getBloodRequestById,
  getBloodReqByPartnerId,
  getNearbyBloodRequests,
  patchBloodRequestStatus,
  verifyUniqueCode,
};
