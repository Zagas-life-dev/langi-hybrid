// Back-compat alias: the save flow now lives at /api/words/save and is shared by
// every tap-a-word surface. Kept so cached clients / the offline SW keep working.
export { POST } from '@/app/api/words/save/route'
