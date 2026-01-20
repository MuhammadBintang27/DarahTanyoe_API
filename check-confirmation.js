import supabase from "./src/config/db.js";

const confirmationId = "b0ce6c3c-204b-43f4-90ce-72633eb827c7";

async function checkConfirmation() {
  const { data, error } = await supabase
    .from("donor_confirmations")
    .select(`
      *,
      fulfillment:fulfillment_requests(*),
      donor:users!donor_confirmations_donor_id_fkey(
        id,
        full_name,
        phone_number,
        blood_type
      )
    `)
    .eq("id", confirmationId)
    .single();

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("\n========================================");
  console.log("📋 DONOR CONFIRMATION DETAILS");
  console.log("========================================\n");
  
  console.log("✅ Confirmation ID:", data.id);
  console.log("👤 Donor Name:", data.donor?.full_name);
  console.log("🩸 Blood Type:", data.donor?.blood_type);
  console.log("📞 Phone:", data.donor?.phone_number);
  console.log("\n--- STATUS ---");
  console.log("Status:", data.status.toUpperCase());
  console.log("Code Verified:", data.code_verified ? "YES ✓" : "NO");
  
  console.log("\n--- UNIQUE CODE ---");
  console.log("🔑 Unique Code:", data.unique_code || "NOT GENERATED YET");
  console.log("📅 Code Generated At:", data.code_generated_at || "N/A");
  console.log("⏰ Code Expires At:", data.code_expires_at);
  
  console.log("\n--- FULFILLMENT INFO ---");
  console.log("Patient Name:", data.fulfillment?.patient_name);
  console.log("Blood Type Needed:", data.fulfillment?.blood_type);
  console.log("Quantity Needed:", data.fulfillment?.quantity_needed, "bags");
  console.log("Urgency Level:", data.fulfillment?.urgency_level);
  
  console.log("\n========================================\n");
}

checkConfirmation();
