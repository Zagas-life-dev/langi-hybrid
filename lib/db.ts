// Data now lives in Firestore (see lib/db/model.ts). There is no connection to open: the Admin SDK
// connects on first use. `connectDB()` stays as a harmless no-op so existing call sites keep working;
// it can be deleted from them over time.
export async function connectDB(): Promise<void> {}
