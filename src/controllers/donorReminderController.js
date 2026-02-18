import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import { sendWhatsAppNotification } from "../services/whatsappService.js";

/**
 * Get eligible donors for reminder (completed donation 90 days ago)
 * Returns list of donors who can donate again
 */
const getEligibleDonorsForReminder = async () => {
  try {
    // Calculate date 90 days ago (vaccination period)
    const vaccinationEndDate = new Date();
    vaccinationEndDate.setDate(vaccinationEndDate.getDate() - 90);
    
    // Get donors who completed donation exactly around 90 days ago (±1 day tolerance)
    const startDate = new Date(vaccinationEndDate);
    startDate.setDate(startDate.getDate() - 1);
    const endDate = new Date(vaccinationEndDate);
    endDate.setDate(endDate.getDate() + 1);

    // Get completed donations from 89-91 days ago
    const { data: recentDonations, error: donationError } = await supabase
      .from("donations")
      .select(`
        id,
        donor_id,
        donation_date,
        blood_type,
        quantity,
        donor:users!donations_donor_id_fkey(
          id,
          full_name,
          phone_number,
          blood_type
        )
      `)
      .eq("status", "completed")
      .gte("donation_date", startDate.toISOString())
      .lte("donation_date", endDate.toISOString())
      .order("donation_date", { ascending: false });

    if (donationError) {
      console.error("❌ Error fetching donations:", donationError);
      return [];
    }

    if (!recentDonations || recentDonations.length === 0) {
      console.log("ℹ️ No donations found from 90 days ago");
      return [];
    }

    // Filter unique donors (avoid duplicate reminders if multiple donations on same day)
    const uniqueDonors = [];
    const donorIds = new Set();

    for (const donation of recentDonations) {
      if (!donorIds.has(donation.donor_id)) {
        donorIds.add(donation.donor_id);
        uniqueDonors.push({
          donor_id: donation.donor_id,
          donor_name: donation.donor?.full_name,
          phone_number: donation.donor?.phone_number,
          blood_type: donation.donor?.blood_type,
          last_donation_date: donation.donation_date,
          donation_id: donation.id
        });
      }
    }

    console.log(`✅ Found ${uniqueDonors.length} eligible donors for reminder`);
    return uniqueDonors;

  } catch (error) {
    console.error("❌ Error in getEligibleDonorsForReminder:", error);
    return [];
  }
};

/**
 * Send WhatsApp reminder to eligible donors
 * Scheduled job endpoint (called via Vercel Cron or external trigger)
 */
const sendDonorReminders = async (req, res) => {
  try {
    // Simple security check: Vercel Cron or authorized requests only
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    
    // Allow if called by Vercel Cron (has x-vercel-cron header) or with valid auth token
    const isVercelCron = req.headers['x-vercel-cron'];
    const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
    
    if (!isVercelCron && !isAuthorized) {
      console.log("⚠️ Unauthorized cron access attempt");
      return response.sendUnauthorized(res, "Akses tidak diizinkan. Endpoint ini hanya untuk scheduled job.");
    }

    console.log("🔔 Starting donor reminder job...");

    // Get eligible donors
    const eligibleDonors = await getEligibleDonorsForReminder();

    if (eligibleDonors.length === 0) {
      return response.sendSuccess(res, {
        message: "Tidak ada donor yang eligible untuk reminder hari ini",
        sent_count: 0,
        donors: []
      });
    }

    // Send WhatsApp to each eligible donor
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const donor of eligibleDonors) {
      try {
        if (!donor.phone_number) {
          console.log(`⚠️ Skipping ${donor.donor_name} - no phone number`);
          failedCount++;
          continue;
        }

        const formatDate = (isoString) => {
          const date = new Date(isoString);
          return new Intl.DateTimeFormat('id-ID', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            timeZone: 'Asia/Jakarta'
          }).format(date);
        };

        const message = `Selamat! 🎉

Masa vakum donor Anda telah berakhir pada hari ini.

INFORMASI DONOR:
Nama: ${donor.donor_name}
Golongan Darah: ${donor.blood_type}
Donasi Terakhir: ${formatDate(donor.last_donation_date)}

Saat ini Anda sudah bisa mendonorkan darah kembali! 🩸

Anda akan menerima notifikasi jika ada permintaan darah yang sesuai dengan profil Anda. Atau, Anda bisa langsung membuat janji donor melalui aplikasi DarahTanyoe.

Terima kasih telah menjadi pahlawan tanpa tanda jasa! 💪`;

        await sendWhatsAppNotification(donor.phone_number, message);
        
        console.log(`✅ Reminder sent to ${donor.donor_name} (${donor.phone_number})`);
        successCount++;

        results.push({
          donor_id: donor.donor_id,
          donor_name: donor.donor_name,
          phone_number: donor.phone_number,
          status: 'sent'
        });

        // Add small delay to avoid rate limiting (100ms between messages)
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (whatsappError) {
        console.error(`❌ Failed to send reminder to ${donor.donor_name}:`, whatsappError.message);
        failedCount++;

        results.push({
          donor_id: donor.donor_id,
          donor_name: donor.donor_name,
          phone_number: donor.phone_number,
          status: 'failed',
          error: whatsappError.message
        });
      }
    }

    console.log(`🔔 Reminder job completed: ${successCount} sent, ${failedCount} failed`);

    return response.sendSuccess(res, {
      message: `Reminder berhasil dikirim ke ${successCount} donor`,
      sent_count: successCount,
      failed_count: failedCount,
      total_eligible: eligibleDonors.length,
      results
    });

  } catch (error) {
    console.error("❌ Error in sendDonorReminders:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Manual trigger: Send reminder to specific donors (for testing/admin use)
 */
const sendManualReminder = async (req, res) => {
  const { donor_ids } = req.body;

  try {
    if (!donor_ids || !Array.isArray(donor_ids) || donor_ids.length === 0) {
      return response.sendBadRequest(res, "donor_ids array harus diisi");
    }

    // Get donor details
    const { data: donors, error: donorError } = await supabase
      .from("users")
      .select("id, full_name, phone_number, blood_type")
      .in("id", donor_ids)
      .eq("role", "donor");

    if (donorError || !donors || donors.length === 0) {
      return response.sendBadRequest(res, "Donor tidak ditemukan");
    }

    // Get last donation for each donor
    const results = [];
    let successCount = 0;

    for (const donor of donors) {
      try {
        const { data: lastDonation } = await supabase
          .from("donations")
          .select("donation_date")
          .eq("donor_id", donor.id)
          .eq("status", "completed")
          .order("donation_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const formatDate = (isoString) => {
          const date = new Date(isoString);
          return new Intl.DateTimeFormat('id-ID', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            timeZone: 'Asia/Jakarta'
          }).format(date);
        };

        const message = `Selamat! 🎉

Masa vakum donor Anda telah berakhir.

INFORMASI DONOR:
Nama: ${donor.full_name}
Golongan Darah: ${donor.blood_type}
${lastDonation ? `Donasi Terakhir: ${formatDate(lastDonation.donation_date)}` : ''}

Saat ini Anda sudah bisa mendonorkan darah kembali! 🩸

Anda akan menerima notifikasi jika ada permintaan darah yang sesuai dengan profil Anda. Atau, Anda bisa langsung membuat janji donor melalui aplikasi DarahTanyoe.

Terima kasih telah menjadi pahlawan tanpa tanda jasa! 💪`;

        if (donor.phone_number) {
          await sendWhatsAppNotification(donor.phone_number, message);
          console.log(`✅ Manual reminder sent to ${donor.full_name}`);
          successCount++;

          results.push({
            donor_id: donor.id,
            donor_name: donor.full_name,
            status: 'sent'
          });
        } else {
          results.push({
            donor_id: donor.id,
            donor_name: donor.full_name,
            status: 'failed',
            error: 'No phone number'
          });
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Failed to send to ${donor.full_name}:`, error.message);
        results.push({
          donor_id: donor.id,
          donor_name: donor.full_name,
          status: 'failed',
          error: error.message
        });
      }
    }

    return response.sendSuccess(res, {
      message: `Reminder berhasil dikirim ke ${successCount} dari ${donors.length} donor`,
      sent_count: successCount,
      total: donors.length,
      results
    });

  } catch (error) {
    console.error("❌ Error in sendManualReminder:", error);
    return response.sendServerError(res, error.message);
  }
};

export default {
  sendDonorReminders,
  sendManualReminder,
  getEligibleDonorsForReminder
};
