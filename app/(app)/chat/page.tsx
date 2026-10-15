import { requireUser } from '@/lib/auth'
import ChatWindow from '@/components/ChatWindow'

export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  await requireUser()
  return <ChatWindow />
}
