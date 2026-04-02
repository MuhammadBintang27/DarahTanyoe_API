import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { sendWhatsAppOTP, sendWhatsAppNotification } from "../services/whatsappService.js";
import { generateOTP, getOTPExpiry } from "../utils/otp.js";
import { getOrSet, invalidate } from "../utils/cache.js";

// Initialize new Supabase client for OTP operations
const supa = createClient(
  process.env.SUPABASE_PROJECT_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const signInWithPhone = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return response.sendBadRequest(res, "Nomor telepon harus diisi");
  }

  try {
    // Generate OTP
    const otp = generateOTP();

    // Set expiry time (5 minutes)
    const expiryTime = getOTPExpiry(5);

    // Delete any existing OTP records for this phone number first
    console.log("🔍 DEBUG signInWithPhone - Deleting existing OTP records for phone:", phone);
    await supa
      .from("otp_records")
      .delete()
      .eq("phone", phone);

    // Store OTP in Supabase using supa client (insert new record)
    const { data, error } = await supa
      .from("otp_records")
      .insert([
        {
          phone,
          otp,
          expiry: expiryTime.toISOString(),
          attempts: 0,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error storing OTP:", error.message);
      return response.sendInternalError(res, "Gagal menyimpan kode OTP");
    }

    // Send OTP via WhatsApp (uncomment when ready)
    // await sendWhatsAppOTP(phone, otp);

    console.log("OTP sent to phone:", otp);

    return response.sendSuccess(res, {
      message: "Kode OTP berhasil dikirim ke nomor telepon",
      otp: otp, // Remove this in production
      expiry: expiryTime.toISOString(),
    });
  } catch (error) {
    console.error("Signin error:", error);
    return response.sendInternalError(
      res,
      "Terjadi kesalahan saat mengirim OTP"
    );
  }
};

const verifyOTP = async (req, res) => {
  let { phone, token } = req.body;

  console.log("🔍 DEBUG verifyOTP - Received body:", req.body);
  console.log("🔍 DEBUG verifyOTP - Phone:", phone, "Token:", token);

  if (!phone || !token) {
    return response.sendBadRequest(
      res,
      "Nomor telepon dan kode OTP harus diisi"
    );
  }

  try {
    // Fetch OTP record from Supabase using supa client
    console.log("🔍 DEBUG verifyOTP - Querying otp_records for phone:", phone);
    const { data: otpRecord, error: fetchError } = await supa
      .from("otp_records")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
      
    console.log("🔍 DEBUG verifyOTP - Query result:", { otpRecord, fetchError });
    
    if (fetchError || !otpRecord) {
      console.log("🔍 DEBUG verifyOTP - OTP record not found or error:", fetchError);
      return response.sendBadRequest(res, `Kode OTP tidak ditemukan atau sudah kadaluarsa`);
    }

    const { otp, expiry, attempts, id } = otpRecord;
    console.log("🔍 DEBUG verifyOTP - OTP record details:", { otp, expiry, attempts, id });

    // Check number of attempts
    if (attempts >= 3) {
      console.log("🔍 DEBUG verifyOTP - Too many attempts:", attempts);
      await supa.from("otp_records").delete().eq("id", id);
      return response.sendBadRequest(
        res,
        "Terlalu banyak percobaan gagal. Silakan minta kode OTP baru"
      );
    }

    // Increment attempts
    const { error: updateError } = await supa
      .from("otp_records")
      .update({ attempts: attempts + 1 })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating attempts:", updateError);
      return response.sendInternalError(res, "Gagal memperbarui percobaan OTP");
    }

    // Check expiry
    const now = new Date();
    const expiryDate = new Date(expiry);
    console.log("🔍 DEBUG verifyOTP - Checking expiry:", { now: now.toISOString(), expiry: expiryDate.toISOString(), isExpired: now > expiryDate });
    
    if (now > expiryDate) {
      console.log("🔍 DEBUG verifyOTP - OTP expired");
      await supa.from("otp_records").delete().eq("id", id);
      return response.sendBadRequest(
        res,
        "Kode OTP sudah kadaluarsa. Silakan minta kode baru"
      );
    }

    // Verify OTP
    console.log("🔍 DEBUG verifyOTP - Comparing tokens:", { 
      received: token, 
      receivedType: typeof token,
      stored: otp, 
      storedType: typeof otp,
      match: token === otp 
    });
    if (token !== otp) {
      console.log("🔍 DEBUG verifyOTP - Invalid OTP");
      return response.sendBadRequest(res, "Kode OTP tidak valid");
    }

    // OTP valid - delete from database
    await supa.from("otp_records").delete().eq("id", id);

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const sessionExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Format phone number
    const phone_number = phone.replace("+", "");

    // Check if user exists (using supa client for consistency)
    const { data: user, error: userError } = await supa
      .from("users")
      .select("*")
      .eq("phone_number", phone_number)
      .maybeSingle();

    if (userError) {
      return response.sendBadRequest(res, userError.message);
    }

    return response.sendSuccess(res, {
      data: {
        session: {
          access_token: sessionToken,
          expires_at: new Date(sessionExpiry).toISOString(),
        },
        user: {
          phone: phone_number,
        },
      },
      user: user || {},
      message: user
        ? "Berhasil masuk"
        : "Nomor telepon berhasil diverifikasi. Silakan lengkapi profil Anda.",
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return response.sendInternalError(
      res,
      "Terjadi kesalahan saat verifikasi"
    );
  }
};

export { signInWithPhone, verifyOTP };

const getUserPoints = async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from("users")
      .select("total_points")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return response.sendNotFound(res, "Pengguna tidak ditemukan");
    }

    return response.sendSuccess(res, {
      total_points: data.total_points,
    });
  } catch (error) {
    console.error("Error fetching user points:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const completeUserProfile = async (req, res) => {
  try {
    // Validasi data input
    const {
      email,
      full_name,
      phoneNumber,
      address,
      latitude,
      longitude,
      date_of_birth,
      blood_type,
      last_donation_date,
      health_notes,
      profile_picture,
    } = req.body;

    // Strip + dari phoneNumber jika ada
    const cleanPhoneNumber = phoneNumber.replace(/^\+/, '');

    // Validasi input wajib
    if (
      !email ||
      !full_name ||
      !address ||
      latitude === undefined ||
      longitude === undefined ||
      !date_of_birth ||
      !blood_type ||
      !cleanPhoneNumber
    ) {
      return response.sendBadRequest(res, "Data yang dibutuhkan belum lengkap");
    }

    // Validasi usia berdasarkan date_of_birth (17-65 tahun)
    const birthDate = new Date(date_of_birth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;

    if (actualAge < 17 || actualAge > 65) {
      return response.sendBadRequest(res, "Usia harus antara 17 hingga 65 tahun berdasarkan tanggal lahir");
    }

    // Validasi blood_type enum
    const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!validBloodTypes.includes(blood_type)) {
      return response.sendBadRequest(res, "Golongan darah tidak valid");
    }

    // Check duplikat phone_number 
    const { data: existingUser, error: checkError } = await supabase
      .from("users")
      .select("id")
      .or(`phone_number.eq.${cleanPhoneNumber}`)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing user:", checkError);
      return response.sendInternalError(res, "Gagal memeriksa pengguna yang sudah ada");
    }

    if (existingUser) {
      return response.sendBadRequest(res, "Nomor telepon sudah terdaftar");
    }

    // Simpan data ke Supabase
    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          email,
          phone_number: cleanPhoneNumber,
          full_name,
          address,
          location: latitude && longitude
            ? `SRID=4326;POINT(${longitude} ${latitude})`
            : null,
          date_of_birth,
          blood_type,
          last_donation_date,
          health_notes,
          total_points: 0,
          profile_picture,
          phone_verified: true,  // Set true setelah complete profile
          updated_at: new Date(),
        },
      ])
      .select();

    if (error) {
      console.error("Error creating user profile:", error);
      return response.sendBadRequest(res, error.message);
    }

    return response.sendCreated(res, {
      message: "Profil pengguna berhasil dibuat",
      user: data[0],
    });
  } catch (error) {
    console.error("Complete profile error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const signInWithWeb = async (req, res) => {
  const { email, password } = req.body;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (userError) {
    console.log("ERROR: ", userError);
    return response.sendBadRequest(res, userError.message);
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log("ERROR: ", error.message);
      return response.sendBadRequest(res, error.message);
    }

    return response.sendSuccess(res, {
      user,
      session: data.session,
      message: "Berhasil masuk",
    });
  } catch (error) {
    console.error("Signin error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const sendNotification = async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return response.sendBadRequest(res, "Nomor telepon dan pesan harus diisi");
  }

  try {
    await sendWhatsAppNotification(phone, message);

    return response.sendSuccess(res, {
      message: "Notifikasi berhasil dikirim melalui WhatsApp"
    });
  } catch (error) {
    console.error("Send notification error:", error);
    return response.sendInternalError(
      res,
      "Terjadi kesalahan saat mengirim notifikasi"
    );
  }
};

// GET /users/:id - fetch single user profile
const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return response.sendBadRequest(res, "ID pengguna diperlukan");
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, full_name, phone_number, email, blood_type, address, date_of_birth, total_donations, total_points, last_donation_date, health_notes, notifications_enabled, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching user:", error);
      return response.sendInternalError(res, "Gagal memuat data pengguna");
    }

    if (!user) {
      return response.sendNotFound(res, "Pengguna tidak ditemukan");
    }

    return response.sendSuccess(res, { user });
  } catch (err) {
    console.error("getUserProfile error:", err);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      email,
      phone_number,
      address,
      latitude,
      longitude,
      health_notes,
      notifications_enabled,
    } = req.body;

    console.log("🔍 DEBUG updateUserProfile - User ID:", id);
    console.log("🔍 DEBUG updateUserProfile - Request body:", req.body);

    // Validasi minimal - minimal ada satu field yang diupdate
    if (!email && !phone_number && !address && !health_notes && 
        (latitude === undefined && longitude === undefined) &&
        notifications_enabled === undefined) {
      return response.sendBadRequest(res, "Minimal satu data harus diisi untuk diperbarui");
    }

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !existingUser) {
      console.error("Error fetching user:", fetchError);
      return response.sendNotFound(res, "Pengguna tidak ditemukan");
    }

    // Prepare update data
    const updateData = {};

    // Update fields if provided
    if (email) updateData.email = email;
    if (phone_number) updateData.phone_number = phone_number;
    if (address) updateData.address = address;
    if (health_notes !== undefined) updateData.health_notes = health_notes;
    if (notifications_enabled !== undefined) updateData.notifications_enabled = notifications_enabled;

    // Handle location conversion (lat/lng to EWKB)
    if (latitude !== undefined && longitude !== undefined) {
      updateData.location = `SRID=4326;POINT(${longitude} ${latitude})`;
      console.log("🔍 DEBUG updateUserProfile - Location EWKB:", updateData.location);
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString();

    console.log("🔍 DEBUG updateUserProfile - Update data to save:", updateData);

    // Update user profile
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select("*");

    if (updateError) {
      console.error("Error updating user profile:", updateError);
      return response.sendInternalError(res, updateError.message);
    }

    console.log("✅ User profile updated successfully:", updatedUser);
    const userToReturn = updatedUser[0];
    console.log("🔍 DEBUG - User ID:", userToReturn?.id);
    console.log("🔍 DEBUG - notifications_enabled in response:", userToReturn?.notifications_enabled);
    console.log("🔍 DEBUG - User fields count:", Object.keys(userToReturn || {}).length);
    console.log("🔍 DEBUG - All user fields:", Object.keys(userToReturn || {}));

    return response.sendSuccess(res, {
      message: "Profil pengguna berhasil diperbarui",
      user: userToReturn,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

export default {
  signInWithPhone,
  verifyOTP,
  completeUserProfile,
  signInWithWeb,
  getUserPoints,
  sendNotification,
  getUserProfile,
  updateUserProfile,
};
