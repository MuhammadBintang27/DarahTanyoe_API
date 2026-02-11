import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import bcrypt from "bcrypt";

// Register Institution (RS/PMI)
const registerInstitution = async (req, res) => {
  try {
    const {
      institution_type,
      email,
      password,
      institution_name,
      address,
      phone_number,
      latitude,
      longitude,
    } = req.body;

    // Validasi input
    if (!institution_type || !email || !password || !institution_name || !address) {
      return response.sendBadRequest(res, "Data yang dibutuhkan belum lengkap");
    }

    // Validasi institution_type
    if (!['hospital', 'pmi'].includes(institution_type)) {
      return response.sendBadRequest(res, "Jenis institusi tidak valid. Harus 'hospital' atau 'pmi'");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if email already exists
    const { data: existingInstitution } = await supabase
      .from("institutions")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (existingInstitution) {
      return response.sendBadRequest(res, "Email Sudah Terdaftar");
    }

    // Insert institution
    const { data, error } = await supabase
      .from("institutions")
      .insert([
        {
          institution_type,
          email,
          password: hashedPassword,
          institution_name,
          address,
          phone_number,
          location: latitude && longitude 
            ? `SRID=4326;POINT(${longitude} ${latitude})` 
            : null,
          updated_at: new Date(),
        },
      ])
      .select();

    if (error) {
      console.error("Error creating institution:", error);
      return response.sendBadRequest(res, error.message);
    }

    // Remove password from response
    const institutionData = { ...data[0] };
    delete institutionData.password;

    return response.sendCreated(res, {
      message: "Institusi berhasil didaftarkan",
      institution: institutionData,
    });
  } catch (error) {
    console.error("Register institution error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Login Institution
const loginInstitution = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return response.sendBadRequest(res, "Email dan password harus diisi");
    }

    // Get institution
    const { data: institution, error } = await supabase
      .from("institutions")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error || !institution) {
      return response.sendBadRequest(res, "email atau password salah");
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, institution.password);
    if (!isValidPassword) {
      return response.sendBadRequest(res, "email atau password salah");
    }

    // Generate session token (simple implementation)
    const sessionToken = Buffer.from(`${institution.id}:${Date.now()}`).toString('base64');
    const sessionExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Remove password from response
    const institutionData = { ...institution };
    delete institutionData.password;

    return response.sendSuccess(res, {
      message: "Login berhasil",
      institution: institutionData,
      session: {
        access_token: sessionToken,
        refresh_token: sessionToken,
        expires_at: new Date(sessionExpiry).toISOString(),
      },
    });
  } catch (error) {
    console.error("Login institution error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

export default {
  registerInstitution,
  loginInstitution,
};
