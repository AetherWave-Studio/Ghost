import { type User, type UpsertUser, type ArtistCard, type InsertArtistCard, type Release, type InsertRelease, type ArtistEvolution, type InsertArtistEvolution, type BandMedia, type InsertBandMedia, type Product, type UserInventory, type Transaction, type BandAchievement } from "@shared/schema";
import { DatabaseStorage } from "./database-storage";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserProgression(userId: string, progression: { experienceGained: number; influenceGained: number; newCard: boolean }): Promise<void>;
  incrementBandGenerationCount(userId: string): Promise<void>;
  
  // Artist card operations
  getArtistCard(id: string): Promise<ArtistCard | undefined>;
  createArtistCard(card: InsertArtistCard): Promise<ArtistCard>;
  getAllArtistCards(): Promise<ArtistCard[]>;
  getUserArtistCards(userId: string): Promise<ArtistCard[]>;
  updateArtistCard(id: string, data: Partial<ArtistCard>): Promise<ArtistCard>;
  deleteArtistCard(id: string, userId: string): Promise<boolean>;
  searchArtists(query: string): Promise<ArtistCard[]>;
  
  // Credit system operations
  renewUserCredits(userId: string): Promise<void>;
  spendUserCredits(userId: string, amount: number): Promise<boolean>;
  addUserCredits(userId: string, amount: number): Promise<void>;
  
  // Band Media operations
  createBandMedia(media: InsertBandMedia): Promise<BandMedia>;
  getBandMedia(artistCardId: string): Promise<BandMedia[]>;
  deleteBandMedia(mediaId: string, userId: string): Promise<boolean>;
  getBandMediaCount(artistCardId: string, mediaType: string): Promise<number>;
  
  // Release operations for band career progression
  createRelease(release: InsertRelease): Promise<Release>;
  getArtistReleases(artistCardId: string): Promise<Release[]>;
  getUserReleases(userId: string): Promise<Release[]>;
  updateRelease(releaseId: string, updates: Partial<Release>): Promise<Release | undefined>;
  
  // Artist evolution tracking
  createArtistEvolution(evolution: InsertArtistEvolution): Promise<ArtistEvolution>;
  getArtistEvolution(artistCardId: string): Promise<ArtistEvolution[]>;
  getLatestArtistEvolution(artistCardId: string): Promise<ArtistEvolution | undefined>;
  
  // Marketplace operations
  getStoreProducts(): Promise<Product[]>;
  getUserInventory(userId: string): Promise<UserInventory[]>;
  purchaseProduct(userId: string, productId: string, quantity?: number): Promise<{ success: boolean; transaction?: Transaction; error?: string }>;
  getUserTransactions(userId: string): Promise<Transaction[]>;
  
  // Achievement operations
  checkAndAwardAchievements(artistCardId: string): Promise<BandAchievement[]>;
  getBandAchievements(artistCardId: string): Promise<BandAchievement[]>;
  getUserAchievements(userId: string): Promise<BandAchievement[]>;
  
  // User daily streams aggregation
  calculateUserDailyStreams(userId: string): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private artistCards: Map<string, ArtistCard>;
  private releases: Map<string, Release>;
  private artistEvolutions: Map<string, ArtistEvolution>;
  private bandMediaItems: Map<string, BandMedia>;

  constructor() {
    this.users = new Map();
    this.artistCards = new Map();
    this.releases = new Map();
    this.artistEvolutions = new Map();
    this.bandMediaItems = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    if (!userData.id) {
      throw new Error('User ID is required for upsert operation');
    }
    
    const existing = this.users.get(userData.id);
    const isNewUser = !existing;
    
    const user: User = {
      id: userData.id,
      email: userData.email || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      level: existing?.level || "Fan",
      experience: existing?.experience || 0,
      influence: existing?.influence || 0,
      totalCards: existing?.totalCards || 0,
      fame: existing?.fame || 1,
      totalStreams: existing?.totalStreams || 0,
      dailyStreams: existing?.dailyStreams || 0,
      chartPosition: existing?.chartPosition || 0,
      fanbase: existing?.fanbase || 0,
      lastActivityDate: existing?.lastActivityDate || new Date(),
      
      // Subscription fields
      subscriptionTier: existing?.subscriptionTier || "Fan",
      subscriptionPrice: existing?.subscriptionPrice || 0.00,
      bandGenerationCount: existing?.bandGenerationCount || 0,
      freeBandGenerations: existing?.freeBandGenerations || 2, // Fan tier starts with 2 free bands
      lastBandGenerated: existing?.lastBandGenerated || null,
      
      // Credit system fields - Give new users 500 one-time signup credits
      credits: existing?.credits || (isNewUser ? 500 : 0),
      monthlyCredits: existing?.monthlyCredits || 0,
      lastCreditRenewal: existing?.lastCreditRenewal || null,
      totalCreditsEarned: existing?.totalCreditsEarned || (isNewUser ? 500 : 0),
      totalCreditsSpent: existing?.totalCreditsSpent || 0,
      
      hasStreamingDistribution: existing?.hasStreamingDistribution || false,
      aetherwavePartner: existing?.aetherwavePartner || false,
      canCustomizeArtistStyle: existing?.canCustomizeArtistStyle || false,
      canSetArtistPhilosophy: existing?.canSetArtistPhilosophy || false,
      canUploadProfileImages: existing?.canUploadProfileImages || false,
      canHardcodeParameters: existing?.canHardcodeParameters || false,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    
    if (isNewUser) {
      console.log(`🎉 New user ${userData.id} signed up and received 500 welcome credits!`);
    }
    
    this.users.set(userData.id, user);
    return user;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateUserProgression(userId: string, progression: { experienceGained: number; influenceGained: number; newCard: boolean }): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;

    // Update stats
    user.experience = (user.experience || 0) + progression.experienceGained;
    user.influence = (user.influence || 0) + progression.influenceGained;
    if (progression.newCard) {
      user.totalCards = (user.totalCards || 0) + 1;
    }

    // Check for level progression
    const currentExp = user.experience;
    let newLevel = user.level || "Fan";
    
    if (currentExp >= 2000) newLevel = "Label Executive";
    else if (currentExp >= 500) newLevel = "Producer";
    else if (currentExp >= 100) newLevel = "Artist";
    else newLevel = "Fan";

    if (newLevel !== user.level) {
      console.log(`🎉 User ${userId} leveled up from ${user.level} to ${newLevel}!`);
      user.level = newLevel;
      
      // Unlock benefits based on level
      if (newLevel === "Producer") {
        user.hasStreamingDistribution = true;
      }
      if (newLevel === "Label Executive") {
        user.aetherwavePartner = true;
      }
    }

    user.updatedAt = new Date();
    this.users.set(userId, user);
  }
  
  async incrementBandGenerationCount(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    
    user.bandGenerationCount = (user.bandGenerationCount || 0) + 1;
    user.lastBandGenerated = new Date();
    user.updatedAt = new Date();
    this.users.set(userId, user);
  }
  
  async updateArtistCard(id: string, data: Partial<ArtistCard>): Promise<ArtistCard> {
    const existing = this.artistCards.get(id);
    if (!existing) {
      throw new Error('Artist card not found');
    }
    
    const updated = { ...existing, ...data, id, updatedAt: new Date() };
    this.artistCards.set(id, updated);
    return updated;
  }

  async deleteArtistCard(id: string, userId: string): Promise<boolean> {
    const card = this.artistCards.get(id);
    if (!card) {
      return false; // Card not found
    }
    
    // Check if the user owns this card
    if (card.userId !== userId) {
      return false; // User doesn't own this card
    }
    
    // Delete the card and any related data
    this.artistCards.delete(id);
    
    // Also delete related releases and evolutions
    Array.from(this.releases.entries()).forEach(([releaseId, release]) => {
      if (release.artistCardId === id) {
        this.releases.delete(releaseId);
      }
    });
    
    Array.from(this.artistEvolutions.entries()).forEach(([evolutionId, evolution]) => {
      if (evolution.artistCardId === id) {
        this.artistEvolutions.delete(evolutionId);
      }
    });
    
    // Delete related band media
    Array.from(this.bandMediaItems.entries()).forEach(([mediaId, media]) => {
      if (media.artistCardId === id) {
        this.bandMediaItems.delete(mediaId);
      }
    });
    
    return true;
  }
  
  async renewUserCredits(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    
    const tier = user.subscriptionTier || 'Free';
    const creditAllocation = this.getCreditAllocation(tier);
    
    if (creditAllocation > 0) {
      user.credits = creditAllocation;
      user.lastCreditRenewal = new Date();
      user.totalCreditsEarned = (user.totalCreditsEarned || 0) + creditAllocation;
      user.updatedAt = new Date();
      this.users.set(userId, user);
    }
  }
  
  async spendUserCredits(userId: string, amount: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    
    const currentCredits = user.credits || 0;
    if (currentCredits < amount) {
      return false; // Insufficient credits
    }
    
    user.credits = currentCredits - amount;
    user.totalCreditsSpent = (user.totalCreditsSpent || 0) + amount;
    user.updatedAt = new Date();
    this.users.set(userId, user);
    return true;
  }
  
  async addUserCredits(userId: string, amount: number): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    
    user.credits = (user.credits || 0) + amount;
    user.totalCreditsEarned = (user.totalCreditsEarned || 0) + amount;
    user.updatedAt = new Date();
    this.users.set(userId, user);
  }
  
  async decrementFreeBandGenerations(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    
    const currentFree = user.freeBandGenerations || 0;
    if (currentFree > 0) {
      user.freeBandGenerations = currentFree - 1;
      user.updatedAt = new Date();
      this.users.set(userId, user);
      console.log(`🎸 User ${userId} used 1 free band generation (${currentFree - 1} remaining)`);
    }
  }
  
  private getCreditAllocation(tier: string): number {
    const allocations: Record<string, number> = {
      'Free': 0,
      'Tier2': 1000,
      'Tier3': 3000,
      'Pro': 9000
    };
    return allocations[tier] || 0;
  }

  async getArtistCard(id: string): Promise<ArtistCard | undefined> {
    return this.artistCards.get(id);
  }

  async createArtistCard(insertCard: InsertArtistCard): Promise<ArtistCard> {
    const id = randomUUID();
    const card: ArtistCard = { 
      id,
      userId: insertCard.userId || null,
      fileName: insertCard.fileName,
      fileSize: insertCard.fileSize,
      duration: insertCard.duration || null,
      genre: insertCard.genre || null,
      tempo: insertCard.tempo || null,
      key: insertCard.key || null,
      energy: insertCard.energy || null,
      
      // Vocal Analysis Fields
      vocalRange: insertCard.vocalRange || null,
      fundamentalFreq: insertCard.fundamentalFreq || null,
      spectralCentroid: insertCard.spectralCentroid || null,
      femaleIndicator: insertCard.femaleIndicator || null,
      
      artistData: insertCard.artistData,
      imageUrl: insertCard.imageUrl || null,
      cardImageUrl: insertCard.cardImageUrl || null,
      processingTime: insertCard.processingTime || null,
      confidence: insertCard.confidence || null,
      artStyle: insertCard.artStyle || null,
      cardTheme: insertCard.cardTheme || null,
      rarity: insertCard.rarity || "Common",
      experienceAwarded: insertCard.experienceAwarded || 10,
      influenceAwarded: insertCard.influenceAwarded || 5,
      streamingPlatforms: insertCard.streamingPlatforms || null,
      musicQuality: insertCard.musicQuality || 0.5,
      releaseImpact: insertCard.releaseImpact || 0,
      // Sales metrics for achievement system 
      physicalCopies: insertCard.physicalCopies || 0,
      digitalDownloads: insertCard.digitalDownloads || 0,
      totalStreams: insertCard.totalStreams || 0,
      // Daily growth system
      currentFame: insertCard.currentFame || 5,
      lastDailyUpdate: insertCard.lastDailyUpdate || new Date(),
      dailyGrowthStreak: insertCard.dailyGrowthStreak || 0,
      createdAt: new Date(),
    };
    this.artistCards.set(id, card);
    return card;
  }

  async getAllArtistCards(): Promise<ArtistCard[]> {
    return Array.from(this.artistCards.values()).sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  async getUserArtistCards(userId: string): Promise<ArtistCard[]> {
    return Array.from(this.artistCards.values())
      .filter(card => card.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async searchArtists(query: string): Promise<ArtistCard[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.artistCards.values()).filter(card => {
      const artistData = card.artistData as any;
      return (
        artistData.bandName?.toLowerCase().includes(lowercaseQuery) ||
        artistData.genre?.toLowerCase().includes(lowercaseQuery) ||
        artistData.philosophy?.toLowerCase().includes(lowercaseQuery) ||
        artistData.members?.some((member: any) => 
          member.name?.toLowerCase().includes(lowercaseQuery)
        )
      );
    });
  }

  // Release operations for band career progression
  async createRelease(insertRelease: InsertRelease): Promise<Release> {
    const id = randomUUID();
    const release: Release = {
      id,
      artistCardId: insertRelease.artistCardId,
      userId: insertRelease.userId,
      fileName: insertRelease.fileName,
      fileSize: insertRelease.fileSize,
      duration: insertRelease.duration || null,
      tempo: insertRelease.tempo || null,
      key: insertRelease.key || null,
      energy: insertRelease.energy || null,
      genre: insertRelease.genre || null,
      confidence: insertRelease.confidence || null,
      releaseTitle: insertRelease.releaseTitle || null,
      releaseType: insertRelease.releaseType || "single",
      trackNumber: insertRelease.trackNumber || 1,
      musicQuality: insertRelease.musicQuality || 0.5,
      genreConsistency: insertRelease.genreConsistency || 1.0,
      releaseImpact: insertRelease.releaseImpact || 0,
      streams: insertRelease.streams || 0,
      likes: insertRelease.likes || 0,
      fanReaction: insertRelease.fanReaction || "neutral",
      peakChartPosition: insertRelease.peakChartPosition || 0,
      weeksOnChart: insertRelease.weeksOnChart || 0,
      audioUrl: insertRelease.audioUrl || null,
      createdAt: new Date(),
    };
    this.releases.set(id, release);
    return release;
  }

  async getArtistReleases(artistCardId: string): Promise<Release[]> {
    return Array.from(this.releases.values())
      .filter(release => release.artistCardId === artistCardId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getUserReleases(userId: string): Promise<Release[]> {
    return Array.from(this.releases.values())
      .filter(release => release.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async updateRelease(releaseId: string, updates: Partial<Release>): Promise<Release | undefined> {
    const release = this.releases.get(releaseId);
    if (!release) return undefined;

    const updatedRelease = { ...release, ...updates };
    this.releases.set(releaseId, updatedRelease);
    return updatedRelease;
  }

  // Artist evolution tracking
  async createArtistEvolution(insertEvolution: InsertArtistEvolution): Promise<ArtistEvolution> {
    const id = randomUUID();
    const evolution: ArtistEvolution = {
      id,
      artistCardId: insertEvolution.artistCardId,
      releaseId: insertEvolution.releaseId,
      genreShift: insertEvolution.genreShift || null,
      soundEvolution: insertEvolution.soundEvolution || null,
      fanbaseReaction: insertEvolution.fanbaseReaction || null,
      fameChangeFromRelease: insertEvolution.fameChangeFromRelease || 0,
      fanbaseChangeFromRelease: insertEvolution.fanbaseChangeFromRelease || 0,
      genreMastery: insertEvolution.genreMastery || 1.0,
      artisticGrowth: insertEvolution.artisticGrowth || null,
      createdAt: new Date(),
    };
    this.artistEvolutions.set(id, evolution);
    return evolution;
  }

  async getArtistEvolution(artistCardId: string): Promise<ArtistEvolution[]> {
    return Array.from(this.artistEvolutions.values())
      .filter(evolution => evolution.artistCardId === artistCardId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getLatestArtistEvolution(artistCardId: string): Promise<ArtistEvolution | undefined> {
    const evolutions = await this.getArtistEvolution(artistCardId);
    return evolutions.length > 0 ? evolutions[0] : undefined;
  }
  
  // Band Media operations
  async createBandMedia(insertMedia: InsertBandMedia): Promise<BandMedia> {
    const id = randomUUID();
    const media: BandMedia = {
      id,
      artistCardId: insertMedia.artistCardId,
      userId: insertMedia.userId,
      mediaType: insertMedia.mediaType,
      fileName: insertMedia.fileName,
      fileSize: insertMedia.fileSize,
      mediaUrl: insertMedia.mediaUrl,
      thumbnailUrl: insertMedia.thumbnailUrl || null,
      duration: insertMedia.duration || null,
      isProfileImage: insertMedia.isProfileImage || false,
      createdAt: new Date(),
    };
    this.bandMediaItems.set(id, media);
    return media;
  }
  
  async getBandMedia(artistCardId: string): Promise<BandMedia[]> {
    return Array.from(this.bandMediaItems.values())
      .filter(media => media.artistCardId === artistCardId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }
  
  async deleteBandMedia(mediaId: string, userId: string): Promise<boolean> {
    const media = this.bandMediaItems.get(mediaId);
    if (!media || media.userId !== userId) {
      return false;
    }
    this.bandMediaItems.delete(mediaId);
    return true;
  }
  
  async getBandMediaCount(artistCardId: string, mediaType: string): Promise<number> {
    return Array.from(this.bandMediaItems.values())
      .filter(media => media.artistCardId === artistCardId && media.mediaType === mediaType)
      .length;
  }

  // Marketplace function stubs (using DatabaseStorage in production)
  async getStoreProducts(): Promise<Product[]> {
    return [];
  }

  async getUserInventory(userId: string): Promise<UserInventory[]> {
    return [];
  }

  async purchaseProduct(userId: string, productId: string, quantity: number = 1): Promise<{ success: boolean; transaction?: Transaction; error?: string }> {
    return { success: false, error: "Marketplace not supported in memory storage" };
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return [];
  }

  // Achievement function stubs (using DatabaseStorage in production)
  async checkAndAwardAchievements(artistCardId: string): Promise<BandAchievement[]> {
    return [];
  }

  async getBandAchievements(artistCardId: string): Promise<BandAchievement[]> {
    return [];
  }

  async getUserAchievements(userId: string): Promise<BandAchievement[]> {
    return [];
  }

  // Calculate user's total daily streams from all owned artist cards
  async calculateUserDailyStreams(userId: string): Promise<number> {
    const userCards = await this.getUserArtistCards(userId);
    const user = await this.getUser(userId);
    
    if (!user || !userCards.length) {
      return 0;
    }

    let totalDailyStreams = 0;
    
    // Sum up potential daily stream growth from all cards
    for (const card of userCards) {
      const cardFame = card.currentFame || 5; // Default starting FAME
      
      // Calculate daily stream growth potential using the same formula from routes.ts
      const baseStreamGrowth = cardFame * 20; // Same formula as calculateDailyGrowth
      const randomFactor = 0.8 + (Math.random() * 0.4); // ±20% variance
      const cardDailyStreams = Math.floor(baseStreamGrowth * randomFactor);
      
      totalDailyStreams += cardDailyStreams;
    }
    
    return totalDailyStreams;
  }
}

// Use database storage for production
export const storage = new DatabaseStorage();
