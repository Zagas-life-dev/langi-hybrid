import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'

// A playlist OR a course (a course is just an ordered playlist where the next
// item matters). Items store enough video metadata to render without a join.
export interface IPlaylistItem {
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
  order: number
  note?: string
}

export interface IPlaylist extends Document {
  ownerId: string
  ownerName: string
  languageCode: string
  title: string
  description: string
  isPublic: boolean
  isCourse: boolean // ordered; drives "next in course" follow-up
  isOfficial: boolean // admin-featured
  level?: CefrLevel | null
  items: IPlaylistItem[]
  createdAt: Date
  updatedAt: Date
}

const Playlist: Model<IPlaylist> = defineModel<IPlaylist>({
  collection: 'playlists',
  timestamps: true,
  indexed: ['ownerId', 'languageCode', 'isPublic', 'isOfficial'],
  defaults: () => ({ ownerName: 'Learner', description: '', isPublic: false, isCourse: false, isOfficial: false, level: null, items: [] }),
})
export default Playlist
