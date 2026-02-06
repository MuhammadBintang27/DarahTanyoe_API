import supabase from "../config/db.js"
import response from "../helpers/responses.js"
import { getOrSet } from "../utils/cache.js"

// Helper: group by day (YYYY-MM-DD)
function groupByDay(rows, dateField = 'created_at') {
  const map = {}
  for (const r of rows || []) {
    const d = new Date(r[dateField])
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    map[key] = (map[key] || 0) + 1
  }
  return Object.entries(map)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }))
}

// RS summary: request counts by status + upcoming pickups
const getHospitalSummary = async (req, res) => {
  const { institutionId } = req.params
  try {
    const key = `dashboard:rs:${institutionId}:summary`
    const ttl = 900 // 15 minutes

    const result = await getOrSet(key, ttl, async () => {
      // Fetch requests for this hospital (requester)
      const { data: requests, error: reqErr } = await supabase
        .from('blood_requests')
        .select('id, status')
        .eq('requester_id', institutionId)

      if (reqErr) throw new Error(reqErr.message)

      const counts = { pending:0, approved:0, confirmed:0, completed:0, rejected:0, cancelled:0, ready:0 }
      for (const r of requests || []) {
        const s = r.status || 'pending'
        counts[s] = (counts[s] || 0) + 1
      }

      // Upcoming pickups for this hospital (next 3 days)
      const today = new Date()
      const in3 = new Date(); in3.setDate(in3.getDate()+3)
      const { data: pickups, error: pickErr } = await supabase
        .from('pickup_schedules')
        .select('id, pickup_date, status')
        .eq('hospital_id', institutionId)
        .eq('status', 'scheduled')
        .gte('pickup_date', today.toISOString().split('T')[0])
        .lte('pickup_date', in3.toISOString().split('T')[0])

      if (pickErr) throw new Error(pickErr.message)

      return {
        request_counts: counts,
        upcoming_pickups: pickups?.length || 0,
      }
    })

    return response.sendSuccess(res, { data: result, message: 'Hospital summary' })
  } catch (error) {
    console.error('Hospital summary error:', error)
    return response.sendInternalError(res, 'An unexpected error occurred')
  }
}

// PMI summary: incoming request counts + stock summary
const getPMISummary = async (req, res) => {
  const { institutionId } = req.params
  try {
    const key = `dashboard:pmi:${institutionId}:summary`
    const ttl = 900

    const result = await getOrSet(key, ttl, async () => {
      // Requests where this PMI is partner
      const { data: requests, error: reqErr } = await supabase
        .from('blood_requests')
        .select('id, status')
        .eq('partner_id', institutionId)

      if (reqErr) throw new Error(reqErr.message)

      const counts = { pending:0, approved:0, confirmed:0, completed:0, rejected:0, cancelled:0, ready:0 }
      for (const r of requests || []) {
        const s = r.status || 'pending'
        counts[s] = (counts[s] || 0) + 1
      }

      // Stock summary by blood_type for this PMI
      const { data: stock, error: stockErr } = await supabase
        .from('blood_stock')
        .select('blood_type, quantity, status')
        .eq('institution_id', institutionId)
        .eq('status', 'available')

      if (stockErr) throw new Error(stockErr.message)

      const stockSummary = {}
      for (const s of stock || []) {
        stockSummary[s.blood_type] = (stockSummary[s.blood_type] || 0) + (s.quantity || 0)
      }

      return {
        request_counts: counts,
        stock_summary: stockSummary,
      }
    })

    return response.sendSuccess(res, { data: result, message: 'PMI summary' })
  } catch (error) {
    console.error('PMI summary error:', error)
    return response.sendInternalError(res, 'An unexpected error occurred')
  }
}

// RS trends: requests per day in last N days
const getHospitalTrends = async (req, res) => {
  const { institutionId } = req.params
  const days = parseInt(req.query.days || '30', 10)
  try {
    const key = `dashboard:rs:${institutionId}:trend:requests:${days}`
    const ttl = 1800 // 30 minutes

    const result = await getOrSet(key, ttl, async () => {
      const start = new Date(); start.setDate(start.getDate() - days)
      const { data, error } = await supabase
        .from('blood_requests')
        .select('id, created_at')
        .eq('requester_id', institutionId)
        .gte('created_at', start.toISOString())

      if (error) throw new Error(error.message)
      return { requests_per_day: groupByDay(data, 'created_at') }
    })

    return response.sendSuccess(res, { data: result, message: 'Hospital trends' })
  } catch (error) {
    console.error('Hospital trends error:', error)
    return response.sendInternalError(res, 'An unexpected error occurred')
  }
}

// PMI trends: incoming requests per day in last N days
const getPMITrends = async (req, res) => {
  const { institutionId } = req.params
  const days = parseInt(req.query.days || '30', 10)
  try {
    const key = `dashboard:pmi:${institutionId}:trend:requests:${days}`
    const ttl = 1800

    const result = await getOrSet(key, ttl, async () => {
      const start = new Date(); start.setDate(start.getDate() - days)
      const { data, error } = await supabase
        .from('blood_requests')
        .select('id, created_at')
        .eq('partner_id', institutionId)
        .gte('created_at', start.toISOString())

      if (error) throw new Error(error.message)
      return { requests_per_day: groupByDay(data, 'created_at') }
    })

    return response.sendSuccess(res, { data: result, message: 'PMI trends' })
  } catch (error) {
    console.error('PMI trends error:', error)
    return response.sendInternalError(res, 'An unexpected error occurred')
  }
}

export default {
  getHospitalSummary,
  getPMISummary,
  getHospitalTrends,
  getPMITrends,
}
