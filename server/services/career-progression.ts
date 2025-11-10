import { storage } from "../storage";
import { RankingSystem, type RankingUpdate } from "./ranking-system";
import type { Release, ArtistCard, ArtistData, ArtistEvolution, InsertRelease, InsertArtistEvolution } from "@shared/schema";

export interface CareerProgressionResult {
  release: Release;
  rankingUpdate: RankingUpdate;
  artistEvolution: ArtistEvolution;
  careerSummary: string;
}

export interface GenreAnalysis {
  genreConsistency: number; // 0-2 scale: 0.5=departure, 1.0=consistent, 1.5=mastery
  genreShift?: {
    from: string;
    to: string;
    intensity: number; // 0-1 scale
  };
  masteryLevel: number; // 0-2 scale
}

export class CareerProgressionService {
  /**
   * Releases new music under an existing artist, updating their career progression
   */
  static async releaseNewMusic(params: {
    artistCardId: string;
    userId: string;
    fileName: string;
    fileSize: number;
    duration?: number;
    tempo?: number;
    key?: string;
    energy?: string;
    genre?: string;
    confidence?: number;
    releaseTitle?: string;
    releaseType?: "single" | "ep" | "album";
    musicQuality: number;
  }): Promise<CareerProgressionResult> {
    const { artistCardId, userId, musicQuality, genre, ...audioData } = params;

    // Get the existing artist card
    const artistCard = await storage.getArtistCard(artistCardId);
    if (!artistCard) {
      throw new Error("Artist not found");
    }

    // Verify ownership
    if (artistCard.userId !== userId) {
      throw new Error("You don't own this artist");
    }

    const artistData = artistCard.artistData as ArtistData;
    
    // Analyze genre consistency and artistic evolution
    const genreAnalysis = this.analyzeGenreConsistency(artistData, genre || "Unknown");
    
    // Create the release record
    const releaseData: InsertRelease = {
      artistCardId,
      userId,
      fileName: audioData.fileName,
      fileSize: audioData.fileSize,
      duration: audioData.duration,
      tempo: audioData.tempo,
      key: audioData.key,
      energy: audioData.energy,
      genre,
      confidence: audioData.confidence,
      releaseTitle: audioData.releaseTitle,
      releaseType: audioData.releaseType || "single",
      musicQuality,
      genreConsistency: genreAnalysis.genreConsistency,
      releaseImpact: 0, // Will be calculated based on quality and consistency
    };

    const release = await storage.createRelease(releaseData);

    // Calculate release impact based on quality and consistency
    const releaseImpact = this.calculateReleaseImpact(musicQuality, genreAnalysis);
    await storage.updateRelease(release.id, { releaseImpact });

    // Calculate ranking update
    const rankingUpdate = RankingSystem.calculateRankingUpdate(musicQuality, releaseImpact);

    // Apply ranking changes to user
    await RankingSystem.applyRankingUpdate(userId, rankingUpdate);

    // Create artistic evolution record
    const artistEvolution = await this.createArtistEvolution({
      artistCardId,
      releaseId: release.id,
      genreAnalysis,
      rankingUpdate,
      artistData,
      newGenre: genre || "Unknown",
    });

    // Generate career summary
    const careerSummary = await this.generateCareerSummary({
      artistCard,
      release,
      rankingUpdate,
      artistEvolution,
    });

    return {
      release,
      rankingUpdate,
      artistEvolution,
      careerSummary,
    };
  }

  /**
   * Analyzes how the new release fits with the artist's established genre
   */
  private static analyzeGenreConsistency(artistData: ArtistData, newGenre: string): GenreAnalysis {
    const establishedGenre = artistData.genre.toLowerCase();
    const releaseGenre = newGenre.toLowerCase();

    // Basic genre matching
    if (establishedGenre === releaseGenre) {
      return {
        genreConsistency: 1.2, // Slight bonus for consistency
        masteryLevel: 1.2,
      };
    }

    // Check for genre families (related genres)
    const genreFamilies = {
      electronic: ["electronic", "edm", "techno", "house", "ambient", "synthwave"],
      rock: ["rock", "metal", "punk", "alternative", "indie", "grunge"],
      pop: ["pop", "indie pop", "synth-pop", "electropop"],
      jazz: ["jazz", "fusion", "smooth jazz", "bebop"],
      classical: ["classical", "orchestral", "baroque", "romantic"],
      hip_hop: ["hip-hop", "rap", "trap", "drill"],
      folk: ["folk", "country", "bluegrass", "americana"],
    };

    let genreFamily = null;
    for (const [family, genres] of Object.entries(genreFamilies)) {
      if (genres.includes(establishedGenre)) {
        genreFamily = family;
        break;
      }
    }

    // Same family = moderate consistency
    if (genreFamily) {
      const familyGenres = genreFamilies[genreFamily as keyof typeof genreFamilies];
      if (familyGenres.includes(releaseGenre)) {
        return {
          genreConsistency: 1.0, // Neutral consistency
          masteryLevel: 1.1,
          genreShift: {
            from: establishedGenre,
            to: releaseGenre,
            intensity: 0.3,
          },
        };
      }
    }

    // Different genre family = departure
    return {
      genreConsistency: 0.6, // Penalty for departure
      masteryLevel: 0.8,
      genreShift: {
        from: establishedGenre,
        to: releaseGenre,
        intensity: 0.8,
      },
    };
  }

  /**
   * Calculates the overall impact of this release
   */
  private static calculateReleaseImpact(musicQuality: number, genreAnalysis: GenreAnalysis): number {
    const baseImpact = Math.floor(musicQuality * 100); // 0-100 base score
    const consistencyMultiplier = genreAnalysis.genreConsistency;
    
    const finalImpact = Math.floor(baseImpact * consistencyMultiplier);
    
    // Bonus for mastery
    if (genreAnalysis.masteryLevel > 1.1) {
      return Math.min(100, finalImpact + 10);
    }
    
    return Math.max(0, finalImpact);
  }

  /**
   * Creates an artist evolution record tracking how this release affects the artist
   */
  private static async createArtistEvolution(params: {
    artistCardId: string;
    releaseId: string;
    genreAnalysis: GenreAnalysis;
    rankingUpdate: RankingUpdate;
    artistData: ArtistData;
    newGenre: string;
  }): Promise<ArtistEvolution> {
    const { artistCardId, releaseId, genreAnalysis, rankingUpdate, artistData, newGenre } = params;

    // Generate artistic evolution descriptions
    let soundEvolution = "";
    let fanbaseReaction = "";
    let artisticGrowth = "";

    if (genreAnalysis.genreShift) {
      const shift = genreAnalysis.genreShift;
      if (shift.intensity > 0.7) {
        soundEvolution = `Dramatic shift from ${shift.from} to ${shift.to} - a bold artistic pivot`;
        fanbaseReaction = rankingUpdate.fameChange > 0 ? 
          "Mixed reactions but ultimately praised for creative risk-taking" :
          "Fans divided on the new direction, some calling it experimental";
        artisticGrowth = shift.intensity > 0.8 ? "Creative breakthrough" : "Artistic exploration";
      } else if (shift.intensity > 0.3) {
        soundEvolution = `Subtle evolution incorporating ${shift.to} elements into core ${shift.from} sound`;
        fanbaseReaction = "Fans appreciate the musical growth while staying true to roots";
        artisticGrowth = "Measured artistic development";
      }
    } else {
      soundEvolution = `Refined mastery of ${artistData.genre} showcasing technical growth`;
      fanbaseReaction = "Core fanbase celebrates the consistent quality and style";
      artisticGrowth = "Genre mastery progression";
    }

    const evolutionData: InsertArtistEvolution = {
      artistCardId,
      releaseId,
      genreShift: genreAnalysis.genreShift ? genreAnalysis.genreShift : null,
      soundEvolution,
      fanbaseReaction,
      fameChangeFromRelease: rankingUpdate.fameChange,
      fanbaseChangeFromRelease: rankingUpdate.fanbaseChange,
      genreMastery: genreAnalysis.masteryLevel,
      artisticGrowth,
    };

    return await storage.createArtistEvolution(evolutionData);
  }

  /**
   * Generates a comprehensive career summary after a release
   */
  private static async generateCareerSummary(params: {
    artistCard: ArtistCard;
    release: Release;
    rankingUpdate: RankingUpdate;
    artistEvolution: ArtistEvolution;
  }): Promise<string> {
    const { artistCard, release, rankingUpdate, artistEvolution } = params;
    const artistData = artistCard.artistData as ArtistData;

    // Get all releases for this artist to track career arc
    const allReleases = await storage.getArtistReleases(artistCard.id);
    const releaseCount = allReleases.length;

    let summary = `**${artistData.bandName}** has released "${release.releaseTitle || 'New Track'}"`;
    
    if (releaseCount === 1) {
      summary += ` - their debut ${release.releaseType}! `;
    } else if (releaseCount <= 3) {
      summary += ` - their ${releaseCount === 2 ? 'sophomore' : 'third'} release. `;
    } else {
      summary += ` - their latest ${release.releaseType} (#${releaseCount} in their catalog). `;
    }

    // Add evolution context
    if (artistEvolution.soundEvolution) {
      summary += `This release shows ${artistEvolution.soundEvolution.toLowerCase()}. `;
    }

    // Add fan reaction
    if (artistEvolution.fanbaseReaction) {
      summary += `${artistEvolution.fanbaseReaction}. `;
    }

    // Add performance metrics
    if (rankingUpdate.fameChange > 0) {
      summary += `The release boosted their FAME by ${rankingUpdate.fameChange} points`;
      if (rankingUpdate.fanbaseChange > 0) {
        summary += ` and gained ${rankingUpdate.fanbaseChange} new fans`;
      }
      summary += `. `;
    } else if (rankingUpdate.fameChange < 0) {
      summary += `The release was met with mixed reception, resulting in ${Math.abs(rankingUpdate.fameChange)} FAME decline. `;
    }

    // Add chart performance
    if (rankingUpdate.chartPositionChange < 0) {
      summary += `Chart momentum: Rising ${Math.abs(rankingUpdate.chartPositionChange)} positions! `;
    }

    summary += `**${artistData.bandName}** continues to evolve their ${artistData.genre} sound`;
    
    if (artistEvolution.artisticGrowth) {
      summary += ` through ${artistEvolution.artisticGrowth.toLowerCase()}`;
    }
    
    summary += `.`;

    return summary;
  }

  /**
   * Gets a comprehensive career overview for an artist
   */
  static async getArtistCareerOverview(artistCardId: string): Promise<{
    releases: Release[];
    evolutions: ArtistEvolution[];
    careerStats: {
      totalReleases: number;
      genreConsistencyScore: number;
      artisticGrowthTrend: string;
      bestPerformingRelease: Release | null;
      careerHighlights: string[];
    };
  }> {
    const releases = await storage.getArtistReleases(artistCardId);
    const evolutions = await storage.getArtistEvolution(artistCardId);

    const careerStats = {
      totalReleases: releases.length,
      genreConsistencyScore: this.calculateOverallConsistency(releases),
      artisticGrowthTrend: this.determineGrowthTrend(evolutions),
      bestPerformingRelease: this.findBestPerformingRelease(releases),
      careerHighlights: this.generateCareerHighlights(releases, evolutions),
    };

    return {
      releases,
      evolutions,
      careerStats,
    };
  }

  private static calculateOverallConsistency(releases: Release[]): number {
    if (releases.length === 0) return 1.0;
    
    const totalConsistency = releases.reduce((sum, release) => sum + (release.genreConsistency || 1.0), 0);
    return totalConsistency / releases.length;
  }

  private static determineGrowthTrend(evolutions: ArtistEvolution[]): string {
    if (evolutions.length === 0) return "New artist";
    if (evolutions.length === 1) return "Emerging";

    const recentEvolutions = evolutions.slice(0, 3);
    const avgGrowth = recentEvolutions.reduce((sum, evo) => sum + (evo.genreMastery || 1.0), 0) / recentEvolutions.length;

    if (avgGrowth > 1.3) return "Mastering craft";
    if (avgGrowth > 1.1) return "Steady growth";
    if (avgGrowth > 0.9) return "Exploring sound";
    return "Finding direction";
  }

  private static findBestPerformingRelease(releases: Release[]): Release | null {
    if (releases.length === 0) return null;

    return releases.reduce((best, current) => {
      const bestScore = (best.releaseImpact || 0) + (best.streams || 0) / 1000;
      const currentScore = (current.releaseImpact || 0) + (current.streams || 0) / 1000;
      return currentScore > bestScore ? current : best;
    });
  }

  private static generateCareerHighlights(releases: Release[], evolutions: ArtistEvolution[]): string[] {
    const highlights: string[] = [];

    // Release milestones
    if (releases.length >= 10) highlights.push(`${releases.length} releases - prolific artist`);
    else if (releases.length >= 5) highlights.push(`${releases.length} releases - established catalog`);

    // Quality highlights
    const highQualityReleases = releases.filter(r => (r.musicQuality || 0) > 0.8);
    if (highQualityReleases.length > 0) {
      highlights.push(`${highQualityReleases.length} high-quality releases`);
    }

    // Genre evolution highlights
    const significantShifts = evolutions.filter(e => e.genreShift && (e.genreShift as any).intensity > 0.7);
    if (significantShifts.length > 0) {
      highlights.push("Genre evolution pioneer");
    }

    // Performance highlights
    const chartingReleases = releases.filter(r => (r.peakChartPosition || 0) > 0);
    if (chartingReleases.length > 0) {
      highlights.push(`${chartingReleases.length} charting releases`);
    }

    return highlights.length > 0 ? highlights : ["Building their career"];
  }
}