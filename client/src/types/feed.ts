// Activity Feed Types for AetherWave Studio

export type FeedItemType =
  | 'new_release'
  | 'achievement'
  | 'rank_change'
  | 'new_artist'
  | 'daily_growth_reminder'
  | 'milestone'
  | 'comment'
  | 'follow';

export interface FeedUser {
  id: string;
  username: string;
  profileImageUrl?: string;
  level?: string;
  chartPosition?: number;
}

export interface FeedArtist {
  id: string;
  bandName: string;
  genre: string;
  imageUrl?: string;
  cardImageUrl?: string;
}

export interface FeedStats {
  streams?: number;
  comments?: number;
  reactions?: number;
  sales?: number;
  chartPosition?: number;
  chartChange?: number;
  fame?: number;
  fameChange?: number;
}

export interface BaseFeedItem {
  id: string;
  type: FeedItemType;
  user: FeedUser;
  timestamp: string;
  stats?: FeedStats;
}

export interface NewReleaseFeedItem extends BaseFeedItem {
  type: 'new_release';
  artist: FeedArtist;
  releaseTitle: string;
  audioUrl?: string;
}

export interface AchievementFeedItem extends BaseFeedItem {
  type: 'achievement';
  achievementType: 'gold_record' | 'platinum_record' | 'diamond_record';
  artist: FeedArtist;
  releaseTitle: string;
  creditsEarned: number;
}

export interface RankChangeFeedItem extends BaseFeedItem {
  type: 'rank_change';
  oldRank: number;
  newRank: number;
  bandsUpdated: number;
}

export interface NewArtistFeedItem extends BaseFeedItem {
  type: 'new_artist';
  artist: FeedArtist;
  description?: string;
  memberCount?: number;
}

export interface DailyGrowthReminderItem extends BaseFeedItem {
  type: 'daily_growth_reminder';
  readyBands: Array<{
    id: string;
    name: string;
    lastGrowth: string;
  }>;
}

export type FeedItem =
  | NewReleaseFeedItem
  | AchievementFeedItem
  | RankChangeFeedItem
  | NewArtistFeedItem
  | DailyGrowthReminderItem;

export type FeedTab = 'for-you' | 'following' | 'trending';

export interface FeedResponse {
  items: FeedItem[];
  hasMore: boolean;
  cursor?: string;
}
