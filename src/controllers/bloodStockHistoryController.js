import supabase from '../config/db.js';

const successResponse = (res, data, message, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const errorResponse = (res, message, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message
  });
};

// Get blood stock history for PMI
export const getBloodStockHistory = async (req, res) => {
  try {
    const { pmiId, bloodType, startDate, endDate, actionType, page = 1, limit = 10 } = req.query;

    if (!pmiId) {
      return errorResponse(res, 'PMI ID is required', 400);
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build query for count
    let countQuery = supabase
      .from('blood_stock_history')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', pmiId);

    // Apply filters to count query
    if (bloodType) {
      countQuery = countQuery.eq('blood_type', bloodType);
    }

    if (actionType) {
      countQuery = countQuery.eq('change_type', actionType);
    }

    if (startDate) {
      countQuery = countQuery.gte('created_at', startDate);
    }

    if (endDate) {
      countQuery = countQuery.lte('created_at', endDate);
    }

    // Get total count
    const { count: totalItems, error: countError } = await countQuery;

    if (countError) {
      console.error('Error counting blood stock history:', countError);
      return errorResponse(res, 'Failed to count blood stock history', 500);
    }

    // Build query for data
    let query = supabase
      .from('blood_stock_history')
      .select(`
        *,
        institution:institution_id(
          institution_name,
          address
        ),
        creator:created_by(
          institution_name
        )
      `)
      .eq('institution_id', pmiId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    // Apply filters
    if (bloodType) {
      query = query.eq('blood_type', bloodType);
    }

    if (actionType) {
      query = query.eq('change_type', actionType);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: history, error } = await query;

    if (error) {
      console.error('Error fetching blood stock history:', error);
      return errorResponse(res, 'Failed to fetch blood stock history', 500);
    }

    // Calculate pagination info
    const totalPages = Math.ceil(totalItems / limitNum);

    return res.status(200).json({
      success: true,
      message: 'Blood stock history retrieved successfully',
      data: history || [],
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error in getBloodStockHistory:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Get blood stock history statistics
export const getBloodStockHistoryStats = async (req, res) => {
  try {
    const { pmiId, startDate, endDate } = req.query;

    if (!pmiId) {
      return errorResponse(res, 'PMI ID is required', 400);
    }

    let query = supabase
      .from('blood_stock_history')
      .select('change_type, quantity_change, blood_type')
      .eq('institution_id', pmiId);

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: history, error } = await query;

    if (error) {
      console.error('Error fetching history stats:', error);
      return errorResponse(res, 'Failed to fetch statistics', 500);
    }

    // Calculate statistics
    const stats = {
      totalAdded: 0,
      totalUsed: 0,
      totalExpired: 0,
      byBloodType: {}
    };

    history.forEach(record => {
      const bloodType = record.blood_type || 'Unknown';
      const quantity = record.quantity_change;

      // Initialize blood type stats if not exists
      if (!stats.byBloodType[bloodType]) {
        stats.byBloodType[bloodType] = {
          added: 0,
          used: 0,
          expired: 0
        };
      }

      // Update totals and by blood type
      switch (record.change_type) {
        case 'add':
          stats.totalAdded += quantity;
          stats.byBloodType[bloodType].added += quantity;
          break;
        case 'used':
          stats.totalUsed += quantity;
          stats.byBloodType[bloodType].used += quantity;
          break;
        case 'expired':
          stats.totalExpired += quantity;
          stats.byBloodType[bloodType].expired += quantity;
          break;
      }
    });

    return successResponse(res, stats, 'Statistics retrieved successfully');
  } catch (error) {
    console.error('Error in getBloodStockHistoryStats:', error);
    return errorResponse(res, error.message, 500);
  }
};
