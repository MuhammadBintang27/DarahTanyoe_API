// Upstash Redis HTTP client (serverless-friendly)
// npm install @upstash/redis
import { Redis } from '@upstash/redis'
import dotenv from 'dotenv'

// Ensure .env is loaded before reading process.env (needed in ESM since imports run before module body)
dotenv.config()

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

let redis
if (url && token) {
  redis = new Redis({ url, token })
} else {
  if (!process.env.REDIS_CACHE_DISABLED) {
    console.warn('[redis] UPSTASH env missing, using no-op cache')
  }
  // No-op shim to avoid runtime errors when env not set (local dev without Upstash)
  redis = {
    async get() { return null },
    async set() { return undefined },
    async del() { return 0 },
  }
}

export default redis
