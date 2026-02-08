import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import notificationService from "../services/notificationService.js";

// Get notifications for donor (user)
const getNotificationByUserId = async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return response.sendInternalError(res, error.message);
    }

    return response.sendSuccess(res, {
      data,
      message: "Berhasil memuat notifikasi",
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Get notifications for institution (PMI/RS)
const getNotificationByInstitutionId = async (req, res) => {
  const { institutionId } = req.params;
  const { limit, offset, unread_only } = req.query;

  try {
    const options = {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      unreadOnly: unread_only === 'true',
    };

    const result = await notificationService.getNotifications(institutionId, options);

    return response.sendSuccess(res, {
      data: result.notifications,
      total: result.total,
      message: "Berhasil memuat notifikasi",
    });
  } catch (error) {
    console.error("Get institution notifications error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Get unread count for institution
const getUnreadCount = async (req, res) => {
  const { institutionId } = req.params;

  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: 'exact', head: true })
      .eq("institution_id", institutionId)
      .eq("is_read", false);

    if (error) {
      return response.sendInternalError(res, error.message);
    }

    return response.sendSuccess(res, {
      unread_count: count || 0,
      message: "Berhasil memuat jumlah notifikasi belum dibaca",
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  const { notificationId } = req.params;

  try {
    await notificationService.markAsRead(notificationId);

    return response.sendSuccess(res, {
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Mark all notifications as read for institution
const markAllAsRead = async (req, res) => {
  const { institutionId } = req.params;

  try {
    await notificationService.markAllAsRead(institutionId);

    return response.sendSuccess(res, {
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Register push token for institution or user
const registerPushToken = async (req, res) => {
  const { institutionId, userId } = req.body;
  const { token, platform, device_id, fcm_token } = req.body;

  // Support both 'token' and 'fcm_token' parameter names
  const pushToken = token || fcm_token;

  if (!pushToken || !platform) {
    return response.sendBadRequest(res, "Token/fcm_token and platform are required");
  }

  // Must provide either institutionId OR userId
  if (!institutionId && !userId) {
    return response.sendBadRequest(res, "Either institutionId or userId is required");
  }

  try {
    const result = await notificationService.registerPushToken({
      institutionId: institutionId || null,
      userId: userId || null,
      token: pushToken,
      platform,
      deviceId: device_id,
    });

    return response.sendSuccess(res, {
      message: `Push token ${result.action}`,
      action: result.action,
    });
  } catch (error) {
    console.error("Register push token error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Unregister push token
const unregisterPushToken = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return response.sendBadRequest(res, "Token is required");
  }

  try {
    await notificationService.unregisterPushToken(token);

    return response.sendSuccess(res, {
      message: "Push token unregistered",
    });
  } catch (error) {
    console.error("Unregister push token error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Test notification (for development)
const sendTestNotification = async (req, res) => {
  const { institutionId, title, message } = req.body;

  if (!institutionId || !title || !message) {
    return response.sendBadRequest(res, "institutionId, title, and message are required");
  }

  try {
    const result = await notificationService.notify({
      institutionId,
      type: 'system',
      title,
      message,
      priority: 'medium',
      sendPush: true,
      sendEmail: false,
    });

    return response.sendSuccess(res, {
      message: "Test notification sent",
      result,
    });
  } catch (error) {
    console.error("Send test notification error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

export default {
  getNotificationByUserId,
  getNotificationByInstitutionId,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerPushToken,
  unregisterPushToken,
  sendTestNotification,
};
