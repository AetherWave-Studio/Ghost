import { User } from "@shared/schema";
import { storage } from "../storage";

export interface RankingUpdate {
  fameChange: number;
  dailyStreamsChange: number;
  totalStreamsChange: number;
  chartPositionChange: number;
  fanbaseChange: number;
  reason: string;
}

interface Milestone {
  id: string;
  name: string;
  description: string;
  requirement: (user: User) => boolean;
  reward: {
    type: 'experience' | 'influence' | 'fame' | 'unlock';
    amount?: number;
    feature?: string;
  };
}

export class RankingSystem {
  private static milestones: Milestone[] = [
    {
      id: "first_upload",
      name: "First Steps",
      description: "Upload your first track",
      requirement: (user) => (user.totalCards || 0) >= 1,
      reward: { type: 'fame', amount: 5 }
    },
    {
      id: "rising_star",
      name: "Rising Star",
      description: "Reach 1,000 total streams",
      requirement: (user) => (user.totalStreams || 0) >= 1000,
      reward: { type: 'fame', amount: 10 }
    },
    {
      id: "chart_debut",
      name: "Chart Debut",
      description: "Enter the charts (position 100 or better)",
      requirement: (user) => (user.chartPosition || 0) > 0 && (user.chartPosition || 0) <= 100,
      reward: { type: 'fame', amount: 15 }
    },
    {
      id: "viral_hit",
      name: "Viral Hit",
      description: "Reach 10,000 daily streams",
      requirement: (user) => (user.dailyStreams || 0) >= 10000,
      reward: { type: 'fame', amount: 20 }
    },
    {
      id: "top_40",
      name: "Top 40 Artist",
      description: "Reach top 40 on the charts",
      requirement: (user) => (user.chartPosition || 0) > 0 && (user.chartPosition || 0) <= 40,
      reward: { type: 'fame', amount: 25 }
    },
    {
      id: "fanbase_1k",
      name: "Growing Fanbase",
      description: "Gain 1,000 fans",
      requirement: (user) => (user.fanbase || 0) >= 1000,
      reward: { type: 'fame', amount: 8 }
    },
    {
      id: "fanbase_10k",
      name: "Devoted Following",
      description: "Gain 10,000 fans",
      requirement: (user) => (user.fanbase || 0) >= 10000,
      reward: { type: 'fame', amount: 15 }
    },
    {
      id: "top_10",
      name: "Chart Domination",
      description: "Reach top 10 on the charts",
      requirement: (user) => (user.chartPosition || 0) > 0 && (user.chartPosition || 0) <= 10,
      reward: { type: 'fame', amount: 30 }
    },
    {
      id: "superstar",
      name: "Superstar Status",
      description: "Reach Fame level 80",
      requirement: (user) => (user.fame || 1) >= 80,
      reward: { type: 'unlock', feature: 'Label Executive Level' }
    },
    {
      id: "legend",
      name: "Music Legend",
      description: "Reach maximum Fame level 100",
      requirement: (user) => (user.fame || 1) >= 100,
      reward: { type: 'unlock', feature: 'Hall of Fame Status' }
    }
  ];

  // Calculate ranking changes based on new release quality
  static calculateRankingUpdate(musicQuality: number, releaseImpact: number): RankingUpdate {
    // Quality affects how much stats can grow (0.0-1.0)
    const qualityMultiplier = Math.max(0.1, musicQuality);
    
    // Base changes (can be positive or negative based on quality)
    const baseStreamsGrowth = Math.floor((musicQuality - 0.3) * 5000); // -1500 to +3500
    const baseFansGrowth = Math.floor((musicQuality - 0.4) * 1000); // -400 to +600
    
    // Random factors to simulate market variability
    const viralChance = Math.random();
    const marketResponse = 0.5 + (Math.random() * 0.5); // 0.5-1.0 multiplier
    
    let update: RankingUpdate = {
      fameChange: 0,
      dailyStreamsChange: Math.floor(baseStreamsGrowth * marketResponse),
      totalStreamsChange: Math.floor(baseStreamsGrowth * marketResponse * 7), // week's worth
      chartPositionChange: 0,
      fanbaseChange: Math.floor(baseFansGrowth * marketResponse),
      reason: musicQuality > 0.7 ? "High-quality release" : musicQuality > 0.4 ? "Average release" : "Poor reception"
    };

    // Viral hit chance (5% for high quality, 1% for average)
    if (viralChance < (musicQuality > 0.7 ? 0.05 : 0.01)) {
      update.dailyStreamsChange *= 5;
      update.totalStreamsChange *= 3;
      update.fanbaseChange *= 3;
      update.reason = "Viral hit! 🔥";
    }

    // Fame changes based on performance (1-100 scale)
    if (update.dailyStreamsChange > 5000) update.fameChange += 5;
    if (update.fanbaseChange > 500) update.fameChange += 3;
    if (musicQuality > 0.8) update.fameChange += 4;
    if (musicQuality < 0.3) update.fameChange -= 2;

    // Chart position logic (simplified)
    const chartMomentum = (update.dailyStreamsChange + update.fanbaseChange) / 1000;
    if (chartMomentum > 10) {
      update.chartPositionChange = -Math.floor(Math.random() * 20 + 10); // Move up 10-30 positions
    } else if (chartMomentum < -5) {
      update.chartPositionChange = Math.floor(Math.random() * 15 + 5); // Drop 5-20 positions
    }

    return update;
  }

  // Apply ranking update to user
  static async applyRankingUpdate(userId: string, update: RankingUpdate): Promise<User | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    // Apply changes with bounds checking
    const newFame = Math.max(1, Math.min(100, (user.fame || 1) + update.fameChange));
    const newDailyStreams = Math.max(0, (user.dailyStreams || 0) + update.dailyStreamsChange);
    const newTotalStreams = Math.max(0, (user.totalStreams || 0) + update.totalStreamsChange);
    const newFanbase = Math.max(0, (user.fanbase || 0) + update.fanbaseChange);
    
    // Chart position logic (0 = unranked, 1-100 = ranked)
    let newChartPosition = user.chartPosition || 0;
    if ((user.chartPosition || 0) === 0 && update.chartPositionChange < 0) {
      // Entering charts
      newChartPosition = Math.min(100, 100 + update.chartPositionChange);
    } else if ((user.chartPosition || 0) > 0) {
      // Already on charts
      newChartPosition = Math.max(0, Math.min(100, (user.chartPosition || 0) + update.chartPositionChange));
    }

    const updatedUser = {
      ...user,
      fame: newFame,
      dailyStreams: newDailyStreams,
      totalStreams: newTotalStreams,
      chartPosition: newChartPosition,
      fanbase: newFanbase,
      lastActivityDate: new Date(),
    };

    await storage.updateUser(userId, updatedUser);
    return updatedUser;
  }

  // Check for milestone achievements
  static checkMilestones(user: User): Milestone[] {
    return this.milestones.filter(milestone => milestone.requirement(user));
  }

  // Initialize new user with random starting stats
  static generateStartingStats(): Partial<User> {
    return {
      fame: 1,
      totalStreams: Math.floor(Math.random() * 100), // 0-99 starting streams
      dailyStreams: Math.floor(Math.random() * 50), // 0-49 daily streams
      chartPosition: 0, // Start unranked
      fanbase: Math.floor(Math.random() * 25), // 0-24 starting fans
    };
  }

  // Calculate and update global user rankings
  static async updateGlobalRankings(): Promise<void> {
    try {
      // Get all users with some activity (non-zero stats)
      const allUsers = await storage.getAllUsers();
      
      // Filter to active users and calculate ranking scores
      const activeUsers = allUsers
        .filter((user: User) => (user.fame || 0) > 1 || (user.totalStreams || 0) > 0 || (user.fanbase || 0) > 0)
        .map((user: User) => ({
          ...user,
          rankingScore: this.calculateRankingScore(user)
        }))
        .sort((a: any, b: any) => b.rankingScore - a.rankingScore); // Highest score first

      // Only assign chart positions to top 100 users
      const TOP_CHART_POSITIONS = 100;
      const topUsers = activeUsers.slice(0, TOP_CHART_POSITIONS);
      
      // Clear chart positions for all users first
      const allUserIds = allUsers.map(u => u.id);
      for (const userId of allUserIds) {
        const currentUser = allUsers.find(u => u.id === userId);
        if (currentUser && (currentUser.chartPosition || 0) > 0) {
          await storage.updateUser(userId, { chartPosition: 0 });
        }
      }

      // Assign chart positions to top 100 users only (1 = best, 2 = second, etc.)
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const chartPosition = i + 1; // 1-based ranking
        
        await storage.updateUser(user.id, { chartPosition });
        console.log(`📊 Updated ${user.firstName || 'User'} to chart position #${chartPosition}`);
      }

      console.log(`✅ Updated global rankings - ${topUsers.length} users ranked (top 100 of ${activeUsers.length} active users)`);
    } catch (error) {
      console.error('Error updating global rankings:', error);
    }
  }

  // Calculate ranking score based on multiple metrics
  static calculateRankingScore(user: User): number {
    const fame = user.fame || 0;
    const totalStreams = user.totalStreams || 0;
    const dailyStreams = user.dailyStreams || 0;
    const fanbase = user.fanbase || 0;
    
    // Weighted scoring system
    return (
      fame * 1000 +           // FAME is most important (1000 points per level)
      totalStreams * 0.01 +   // Total streams contribute
      dailyStreams * 1 +      // Daily activity important
      fanbase * 10            // Fanbase size matters
    );
  }

  // Get user's rank compared to others (for leaderboards)
  static async getUserRank(userId: string): Promise<{ fameRank: number, streamsRank: number, totalUsers: number }> {
    try {
      const allUsers = await storage.getAllUsers();
      const user = allUsers.find(u => u.id === userId);
      if (!user) return { fameRank: 0, streamsRank: 0, totalUsers: 0 };

      const activeUsers = allUsers.filter((u: User) => (u.fame || 0) > 1 || (u.totalStreams || 0) > 0);
      
      // Sort by FAME for fame rank
      const fameRanked = activeUsers.sort((a: User, b: User) => (b.fame || 0) - (a.fame || 0));
      const fameRank = fameRanked.findIndex((u: User) => u.id === userId) + 1;
      
      // Sort by total streams for streams rank  
      const streamsRanked = activeUsers.sort((a: User, b: User) => (b.totalStreams || 0) - (a.totalStreams || 0));
      const streamsRank = streamsRanked.findIndex((u: User) => u.id === userId) + 1;
      
      return {
        fameRank,
        streamsRank,
        totalUsers: activeUsers.length
      };
    } catch (error) {
      console.error('Error getting user rank:', error);
      return { fameRank: 0, streamsRank: 0, totalUsers: 0 };
    }
  }

  // Simulate daily activity decay (streams decrease over time without new releases)
  static calculateDailyDecay(user: User): Partial<User> {
    const daysSinceActivity = Math.floor((Date.now() - (user.lastActivityDate?.getTime() || Date.now())) / (1000 * 60 * 60 * 24));
    
    if (daysSinceActivity > 1) {
      const decayRate = Math.min(0.9, 0.95 ** daysSinceActivity); // 5% decay per day
      
      return {
        dailyStreams: Math.floor((user.dailyStreams || 0) * decayRate),
        chartPosition: (user.chartPosition || 0) > 0 ? Math.min(100, Math.floor((user.chartPosition || 0) * 1.1)) : 0
      };
    }
    
    return {};
  }
}