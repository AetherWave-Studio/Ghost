import { users, artistCards, releases, artistEvolution, bandMedia, products, userInventory, transactions, bandAchievements, type User, type UpsertUser, type ArtistCard, type InsertArtistCard, type Release, type InsertRelease, type ArtistEvolution, type InsertArtistEvolution, type BandMedia, type InsertBandMedia, type Product, type InsertProduct, type UserInventory, type InsertUserInventory, type Transaction, type InsertTransaction, type BandAchievement, type InsertBandAchievement } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error("Error getting user:", error);
      return undefined;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const allUsers = await db.select().from(users);
      return allUsers;
    } catch (error) {
      console.error("Error getting all users:", error);
      return [];
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      if (!userData.id) {
        throw new Error('User ID is required for upsert operation');
      }

      // Check if user already exists
      const existingUser = await this.getUser(userData.id);
      const isNewUser = !existingUser;

      // For new users, apply Fan tier benefits by default
      const tierConfig = isNewUser ? this.getTierConfiguration('Fan') : null;

      const [user] = await db
        .insert(users)
        .values({
          ...userData,
          // Apply tier-based initial values for new users
          subscriptionTier: isNewUser ? 'Fan' : undefined,
          subscriptionPrice: isNewUser ? tierConfig!.price : undefined,
          credits: isNewUser ? tierConfig!.initialCredits : undefined,
          monthlyCredits: isNewUser ? tierConfig!.monthlyCredits : undefined,
          fame: isNewUser ? tierConfig!.initialFame : undefined,
          experience: isNewUser ? tierConfig!.initialExperience : undefined,
          totalCreditsEarned: isNewUser ? tierConfig!.initialCredits : undefined,
          lastCreditRenewal: isNewUser ? new Date() : undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          },
        })
        .returning();
      
      if (isNewUser) {
        console.log(`🎉 New user ${userData.id} signed up and received 500 welcome credits!`);
      }
      
      return user;
    } catch (error) {
      console.error("Error upserting user:", error);
      throw new Error("Failed to upsert user");
    }
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | undefined> {
    try {
      const [user] = await db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      
      return user;
    } catch (error) {
      console.error("Error updating user:", error);
      return undefined;
    }
  }

  async updateUserProgression(userId: string, progression: { experienceGained: number; influenceGained: number; newCard: boolean }): Promise<void> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return;

      // Calculate new stats
      const newExperience = (user.experience || 0) + progression.experienceGained;
      const newInfluence = (user.influence || 0) + progression.influenceGained;
      const newTotalCards = progression.newCard ? (user.totalCards || 0) + 1 : (user.totalCards || 0);

      // Check for level progression with creative control permissions
      let newLevel = user.level || "Fan";
      let canCustomizeArtistStyle = false;
      let canSetArtistPhilosophy = false;
      let canUploadProfileImages = false;
      let canHardcodeParameters = false;
      
      if (newExperience >= 5000) {
        newLevel = "Label Executive";
        canCustomizeArtistStyle = true;
        canSetArtistPhilosophy = true;
        canUploadProfileImages = true;
        canHardcodeParameters = true; // Full creative control - can manufacture stars
      } else if (newExperience >= 2000) {
        newLevel = "A&R";
        canCustomizeArtistStyle = true;
        canSetArtistPhilosophy = true;
        canUploadProfileImages = false; // Still some limitations
        canHardcodeParameters = false;
      } else if (newExperience >= 500) {
        newLevel = "Producer";
        canCustomizeArtistStyle = false;
        canSetArtistPhilosophy = false;
        canUploadProfileImages = false;
        canHardcodeParameters = false; // Limited creative control
      } else if (newExperience >= 100) {
        newLevel = "Artist";
        canCustomizeArtistStyle = false;
        canSetArtistPhilosophy = false;
        canUploadProfileImages = false;
        canHardcodeParameters = false;
      } else {
        newLevel = "Fan";
      }

      // Update user in database with creative control permissions
      await db
        .update(users)
        .set({
          experience: newExperience,
          influence: newInfluence,
          totalCards: newTotalCards,
          level: newLevel,
          canCustomizeArtistStyle,
          canSetArtistPhilosophy,
          canUploadProfileImages,
          canHardcodeParameters,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`✨ User ${userId} progression updated: +${progression.experienceGained} XP, +${progression.influenceGained} influence, level: ${newLevel}`);
    } catch (error) {
      console.error("Error updating user progression:", error);
    }
  }

  async incrementBandGenerationCount(userId: string): Promise<void> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return;
      
      await db
        .update(users)
        .set({
          bandGenerationCount: (user.bandGenerationCount || 0) + 1,
          lastBandGenerated: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
        
      console.log(`🎵 User ${userId} band generation count incremented to ${(user.bandGenerationCount || 0) + 1}`);
    } catch (error) {
      console.error("Error incrementing band generation count:", error);
      throw new Error("Failed to increment band generation count");
    }
  }
  
  async updateArtistCard(id: string, data: Partial<ArtistCard>): Promise<ArtistCard> {
    try {
      const [updated] = await db
        .update(artistCards)
        .set({
          ...data,
        })
        .where(eq(artistCards.id, id))
        .returning();
        
      if (!updated) {
        throw new Error('Artist card not found');
      }
      
      return updated;
    } catch (error) {
      console.error("Error updating artist card:", error);
      throw new Error("Failed to update artist card");
    }
  }

  async deleteArtistCard(id: string, userId: string): Promise<boolean> {
    try {
      // First check if the card exists and belongs to the user
      const [card] = await db
        .select({ userId: artistCards.userId })
        .from(artistCards)
        .where(eq(artistCards.id, id));

      if (!card) {
        return false; // Card not found
      }

      if (card.userId !== userId) {
        return false; // User doesn't own this card
      }

      // Delete related data in proper order (due to foreign key constraints)
      // Delete band achievements first
      await db
        .delete(bandAchievements)
        .where(eq(bandAchievements.artistCardId, id));

      // Delete band media
      await db
        .delete(bandMedia)
        .where(eq(bandMedia.artistCardId, id));

      // Delete artist evolutions
      await db
        .delete(artistEvolution)
        .where(eq(artistEvolution.artistCardId, id));

      // Delete releases
      await db
        .delete(releases)
        .where(eq(releases.artistCardId, id));

      // Finally delete the artist card itself
      await db
        .delete(artistCards)
        .where(eq(artistCards.id, id));

      return true;
    } catch (error) {
      console.error("Error deleting artist card:", error);
      return false;
    }
  }
  
  async renewUserCredits(userId: string): Promise<void> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return;
      
      const tier = user.subscriptionTier || 'Free';
      const creditAllocation = this.getCreditAllocation(tier);
      
      if (creditAllocation > 0) {
        await db
          .update(users)
          .set({
            credits: (user.credits || 0) + creditAllocation, // ADD to existing credits instead of replacing
            lastCreditRenewal: new Date(),
            totalCreditsEarned: (user.totalCreditsEarned || 0) + creditAllocation,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
          
        console.log(`💰 User ${userId} credits renewed: ${creditAllocation} credits for ${tier} tier`);
      }
    } catch (error) {
      console.error("Error renewing user credits:", error);
      throw new Error("Failed to renew user credits");
    }
  }
  
  async spendUserCredits(userId: string, amount: number): Promise<boolean> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return false;
      
      const currentCredits = user.credits || 0;
      if (currentCredits < amount) {
        return false; // Insufficient credits
      }
      
      await db
        .update(users)
        .set({
          credits: currentCredits - amount,
          totalCreditsSpent: (user.totalCreditsSpent || 0) + amount,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
        
      console.log(`💳 User ${userId} spent ${amount} credits (${currentCredits - amount} remaining)`);
      return true;
    } catch (error) {
      console.error("Error spending user credits:", error);
      throw new Error("Failed to spend user credits");
    }
  }
  
  async addUserCredits(userId: string, amount: number): Promise<void> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return;
      
      await db
        .update(users)
        .set({
          credits: (user.credits || 0) + amount,
          totalCreditsEarned: (user.totalCreditsEarned || 0) + amount,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
        
      console.log(`💰 User ${userId} earned ${amount} credits (${(user.credits || 0) + amount} total)`);
    } catch (error) {
      console.error("Error adding user credits:", error);
      throw new Error("Failed to add user credits");
    }
  }

  async decrementFreeBandGenerations(userId: string): Promise<void> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return;
      
      const currentFree = user.freeBandGenerations || 0;
      if (currentFree > 0) {
        await db
          .update(users)
          .set({
            freeBandGenerations: currentFree - 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
          
        console.log(`🎸 User ${userId} used 1 free band generation (${currentFree - 1} remaining)`);
      }
    } catch (error) {
      console.error("Error decrementing free band generations:", error);
      throw new Error("Failed to decrement free band generations");
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
  
  // Band Media operations
  async createBandMedia(insertMedia: InsertBandMedia): Promise<BandMedia> {
    try {
      const [media] = await db
        .insert(bandMedia)
        .values({
          ...insertMedia,
          createdAt: new Date(),
        })
        .returning();
        
      console.log(`📷 Created ${insertMedia.mediaType} for band ${insertMedia.artistCardId}`);
      return media;
    } catch (error) {
      console.error("Error creating band media:", error);
      throw new Error("Failed to create band media");
    }
  }
  
  async getBandMedia(artistCardId: string): Promise<BandMedia[]> {
    try {
      const media = await db
        .select()
        .from(bandMedia)
        .where(eq(bandMedia.artistCardId, artistCardId))
        .orderBy(bandMedia.createdAt);
        
      return media;
    } catch (error) {
      console.error("Error fetching band media:", error);
      throw new Error("Failed to fetch band media");
    }
  }
  
  async deleteBandMedia(mediaId: string, userId: string): Promise<boolean> {
    try {
      const [media] = await db
        .select()
        .from(bandMedia)
        .where(eq(bandMedia.id, mediaId));
        
      if (!media || media.userId !== userId) {
        return false;
      }
      
      await db.delete(bandMedia).where(eq(bandMedia.id, mediaId));
      console.log(`🗑️ Deleted media ${mediaId} for user ${userId}`);
      return true;
    } catch (error) {
      console.error("Error deleting band media:", error);
      throw new Error("Failed to delete band media");
    }
  }
  
  async getBandMediaCount(artistCardId: string, mediaType: string): Promise<number> {
    try {
      const media = await db
        .select()
        .from(bandMedia)
        .where(eq(bandMedia.artistCardId, artistCardId));
        
      return media.filter(m => m.mediaType === mediaType).length;
    } catch (error) {
      console.error("Error counting band media:", error);
      return 0;
    }
  }

  // Artist card operations
  async getArtistCard(id: string): Promise<ArtistCard | undefined> {
    try {
      const [card] = await db.select().from(artistCards).where(eq(artistCards.id, id));
      return card;
    } catch (error) {
      console.error("Error getting artist card:", error);
      return undefined;
    }
  }

  async createArtistCard(cardData: InsertArtistCard): Promise<ArtistCard> {
    try {
      const id = randomUUID();
      const [card] = await db
        .insert(artistCards)
        .values({
          ...cardData,
          id,
          createdAt: new Date(),
        })
        .returning();
      
      return card;
    } catch (error) {
      console.error("Error creating artist card:", error);
      throw new Error("Failed to create artist card");
    }
  }

  async getAllArtistCards(): Promise<ArtistCard[]> {
    try {
      const cards = await db.select().from(artistCards);
      return cards;
    } catch (error) {
      console.error("Error getting all artist cards:", error);
      return [];
    }
  }

  async getUserArtistCards(userId: string): Promise<ArtistCard[]> {
    try {
      const cards = await db.select().from(artistCards).where(eq(artistCards.userId, userId));
      return cards;
    } catch (error) {
      console.error("Error getting user artist cards:", error);
      return [];
    }
  }

  async searchArtists(query: string): Promise<ArtistCard[]> {
    try {
      const cards = await db.select().from(artistCards);
      const lowercaseQuery = query.toLowerCase();
      
      return cards.filter(card => {
        const artistData = card.artistData as any;
        return (
          artistData.bandName?.toLowerCase().includes(lowercaseQuery) ||
          artistData.genre?.toLowerCase().includes(lowercaseQuery) ||
          artistData.philosophy?.toLowerCase().includes(lowercaseQuery) ||
          artistData.members?.some((member: any) => 
            member.name?.toLowerCase().includes(lowercaseQuery)
          )
        );
      }).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    } catch (error) {
      console.error("Error searching artists:", error);
      return [];
    }
  }

  // Release operations for band career progression
  async createRelease(releaseData: InsertRelease): Promise<Release> {
    try {
      const id = randomUUID();
      const [release] = await db
        .insert(releases)
        .values({
          ...releaseData,
          id,
          createdAt: new Date(),
        })
        .returning();
      
      return release;
    } catch (error) {
      console.error("Error creating release:", error);
      throw new Error("Failed to create release");
    }
  }

  async getArtistReleases(artistCardId: string): Promise<Release[]> {
    try {
      const artistReleases = await db.select().from(releases).where(eq(releases.artistCardId, artistCardId));
      return artistReleases;
    } catch (error) {
      console.error("Error getting artist releases:", error);
      return [];
    }
  }

  async getUserReleases(userId: string): Promise<Release[]> {
    try {
      const userReleases = await db.select().from(releases).where(eq(releases.userId, userId));
      return userReleases;
    } catch (error) {
      console.error("Error getting user releases:", error);
      return [];
    }
  }

  async updateRelease(releaseId: string, updates: Partial<Release>): Promise<Release | undefined> {
    try {
      const [release] = await db
        .update(releases)
        .set(updates)
        .where(eq(releases.id, releaseId))
        .returning();
      
      return release;
    } catch (error) {
      console.error("Error updating release:", error);
      return undefined;
    }
  }

  // Artist evolution tracking
  async createArtistEvolution(evolutionData: InsertArtistEvolution): Promise<ArtistEvolution> {
    try {
      const id = randomUUID();
      const [evolution] = await db
        .insert(artistEvolution)
        .values({
          ...evolutionData,
          id,
          createdAt: new Date(),
        })
        .returning();
      
      return evolution;
    } catch (error) {
      console.error("Error creating artist evolution:", error);
      throw new Error("Failed to create artist evolution");
    }
  }

  async getArtistEvolution(artistCardId: string): Promise<ArtistEvolution[]> {
    try {
      const evolutions = await db.select().from(artistEvolution).where(eq(artistEvolution.artistCardId, artistCardId));
      return evolutions;
    } catch (error) {
      console.error("Error getting artist evolution:", error);
      return [];
    }
  }

  async getLatestArtistEvolution(artistCardId: string): Promise<ArtistEvolution | undefined> {
    try {
      const evolutions = await this.getArtistEvolution(artistCardId);
      return evolutions.length > 0 ? evolutions[0] : undefined;
    } catch (error) {
      console.error("Error getting latest artist evolution:", error);
      return undefined;
    }
  }

  // === MARKETPLACE FUNCTIONS ===

  async getStoreProducts(): Promise<Product[]> {
    try {
      const productList = await db.select().from(products).where(eq(products.isActive, true));
      return productList;
    } catch (error) {
      console.error("Error getting store products:", error);
      return [];
    }
  }

  async getUserInventory(userId: string): Promise<UserInventory[]> {
    try {
      const inventory = await db.select().from(userInventory).where(eq(userInventory.userId, userId));
      return inventory;
    } catch (error) {
      console.error("Error getting user inventory:", error);
      return [];
    }
  }

  async purchaseProduct(userId: string, productId: string, quantity: number = 1): Promise<{ success: boolean; transaction?: Transaction; error?: string }> {
    try {
      // Get user and product info
      const user = await this.getUser(userId);
      const [product] = await db.select().from(products).where(eq(products.id, productId));

      if (!user) {
        return { success: false, error: "User not found" };
      }

      if (!product) {
        return { success: false, error: "Product not found" };
      }

      if (!product.isActive) {
        return { success: false, error: "Product is not available" };
      }

      const totalCost = product.price * quantity;

      if ((user.credits || 0) < totalCost) {
        return { success: false, error: "Insufficient credits" };
      }

      // Check stock if limited
      if (product.stock !== null && product.stock < quantity) {
        return { success: false, error: "Insufficient stock" };
      }

      // Start transaction
      const transactionId = randomUUID();

      // Create transaction record
      const [transaction] = await db
        .insert(transactions)
        .values({
          id: transactionId,
          userId,
          productId,
          type: "purchase",
          status: "completed",
          amount: totalCost,
          quantity,
          createdAt: new Date(),
        })
        .returning();

      // Add to user inventory
      await db
        .insert(userInventory)
        .values({
          id: randomUUID(),
          userId,
          productId,
          quantity,
          acquiredVia: "purchase",
          createdAt: new Date(),
        });

      // Update user credits
      await db
        .update(users)
        .set({
          credits: (user.credits || 0) - totalCost,
          totalCreditsSpent: (user.totalCreditsSpent || 0) + totalCost,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Update product stock if limited
      if (product.stock !== null) {
        await db
          .update(products)
          .set({
            stock: product.stock - quantity,
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId));
      }

      console.log(`✅ User ${userId} purchased ${quantity}x ${product.name} for ${totalCost} credits`);

      return { success: true, transaction };
    } catch (error) {
      console.error("Error purchasing product:", error);
      return { success: false, error: "Purchase failed" };
    }
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    try {
      const transactionList = await db.select().from(transactions).where(eq(transactions.userId, userId));
      return transactionList;
    } catch (error) {
      console.error("Error getting user transactions:", error);
      return [];
    }
  }

  // === SUBSCRIPTION TIER ALGORITHMS ===

  // Define tier configuration based on CSV data
  private getTierConfiguration(tier: string) {
    const tierConfigs = {
      'Fan': {
        price: 0.00,
        initialCredits: 500,
        monthlyCredits: 0,
        initialFame: 1,
        initialExperience: 0
      },
      'Artist': {
        price: 5.95,
        initialCredits: 1500,
        monthlyCredits: 1500,
        initialFame: 5,
        initialExperience: 100
      },
      'Record Label': {
        price: 19.95,
        initialCredits: 5000,
        monthlyCredits: 5000,
        initialFame: 15,
        initialExperience: 3500
      },
      'Mogul': {
        price: 49.50,
        initialCredits: 15000,
        monthlyCredits: 15000,
        initialFame: 30,
        initialExperience: 10000
      }
    };

    return tierConfigs[tier as keyof typeof tierConfigs] || tierConfigs['Fan'];
  }

  async applySubscriptionTierBenefits(userId: string, newTier: string): Promise<void> {
    try {
      const tierConfig = this.getTierConfiguration(newTier);
      const currentUser = await this.getUser(userId);
      
      if (!currentUser) {
        throw new Error('User not found');
      }

      // Calculate band generation benefits - ADDITIVE system (add free generations to existing count)
      const currentFreeGenerations = currentUser.freeBandGenerations || 0;
      const additionalFreeGenerations = {
        'Fan': 0,        // No additional generations for Fan tier
        'Artist': 5,     // +5 additional free generations
        'Record Label': 15, // +15 additional free generations  
        'Mogul': 999     // Set to high number for unlimited (999 should be enough)
      };
      
      const additionalGenerations = additionalFreeGenerations[newTier as keyof typeof additionalFreeGenerations] || 0;
      const newFreeGenerationsCount = newTier === 'Mogul' ? 999 : (currentFreeGenerations + additionalGenerations);
      
      // Users keep all existing bands AND get additional free generations
      const keepCurrentBandCount = currentUser.bandGenerationCount || 0;

      // Update user with new tier benefits
      await db
        .update(users)
        .set({
          subscriptionTier: newTier,
          subscriptionPrice: tierConfig.price,
          credits: Math.max(currentUser.credits || 0, tierConfig.initialCredits), // Keep higher amount
          monthlyCredits: tierConfig.monthlyCredits,
          fame: Math.max(currentUser.fame || 1, tierConfig.initialFame), // Keep higher amount
          experience: Math.max(currentUser.experience || 0, tierConfig.initialExperience), // Keep higher amount
          totalCreditsEarned: Math.max(currentUser.totalCreditsEarned || 0, tierConfig.initialCredits), // Keep higher total
          bandGenerationCount: keepCurrentBandCount, // Keep all existing bands
          freeBandGenerations: newFreeGenerationsCount, // Add additional free generations
          lastCreditRenewal: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      const bandBenefit = newTier === 'Mogul' ? 'unlimited bands' : `+${additionalGenerations} free bands (now ${newFreeGenerationsCount} total)`;
      console.log(`✅ Applied ${newTier} tier benefits to user ${userId}: ${tierConfig.initialCredits} credits, ${tierConfig.initialFame} fame, ${tierConfig.initialExperience} exp, ${bandBenefit} (keeping existing ${keepCurrentBandCount} created bands)`);
    } catch (error) {
      console.error("Error applying subscription tier benefits:", error);
      throw error;
    }
  }

  async processMonthlyCredits(): Promise<void> {
    try {
      // Get all users who need monthly credit renewals (non-Fan tiers only)
      const usersNeedingRenewal = await db
        .select()
        .from(users)
        .where(sql`subscription_tier != 'Fan' AND COALESCE(last_credit_renewal, created_at) <= NOW() - INTERVAL '30 days'`);

      for (const user of usersNeedingRenewal) {
        const tierConfig = this.getTierConfiguration(user.subscriptionTier || 'Fan');
        
        if (tierConfig.monthlyCredits > 0) {
          const newTotalCredits = (user.credits || 0) + tierConfig.monthlyCredits;
          const newTotalEarned = (user.totalCreditsEarned || 0) + tierConfig.monthlyCredits;

          await db
            .update(users)
            .set({
              credits: newTotalCredits,
              totalCreditsEarned: newTotalEarned,
              lastCreditRenewal: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          console.log(`💰 Monthly credits renewed: User ${user.id} received ${tierConfig.monthlyCredits} credits (${user.subscriptionTier} tier)`);
        }
      }

      console.log(`🔄 Monthly credit renewal processed for ${usersNeedingRenewal.length} users`);
    } catch (error) {
      console.error("Error processing monthly credits:", error);
    }
  }

  // === ACHIEVEMENT SYSTEM ===

  async checkAndAwardAchievements(artistCardId: string): Promise<BandAchievement[]> {
    try {
      const card = await this.getArtistCard(artistCardId);
      if (!card) return [];

      // Calculate total sales from all 3 metrics: physical copies + digital downloads + streams
      const currentSales = (card.physicalCopies || 0) + (card.digitalDownloads || 0) + (card.totalStreams || 0);
      const newAchievements: BandAchievement[] = [];

      // Define achievement milestones
      const milestones = [
        {
          type: "gold_record",
          name: "GOLD Record!",
          description: "Achieved 500,000 sales - A true mark of success!",
          icon: "gold",
          salesRequired: 500000,
          fameBoost: 5
        },
        {
          type: "platinum_album", 
          name: "Platinum Album!",
          description: "Achieved 2,000,000 sales - Elite status reached!",
          icon: "platinum",
          salesRequired: 2000000,
          fameBoost: 25
        },
        {
          type: "diamond_album",
          name: "Diamond Album!",
          description: "Achieved 10,000,000 sales - Legendary status forever!",
          icon: "diamond", 
          salesRequired: 10000000,
          fameBoost: 45
        }
      ];

      // Check each milestone
      for (const milestone of milestones) {
        if (currentSales >= milestone.salesRequired) {
          // Check if achievement already exists
          const existing = await db.select().from(bandAchievements)
            .where(eq(bandAchievements.artistCardId, artistCardId));
          
          const hasAchievement = existing.some(a => a.achievementType === milestone.type);

          if (!hasAchievement) {
            // Award new achievement
            const [achievement] = await db
              .insert(bandAchievements)
              .values({
                id: randomUUID(),
                artistCardId,
                userId: card.userId!,
                achievementType: milestone.type,
                achievementName: milestone.name,
                description: milestone.description,
                iconType: milestone.icon,
                salesRequired: milestone.salesRequired,
                salesAtAchievement: currentSales,
                fameBoostPercent: milestone.fameBoost,
                createdAt: new Date(),
              })
              .returning();

            newAchievements.push(achievement);

            // Update user's FAME with the boost
            const user = await this.getUser(card.userId!);
            if (user) {
              const currentFame = user.fame || 1;
              const fameIncrease = Math.floor(currentFame * (milestone.fameBoost / 100));
              await db
                .update(users)
                .set({
                  fame: currentFame + fameIncrease,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, card.userId!));

              console.log(`🏆 ${milestone.name} achieved! ${card.userId} gained ${fameIncrease} FAME (${milestone.fameBoost}% boost)`);
            }
          }
        }
      }

      return newAchievements;
    } catch (error) {
      console.error("Error checking achievements:", error);
      return [];
    }
  }

  async getBandAchievements(artistCardId: string): Promise<BandAchievement[]> {
    try {
      const achievements = await db.select().from(bandAchievements)
        .where(eq(bandAchievements.artistCardId, artistCardId))
        .orderBy(bandAchievements.salesRequired);
      return achievements;
    } catch (error) {
      console.error("Error getting band achievements:", error);
      return [];
    }
  }

  async getUserAchievements(userId: string): Promise<BandAchievement[]> {
    try {
      const achievements = await db.select().from(bandAchievements)
        .where(eq(bandAchievements.userId, userId))
        .orderBy(bandAchievements.createdAt);
      return achievements;
    } catch (error) {
      console.error("Error getting user achievements:", error);
      return [];
    }
  }

  // Calculate user's total daily streams from all owned artist cards
  async calculateUserDailyStreams(userId: string): Promise<number> {
    try {
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
    } catch (error) {
      console.error("Error calculating user daily streams:", error);
      return 0;
    }
  }
}