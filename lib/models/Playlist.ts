import mongoose, { Schema, Document, Model, Types } from 'mongoose'
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
  ownerId: Types.ObjectId
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

const PlaylistItemSchema = new Schema<IPlaylistItem>(
  {
    videoId: { type: String, required: true },
    title: { type: String, default: '' },
    channelTitle: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    order: { type: Number, default: 0 },
    note: { type: String },
  },
  { _id: false }
)

const PlaylistSchema = new Schema<IPlaylist>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
    ownerName: { type: String, default: 'Learner' },
    languageCode: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    isPublic: { type: Boolean, default: false, index: true },
    isCourse: { type: Boolean, default: false },
    isOfficial: { type: Boolean, default: false, index: true },
    level: { type: String, default: null },
    items: { type: [PlaylistItemSchema], default: [] },
  },
  { timestamps: true }
)

if (mongoose.models.Playlist) mongoose.deleteModel('Playlist')
const Playlist: Model<IPlaylist> = mongoose.model<IPlaylist>('Playlist', PlaylistSchema)
export default Playlist
