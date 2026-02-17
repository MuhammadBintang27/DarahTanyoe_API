import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import notificationService from "../services/notificationService.js";
import { sendWhatsAppNotification } from "../services/whatsappService.js";
import { invalidateForPartnerStock } from "../utils/invalidation.js";

/**
 * Create Janji Donor (Donor Biasa)
 * Flow: insert pending → update to confirmed (trigger generates code)
 */
const createJanjiDonor = async (req, res) => {
  const { donor_id, pmi_id, blood_type, scheduled_at, notes } = req.body;

  try {
    if (!donor_id || !blood_type) {
      return response.sendBadRequest(res, "donor_id dan golongan darah harus diisi");
    }

    // Guard: Cek apakah sudah ada Janji Donor aktif/berjalan untuk donor ini
    // Aktif = status pending/confirmed/code_verified (agar cegah double-click race)
    const { data: existingActive, error: existingErr } = await supabase
      .from("donor_confirmations")
      .select("*")
      .eq("confirmation_origin", "donor_biasa")
      .eq("donor_id", donor_id)
      .in("status", ["pending", "confirmed", "code_verified"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      return response.sendServerError(res, existingErr.message);
    }
    if (existingActive) {
      // Konflik: sudah ada janji donor berjalan → jangan buat baru
      return res.status(409).json({
        ok: false,
        code: "ACTIVE_APPOINTMENT_EXISTS",
        message: "Anda sudah memiliki Janji Donor yang aktif.",
        existing: existingActive,
      });
    }

    // Validate donor exists and matches blood_type if provided
    const { data: donor } = await supabase
      .from("users")
      .select("id, full_name, blood_type, phone_number")
      .eq("id", donor_id)
      .single();

    if (!donor) {
      return response.sendNotFound(res, "Pendonor tidak ditemukan");
    }

    // Resolve PMI if not provided: pick any active PMI (later: nearest based on donor.location)
    let resolvedPmiId = pmi_id;
    if (!resolvedPmiId) {
      const { data: anyPmi } = await supabase
        .from("institutions")
        .select("id")
        .eq("institution_type", "pmi")
        .eq("active", true)
        .limit(1)
        .single();
      if (!anyPmi) {
        return response.sendBadRequest(res, "PMI belum tersedia");
      }
      resolvedPmiId = anyPmi.id;
    }

    // Compute distance_km between donor and selected PMI using dedicated RPC
    let computedDistanceKm = null;
    try {
      const { data: distValue, error: distErr } = await supabase.rpc('compute_user_pmi_distance', {
        p_user_id: donor_id,
        p_pmi_id: resolvedPmiId
      });
      if (!distErr && typeof distValue === 'number') {
        computedDistanceKm = Number(distValue);
      }
    } catch (e) {
      console.warn('⚠️ Failed to compute distance_km for Donor Biasa:', e?.message);
    }

    // Insert as pending first (to trigger code generation on update → confirmed)
    const { data: pending, error: insertError } = await supabase
      .from("donor_confirmations")
      .insert({
        fulfillment_request_id: null,
        campaign_id: null,
        donor_id,
        status: "pending",
        confirmation_origin: "donor_biasa",
        pmi_id: resolvedPmiId,
        scheduled_at: scheduled_at || null,
        code_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: notes || null,
        distance_km: computedDistanceKm
      })
      .select("*")
      .single();

    if (insertError) {
      return response.sendBadRequest(res, insertError.message);
    }

    // Update to confirmed to trigger unique code via DB trigger
    const { data: confirmed, error: updateError } = await supabase
      .from("donor_confirmations")
      .update({ status: "confirmed" })
      .eq("id", pending.id)
      .select(`
        *,
        donor:users!donor_confirmations_donor_id_fkey(id, full_name, blood_type)
      `)
      .single();

    if (updateError) {
      return response.sendBadRequest(res, updateError.message);
    }

    // Send WhatsApp notification with unique code (walk-in donor - no patient info)
    try {
      if (donor?.phone_number) {
        const formatDate = (isoString) => {
          const date = new Date(isoString);
          return new Intl.DateTimeFormat('id-ID', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jakarta'
          }).format(date) + ' WIB';
        };

        const message = `Terima kasih telah bersedia mendonorkan darah! 🩸\n\nJANJI DONOR ANDA:\nKode Unik: *${confirmed.unique_code}*\nGolongan Darah: ${confirmed.donor?.blood_type || blood_type}\nBerlaku sampai: ${formatDate(confirmed.code_expires_at)}\n\n📱 Lihat detail: darahtanyoe://confirmation/${confirmed.id}\n\nSilakan datang ke PMI dengan kode unik ini untuk verifikasi dan donasi. Terima kasih telah menyelamatkan nyawa!`;

        await sendWhatsAppNotification(donor.phone_number, message);
        console.log(`📱 WhatsApp sent to ${donor.full_name} (walk-in donor)`);
      }
    } catch (whatsappError) {
      console.error("❌ Failed to send WhatsApp notification:", whatsappError.message);
      // Don't fail the request - WhatsApp is optional
    }

    return response.sendSuccess(res, {
      message: "Janji Donor berhasil dibuat. Kode unik telah dihasilkan.",
      data: {
        id: confirmed.id,
        uniqueCode: confirmed.unique_code,
        donorName: confirmed.donor?.full_name || donor.full_name,
        bloodType: confirmed.donor?.blood_type || blood_type,
        codeExpiresAt: confirmed.code_expires_at
      }
    });
  } catch (error) {
    console.error("Error creating Janji Donor:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Verify Janji Donor by 8–12 char code (PMI)
 */
const verifyJanjiDonor = async (req, res) => {
  const { kode, pmi_id } = req.body;

  try {
    if (!kode || !pmi_id) {
      return response.sendBadRequest(res, "kode dan pmi_id harus diisi");
    }

    const { data: confirmation } = await supabase
      .from("donor_confirmations")
      .select(`
        *,
        donor:users!donor_confirmations_donor_id_fkey(id, full_name, blood_type)
      `)
      .eq("unique_code", kode)
      .eq("confirmation_origin", "donor_biasa")
      .single();

    if (!confirmation) {
      return response.sendNotFound(res, "Kode tidak ditemukan");
    }

    // Expiry check
    const now = new Date();
    const expiresAt = confirmation.code_expires_at ? new Date(confirmation.code_expires_at) : null;
    if (expiresAt && now > expiresAt) {
      await supabase
        .from("donor_confirmations")
        .update({ status: "expired" })
        .eq("id", confirmation.id);
      return response.sendBadRequest(res, "Kode sudah kadaluarsa");
    }

    // PMI match check (use pmi_id column, not fulfillment)
    if (!confirmation.pmi_id || confirmation.pmi_id !== pmi_id) {
      return response.sendBadRequest(res, "Kode ini tidak untuk PMI Anda");
    }

    // Already verified?
    if (confirmation.code_verified) {
      return response.sendBadRequest(res, "Kode sudah diverifikasi");
    }

    const { data: updated, error: updateError } = await supabase
      .from("donor_confirmations")
      .update({
        code_verified: true,
        code_verified_at: new Date().toISOString(),
        verified_by: pmi_id,
        status: "code_verified",
        check_in_time: new Date().toISOString()
      })
      .eq("id", confirmation.id)
      .select(`
        *,
        donor:users!donor_confirmations_donor_id_fkey(id, full_name, blood_type)
      `)
      .single();

    if (updateError) {
      return response.sendBadRequest(res, updateError.message);
    }

    return response.sendSuccess(res, {
      message: "Kode berhasil diverifikasi",
      data: updated
    });
  } catch (error) {
    console.error("Error verifying Janji Donor:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Complete Janji Donor → create donation + add blood stock (free stock)
 */
const completeJanjiDonor = async (req, res) => {
  const { confirmation_id, pmi_id, quantity, notes, medical_notes, health_screening } = req.body;

  try {
    if (!confirmation_id || !pmi_id || !quantity) {
      return response.sendBadRequest(res, "confirmation_id, pmi_id, dan quantity harus diisi");
    }

    const { data: confirmation } = await supabase
      .from("donor_confirmations")
      .select(`
        *,
        donor:users!donor_confirmations_donor_id_fkey(id, full_name, blood_type)
      `)
      .eq("id", confirmation_id)
      .eq("confirmation_origin", "donor_biasa")
      .single();

    if (!confirmation) {
      return response.sendNotFound(res, "Konfirmasi tidak ditemukan");
    }

    if (confirmation.status !== "code_verified") {
      return response.sendBadRequest(res, `Kode harus diverifikasi terlebih dahulu. Status saat ini: ${confirmation.status}`);
    }

    // Create donation using donor's blood_type (no fulfillment link)
    const donorBloodType = confirmation.donor?.blood_type;
    const { data: donation, error: donationError } = await supabase
      .from("donations")
      .insert({
        donor_id: confirmation.donor_id,
        institution_id: pmi_id,
        blood_type: donorBloodType,
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

    // Update confirmation to completed
    const { data: updated } = await supabase
      .from("donor_confirmations")
      .update({
        status: "completed",
        donation_id: donation.id,
        donation_completed_at: new Date().toISOString(),
        check_out_time: new Date().toISOString()
      })
      .eq("id", confirmation_id)
      .select("*")
      .single();

    // Add blood stock (free stock)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 35);
    const batchNumber = `BATCH-${donorBloodType}-${Date.now()}`;

    const { data: bloodStock } = await supabase
      .from("blood_stock")
      .insert({
        institution_id: pmi_id,
        donation_id: donation.id,
        blood_type: donorBloodType,
        quantity,
        expiry_date: expiryDate.toISOString().split('T')[0],
        batch_number: batchNumber,
        collection_date: new Date().toISOString().split('T')[0],
        status: 'available',
        component_type: 'whole_blood'
      })
      .select()
      .single();

    // History entry
    const { data: currentStock } = await supabase
      .from("blood_stock")
      .select("quantity")
      .eq("institution_id", pmi_id)
      .eq("blood_type", donorBloodType)
      .eq("status", "available")
      .neq("id", bloodStock?.id || "00000000-0000-0000-0000-000000000000");

    const previousQuantity = currentStock?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const newTotalQuantity = previousQuantity + quantity;

    await supabase
      .from("blood_stock_history")
      .insert({
        institution_id: pmi_id,
        blood_type: donorBloodType,
        change_type: 'add',
        quantity_change: quantity,
        previous_quantity: previousQuantity,
        new_quantity: newTotalQuantity,
        notes: `Donasi (Janji Donor) dari ${confirmation.donor?.full_name} - Batch: ${batchNumber}`,
        created_by: pmi_id
      });

    // Invalidate PMI stock-related caches (snapshot, partner details, lists)
    try {
      await invalidateForPartnerStock(pmi_id);
    } catch (e) {
      console.warn('[cache] invalidateForPartnerStock failed:', e?.message);
    }

    // Notify donor
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

    return response.sendSuccess(res, {
      message: "Janji Donor berhasil diselesaikan",
      data: {
        donation,
        confirmation: updated,
        blood_stock: bloodStock
      }
    });
  } catch (error) {
    console.error("Error completing Janji Donor:", error);
    return response.sendServerError(res, error.message);
  }
};

export default {
  createJanjiDonor,
  verifyJanjiDonor,
  completeJanjiDonor,
  async cancelJanjiDonor(req, res) {
    try {
      const { confirmation_id, donor_id } = req.body;
      if (!confirmation_id || !donor_id) {
        return response.sendBadRequest(res, "confirmation_id dan donor_id harus diisi");
      }

      // Ambil konfirmasi dan validasi kepemilikan + origin
      const { data: conf, error } = await supabase
        .from('donor_confirmations')
        .select('*')
        .eq('id', confirmation_id)
        .eq('donor_id', donor_id)
        .eq('confirmation_origin', 'donor_biasa')
        .maybeSingle();
      if (error) return response.sendServerError(res, error.message);
      if (!conf) return response.sendNotFound(res, 'Janji Donor tidak ditemukan');

      if (['completed','cancelled','expired','failed'].includes(conf.status)) {
        return response.sendBadRequest(res, `Tidak dapat membatalkan pada status: ${conf.status}`);
      }

      const { data: updated, error: upErr } = await supabase
        .from('donor_confirmations')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', confirmation_id)
        .select('*')
        .single();
      if (upErr) return response.sendServerError(res, upErr.message);

      return response.sendSuccess(res, { message: 'Janji Donor dibatalkan', data: updated });
    } catch (e) {
      return response.sendServerError(res, e.message);
    }
  },
  async getActiveJanjiDonor(req, res) {
    try {
      const donorId = req.user?.id || req.query?.donor_id;
      if (!donorId) {
        return response.sendBadRequest(res, "donor_id harus diisi");
      }

      const { data, error } = await supabase
        .from("donor_confirmations")
        .select(`
          *,
          donor:users!donor_confirmations_donor_id_fkey(id, full_name, blood_type, phone_number)
        `)
        .eq("confirmation_origin", "donor_biasa")
        .eq("donor_id", donorId)
        .in("status", ["confirmed", "code_verified"]) // aktif yang ditampilkan ke pengguna
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return response.sendServerError(res, error.message);
      }

      return response.sendSuccess(res, {
        message: "Janji Donor aktif",
        active: data || null,
      });
    } catch (e) {
      return response.sendServerError(res, e.message);
    }
  },
  async listJanjiDonorConfirmations(req, res) {
    const { pmi_id, status } = req.query;
    try {
      if (!pmi_id) {
        return response.sendBadRequest(res, "pmi_id harus diisi");
      }

      let query = supabase
        .from("donor_confirmations")
        .select(`
          id, donor_id, unique_code, status, code_expires_at, code_verified, code_verified_at,
          created_at, updated_at, scheduled_at, pmi_id,
          donor:users!donor_confirmations_donor_id_fkey(id, full_name, blood_type, phone_number)
        `)
        .eq("confirmation_origin", "donor_biasa")
        .eq("pmi_id", pmi_id)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) {
        return response.sendBadRequest(res, error.message);
      }

      return response.sendSuccess(res, {
        message: "Daftar konfirmasi Janji Donor",
        data,
      });
    } catch (error) {
      console.error("Error listing Janji Donor confirmations:", error);
      return response.sendServerError(res, error.message);
    }
  }
};
