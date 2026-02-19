import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import { invalidate } from "../utils/cache.js";

/**
 * Get donations pending processing (test_passed but components not created)
 */
const getPendingProcessing = async (req, res) => {
  try {
    const { pmi_id } = req.query;

    let query = supabase
      .from("donations")
      .select(`
        *,
        donor:users!donations_donor_id_fkey(
          id,
          full_name,
          phone_number
        ),
        institution:institutions!donations_institution_id_fkey(
          id,
          institution_name
        )
      `)
      .eq("components_created", false)
      .in("status", ["pending", "completed"])
      .order("donation_date", { ascending: false });

    if (pmi_id) {
      query = query.eq("institution_id", pmi_id);
    }

    const { data: donations, error } = await query;

    if (error) {
      console.error("❌ Error getting pending donations:", error);
      return response.sendBadRequest(res, error.message);
    }

    // Format donor data to match expected frontend structure
    const formattedDonations = donations?.map(d => ({
      ...d,
      donor: d.donor ? {
        id: d.donor.id,
        name: d.donor.full_name,
        phone: d.donor.phone_number
      } : null,
      institution: d.institution,
      // Keep pmi for backward compatibility
      pmi: d.institution
    })) || [];

    console.log(`✅ Found ${formattedDonations.length} donations pending processing for institution ${pmi_id || 'ALL'}`);

    return response.sendSuccess(res, {
      message: "Berhasil memuat daftar donasi yang menunggu pemrosesan komponen",
      data: {
        donations: formattedDonations,
        summary: {
          total_pending: formattedDonations.length
        }
      }
    });
  } catch (error) {
    console.error("❌ Error in getPendingProcessing:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Process donation and create blood components
 */
const processDonation = async (req, res) => {
  const { donation_id } = req.params;
  const { components, notes } = req.body;
  
  // components format: [{ component_type: 'PRC', quantity: 1 }, { component_type: 'FFP', quantity: 1 }]
  
  try {
    if (!donation_id) {
      return response.sendBadRequest(res, "donation_id is required");
    }

    if (!components || !Array.isArray(components) || components.length === 0) {
      return response.sendBadRequest(res, "components array is required");
    }

    console.log(`🔬 Processing donation ${donation_id} into ${components.length} components`);

    // Get donation details
    const { data: donation, error: donationError } = await supabase
      .from("donations")
      .select("*, pmi:institutions!donations_institution_id_fkey(id, institution_name)")
      .eq("id", donation_id)
      .single();

    if (donationError || !donation) {
      return response.sendNotFound(res, "Donation not found");
    }

    if (donation.components_created) {
      return response.sendBadRequest(res, "Components already created for this donation");
    }

    // Validate component types
    const validComponentTypes = ['WB', 'PRC', 'FFP', 'TC', 'Cryo'];
    for (const component of components) {
      if (!validComponentTypes.includes(component.component_type)) {
        return response.sendBadRequest(res, `Invalid component type: ${component.component_type}`);
      }
      if (!component.quantity || component.quantity <= 0) {
        return response.sendBadRequest(res, "quantity must be greater than 0");
      }
    }

    // Calculate expiry dates for each component type
    const getExpiryDate = (componentType, collectionDate) => {
      const collectionDateTime = new Date(collectionDate);
      const shelfLifeDays = {
        'WB': 35,     // Whole Blood: 35 days
        'PRC': 35,    // Packed Red Cells: 35 days
        'FFP': 365,   // Fresh Frozen Plasma: 1 year
        'TC': 5,      // Thrombocyte Concentrate: 5 days
        'Cryo': 365   // Cryoprecipitate: 1 year
      };
      
      const days = shelfLifeDays[componentType] || 35;
      const expiryDate = new Date(collectionDateTime);
      expiryDate.setDate(expiryDate.getDate() + days);
      return expiryDate.toISOString().split('T')[0];
    };

    // Create stock entries for each component
    const stockEntries = components.map(component => ({
      institution_id: donation.institution_id,
      donation_id: donation_id,
      blood_type: donation.blood_type,
      component_type: component.component_type,
      quantity: component.quantity,
      unit_type: 'kantong',
      collection_date: donation.donation_date,
      expiry_date: getExpiryDate(component.component_type, donation.donation_date),
      status: 'available',
      notes: component.notes || `Processed from donation ${donation_id}`
    }));

    // Insert stock entries
    const { data: createdStock, error: stockError } = await supabase
      .from("blood_stock")
      .insert(stockEntries)
      .select();

    if (stockError) {
      console.error("❌ Error creating stock:", stockError);
      return response.sendBadRequest(res, stockError.message);
    }

    console.log(`✅ Created ${createdStock.length} stock entries`);

    // Create blood_stock_history entries for each component
    const historyEntries = [];
    for (const stock of createdStock) {
      // Get current total quantity for this blood type + component type (excluding this new stock)
      const { data: currentStock } = await supabase
        .from("blood_stock")
        .select("quantity")
        .eq("institution_id", donation.institution_id)
        .eq("blood_type", stock.blood_type)
        .eq("component_type", stock.component_type)
        .eq("status", "available")
        .neq("id", stock.id);

      const previousQuantity = currentStock?.reduce((sum, item) => sum + item.quantity, 0) || 0;
      const newTotalQuantity = previousQuantity + stock.quantity;

      historyEntries.push({
        institution_id: donation.institution_id,
        blood_type: stock.blood_type,
        component_type: stock.component_type,
        change_type: 'add',
        quantity_change: stock.quantity,
        previous_quantity: previousQuantity,
        new_quantity: newTotalQuantity,
        notes: `Komponen ${stock.component_type} dari donasi ${donation_id}`,
        created_by: donation.institution_id
      });
    }

    // Insert history records
    if (historyEntries.length > 0) {
      const { error: historyError } = await supabase
        .from("blood_stock_history")
        .insert(historyEntries);

      if (historyError) {
        console.error("❌ Error creating stock history:", historyError);
        // Don't fail the whole operation, just log it
      } else {
        console.log(`✅ Created ${historyEntries.length} stock history entries`);
      }
    }

    // Update donation status
    const { error: updateError } = await supabase
      .from("donations")
      .update({
        status: "completed",
        components_created: true
      })
      .eq("id", donation_id);

    if (updateError) {
      console.error("❌ Error updating donation:", updateError);
      return response.sendBadRequest(res, updateError.message);
    }

    // Invalidate caches
    invalidate("donations:*");
    invalidate("stock:*");
    invalidate(`pmi:${donation.institution_id}:*`);

    return response.sendSuccess(res, {
      message: `Berhasil memproses donasi menjadi ${createdStock.length} komponen`,
      data: {
        donation_id,
        components_created: createdStock.length,
        stock: createdStock
      }
    });
  } catch (error) {
    console.error("❌ Error in processDonation:", error);
    return response.sendServerError(res, error.message);
  }
};

/**
 * Update test results for a donation
 * @deprecated This function is no longer used after removing testing workflow
 */
const updateTestResults = async (req, res) => {
  return response.sendBadRequest(res, "This endpoint is deprecated. Testing workflow has been removed.");
};

export default {
  getPendingProcessing,
  processDonation,
  updateTestResults
};
