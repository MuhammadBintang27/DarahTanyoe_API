import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
// import dotenv from "dotenv";

// dotenv.config();

// Initialize new Supabase client for OTP operations
const supa = createClient(
  process.env.SUPABASE_PROJECT_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Function to generate OTP (unchanged)
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Fungsi untuk mengirim OTP melalui WhatsApp menggunakan WAnotifier
const sendWhatsAppOTP = async (phone, otp) => {
  try {
    const message = `Kode OTP Anda adalah: ${otp}. Kode ini berlaku selama 5 menit.`;
    const urlAPI =
      "https://app.wanotifier.com/api/v1/notifications/9EbMPvrONH?key=NDF9Dct0JIjVnOxT7QyRhRBATObe5y";

    const payload = {
      data: {
        body_variables: [otp],
      },
      recipients: [
        {
          whatsapp_number: phone,
          first_name: "User",
          replace: false,
        },
      ],
    };

    const response = await axios.post(urlAPI, payload);

    console.log("WhatsApp message sent:", response.data.message);

    return { success: true, data: response.data, message: message };
  } catch (error) {
    console.error("Error sending WhatsApp OTP:", error);
    throw new Error("Failed to send OTP via WhatsApp");
  }
};

const signInWithPhone = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return response.sendBadRequest(res, "Phone number is required");
  }

  try {
    // Generate OTP
    const otp = generateOTP();

    // Set expiry time (5 minutes)
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000);

    // Store OTP in Supabase using supa client
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
      return response.sendInternalError(res, "Failed to store OTP");
    }

    // Send OTP via WhatsApp (uncomment when ready)
    await sendWhatsAppOTP(phone, otp);

    console.log("OTP sent to phone:", otp);

    return response.sendSuccess(res, {
      message: "Successfully sent OTP to phone number",
      otp: otp, // Remove this in production
      expiry: expiryTime.toISOString(),
    });
  } catch (error) {
    console.error("Signin error:", error);
    return response.sendInternalError(
      res,
      "An unexpected error occurred when sending OTP"
    );
  }
};

const verifyOTP = async (req, res) => {
  let { phone, token } = req.body;

  if (!phone || !token) {
    return response.sendBadRequest(
      res,
      "Phone number and OTP token are required"
    );
  }

  try {
    // Fetch OTP record from Supabase using supa client
    const { data: otpRecord, error: fetchError } = await supa
      .from("otp_records")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();
      
    if (fetchError || !otpRecord) {
      return response.sendBadRequest(res, `OTP not requested or expired`);
    }

    const { otp, expiry, attempts, id } = otpRecord;

    // Check number of attempts
    if (attempts >= 3) {
      await supa.from("otp_records").delete().eq("id", id);
      return response.sendBadRequest(
        res,
        "Too many failed attempts. Please request a new OTP"
      );
    }

    // Increment attempts
    const { error: updateError } = await supa
      .from("otp_records")
      .update({ attempts: attempts + 1 })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating attempts:", updateError);
      return response.sendInternalError(res, "Failed to update OTP attempts");
    }

    // Check expiry
    if (new Date() > new Date(expiry)) {
      await supa.from("otp_records").delete().eq("id", id);
      return response.sendBadRequest(
        res,
        "OTP has expired. Please request a new one"
      );
    }

    // Verify OTP
    if (token !== otp) {
      return response.sendBadRequest(res, "Invalid OTP");
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
        ? "Logged in successfully"
        : "Phone number verified successfully. Please complete your profile.",
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return response.sendInternalError(
      res,
      "An unexpected error occurred during verification"
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

    if (error) {
      console.error("Error fetching user points:", error);
      return response.sendInternalError(res, "Failed to fetch user points");
    }

    if (!data) {
      return response.sendNotFound(res, "User not found");
    }

    return response.sendSuccess(res, {
      total_points: data.total_points,
    });
  } catch (error) {
    console.error("Error fetching user points:", error);
    return response.sendInternalError(res, "An unexpected error occurred");
  }
};

const completeUserProfile = async (req, res) => {
  try {
    // Validasi autentikasi
    // const {
    //   data: { user },
    //   error: userError,
    // } = await supabase.auth.getUser();

    // if (userError || !user) {
    //   return response.sendUnauthorized(res, "Authentication required");
    // }

    // Validasi data input
    const {
      email,
      full_name,
      phoneNumber,
      address,
      latitude,
      longitude,
      age,
      blood_type,
      last_donation_date,
      health_notes,
      profile_picture,
    } = req.body;

    if (
      !email ||
      !full_name ||
      !address ||
      latitude === undefined ||
      longitude === undefined ||
      !age ||
      !blood_type
    ) {
      return response.sendBadRequest(res, "Missing required fields");
    }

    // Simpan data ke Supabase
    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          email: email,
          phone_number: phoneNumber,
          full_name,
          address,
          location: `SRID=4326;POINT(${longitude} ${latitude})`,
          age,
          blood_type,
          last_donation_date,
          health_notes,
          total_points: 0,
          profile_picture,
          updated_at: new Date(),
        },
      ])
      .select();

    if (error) {
      console.error("Error creating user profile:", error);
      return response.sendBadRequest(res, error.message);
    }

    const user_phone = `+${phoneNumber}`;
    const bodyToWANotifier = {
      whatsapp_number: user_phone,
      first_name: full_name,
      lists: ["Default"],
      status: "subscribed",
      replace: false,
    };

    // Panggil API WAnotifier - jika gagal, akan masuk ke blok catch
    try {
      const waResponse = await axios.post(
        "https://app.wanotifier.com/api/v1/contacts/?key=I4E2g6TmwOEymmWdKk5DKsrXW3NRdO",
        bodyToWANotifier
      );
      console.log("User added to WAnotifier successfully:", waResponse.data);
    } catch (waError) {
      console.error("Error adding user to WAnotifier:", waError);

      // Rollback - hapus user dari Supabase karena WAnotifier gagal
      const { error: deleteError } = await supabase
        .from("users")
        .delete()
        .match({ email: email, phone_number: phoneNumber });

      if (deleteError) {
        console.error("Error during rollback:", deleteError);
      }

      return response.sendBadRequest(
        res,
        "Failed to register with notification service: " + waError.message
      );
    }

    return response.sendCreated(res, {
      message:
        "User profile created and phone_number added to WAnotifier successfully",
      user: data[0],
    });
  } catch (error) {
    console.error("Complete profile error:", error);
    return response.sendInternalError(res, "An unexpected error occurred");
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
      message: "Successfully signed in",
    });
  } catch (error) {
    console.error("Signin error:", error);
    return response.sendInternalError(res, "An unexpected error occurred");
  }
};

export default {
  signInWithPhone,
  verifyOTP,
  completeUserProfile,
  signInWithWeb,
  getUserPoints,
};
