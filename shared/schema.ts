import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, real, timestamp, index, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  
  // Fantasy/Reality Progression System
  level: varchar("level").default("Fan"), // Fan, Artist, Producer, A&R, Label Executive
  experience: integer("experience").default(0),
  influence: integer("influence").default(0),
  totalCards: integer("total_cards").default(0),
  
  // Core Ranking Metrics
  fame: integer("fame").default(1), // 1-100 scale, major stat
  totalStreams: integer("total_streams").default(0),
  dailyStreams: integer("daily_streams").default(0),
  chartPosition: integer("chart_position").default(0), // 0 = unranked, 1-100 = chart position
  fanbase: integer("fanbase").default(0), // number of fans/followers
  
  // Additional Stats
  lastActivityDate: timestamp("last_activity_date").defaultNow(),
  
  // Creative Control Permissions
  canCustomizeArtistStyle: boolean("can_customize_artist_style").default(false),
  canSetArtistPhilosophy: boolean("can_set_artist_philosophy").default(false),
  canUploadProfileImages: boolean("can_upload_profile_images").default(false),
  canHardcodeParameters: boolean("can_hardcode_parameters").default(false),
  
  // Subscription Management
  subscriptionTier: varchar("subscription_tier").default("Fan"), // Fan, Artist, Record Label, Mogul
  subscriptionPrice: real("subscription_price").default(0.00), // Monthly subscription cost
  bandGenerationCount: integer("band_generation_count").default(0), // Total bands created (for tracking)
  freeBandGenerations: integer("free_band_generations").default(2), // Remaining free bands (Fan tier starts with 2)
  lastBandGenerated: timestamp("last_band_generated"),
  
  // Credit System  
  credits: integer("credits").default(500), // Virtual currency - starts with tier default
  monthlyCredits: integer("monthly_credits").default(0), // Monthly credit allocation based on tier
  lastCreditRenewal: timestamp("last_credit_renewal"),
  totalCreditsEarned: integer("total_credits_earned").default(500), // Include initial allocation
  totalCreditsSpent: integer("total_credits_spent").default(0),
  
  // Real-world achievements
  hasStreamingDistribution: boolean("has_streaming_distribution").default(false),
  aetherwavePartner: boolean("aetherwave_partner").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const artistCards = pgTable("artist_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  fileName: text("file_name").notNull(),
  fileSize: real("file_size").notNull(),
  duration: real("duration"),
  genre: text("genre"),
  tempo: real("tempo"),
  key: text("key"),
  energy: text("energy"),
  
  // Vocal Analysis Fields (for gender/vocal detection)
  vocalRange: varchar("vocal_range"), // 'low' | 'medium' | 'high'
  fundamentalFreq: real("fundamental_freq"), // Hz value for vocal pitch
  spectralCentroid: real("spectral_centroid"), // Audio spectral characteristics
  femaleIndicator: real("female_indicator"), // 0-1 confidence score for female vocals
  
  artistData: jsonb("artist_data").notNull(),
  imageUrl: text("image_url"),
  cardImageUrl: text("card_image_url"),
  processingTime: real("processing_time"),
  confidence: real("confidence"),
  artStyle: text("art_style"),
  cardTheme: text("card_theme"),
  
  // Progression System Fields
  rarity: varchar("rarity").default("Common"), // Common, Rare, Epic, Legendary
  experienceAwarded: integer("experience_awarded").default(10),
  influenceAwarded: integer("influence_awarded").default(5),
  streamingPlatforms: jsonb("streaming_platforms"), // Array of platform names
  
  // Quality Metrics (affect ranking progression)
  musicQuality: real("music_quality").default(0.5), // 0-1 scale, affects stat growth
  releaseImpact: integer("release_impact").default(0), // impact score for this release
  
  // Sales Metrics for Achievement System
  physicalCopies: integer("physical_copies").default(0), // Physical album/single sales
  digitalDownloads: integer("digital_downloads").default(0), // Digital sales
  totalStreams: integer("total_streams").default(0), // Aggregate streams across all platforms
  
  // Daily Growth System (Grok's FAME-driven mechanics)
  currentFame: integer("current_fame").default(5), // Band's current FAME score (separate from user FAME)
  lastDailyUpdate: timestamp("last_daily_update").default(sql`now()`), // Last time daily growth was applied
  dailyGrowthStreak: integer("daily_growth_streak").default(0), // Days of consecutive growth
  
  createdAt: timestamp("created_at").default(sql`now()`),
});

// Releases table - tracks individual song releases for artist career progression
export const releases = pgTable("releases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistCardId: varchar("artist_card_id").references(() => artistCards.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Audio file information
  fileName: text("file_name").notNull(),
  fileSize: real("file_size").notNull(),
  duration: real("duration"),
  audioUrl: text("audio_url"), // Path to stored audio file for streaming
  
  // Music analysis
  tempo: real("tempo"),
  key: text("key"),
  energy: text("energy"),
  genre: text("genre"),
  confidence: real("confidence"),
  
  // Release metadata
  releaseTitle: text("release_title"), // User can override song title
  releaseType: varchar("release_type").default("single"), // single, ep, album
  trackNumber: integer("track_number").default(1),
  
  // Quality and impact metrics
  musicQuality: real("music_quality").default(0.5), // 0-1 scale
  genreConsistency: real("genre_consistency").default(1.0), // How well it matches artist's style
  releaseImpact: integer("release_impact").default(0),
  
  // Performance metrics specific to this release
  streams: integer("streams").default(0),
  likes: integer("likes").default(0),
  fanReaction: varchar("fan_reaction").default("neutral"), // positive, neutral, negative
  
  // Chart performance
  peakChartPosition: integer("peak_chart_position").default(0), // 0 = never charted
  weeksOnChart: integer("weeks_on_chart").default(0),
  
  createdAt: timestamp("created_at").default(sql`now()`),
});

// Band evolution tracking - how releases affect the artist's overall identity
export const artistEvolution = pgTable("artist_evolution", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistCardId: varchar("artist_card_id").references(() => artistCards.id).notNull(),
  releaseId: varchar("release_id").references(() => releases.id).notNull(),
  
  // Style evolution
  genreShift: jsonb("genre_shift"), // Track changes in style
  soundEvolution: text("sound_evolution"), // Describe how sound changed
  fanbaseReaction: text("fanbase_reaction"), // How fans reacted to changes
  
  // Metrics changes
  fameChangeFromRelease: integer("fame_change_from_release").default(0),
  fanbaseChangeFromRelease: integer("fanbase_change_from_release").default(0),
  
  // Mastery progression
  genreMastery: real("genre_mastery").default(1.0), // 0-2 scale (0.5=poor, 1=consistent, 2=master)
  artisticGrowth: text("artistic_growth"), // Description of growth/decline
  
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const upsertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
}).required({ id: true });

export const insertArtistCardSchema = createInsertSchema(artistCards).omit({
  id: true,
  createdAt: true,
}).extend({
  fileSize: z.number().max(50000000), // Allow up to 50MB files
});

export const artistDataSchema = z.object({
  bandName: z.string(),
  genre: z.string(),
  philosophy: z.string(),
  bandConcept: z.string(),
  members: z.array(z.object({
    name: z.string(),
    role: z.string(),
    archetype: z.string().optional(),
  })),
  influences: z.array(z.string()),
  signatureSound: z.string(),
  lyricalThemes: z.string(),
  liveVisuals: z.string(),
  colorPalette: z.object({
    background: z.string(),
    textPrimary: z.string(),
    highlight: z.string(),
  }),
  sunoPrompt: z.string(),
});

export const generationOptionsSchema = z.object({
  artStyle: z.enum(["realistic", "stylized", "retro", "abstract"]),
  cardTheme: z.enum(["dark", "light", "vibrant"]),
});

// Release schemas
export const insertReleaseSchema = createInsertSchema(releases).omit({
  id: true,
  createdAt: true,
}).extend({
  fileSize: z.number().max(50000000), // Allow up to 50MB files
});

export const insertArtistEvolutionSchema = createInsertSchema(artistEvolution).omit({
  id: true,
  createdAt: true,
});

export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertArtistCard = z.infer<typeof insertArtistCardSchema>;
export type ArtistCard = typeof artistCards.$inferSelect;
export type ArtistData = z.infer<typeof artistDataSchema>;
export type GenerationOptions = z.infer<typeof generationOptionsSchema>;

// New release types
export type InsertRelease = z.infer<typeof insertReleaseSchema>;
export type Release = typeof releases.$inferSelect;
export type InsertArtistEvolution = z.infer<typeof insertArtistEvolutionSchema>;
export type ArtistEvolution = typeof artistEvolution.$inferSelect;

// Band Media table - stores photos and videos for each band with tier limits
export const bandMedia = pgTable("band_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistCardId: varchar("artist_card_id").references(() => artistCards.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Media details
  mediaType: varchar("media_type").notNull(), // "photo" or "video"
  fileName: text("file_name").notNull(),
  fileSize: real("file_size").notNull(),
  mediaUrl: text("media_url").notNull(), // Object storage path
  thumbnailUrl: text("thumbnail_url"), // For videos
  
  // Video-specific fields
  duration: real("duration"), // Duration in seconds (should be ~5 for videos)
  
  // Usage flags
  isProfileImage: boolean("is_profile_image").default(false), // Can be used as card profile image
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Band Media schemas
export const insertBandMediaSchema = createInsertSchema(bandMedia).omit({
  id: true,
  createdAt: true,
});

export type BandMedia = typeof bandMedia.$inferSelect;
export type InsertBandMedia = z.infer<typeof insertBandMediaSchema>;

// === MARKETPLACE SYSTEM ===

// Products available in the store
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Basic product info
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: varchar("category").notNull(), // "premium_features", "card_themes", "sound_packs", "profile_items"
  
  // Pricing and availability
  price: integer("price").notNull(), // Cost in credits
  isActive: boolean("is_active").default(true),
  isLimited: boolean("is_limited").default(false), // Limited time/quantity items
  stock: integer("stock"), // null = unlimited, number = limited stock
  
  // Product metadata
  imageUrl: text("image_url"), // Preview image
  productData: jsonb("product_data"), // Product-specific configuration
  rarity: varchar("rarity").default("Common"), // Common, Rare, Epic, Legendary
  
  // Requirements and restrictions
  requiredLevel: varchar("required_level").default("Fan"), // Minimum user level required
  subscriptionTierRequired: varchar("subscription_tier_required"), // If specific tier needed
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User inventory - items owned by users
export const userInventory = pgTable("user_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  
  // Ownership details
  quantity: integer("quantity").default(1), // For stackable items
  isActive: boolean("is_active").default(true), // If effect is currently applied
  
  // Trading properties
  isTradeable: boolean("is_tradeable").default(true),
  isConsumable: boolean("is_consumable").default(false), // Single-use items
  
  // Metadata
  acquiredVia: varchar("acquired_via").default("purchase"), // "purchase", "trade", "reward", "gift"
  tradeLockUntil: timestamp("trade_lock_until"), // Prevents immediate trading
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Transaction history
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  productId: varchar("product_id").references(() => products.id),
  
  // Transaction details
  type: varchar("type").notNull(), // "purchase", "trade", "refund", "gift"
  status: varchar("status").default("completed"), // "pending", "completed", "failed", "cancelled"
  amount: integer("amount").notNull(), // Credits involved
  quantity: integer("quantity").default(1),
  
  // Trade-specific fields
  tradeWithUserId: varchar("trade_with_user_id").references(() => users.id), // For trades
  tradeOfferId: varchar("trade_offer_id"), // Link to trade offer
  
  // Additional metadata
  notes: text("notes"), // Admin notes or trade messages
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Peer-to-peer trading offers
export const tradeOffers = pgTable("trade_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").references(() => users.id).notNull(),
  toUserId: varchar("to_user_id").references(() => users.id), // null = public offer
  
  // Offer status
  status: varchar("status").default("pending"), // "pending", "accepted", "declined", "cancelled", "expired"
  type: varchar("type").default("direct"), // "direct", "public", "auction"
  
  // What's being offered
  offeredItems: jsonb("offered_items").notNull(), // Array of {productId, quantity}
  requestedItems: jsonb("requested_items"), // Array of {productId, quantity} or null for credit-only
  requestedCredits: integer("requested_credits").default(0),
  
  // Trade conditions
  expiresAt: timestamp("expires_at"), // Auto-decline after this time
  message: text("message"), // Optional message from trader
  
  // Counters and modifications  
  originalOfferId: varchar("original_offer_id"), // For counter-offers (self-reference)
  isCounterOffer: boolean("is_counter_offer").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product schemas
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserInventorySchema = createInsertSchema(userInventory).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertTradeOfferSchema = createInsertSchema(tradeOffers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Marketplace types
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type UserInventory = typeof userInventory.$inferSelect;
export type InsertUserInventory = z.infer<typeof insertUserInventorySchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type TradeOffer = typeof tradeOffers.$inferSelect;
export type InsertTradeOffer = z.infer<typeof insertTradeOfferSchema>;

// === ACHIEVEMENT SYSTEM ===

// Band achievements based on sales milestones
export const bandAchievements = pgTable("band_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistCardId: varchar("artist_card_id").references(() => artistCards.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Achievement details
  achievementType: varchar("achievement_type").notNull(), // "gold_record", "platinum_album", "diamond_album"
  achievementName: text("achievement_name").notNull(),
  description: text("description").notNull(),
  iconType: varchar("icon_type").notNull(), // "gold", "platinum", "diamond"
  
  // Achievement requirements and rewards
  salesRequired: integer("sales_required").notNull(), // 500000, 2000000, 10000000
  salesAtAchievement: integer("sales_at_achievement").notNull(), // Actual sales when achieved
  fameBoostPercent: integer("fame_boost_percent").notNull(), // 5, 25, 45
  
  // Achievement status
  isActive: boolean("is_active").default(true), // If the boost is currently applied
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Achievement schemas
export const insertBandAchievementSchema = createInsertSchema(bandAchievements).omit({
  id: true,
  createdAt: true,
});

export type BandAchievement = typeof bandAchievements.$inferSelect;
export type InsertBandAchievement = z.infer<typeof insertBandAchievementSchema>;

// === SOCIAL & GAMIFICATION FEATURES ===

// User activity feed - tracks all user actions for social feed
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  activityType: varchar("activity_type").notNull(), // "card_created", "release_published", "achievement_earned", "level_up"
  
  // Related entities (optional based on activity type)
  artistCardId: varchar("artist_card_id").references(() => artistCards.id),
  releaseId: varchar("release_id").references(() => releases.id),
  achievementId: varchar("achievement_id"),
  
  // Activity content
  title: text("title").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"), // Additional activity-specific data
  
  // Social engagement
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  
  // Visibility
  isPublic: boolean("is_public").default(true),
  isPinned: boolean("is_pinned").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily quests/challenges system
export const dailyQuests = pgTable("daily_quests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Quest details
  questType: varchar("quest_type").notNull(), // "create_card", "upload_release", "stream_music", "earn_credits"
  title: text("title").notNull(),
  description: text("description"),
  
  // Progress tracking
  reward: integer("reward").notNull(), // Credits awarded on completion
  progress: integer("progress").default(0), // Current progress
  total: integer("total").notNull(), // Target to complete
  completed: boolean("completed").default(false),
  
  // Timing
  questDate: timestamp("quest_date").defaultNow(), // Date quest was assigned
  expiresAt: timestamp("expires_at"), // When quest expires
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// User following/follower relationships
export const userFollows = pgTable("user_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").references(() => users.id).notNull(), // User who is following
  followingId: varchar("following_id").references(() => users.id).notNull(), // User being followed
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Social feature schemas
export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

export const insertDailyQuestSchema = createInsertSchema(dailyQuests).omit({
  id: true,
  createdAt: true,
});

export const insertUserFollowSchema = createInsertSchema(userFollows).omit({
  id: true,
  createdAt: true,
});

// Social feature types
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type DailyQuest = typeof dailyQuests.$inferSelect;
export type InsertDailyQuest = z.infer<typeof insertDailyQuestSchema>;
export type UserFollow = typeof userFollows.$inferSelect;
export type InsertUserFollow = z.infer<typeof insertUserFollowSchema>;
