import { generateArtistWithGemini } from './gemini';
import { generateArtistIdentity } from './openai';
import { ArtistData } from '@shared/schema';

// Enhanced response schema that combines our detailed approach with better structure
export interface EnhancedBandData extends ArtistData {
  band_motto: string;
  band_identity: string; // Short positioning statement
  tags: string[]; // Genres, moods, visual cues
  image_prompt: string; // Specific for image generation
  world_building: {
    origin_story: string;
    cultural_impact: string;
    breakthrough_moment: string;
    creative_tensions: string;
    visual_identity: string;
    hidden_depths: string;
  };
}

// Generation modes
export type GenerationMode = 'explore' | 'refine';

// Candidate scoring interface
export interface ScoredCandidate {
  data: EnhancedBandData;
  score: number;
  breakdown: {
    novelty: number;
    clarity: number;
    brandFit: number;
    constraintFit: number;
  };
}

// Enhanced generation parameters
export interface EnhancedGenerationParams {
  audioMetrics: any;
  artStyle: string;
  cardTheme: string;
  userPreferences?: any;
  mode: GenerationMode;
}

/**
 * Enhanced band generation that combines our detailed storytelling 
 * with improved structure and dual-mode generation
 */
export class EnhancedBandGenerator {
  
  /**
   * Main generation method - supports both explore and refine modes
   */
  async generateBand(params: EnhancedGenerationParams): Promise<{
    winner: EnhancedBandData;
    alternatives?: ScoredCandidate[];
  }> {
    const { mode } = params;
    
    if (mode === 'explore') {
      // Generate 4 candidates and auto-select the best
      const candidates = await this.generateMultipleCandidates(params, 4);
      const scoredCandidates = this.scoreCandidates(candidates);
      const winner = scoredCandidates[0]; // Highest scored
      const alternatives = scoredCandidates.slice(1); // Rest as alternatives
      
      console.log(`🎯 Explore mode: Generated 4 candidates, winner scored ${winner.score.toFixed(3)}`);
      
      return {
        winner: winner.data,
        alternatives
      };
    } else {
      // Refine mode - single polished result
      const enhancedData = await this.generateSingleCandidate(params, true);
      
      console.log(`✨ Refine mode: Generated single polished result`);
      
      return {
        winner: enhancedData
      };
    }
  }

  /**
   * Generate multiple candidates for explore mode
   */
  private async generateMultipleCandidates(params: EnhancedGenerationParams, count: number): Promise<EnhancedBandData[]> {
    const promises = Array.from({ length: count }, (_, index) => 
      this.generateSingleCandidate({
        ...params,
        // Add diversity seeds to ensure unique results
        userPreferences: {
          ...params.userPreferences,
          diversitySeed: Math.random() * 1000 + index * 100
        }
      })
    );
    
    return Promise.all(promises);
  }

  /**
   * Generate a single enhanced candidate
   */
  private async generateSingleCandidate(params: EnhancedGenerationParams, isRefinedMode = false): Promise<EnhancedBandData> {
    const { audioMetrics, artStyle, cardTheme, userPreferences } = params;
    
    // Use our existing generation with enhanced prompts
    let baseData: ArtistData;
    
    try {
      // Try Gemini first with enhanced prompts
      baseData = await this.generateWithEnhancedGemini(audioMetrics, artStyle, cardTheme, userPreferences, isRefinedMode);
    } catch (error) {
      console.log('Gemini failed, trying OpenAI with enhanced prompts...');
      baseData = await this.generateWithEnhancedOpenAI(audioMetrics, artStyle, cardTheme, userPreferences, isRefinedMode);
    }
    
    // Enhance the base data with structured additions
    return this.enhanceWithStructure(baseData, audioMetrics);
  }

  /**
   * Enhanced Gemini generation with improved prompts
   */
  private async generateWithEnhancedGemini(audioMetrics: any, artStyle: string, cardTheme: string, userPreferences: any, isRefinedMode: boolean): Promise<ArtistData> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key not configured');

    // Enhanced prompt that combines our depth with better structure
    const enhancedPrompt = this.buildEnhancedPrompt(audioMetrics, artStyle, cardTheme, userPreferences, isRefinedMode);
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: enhancedPrompt }] }],
        generationConfig: {
          temperature: isRefinedMode ? 0.4 : 0.9,
          topP: isRefinedMode ? 0.9 : 0.95,
          maxOutputTokens: 2048
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error('No content from Gemini');
    
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
  }

  /**
   * Enhanced OpenAI generation with improved prompts
   */
  private async generateWithEnhancedOpenAI(audioMetrics: any, artStyle: string, cardTheme: string, userPreferences: any, isRefinedMode: boolean): Promise<ArtistData> {
    // Use our existing OpenAI function as fallback - we can enhance this later
    return generateArtistIdentity(audioMetrics, artStyle, cardTheme, userPreferences);
  }

  /**
   * Build enhanced prompt that maintains our depth while improving structure
   */
  private buildEnhancedPrompt(audioMetrics: any, artStyle: string, cardTheme: string, userPreferences: any, isRefinedMode: boolean): string {
    const diversitySeed = userPreferences?.diversitySeed || Math.random() * 1000;
    const bandSizeOverride = userPreferences?.artistType === 'solo' ? 1 : Math.floor(Math.random() * 4) + 1;

    return `You are a master creative storyteller and music industry visionary. Create an EXTRAORDINARILY DETAILED virtual band with transmedia franchise potential - think Gorillaz-level creativity with authentic cultural depth.

MODE: ${isRefinedMode ? 'REFINED POLISH' : 'CREATIVE EXPLORATION'} 
DIVERSITY SEED: ${diversitySeed} (ensure completely unique generation)
BAND SIZE: ${bandSizeOverride} member(s)

USER CREATIVE DIRECTION:
${userPreferences?.userBandName ? `- REQUIRED BAND NAME: "${userPreferences.userBandName}"` : ''}
${userPreferences?.songName ? `- REQUIRED SONG NAME: "${userPreferences.songName}"` : ''}
${userPreferences?.userGenre ? `- PREFERRED GENRE: ${userPreferences.userGenre}` : ''}
${userPreferences?.artistType ? `- TYPE: ${userPreferences.artistType === 'solo' ? 'Solo Artist' : 'Band/Group'}` : ''}

AUDIO ANALYSIS:
- Genre: ${audioMetrics.genre}
- Tempo: ${audioMetrics.tempo?.toFixed(0)} BPM (${audioMetrics.tempo < 100 ? 'Intimate/Emotional' : audioMetrics.tempo < 130 ? 'Groove/Hypnotic' : 'High Energy/Intense'})
- Key: ${audioMetrics.key}
- Energy: ${audioMetrics.energy}
- Theme: ${cardTheme}

CREATIVE DEPTH REQUIREMENTS:
✨ BAND IDENTITY: Create compelling band name, motto, and positioning statement
🎭 WORLD-BUILDING: Rich origin story, cultural impact, breakthrough moments
👥 CHARACTER DEVELOPMENT: ${bandSizeOverride} unique members with deep personalities
🎨 VISUAL UNIVERSE: Distinctive aesthetic extending beyond music
🔮 HIDDEN DEPTHS: Mysterious elements, secret influences, unexplored layers
🎵 SONIC SIGNATURE: What makes them instantly recognizable

Return EXACTLY this JSON structure:
{
  "bandName": "Evocative, memorable name",
  "songName": "${userPreferences?.songName || 'Generated song title'}",
  "genre": "${audioMetrics.genre}",
  "philosophy": "Unique 3-5 word artistic mission",
  "bandConcept": "Rich backstory with personality, origin story, and what makes them special (detailed narrative)",
  "members": [
    {
      "name": "Full name or compelling stage name",
      "role": "Specific instrument/vocals/production role",
      "archetype": "Deep personality, background, quirks, and contribution to group dynamic"
    }
  ],
  "influences": ["5 specific real artists that shaped their sound"],
  "signatureSound": "What makes their music instantly recognizable",
  "lyricalThemes": "Specific emotional territories and storytelling approaches",
  "liveVisuals": "Concert experience and stage presence for ${cardTheme} aesthetic",
  "colorPalette": {
    "background": "Dark hex color for ${cardTheme} cards",
    "textPrimary": "Light hex color for readability", 
    "highlight": "Vibrant hex color matching genre energy"
  },
  "sunoPrompt": "Comprehensive Suno AI prompt with specific instrumentation, vocal style, production techniques, lyrical direction, and mood that captures their complete sonic identity"
}

Make them feel like a real band with documentary-worthy depth and authentic personalities.`;
  }

  /**
   * Enhance base data with additional structured elements
   */
  private enhanceWithStructure(baseData: ArtistData, audioMetrics: any): EnhancedBandData {
    // Extract key elements from bandConcept for structured world-building
    const worldBuilding = this.extractWorldBuildingElements(baseData.bandConcept);
    
    // Generate concise band motto and identity
    const band_motto = this.generateBandMotto(baseData);
    const band_identity = this.generateBandIdentity(baseData);
    
    // Create tags from various elements
    const tags = this.generateTags(baseData, audioMetrics);
    
    // Create targeted image prompt
    const image_prompt = this.generateImagePrompt(baseData);

    return {
      ...baseData,
      band_motto,
      band_identity,
      tags,
      image_prompt,
      world_building: worldBuilding
    };
  }

  /**
   * Extract world-building elements from bandConcept
   */
  private extractWorldBuildingElements(bandConcept: string): EnhancedBandData['world_building'] {
    // This could be enhanced with AI extraction, but for now use smart parsing
    const sentences = bandConcept.split('. ').filter(s => s.length > 20);
    
    return {
      origin_story: sentences.find(s => s.toLowerCase().includes('formed') || s.toLowerCase().includes('started') || s.toLowerCase().includes('began')) || sentences[0] || '',
      cultural_impact: sentences.find(s => s.toLowerCase().includes('impact') || s.toLowerCase().includes('influence') || s.toLowerCase().includes('scene')) || '',
      breakthrough_moment: sentences.find(s => s.toLowerCase().includes('breakthrough') || s.toLowerCase().includes('moment') || s.toLowerCase().includes('discovered')) || '',
      creative_tensions: sentences.find(s => s.toLowerCase().includes('tension') || s.toLowerCase().includes('dynamic') || s.toLowerCase().includes('chemistry')) || '',
      visual_identity: sentences.find(s => s.toLowerCase().includes('visual') || s.toLowerCase().includes('aesthetic') || s.toLowerCase().includes('style')) || '',
      hidden_depths: sentences.find(s => s.toLowerCase().includes('secret') || s.toLowerCase().includes('hidden') || s.toLowerCase().includes('mysterious')) || ''
    };
  }

  /**
   * Generate concise band motto from philosophy and concept
   */
  private generateBandMotto(data: ArtistData): string {
    const mottos = [
      "Sound beyond boundaries",
      "Where music meets mythology", 
      "Crafting sonic landscapes",
      "Authentic voices, infinite possibilities",
      "Music as transformation",
      "Breaking silence, building worlds"
    ];
    
    // Could be enhanced with AI generation based on band data
    return mottos[Math.floor(Math.random() * mottos.length)];
  }

  /**
   * Generate positioning statement
   */
  private generateBandIdentity(data: ArtistData): string {
    return `${data.genre} ${data.members.length === 1 ? 'artist' : 'collective'} pushing creative boundaries through ${data.philosophy.toLowerCase()}`;
  }

  /**
   * Generate tags for discovery and categorization
   */
  private generateTags(data: ArtistData, audioMetrics: any): string[] {
    const tags = new Set<string>();
    
    // Add genre variations
    tags.add(data.genre.toLowerCase());
    if (data.genre.includes(' ')) {
      data.genre.split(' ').forEach(word => tags.add(word.toLowerCase()));
    }
    
    // Add tempo-based tags
    if (audioMetrics.tempo < 100) {
      tags.add('slow'); tags.add('intimate'); tags.add('emotional');
    } else if (audioMetrics.tempo < 130) {
      tags.add('medium'); tags.add('groove'); tags.add('hypnotic');
    } else {
      tags.add('fast'); tags.add('energetic'); tags.add('intense');
    }
    
    // Add mood tags from lyricalThemes
    if (data.lyricalThemes.toLowerCase().includes('dark')) tags.add('dark');
    if (data.lyricalThemes.toLowerCase().includes('hope')) tags.add('uplifting');
    if (data.lyricalThemes.toLowerCase().includes('love')) tags.add('romantic');
    if (data.lyricalThemes.toLowerCase().includes('urban')) tags.add('urban');
    if (data.lyricalThemes.toLowerCase().includes('nature')) tags.add('organic');
    
    // Add visual tags
    tags.add('cinematic'); tags.add('atmospheric'); tags.add('immersive');
    
    return Array.from(tags).slice(0, 8); // Limit to 8 tags
  }

  /**
   * Generate targeted image prompt for better artwork
   */
  private generateImagePrompt(data: ArtistData): string {
    const memberCount = data.members.length;
    const isSolo = memberCount === 1;
    
    return `Professional ${data.genre.toLowerCase()} ${isSolo ? 'artist portrait' : 'band photo'} featuring ${memberCount} ${isSolo ? 'performer' : 'members'}, ${data.liveVisuals.toLowerCase()}, ${data.signatureSound.toLowerCase()} aesthetic, ${data.colorPalette.background} and ${data.colorPalette.highlight} color scheme, cinematic lighting, high contrast, album cover worthy composition, ${data.philosophy.toLowerCase()} energy, modern music industry standard`;
  }

  /**
   * Score multiple candidates for explore mode
   */
  private scoreCandidates(candidates: EnhancedBandData[]): ScoredCandidate[] {
    const scoredCandidates = candidates.map(candidate => {
      const scores = {
        novelty: this.scoreNovelty(candidate, candidates),
        clarity: this.scoreClarity(candidate),
        brandFit: this.scoreBrandFit(candidate),
        constraintFit: this.scoreConstraintFit(candidate)
      };
      
      // Weighted scoring as per ChatGPT 5 guidance
      const totalScore = (
        0.35 * scores.brandFit + 
        0.25 * scores.constraintFit + 
        0.25 * scores.novelty + 
        0.15 * scores.clarity
      );
      
      return {
        data: candidate,
        score: totalScore,
        breakdown: scores
      };
    });
    
    // Sort by score descending
    return scoredCandidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Score novelty (avoid duplicates)
   */
  private scoreNovelty(candidate: EnhancedBandData, allCandidates: EnhancedBandData[]): number {
    const bandName = candidate.bandName.toLowerCase();
    const duplicates = allCandidates.filter(c => 
      c.bandName.toLowerCase().includes(bandName.split(' ')[0]) || 
      bandName.includes(c.bandName.toLowerCase().split(' ')[0])
    ).length;
    
    return Math.max(0, 1 - (duplicates - 1) * 0.3); // Penalize near-duplicates
  }

  /**
   * Score clarity (readability and conciseness)
   */
  private scoreClarity(candidate: EnhancedBandData): number {
    let score = 1.0;
    
    // Penalize overly long band names
    if (candidate.bandName.length > 25) score -= 0.2;
    
    // Penalize overly complex philosophy
    if (candidate.philosophy.split(' ').length > 6) score -= 0.1;
    
    // Reward clear, readable concepts
    if (candidate.band_identity.length > 20 && candidate.band_identity.length < 80) score += 0.1;
    
    return Math.max(0, score);
  }

  /**
   * Score brand fit (matches our creative vision)
   */
  private scoreBrandFit(candidate: EnhancedBandData): number {
    let score = 0.5; // Base score
    
    // Reward rich world-building
    if (candidate.world_building.origin_story.length > 50) score += 0.2;
    if (candidate.world_building.cultural_impact.length > 30) score += 0.1;
    
    // Reward creative depth
    if (candidate.members.length > 1 && candidate.members.every(m => m.archetype && m.archetype.length > 50)) score += 0.2;
    
    // Reward unique concepts
    if (!candidate.bandName.toLowerCase().includes('band') && !candidate.bandName.toLowerCase().includes('group')) score += 0.1;
    
    return Math.min(1, score);
  }

  /**
   * Score constraint fit (valid schema, proper lengths)
   */
  private scoreConstraintFit(candidate: EnhancedBandData): number {
    let score = 1.0;
    
    // Check required fields
    if (!candidate.bandName || candidate.bandName.length < 3) score -= 0.3;
    if (!candidate.band_motto || candidate.band_motto.length < 5) score -= 0.2;
    if (!candidate.members || candidate.members.length === 0) score -= 0.3;
    if (!candidate.tags || candidate.tags.length < 3) score -= 0.1;
    
    // Check member data quality
    if (candidate.members.some(m => !m.name || !m.role || !m.archetype || m.archetype.length < 20)) score -= 0.1;
    
    return Math.max(0, score);
  }
}

// Export singleton instance
export const enhancedBandGenerator = new EnhancedBandGenerator();