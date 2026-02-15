import redis from '../config/redis.js'

const isEnabled = () => {
  const flag = process.env.REDIS_CACHE_DISABLED
  return !(flag === '1' || flag === 'true')
}

export async function getOrSet(key, ttlSeconds, loaderFn) {
  if (!isEnabled()) return loaderFn()

  try {
    const cached = await redis.get(key)
    if (cached !== null && cached !== undefined) {
      return cached
    }
  } catch (e) {
    console.warn(`[cache] read fail ${key}:`, e?.message)
  }

  const fresh = await loaderFn()
  try {
    await redis.set(key, fresh, { ex: ttlSeconds })
  } catch (e) {
    console.warn(`[cache] write fail ${key}:`, e?.message)
  }
  return fresh
}

export async function invalidate(keys) {
  if (!isEnabled()) return
  const list = Array.isArray(keys) ? keys : [keys]
  try {
    if (list.length > 0) {
      console.log(`[cache] Deleting ${list.length} keys:`, list);
      const result = await redis.del(...list);
      console.log(`[cache] ✅ Deleted ${result} keys from Redis`);
    }
  } catch (e) {
    console.warn('[cache] ❌ invalidate fail:', e?.message)
  }
}
