import supabase from "../config/db.js";
import response from "../helpers/responses.js";
import { getOrSet, invalidate } from "../utils/cache.js";

// Get blood stock for an institution
const getBloodStockByInstitution = async (req, res) => {
  const { institutionId } = req.params;

  try {
    const key = `stock:snapshot:${institutionId}`;
    const ttl = 60; // 1 minute snapshot

    const data = await getOrSet(key, ttl, async () => {
      const { data, error } = await supabase
        .from("blood_stock")
        .select("*")
        .eq("institution_id", institutionId)
        .eq("status", "available")
        .order("blood_type", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }
      return data || []
    })

    return response.sendSuccess(res, {
      data,
      message: "Berhasil memuat stok darah",
    });
  } catch (error) {
    console.error("Get blood stock error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Adjust blood stock (add or reduce)
const adjustBloodStock = async (req, res) => {
  const { institution_id, blood_type, component_type, change_type, quantity_change, notes } = req.body;

  // Validation
  if (!institution_id || !blood_type || !change_type || !quantity_change) {
    return response.sendBadRequest(res, "Data yang dibutuhkan belum lengkap");
  }

  if (quantity_change <= 0) {
    return response.sendBadRequest(res, "Perubahan jumlah harus lebih besar dari 0");
  }

  if (!['add', 'reduce', 'used', 'expired'].includes(change_type)) {
    return response.sendBadRequest(res, "Jenis perubahan tidak valid");
  }

  // Default to WB if component_type not provided (backward compatibility)
  const componentTypeValue = component_type || 'WB';

  try {
    console.log(`🔍 [adjustBloodStock] Checking stock for ${institution_id} - ${blood_type} - ${componentTypeValue} - ${change_type}: ${quantity_change}`);

    // Get ALL current stock records for this blood type AND component type
    const { data: currentStocks, error: stockError } = await supabase
      .from("blood_stock")
      .select("*")
      .eq("institution_id", institution_id)
      .eq("blood_type", blood_type)
      .eq("component_type", componentTypeValue)
      .eq("status", "available");

    if (stockError) {
      console.error("Error fetching stock:", stockError);
      return response.sendInternalError(res, "Failed to fetch current stock");
    }

    console.log(`📦 Found ${currentStocks?.length || 0} available stock records`);
    
    // Calculate total current quantity from all available stocks
    const currentQuantity = currentStocks?.reduce((total, stock) => total + stock.quantity, 0) || 0;
    console.log(`📊 Total current quantity: ${currentQuantity} kantong`);

    // Validation for reduce operations
    if ((change_type === 'reduce' || change_type === 'used' || change_type === 'expired') && quantity_change > currentQuantity) {
      return response.sendBadRequest(
        res, 
        `Cannot ${change_type} ${quantity_change} units. Current stock: ${currentQuantity}`
      );
    }

    // Calculate new quantity
    let newQuantity;
    if (change_type === 'add') {
      newQuantity = currentQuantity + quantity_change;
    } else {
      newQuantity = currentQuantity - quantity_change;
      // Ensure quantity never goes below 0
      if (newQuantity < 0) newQuantity = 0;
    }

    // Update or insert stock record
    if (change_type === 'add') {
      // For add operations: create new stock record
      // Set expiry date based on component type
      const shelfLifeDays = {
        'WB': 35,     // Whole Blood: 35 days
        'PRC': 35,    // Packed Red Cells: 35 days
        'FFP': 365,   // Fresh Frozen Plasma: 1 year
        'TC': 5,      // Thrombocyte Concentrate: 5 days
        'Cryo': 365   // Cryoprecipitate: 1 year
      };
      
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (shelfLifeDays[componentTypeValue] || 35));
      
      const { error: insertError } = await supabase
        .from("blood_stock")
        .insert({
          institution_id,
          blood_type,
          component_type: componentTypeValue,
          quantity: quantity_change, // Only the added quantity
          status: "available",
          expiry_date: expiryDate.toISOString().split('T')[0],
          collection_date: new Date().toISOString().split('T')[0],
          batch_number: `BATCH-${blood_type}-${componentTypeValue}-${Date.now()}`,
          created_at: new Date(),
          updated_at: new Date(),
        });

      if (insertError) {
        console.error("Insert stock error:", insertError);
        return response.sendInternalError(res, "Failed to create stock record");
      }
      
      console.log(`✅ Created new stock record: ${quantity_change} kantong`);
    } else {
      // For reduce/used/expired operations: update existing stocks
      if (currentStocks && currentStocks.length > 0) {
        // Sort stocks by creation date (oldest first) or quantity (smallest first)
        const sortedStocks = currentStocks.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        let remainingToReduce = quantity_change;
        const updatePromises = [];
        
        for (const stock of sortedStocks) {
          if (remainingToReduce <= 0) break;
          
          const reduceFromThisStock = Math.min(remainingToReduce, stock.quantity);
          const newQuantity = stock.quantity - reduceFromThisStock;
          const newStatus = newQuantity === 0 ? "used" : "available";
          
          console.log(`🔄 Updating stock ${stock.id}: ${stock.quantity} → ${newQuantity}`);
          
          const updatePromise = supabase
            .from("blood_stock")
            .update({
              quantity: newQuantity,
              status: newStatus,
              updated_at: new Date(),
            })
            .eq("id", stock.id);
            
          updatePromises.push(updatePromise);
          remainingToReduce -= reduceFromThisStock;
        }
        
        // Execute all updates
        const results = await Promise.all(updatePromises);
        const hasError = results.some(result => result.error);
        
        if (hasError) {
          console.error("Update stock error:", results.filter(r => r.error));
          return response.sendInternalError(res, "Failed to update stock");
        }
        
        console.log(`✅ Updated ${updatePromises.length} stock records`);
      } else {
        return response.sendBadRequest(res, "Tidak dapat mengurangi stok yang tidak ada");
      }
    }

    // Log the stock change in history
    const { error: historyError } = await supabase
      .from("blood_stock_history")
      .insert({
        institution_id,
        blood_type,
        component_type: componentTypeValue,
        change_type,
        quantity_change,
        previous_quantity: currentQuantity,
        new_quantity: newQuantity,
        notes: notes || null,
        created_at: new Date(),
      });

    if (historyError) {
      console.error("Error logging stock history:", historyError);
      // Don't fail the request if history logging fails
    }

    console.log(`📝 Stock history logged: ${currentQuantity} → ${newQuantity}`);

    // Invalidate relevant caches
    try {
      const keysToInvalidate = [
        `stock:snapshot:${institution_id}`,
        'partners:with_stock',
        `partners:institution:${institution_id}`,
        `dashboard:pmi:${institution_id}:summary`,
      ]
      await invalidate(keysToInvalidate)
    } catch (e) {
      console.warn('[cache] post-adjust invalidate failed:', e?.message)
    }

    return response.sendSuccess(res, {
      message: `Stok darah berhasil ${change_type === 'add' ? 'ditambah' : 'dikurangi'}`,
      data: {
        blood_type,
        component_type: componentTypeValue,
        previous_quantity: currentQuantity,
        quantity_change,
        new_quantity: newQuantity,
        change_type,
      },
    });
  } catch (error) {
    console.error("Adjust blood stock error:", error);
    return response.sendInternalError(res, "Error adjusting stock");
  }
};

// Get stock history for an institution
const getStockHistory = async (req, res) => {
  const { institutionId } = req.params;
  const { limit = 50 } = req.query;

  try {
    const { data, error } = await supabase
      .from("blood_stock_history")
      .select("*")
      .eq("institution_id", institutionId)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      return response.sendInternalError(res, error.message);
    }

    return response.sendSuccess(res, {
      data: data || [],
      message: "Berhasil memuat riwayat stok",
    });
  } catch (error) {
    console.error("Get stock history error:", error);
    return response.sendInternalError(res, "Terjadi kesalahan yang tidak terduga");
  }
};

// Mark blood bags as expired (batch operation)
const markAsExpired = async (req, res) => {
  const { institution_id, blood_type, quantity, notes } = req.body;

  if (!institution_id || !blood_type || !quantity) {
    return response.sendBadRequest(res, "Missing required fields");
  }

  // Use the adjust function with 'expired' type
  req.body.change_type = 'expired';
  req.body.quantity_change = quantity;
  return adjustBloodStock(req, res);
};

// Use blood for request (when hospital picks up)
const useBloodForRequest = async (req, res) => {
  const { institution_id, blood_type, quantity, request_id } = req.body;

  if (!institution_id || !blood_type || !quantity || !request_id) {
    return response.sendBadRequest(res, "Missing required fields");
  }

  req.body.change_type = 'used';
  req.body.quantity_change = quantity;
  req.body.notes = `Used for blood request ${request_id}`;
  return adjustBloodStock(req, res);
};

export {
  getBloodStockByInstitution,
  adjustBloodStock,
  getStockHistory,
  markAsExpired,
  useBloodForRequest,
};
