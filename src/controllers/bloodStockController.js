import supabase from "../config/db.js";
import response from "../helpers/responses.js";

// Get blood stock for an institution
const getBloodStockByInstitution = async (req, res) => {
  const { institutionId } = req.params;

  try {
    const { data, error } = await supabase
      .from("blood_stock")
      .select("*")
      .eq("institution_id", institutionId)
      .eq("status", "available")
      .order("blood_type", { ascending: true });

    if (error) {
      return response.sendInternalError(res, error.message);
    }

    return response.sendSuccess(res, {
      data: data || [],
      message: "Successfully retrieved blood stock",
    });
  } catch (error) {
    console.error("Get blood stock error:", error);
    return response.sendInternalError(res, "An unexpected error occurred");
  }
};

// Adjust blood stock (add or reduce)
const adjustBloodStock = async (req, res) => {
  const { institution_id, blood_type, change_type, quantity_change, notes } = req.body;

  // Validation
  if (!institution_id || !blood_type || !change_type || !quantity_change) {
    return response.sendBadRequest(res, "Missing required fields");
  }

  if (quantity_change <= 0) {
    return response.sendBadRequest(res, "Quantity change must be greater than 0");
  }

  if (!['add', 'reduce', 'used', 'expired'].includes(change_type)) {
    return response.sendBadRequest(res, "Invalid change type");
  }

  try {
    // Get current stock - use maybeSingle() to avoid error when no stock exists
    const { data: currentStock, error: stockError } = await supabase
      .from("blood_stock")
      .select("*")
      .eq("institution_id", institution_id)
      .eq("blood_type", blood_type)
      .eq("status", "available")
      .maybeSingle();

    if (stockError) {
      console.error("Error fetching stock:", stockError);
      return response.sendInternalError(res, "Failed to fetch current stock");
    }

    const currentQuantity = currentStock?.quantity || 0;

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
    if (currentStock) {
      // Update existing stock
      const { error: updateError } = await supabase
        .from("blood_stock")
        .update({
          quantity: newQuantity,
          updated_at: new Date(),
        })
        .eq("id", currentStock.id);

      if (updateError) {
        console.error("Update stock error:", updateError);
        return response.sendInternalError(res, "Failed to update stock");
      }
    } else if (change_type === 'add') {
      // Create new stock record only for 'add' operations
      // Set expiry date to 35 days from now (default blood expiry)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 35);
      
      const { error: insertError } = await supabase
        .from("blood_stock")
        .insert({
          institution_id,
          blood_type,
          quantity: newQuantity,
          status: "available",
          expiry_date: expiryDate.toISOString().split('T')[0],
          collection_date: new Date().toISOString().split('T')[0],
          batch_number: `BATCH-${blood_type}-${Date.now()}`,
          created_at: new Date(),
          updated_at: new Date(),
        });

      if (insertError) {
        console.error("Insert stock error:", insertError);
        return response.sendInternalError(res, "Failed to create stock record");
      }
    } else {
      return response.sendBadRequest(res, "Cannot reduce non-existent stock");
    }

    // Log the stock change in history
    const { error: historyError } = await supabase
      .from("blood_stock_history")
      .insert({
        institution_id,
        blood_type,
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

    return response.sendSuccess(res, {
      message: `Blood stock ${change_type === 'add' ? 'increased' : 'decreased'} successfully`,
      data: {
        blood_type,
        previous_quantity: currentQuantity,
        quantity_change,
        new_quantity: newQuantity,
        change_type,
      },
    });
  } catch (error) {
    console.error("Adjust blood stock error:", error);
    return response.sendInternalError(res, "An unexpected error occurred");
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
      message: "Successfully retrieved stock history",
    });
  } catch (error) {
    console.error("Get stock history error:", error);
    return response.sendInternalError(res, "An unexpected error occurred");
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
