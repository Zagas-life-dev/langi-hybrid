import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined')

declare global {
  var _langiMongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}

let cached = global._langiMongooseCache
if (!cached) {
  cached = global._langiMongooseCache = { conn: null, promise: null }
}

export async function connectDB() {
  if (cached.conn) return cached.conn
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
    })
  }
  try {
    cached.conn = await cached.promise
  } catch (e) {
    // Drop the rejected promise so the next request retries a fresh connection
    // instead of re-awaiting the same failure forever.
    cached.promise = null
    throw e
  }
  return cached.conn
}
