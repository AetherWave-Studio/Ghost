import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { generateArtistIdentity, generateArtistImage, analyzeGenreFromAudio } from "./services/openai";
import { generateBandPortrait } from "./services/google-imagen";
import { analyzeGenreWithGemini, generateArtistWithGemini } from "./services/gemini";
import { ServerAudioAnalyzer } from "./services/audio-analyzer";
import { RankingSystem } from "./services/ranking-system";
import { insertArtistCardSchema, insertReleaseSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { CareerProgressionService } from "./services/career-progression";
import { ObjectStorageService } from "./objectStorage";
import { setupEnhancedBandRoutes } from './routes/enhanced-band-routes';
import { generateTradingCardImage } from './services/trading-card-generator';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Subscription tier limits for band generation (additive system)
const SUBSCRIPTION_LIMITS = {
  Fan: 2,        // Fan tier: 2 free bands (base)
  Artist: 7,     // Artist tier: 2 + 5 = 7 total free bands
  'Record Label': 17, // Record Label tier: 2 + 15 = 17 total free bands
  Mogul: -1      // Mogul tier: unlimited bands
};

// Cost for additional bands beyond tier limits
const ADDITIONAL_BAND_COST = 500; // 500 credits per band

// Credit allocations per subscription tier (monthly)
const CREDIT_ALLOCATIONS = {
  Free: 0,
  Tier2: 1000,
  Tier3: 3000,
  Pro: 9000
};

// Media upload limits per subscription tier
const MEDIA_LIMITS = {
  Free: { photos: 1, videos: 0 },
  Tier2: { photos: 3, videos: 0 },
  Tier3: { photos: 5, videos: 1 },
  Pro: { photos: 10, videos: 3 }
};

function getCreditAllocation(tier: string): number {
  return CREDIT_ALLOCATIONS[tier as keyof typeof CREDIT_ALLOCATIONS] || 0;
}

function getMediaLimits(tier: string): { photos: number; videos: number } {
  return MEDIA_LIMITS[tier as keyof typeof MEDIA_LIMITS] || { photos: 1, videos: 0 };
}

// Generate realistic starting metrics for new bands based on music industry standards
function generateRealisticStartingMetrics(genre: string, confidence: number, audioMetrics: any) {
  // Base ranges for different genres (realistic new band numbers)
  const genreMultipliers = {
    'Pop': 1.5,
    'Rock': 1.2,
    'Hip Hop': 1.8,
    'Electronic': 1.3,
    'Country': 1.1,
    'R&B': 1.4,
    'Indie': 0.8,
    'Folk': 0.6,
    'Jazz': 0.5,
    'Classical': 0.4,
    'Metal': 0.9,
    'Punk': 0.7,
    'Alternative': 1.0
  };

  // Find best genre match or default to 1.0
  const genreKey = Object.keys(genreMultipliers).find(g => 
    genre?.toLowerCase().includes(g.toLowerCase())
  ) || 'Alternative';
  
  const multiplier = genreMultipliers[genreKey as keyof typeof genreMultipliers];

  // Quality factor based on confidence (0.7 - 1.3 range)
  const qualityFactor = 0.7 + (confidence / 100) * 0.6;

  // Grok's conservative starting numbers (more realistic grind)
  const basePhysical = Math.floor((10 + Math.random() * 5) * multiplier * qualityFactor);
  const baseDigital = Math.floor((50 + Math.random() * 25) * multiplier * qualityFactor);
  const baseStreams = Math.floor((100 + Math.random() * 50) * multiplier * qualityFactor);

  // Conservative starting metrics for longer, more engaging progression
  return {
    physicalCopies: Math.max(basePhysical, 10), // 10-15 range (friends and family)
    digitalDownloads: Math.max(baseDigital, 50), // 50-75 range (early supporters)
    totalStreams: Math.max(baseStreams, 100), // 100-150 range (initial discovery)
  };
}

// Calculate milestone FAME boosts based on total sales (Grok's achievement system)
function getMilestoneFameBoost(totalSales: number): number {
  if (totalSales >= 10000000) return 1.45; // Diamond: +45% FAME boost
  if (totalSales >= 2000000) return 1.25;  // Platinum: +25% FAME boost  
  if (totalSales >= 500000) return 1.05;   // Gold: +5% FAME boost
  return 1.0; // No milestone reached
}

// Apply daily FAME-driven growth to a band (Grok's core mechanic)
function calculateDailyGrowth(currentFame: number, currentSales: { physical: number, digital: number, streams: number }, userTier: string): { physicalGrowth: number, digitalGrowth: number, streamGrowth: number, fameGrowth: number } {
  // Base FAME growth by subscription tier (Grok's progression system)
  const baseFameGrowth = {
    'Fan': 1.0,
    'Artist': 1.5, 
    'Record Label': 2.0,
    'Mogul': 2.5 // Matches Grok's Mogul tier spec
  }[userTier] || 1.0;

  // Calculate milestone boost
  const totalCurrentSales = currentSales.physical + currentSales.digital + currentSales.streams;
  const milestoneBoost = getMilestoneFameBoost(totalCurrentSales);

  // Apply milestone boost to FAME growth
  const adjustedFameGrowth = baseFameGrowth * milestoneBoost;

  // Grok's growth rates: Streams 20x, Digital 1x, Physical 0.1x per FAME point
  const baseStreamGrowth = currentFame * 20;
  const baseDigitalGrowth = currentFame * 1;  
  const basePhysicalGrowth = currentFame * 0.1;

  // Add 20% randomness factor (Grok's "life's unpredictability")
  const randomFactor = 0.8 + (Math.random() * 0.4); // ±20% variance

  return {
    physicalGrowth: Math.floor(basePhysicalGrowth * randomFactor),
    digitalGrowth: Math.floor(baseDigitalGrowth * randomFactor),
    streamGrowth: Math.floor(baseStreamGrowth * randomFactor),
    fameGrowth: adjustedFameGrowth
  };
}

// Simple free band generation checker
async function checkBandGenerationAllowed(userId: string): Promise<{ 
  allowed: boolean; 
  freeBandsRemaining: number;
  tier: string; 
  requiresCredits: boolean; 
  creditCost: number;
  canAfford: boolean;
  userCredits: number;
}> {
  const user = await storage.getUser(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const tier = user.subscriptionTier || 'Fan';
  const freeBandsRemaining = user.freeBandGenerations || 0;
  const userCredits = user.credits || 0;
  
  // Check if user has unlimited bands (Mogul tier)
  const hasUnlimited = tier === 'Mogul';
  
  // Check if user has free bands remaining
  const hasFreeBands = hasUnlimited || freeBandsRemaining > 0;
  
  // If no free bands, requires credits
  const requiresCredits = !hasFreeBands;
  const canAfford = userCredits >= ADDITIONAL_BAND_COST;
  
  // Debug logging for troubleshooting
  console.log(`🔍 Band Generation Check for User ${userId}:`, {
    tier,
    freeBandsRemaining,
    hasUnlimited,
    hasFreeBands,
    requiresCredits,
    creditCost: ADDITIONAL_BAND_COST,
    canAfford,
    userCredits,
    allowed: hasFreeBands || canAfford
  });
  
  return {
    allowed: hasFreeBands || canAfford, // Allowed if has free bands OR can afford credits
    freeBandsRemaining,
    tier,
    requiresCredits,
    creditCost: ADDITIONAL_BAND_COST,
    canAfford,
    userCredits
  };
}

// Enhanced fallback artist generation with diversity
function createDiverseFallbackArtist(audioMetrics: any, genre: string, composition: string, memberCount: number, userPreferences?: { userBandName?: string; songName?: string; userGenre?: string; artistType?: string }) {
  const fallbackSeed = Math.floor(Math.random() * 1000);
  const currentYear = new Date().getFullYear();
  
  // Evocative band names with creative depth
  const bandNameTemplates = {
    'Electronic': ['Quantum Echoes', 'Neon Parallax', 'Digital Séance', 'Chrome Butterfly', 'Static Prophecy', 'Voltage Cathedral', 'Binary Ghost', 'Circuit Reverie'],
    'Rock': ['Velvet Ruins', 'Thunder Manuscript', 'Crimson Observatory', 'Iron Mythology', 'Fractured Mirror', 'Stone Aria', 'Ember Dynasty', 'Shadow Ballet'],
    'Pop': ['Midnight Architecture', 'Golden Paradigm', 'Silver Horizon', 'Crystal Narrative', 'Velvet Frequency', 'Prism Society', 'Neon Solitude', 'Ethereal Engine'],
    'Hip-Hop': ['Urban Prophecy', 'Metro Renaissance', 'Street Philosophy', 'Block Symphony', 'Concrete Poetry', 'Hood Mythology', 'City Manuscript', 'Underground Canvas'],
    'Folk': ['Hollow Oak Society', 'Prairie Cathedral', 'River Manuscript', 'Mountain Folklore', 'Cedar Mythology', 'Morning Star Collective', 'Wild Honey Theory', 'Autumn Prophecy'],
    'Alternative': ['Static Cathedral', 'Paper Moon Theory', 'Glass House Syndrome', 'Broken Radio Collective', 'Lost Signal Society', 'Drift Theory', 'Empty Room Orchestra', 'Faded Memory Project']
  };
  
  // Rich character archetypes with detailed backstories
  const memberArchetypes = {
    visionaries: [
      ['Aria Blackwood', 'Lead Vocals/Conceptual Direction', 'Former philosophy PhD student who abandoned academia to explore consciousness through sound. Known for cryptic lyrics that reference quantum physics and ancient mythology. Suffers from synesthesia, seeing music as cascading colors.'],
      ['Kai Nakamura', 'Multi-Instrumentalist/Producer', 'Tokyo-born sound architect who spent years studying traditional Japanese music before fusing it with modern electronics. Lives in a converted warehouse studio filled with both vintage synthesizers and ancient instruments.'],
      ['River Martinez-Chen', 'Vocals/Lyrics', 'Child of immigrant parents who channels generational trauma and hope into haunting melodies. Studied literature at Berkeley before dropping out to chase the sound they heard in dreams.']
    ],
    technicians: [
      ['Luna Rodriguez', 'Bass/Sound Design', 'Former audio engineer for major labels who got tired of polishing other people\'s visions. Now obsessed with creating "impossible" sounds using analog gear pushed beyond its limits. Insomniac perfectionist.'],
      ['Phoenix Thompson', 'Drums/Percussion/Electronics', 'Studied jazz at Berklee but fell in love with the imperfection of broken beats. Collects vintage drum machines and builds their own hybrid electronic kits. The rhythmic heartbeat of every composition.'],
      ['Storm Kim', 'Guitar/Effects Processing', 'Self-taught guitarist who learned by playing along to shoegaze records in their parents\' garage. Masters the art of making guitars sound like everything except guitars. Shy performer, explosive creator.']
    ],
    rebels: [
      ['Sage Williams', 'Vocals/Attitude', 'Former street busker who brings raw authenticity to every performance. Grew up in seven different cities, absorbing musical influences like a sponge. Refuses to be contained by any single genre or expectation.'],
      ['Echo Park', 'Synthesizers/Chaos Theory', 'Dropout from MIT who chose music over robotics engineering. Approaches composition like coding, creating algorithmic beauty from controlled chaos. Believes music is the closest thing to time travel.'],
      ['Ocean Blue', 'Multiple Instruments/Vision', 'Born into a family of classical musicians but rejected traditional paths. Self-imposed exile led to years of experimentation in isolated mountain studios. Returns to civilization with sounds no one has heard before.']
    ]
  };
  
  // Deep cultural influences by genre
  const culturalInfluences = {
    'Electronic': ['Kraftwerk', 'Brian Eno', 'Aphex Twin', 'Burial', 'Boards of Canada', 'William Gibson\'s Neuromancer', 'Blade Runner aesthetic', 'Berlin techno underground'],
    'Rock': ['Radiohead', 'My Bloody Valentine', 'Sonic Youth', 'Pixies', 'Queens of the Stone Age', 'David Lynch films', 'Beat Generation literature', 'Industrial revolution imagery'],
    'Pop': ['Björk', 'FKA twigs', 'The 1975', 'Lorde', 'Grimes', 'Pop Art movement', 'Social media culture', 'Digital native experience'],
    'Hip-Hop': ['Kendrick Lamar', 'Death Grips', 'Tyler the Creator', 'Madlib', 'J Dilla', 'Street photography', 'Urban sociology', 'Post-internet culture'],
    'Folk': ['Bon Iver', 'Sufjan Stevens', 'Fleet Foxes', 'Nick Drake', 'Joni Mitchell', 'American transcendentalism', 'Environmental activism', 'Rural isolation'],
    'Alternative': ['Vampire Weekend', 'Arctic Monkeys', 'Modest Mouse', 'Built to Spill', 'Pavement', 'Independent film culture', 'Zine publishing', 'College radio ethos']
  };
  
  const genreKey = Object.keys(bandNameTemplates).find(g => genre.includes(g)) || 'Alternative';
  const availableNames = bandNameTemplates[genreKey as keyof typeof bandNameTemplates];
  // Use user-specified name or generate one
  const selectedBandName = userPreferences?.userBandName?.trim() || availableNames[fallbackSeed % availableNames.length];
  
  // Create diverse members from rich character archetypes
  const allMembers = [...memberArchetypes.visionaries, ...memberArchetypes.technicians, ...memberArchetypes.rebels];
  const selectedMembers = allMembers
    .sort(() => 0.5 - Math.random())
    .slice(0, memberCount)
    .map((member) => ({ 
      name: member[0], 
      role: member[1], 
      archetype: member[2] 
    }));
  
  const selectedInfluences = culturalInfluences[genreKey as keyof typeof culturalInfluences] || culturalInfluences.Alternative;
  
  // Genre-specific philosophies
  const philosophies = {
    'Electronic': ['Digital Dreams', 'Future Sound', 'Electric Pulse', 'Sonic Exploration'],
    'Rock': ['Raw Energy', 'Authentic Power', 'Rock Revolution', 'Electric Truth'],
    'Pop': ['Universal Connection', 'Melodic Stories', 'Pop Perfection', 'Catchy Dreams'],
    'Hip-Hop': ['Street Wisdom', 'Urban Poetry', 'Real Talk', 'City Stories'],
    'Folk': ['Honest Songs', 'Acoustic Truth', 'Traditional Roots', 'Simple Stories'],
    'Alternative': ['Creative Freedom', 'Artistic Expression', 'Independent Sound', 'Alternative Vision']
  };
  
  const genrePhilosophies = philosophies[genreKey as keyof typeof philosophies] || philosophies.Alternative;
  const selectedPhilosophy = genrePhilosophies[fallbackSeed % genrePhilosophies.length];
  
  // Generate genre-specific Suno prompt
  const sunoPrompts = {
    'Electronic': `Create an electronic track at ${Math.round(audioMetrics.tempo || 120)} BPM featuring analog synthesizers, ethereal pads, and crisp digital percussion. Include atmospheric textures, filtered basslines, and subtle vocal processing. The mood should be ${audioMetrics.tempo > 130 ? 'energetic and driving' : 'ambient and contemplative'} with rich reverb and spatial effects. Lyrical themes should explore digital identity and human connection in a technological world.`,
    'Rock': `Generate a ${audioMetrics.tempo > 140 ? 'high-energy' : 'mid-tempo'} rock song at ${Math.round(audioMetrics.tempo || 120)} BPM with distorted electric guitars, driving bass, and powerful drums. Include guitar solos, raw vocals, and dynamic song structure. Production should be ${audioMetrics.tempo > 130 ? 'aggressive and punchy' : 'atmospheric with space for dynamics'}. Lyrics should focus on rebellion, personal freedom, and authentic expression.`,
    'Pop': `Create a polished pop track at ${Math.round(audioMetrics.tempo || 120)} BPM with catchy hooks, layered vocals, and modern production. Include synthesizers, drum programming, and melodic bass. The arrangement should be radio-friendly with clear verse-chorus structure. Lyrical content should explore love, relationships, and self-discovery with relatable, emotional storytelling.`,
    'Hip-Hop': `Generate a hip-hop beat at ${Math.round(audioMetrics.tempo || 120)} BPM featuring hard-hitting drums, deep bass, and creative sampling. Include trap-influenced hi-hats, melodic elements, and space for rap vocals. Production should be modern with crisp mixing and dynamic range. Lyrical themes should address urban life, social commentary, and personal authenticity.`,
    'Folk': `Create an acoustic folk song at ${Math.round(audioMetrics.tempo || 120)} BPM with fingerpicked guitar, warm vocals, and organic instrumentation. Include subtle harmonies, natural reverb, and intimate production. The arrangement should be simple yet emotionally powerful. Lyrics should explore nature, tradition, personal storytelling, and human connection.`,
    'Alternative': `Generate an alternative track at ${Math.round(audioMetrics.tempo || 120)} BPM blending indie sensibilities with experimental elements. Include jangly guitars, creative rhythm section, and distinctive vocals. Production should balance clarity with artistic texture. Lyrical themes should address modern alienation, artistic expression, and emotional complexity.`
  };

  const selectedSunoPrompt = sunoPrompts[genreKey as keyof typeof sunoPrompts] || sunoPrompts.Alternative;

  // Override member count based on artist type
  if (userPreferences?.artistType === 'solo') {
    memberCount = 1;
    selectedMembers.splice(1); // Keep only first member for solo
  }
  
  return {
    bandName: selectedBandName,
    genre: userPreferences?.userGenre || genre,
    philosophy: selectedPhilosophy,
    bandConcept: `${selectedBandName} emerged from the underground ${genreKey.toLowerCase()} scene in ${currentYear - 3} when fate brought together ${memberCount === 1 ? 'a visionary artist' : `${memberCount} unlikely collaborators`}. Born from late-night studio sessions and a shared rejection of mainstream formulas, they've carved out a distinctive space in the ${genre.toLowerCase()} landscape. Their breakthrough came during an improvised jam session that lasted 14 hours straight, resulting in their signature sound - a fusion of ${audioMetrics.tempo > 130 ? 'high-energy rhythms' : 'hypnotic grooves'} and introspective songwriting. What started as creative experimentation has evolved into something that defies easy categorization, earning them a devoted following among those who crave authenticity in an increasingly artificial world.`,
    members: selectedMembers,
    influences: selectedInfluences,
    signatureSound: `A distinctive ${genre.toLowerCase()} sound characterized by ${Math.round(audioMetrics.tempo || 120)} BPM tempo, rich harmonic textures, and innovative production techniques.`,
    lyricalThemes: `Explores themes of ${genreKey === 'Electronic' ? 'digital identity and human connection' : genreKey === 'Rock' ? 'rebellion and personal freedom' : genreKey === 'Pop' ? 'love, relationships, and self-discovery' : genreKey === 'Hip-Hop' ? 'urban life and social commentary' : genreKey === 'Folk' ? 'nature, tradition, and personal storytelling' : 'modern alienation and artistic expression'}.`,
    liveVisuals: `${genreKey === 'Electronic' ? 'Immersive light shows with synchronized visuals' : genreKey === 'Rock' ? 'High-energy performances with dramatic lighting' : genreKey === 'Pop' ? 'Polished stage production with choreography' : genreKey === 'Hip-Hop' ? 'Dynamic street-style performances' : genreKey === 'Folk' ? 'Intimate acoustic settings with warm lighting' : 'Artistic, minimalist stage design'}`,
    colorPalette: {
      background: genreKey === 'Electronic' ? "#0f0f23" : genreKey === 'Rock' ? "#1a0000" : genreKey === 'Pop' ? "#2a1810" : genreKey === 'Hip-Hop' ? "#1a1a00" : genreKey === 'Folk' ? "#0f1a0f" : "#1a1a1a",
      textPrimary: "#f0f0f0",
      highlight: genreKey === 'Electronic' ? "#00ffff" : genreKey === 'Rock' ? "#ff4444" : genreKey === 'Pop' ? "#ff69b4" : genreKey === 'Hip-Hop' ? "#ffd700" : genreKey === 'Folk' ? "#90ee90" : "#888888"
    },
    sunoPrompt: selectedSunoPrompt
  };
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  // Temporarily disable fileFilter to debug
  // fileFilter: (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  //   console.log('File upload attempt - MIME type:', file.mimetype, 'Original name:', file.originalname);
  //   cb(null, true);
  // }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Serve audio files for streaming (BEFORE authentication middleware)
  app.get('/api/audio/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', 'audio', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Audio file not found' });
    }
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(filePath);
  });
  
  // Setup Replit Auth
  await setupAuth(app);

  // Setup enhanced band generation routes
  setupEnhancedBandRoutes(app);
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Compatibility route for existing frontend
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      
      res.json({ 
        user: { 
          id: user.id, 
          username: user.firstName || user.email || 'User',
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          subscriptionTier: user.subscriptionTier,
          level: user.level,
          experience: user.experience,
          canCustomizeArtistStyle: user.canCustomizeArtistStyle,
          canSetArtistPhilosophy: user.canSetArtistPhilosophy,
          canUploadProfileImages: user.canUploadProfileImages,
          canHardcodeParameters: user.canHardcodeParameters
        } 
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get user stats with calculated daily streams
  app.get("/api/user/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Calculate real-time daily streams from all owned cards
      const calculatedDailyStreams = await storage.calculateUserDailyStreams(userId);

      // If user is unranked but has activity, trigger global ranking update
      if ((user.chartPosition || 0) === 0 && ((user.fame || 0) > 1 || (user.totalStreams || 0) > 0)) {
        console.log(`🔄 User ${user.firstName || user.id} is unranked but has activity, updating global rankings...`);
        await RankingSystem.updateGlobalRankings();
      }

      // Get fresh user data after any potential ranking updates
      const freshUser = await storage.getUser(userId);

      const userStats = {
        fame: freshUser?.fame || user.fame || 1,
        dailyStreams: calculatedDailyStreams,
        totalStreams: freshUser?.totalStreams || user.totalStreams || 0,
        chartPosition: freshUser?.chartPosition || user.chartPosition || 0,
        fanbase: freshUser?.fanbase || user.fanbase || 0,
        // Additional Journey Panel metrics
        totalCards: freshUser?.totalCards || user.totalCards || 0,
        influence: freshUser?.influence || user.influence || 0,
        experience: freshUser?.experience || user.experience || 0
      };

      res.json(userStats);
    } catch (error) {
      console.error("Error getting user stats:", error);
      res.status(500).json({ message: "Failed to get user stats" });
    }
  });

  // Manual ranking update endpoint for testing
  app.post("/api/rankings/update", isAuthenticated, async (req: any, res) => {
    try {
      console.log("🔄 Manual ranking update triggered");
      await RankingSystem.updateGlobalRankings();
      res.json({ success: true, message: "Rankings updated successfully" });
    } catch (error) {
      console.error("Error updating rankings:", error);
      res.status(500).json({ message: "Failed to update rankings" });
    }
  });
  
  // Audio analysis and artist generation endpoint  
  app.post('/api/analyze-audio', upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'customPhoto', maxCount: 1 }
  ]), async (req: any, res) => {
    try {
      const audioFile = req.files?.['audio']?.[0];
      const customPhotoFile = req.files?.['customPhoto']?.[0];
      
      if (!audioFile) {
        return res.status(400).json({ message: 'No audio file provided' });
      }

      const startTime = Date.now();
      const artStyle = req.body.artStyle || 'realistic';
      const cardTheme = req.body.cardTheme || 'dark';
      
      // Extract user preferences
      const userBandName = req.body.userBandName?.trim() || '';
      const songName = req.body.songName?.trim() || '';
      const userGenre = req.body.userGenre?.trim() || '';
      const artistType = req.body.artistType || 'ensemble';
      const hasCustomPhoto = !!customPhotoFile;
      
      // Analyze audio file
      const audioMetrics = ServerAudioAnalyzer.analyzeBuffer(
        audioFile.buffer.buffer as ArrayBuffer, 
        audioFile.originalname
      );

      // Try AI generation first, fall back to demo data if needed
      let genre = "Electronic Rock";
      let artistData;
      let imageUrl = '';

      try {
        // Try Gemini API first (but respect user genre preference)
        try {
          console.log('🎵 Attempting Gemini genre analysis for:', audioFile.originalname);
          console.log('User preferences:', { userBandName, songName, userGenre, artistType, hasCustomPhoto });
          console.log('Audio metrics:', { 
            duration: audioMetrics.duration, 
            tempo: audioMetrics.tempo, 
            key: audioMetrics.key,
            energy: audioMetrics.energy,
            loudness: audioMetrics.loudness 
          });
          
          // Use user-specified genre or analyze from audio
          if (userGenre) {
            genre = userGenre;
            console.log('✅ Using user-specified genre:', genre);
          } else {
            genre = await analyzeGenreWithGemini({
              fileName: audioFile.originalname,
              duration: audioMetrics.duration || 0,
              tempo: audioMetrics.tempo || 120,
              key: audioMetrics.key || 'Unknown',
              energy: audioMetrics.energy || 'Medium',
              loudness: audioMetrics.loudness || 0.5,
            });
            console.log('✅ AI-analyzed genre:', genre);
          }
          
          console.log('✅ Gemini genre analysis successful:', genre);

          artistData = await generateArtistWithGemini({
            fileName: audioFile.originalname,
            duration: audioMetrics.duration || 0,
            tempo: audioMetrics.tempo || 120,
            key: audioMetrics.key || 'Unknown',
            energy: audioMetrics.energy || 'Medium',
            loudness: audioMetrics.loudness || 0.5,
            fundamentalFreq: audioMetrics.fundamentalFreq,
            spectralCentroid: audioMetrics.spectralCentroid,
            vocalRange: audioMetrics.vocalRange,
            instrumentComplexity: audioMetrics.instrumentComplexity,
            genre,
          }, artStyle, cardTheme, {
            userBandName,
            songName,
            userGenre,
            artistType
          });

          console.log('✅ Successfully generated artist with Gemini AI:', artistData.bandName, `(${artistData.members.length} members)`);

        } catch (geminiError) {
          console.log('❌ Gemini failed, trying OpenAI fallback:', geminiError instanceof Error ? geminiError.message : String(geminiError));
          
          // Fallback to OpenAI
          try {
            // Use user-specified genre or analyze from audio
            if (userGenre) {
              genre = userGenre;
            } else {
              genre = await analyzeGenreFromAudio({
                fileName: audioFile.originalname,
                duration: audioMetrics.duration,
                tempo: audioMetrics.tempo,
                energy: audioMetrics.energy,
                loudness: audioMetrics.loudness,
              });
            }

            artistData = await generateArtistIdentity({
              fileName: audioFile.originalname,
              duration: audioMetrics.duration,
              tempo: audioMetrics.tempo,
              key: audioMetrics.key,
              energy: audioMetrics.energy,
              loudness: audioMetrics.loudness,
              genre,
            }, artStyle, cardTheme, {
              userBandName,
              songName,
              userGenre,
              artistType
            });
            
          } catch (openaiError) {
            console.log('Both AI services failed, creating fallback based on audio characteristics');
            
            // Create a more dynamic fallback based on actual audio metrics
            const tempo = audioMetrics.tempo || 120;
            const fallbackGenre = tempo > 140 ? "High Energy Rock" : 
                                 tempo > 120 ? "Alternative Rock" : 
                                 tempo > 80 ? "Indie Rock" : "Ambient Rock";
            
            // Create realistic fallback based on instrument complexity
            const composition = audioMetrics.instrumentComplexity || 'solo';
            const memberCount = composition === 'solo' ? 1 : 
                              composition === 'duo' ? 2 : 
                              composition === 'trio' ? 3 : 4;
            
            // Removed - using createDiverseFallbackArtist instead

            // Create fallback artist with user preferences
            artistData = createDiverseFallbackArtist(audioMetrics, fallbackGenre, composition, memberCount, {
              userBandName,
              songName,
              userGenre,
              artistType
            });
          }
        }

        // Use custom photo if provided, otherwise generate professional band portrait
        if (customPhotoFile) {
          console.log('Using custom uploaded photo for:', artistData.bandName);
          // Store custom photo (in real implementation, you'd upload to object storage)
          // For now, we'll use a placeholder that indicates custom photo was uploaded
          imageUrl = 'data:image/' + customPhotoFile.mimetype.split('/')[1] + ';base64,' + customPhotoFile.buffer.toString('base64');
          console.log('Successfully using custom uploaded photo');
        } else {
          try {
            console.log('Generating professional band photo shoot for:', artistData.bandName);
            imageUrl = await generateBandPortrait(artistData, artStyle, cardTheme);
            console.log('Successfully generated professional band portrait');
          } catch (imageError) {
            console.log('Google Imagen failed, generating fallback SVG portrait:', imageError instanceof Error ? imageError.message : String(imageError));
            // Generate fallback SVG portrait if image generation fails
            const { generateArtistImageWithCustomSearch } = await import('./services/google-imagen');
            imageUrl = await generateArtistImageWithCustomSearch(artistData, artStyle, cardTheme);
            console.log('Successfully generated fallback SVG portrait');
          }
        }

      } catch (error) {
        console.log('Falling back to demo mode due to API errors:', error instanceof Error ? error.message : String(error));
      }

      // Generate full trading card image after getting the artist portrait
      let cardImageUrl = '';
      if (imageUrl && artistData) {
        try {
          console.log('Generating complete trading card design for:', artistData.bandName);
          const userFame = req.user?.claims?.sub ? await storage.getUser(req.user.claims.sub).then(u => u?.fame || 1) : 1;
          cardImageUrl = generateTradingCardImage(artistData, imageUrl, artStyle, cardTheme, userFame);
          console.log('Successfully generated trading card design');
        } catch (cardError) {
          console.log('Failed to generate trading card design:', cardError instanceof Error ? cardError.message : String(cardError));
        }
      }

      const audioAnalysis = {
        ...audioMetrics,
        genre: artistData?.genre || genre,
        quality: ServerAudioAnalyzer.getQualityRating(audioFile.size, audioMetrics.duration),
        uniqueness: ServerAudioAnalyzer.calculateUniquenessScore(),
      };

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      const confidence = Math.round(85 + Math.random() * 10) + '%'; // 85-95%

      // Get current user if logged in (Replit Auth)
      let userId = null;
      const user = req.user as any;
      if (user?.claims?.sub) {
        userId = user.claims.sub;
        
        // Check subscription limits
        // Check band generation allowance (free bands or credits)
        try {
          const allowanceCheck = await checkBandGenerationAllowed(userId);
          if (!allowanceCheck.allowed) {
            if (allowanceCheck.requiresCredits) {
              // User needs to pay credits for band
              const message = allowanceCheck.freeBandsRemaining === 0 
                ? `You've used all your free bands for ${allowanceCheck.tier} tier. Additional bands cost ${allowanceCheck.creditCost} credits each.`
                : `No free bands remaining. Additional bands cost ${allowanceCheck.creditCost} credits each.`;
              
              return res.status(402).json({
                error: 'CREDITS_REQUIRED',
                message,
                freeBandsRemaining: allowanceCheck.freeBandsRemaining,
                tier: allowanceCheck.tier,
                requiresCredits: true,
                creditCost: allowanceCheck.creditCost,
                userCredits: allowanceCheck.userCredits,
                canAfford: allowanceCheck.canAfford,
                upgradeUrl: '/upgrade'
              });
            }
          }
          
          // If user has free bands, decrement the count
          if (allowanceCheck.freeBandsRemaining > 0 && allowanceCheck.tier !== 'Mogul') {
            await storage.decrementFreeBandGenerations(userId);
            console.log(`🎸 Used 1 free band generation for user ${userId} (${allowanceCheck.freeBandsRemaining - 1} remaining)`);
          }
          
          // If user requires credits but can afford, deduct credits
          if (allowanceCheck.requiresCredits && allowanceCheck.canAfford) {
            await storage.spendUserCredits(userId, allowanceCheck.creditCost);
            console.log(`💳 Charged ${allowanceCheck.creditCost} credits to user ${userId} for additional band generation`);
          }
          
        } catch (allowanceError) {
          console.error('Error checking band generation allowance:', allowanceError);
          // Continue without allowance check if there's an error
        }
      }
      
      // Save to storage
      // Generate realistic starting metrics for new artists
      const realisticStartingMetrics = generateRealisticStartingMetrics(
        audioAnalysis.genre,
        parseFloat(confidence.replace('%', '')),
        audioMetrics
      );

      const cardData = insertArtistCardSchema.parse({
        userId: userId,
        fileName: audioFile.originalname,
        fileSize: audioFile.size,
        duration: audioMetrics.duration,
        genre: audioAnalysis.genre,
        tempo: audioMetrics.tempo,
        key: audioMetrics.key,
        energy: audioMetrics.energy,
        artistData,
        imageUrl,
        cardImageUrl: cardImageUrl || null, // Add the generated trading card image
        processingTime: parseFloat(processingTime),
        confidence: parseFloat(confidence.replace('%', '')),
        artStyle,
        cardTheme,
        // Add realistic starting metrics for new bands
        physicalCopies: realisticStartingMetrics.physicalCopies,
        digitalDownloads: realisticStartingMetrics.digitalDownloads,
        totalStreams: realisticStartingMetrics.totalStreams,
        // Initialize daily growth system (Grok's FAME-driven mechanics)
        currentFame: 5, // All bands start with base 5 FAME
        lastDailyUpdate: new Date(), // Initialize daily growth tracking
        dailyGrowthStreak: 0, // Start streak tracking
      });

      const savedCard = await storage.createArtistCard(cardData);

      // Update user progression (experience, level, total cards)
      if (userId) {
        try {
          await storage.updateUserProgression(userId, {
            experienceGained: 50, // Base XP for creating a card
            influenceGained: 10,  // Base influence for creating a card
            newCard: true         // Increment totalCards counter
          });
          console.log('✨ User progression updated for new card creation');
        } catch (progressionError) {
          console.error('❌ Failed to update user progression:', progressionError);
        }
      }

      // Save audio file to disk for streaming
      const audioFileName = `${savedCard.id}_${Date.now()}_${audioFile.originalname}`;
      const audioDir = path.join(__dirname, 'uploads', 'audio');
      const audioFilePath = path.join(audioDir, audioFileName);
      
      try {
        // Ensure directory exists
        if (!fs.existsSync(audioDir)) {
          fs.mkdirSync(audioDir, { recursive: true });
        }
        
        fs.writeFileSync(audioFilePath, audioFile.buffer);
        console.log('✅ Audio file saved for streaming:', audioFileName);
      } catch (error) {
        console.error('❌ Failed to save audio file:', error);
      }

      // Create a release for the uploaded song so it appears in band's discography
      if (userId && artistData) {
        try {
          console.log('🎵 Attempting to create release for uploaded song...');
          console.log('Song name from user input:', songName);
          console.log('Artist card ID:', savedCard.id);
          console.log('User ID:', userId);
          
          const releaseData = {
            artistCardId: savedCard.id,
            userId: userId,
            fileName: audioFile.originalname,
            fileSize: audioFile.size,
            duration: audioMetrics.duration || 0,
            tempo: audioMetrics.tempo || 120,
            key: audioMetrics.key || 'Unknown',
            energy: audioMetrics.energy || 'Medium',
            genre: audioAnalysis.genre,
            confidence: parseFloat(confidence.replace('%', '')),
            releaseTitle: songName || audioFile.originalname.replace(/\.[^/.]+$/, ''), // Use user's song name or filename
            releaseType: 'single' as const,
            musicQuality: audioAnalysis.quality === 'High' ? 0.8 : audioAnalysis.quality === 'Medium' ? 0.5 : 0.3,
            audioUrl: `/api/audio/${audioFileName}` // Store URL for streaming
          };
          
          console.log('Release data to create:', JSON.stringify(releaseData, null, 2));
          
          // Validate release data against schema before creating
          const validatedReleaseData = insertReleaseSchema.parse(releaseData);
          console.log('✅ Release data validated successfully');
          
          const newRelease = await storage.createRelease(validatedReleaseData);
          console.log('✅ Successfully created release for uploaded song:', releaseData.releaseTitle);
          console.log('Release ID:', newRelease.id);
        } catch (releaseError) {
          console.error('❌ Failed to create release for uploaded song:', releaseError);
          console.error('Full error details:', JSON.stringify(releaseError, null, 2));
          // Don't fail the whole request if release creation fails
        }
      }

      // Apply ranking system if user is logged in
      let rankingUpdate = null;
      if (userId) {
        // Calculate music quality based on audio analysis
        const musicQuality = Math.min(1.0, Math.max(0.0, 
          (parseFloat(confidence.replace('%', '')) / 100) * 
          (audioAnalysis.quality === 'High' ? 1.0 : audioAnalysis.quality === 'Medium' ? 0.7 : 0.4)
        ));
        
        // Generate ranking update
        const update = RankingSystem.calculateRankingUpdate(musicQuality, 100);
        const updatedUser = await RankingSystem.applyRankingUpdate(userId, update);
        
        // Update global rankings after user activity
        await RankingSystem.updateGlobalRankings();
        
        if (updatedUser) {
          const milestones = RankingSystem.checkMilestones(updatedUser);
          rankingUpdate = {
            update,
            newStats: {
              fame: updatedUser.fame,
              dailyStreams: await storage.calculateUserDailyStreams(userId),
              totalStreams: updatedUser.totalStreams,
              chartPosition: updatedUser.chartPosition,
              fanbase: updatedUser.fanbase
            },
            milestones
          };
        }
      }

      res.json({
        success: true,
        analysis: {
          ...audioAnalysis,
          processingTime,
          confidence,
        },
        artistData,
        imageUrl,
        cardId: savedCard.id,
        rankingUpdate
      });

    } catch (error) {
      console.error('Audio analysis error:', error);
      
      // Provide more user-friendly error messages
      let userMessage = 'Failed to analyze audio file';
      if (error instanceof Error) {
        if (error.message.includes('quota') || error.message.includes('insufficient_quota')) {
          userMessage = 'AI service is temporarily unavailable. Please try again in a few moments.';
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          userMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('file') || error.message.includes('audio')) {
          userMessage = 'Invalid audio file. Please upload a valid MP3 file.';
        }
      }
      
      res.status(500).json({ 
        message: userMessage,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get saved cards (public)
  app.get('/api/cards', async (req, res) => {
    try {
      const cards = await storage.getAllArtistCards();
      res.json(cards);
    } catch (error) {
      console.error('Error fetching cards:', error);
      res.status(500).json({ message: 'Failed to fetch cards' });
    }
  });

  // Get user's saved cards (protected)
  app.get('/api/my-cards', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cards = await storage.getUserArtistCards(userId);
      res.json(cards);
    } catch (error) {
      console.error('Error fetching user cards:', error);
      res.status(500).json({ message: 'Failed to fetch user cards' });
    }
  });

  // Get specific card
  app.get('/api/cards/:id', async (req, res) => {
    try {
      const card = await storage.getArtistCard(req.params.id);
      if (!card) {
        return res.status(404).json({ message: 'Card not found' });
      }
      res.json(card);
    } catch (error) {
      console.error('Error fetching card:', error);
      res.status(500).json({ message: 'Failed to fetch card' });
    }
  });

  // Delete artist card (protected)
  app.delete('/api/cards/:id', isAuthenticated, async (req: any, res) => {
    try {
      const cardId = req.params.id;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const deleted = await storage.deleteArtistCard(cardId, userId);
      
      if (!deleted) {
        return res.status(404).json({ message: 'Card not found or you do not have permission to delete it' });
      }

      res.json({ message: 'Band deleted successfully' });
    } catch (error) {
      console.error('Error deleting card:', error);
      res.status(500).json({ message: 'Failed to delete band' });
    }
  });

  // Get individual artist card by ID for artist pages
  app.get('/api/artist-cards/:cardId', async (req, res) => {
    try {
      const { cardId } = req.params;
      const cards = await storage.getAllArtistCards();
      const card = cards.find(c => c.id === cardId);
      
      if (!card) {
        return res.status(404).json({ message: "Artist card not found" });
      }
      
      res.json(card);
    } catch (error) {
      console.error("Error fetching artist card:", error);
      res.status(500).json({ message: "Failed to fetch artist card" });
    }
  });

  // Credit system routes
  
  // Renew user credits (monthly)
  app.post('/api/credits/renew', isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if user should get credit renewal (paid tiers only)
      const tier = user.subscriptionTier || 'Free';
      if (tier === 'Free') {
        return res.status(403).json({ error: "Credit renewal only available for paid subscribers" });
      }
      
      // Check if it's time for renewal (monthly)
      const now = new Date();
      const lastRenewal = user.lastCreditRenewal;
      const shouldRenew = !lastRenewal || 
        (now.getTime() - lastRenewal.getTime()) > (30 * 24 * 60 * 60 * 1000); // 30 days
      
      if (!shouldRenew) {
        return res.status(400).json({ 
          error: "Credits already renewed this month",
          nextRenewal: new Date(lastRenewal.getTime() + (30 * 24 * 60 * 60 * 1000))
        });
      }
      
      await storage.renewUserCredits(userId);
      const creditAllocation = getCreditAllocation(tier);
      
      res.json({ 
        message: "Credits renewed successfully",
        creditsAdded: creditAllocation,
        tier: tier
      });
    } catch (error) {
      console.error("Error renewing credits:", error);
      res.status(500).json({ error: "Failed to renew credits" });
    }
  });
  
  // Get user credit balance
  app.get('/api/credits', isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        credits: user.credits || 0,
        totalEarned: user.totalCreditsEarned || 0,
        totalSpent: user.totalCreditsSpent || 0,
        tier: user.subscriptionTier || 'Free',
        lastRenewal: user.lastCreditRenewal
      });
    } catch (error) {
      console.error("Error fetching credits:", error);
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  });

  // Band Media routes
  
  // Get upload URL for band media
  app.post('/api/bands/:cardId/media/upload-url', isAuthenticated, async (req, res) => {
    try {
      const { cardId } = req.params;
      const { mediaType } = req.body; // "photo" or "video"
      const userId = (req as any).user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!mediaType || !['photo', 'video'].includes(mediaType)) {
        return res.status(400).json({ error: "Invalid media type. Must be 'photo' or 'video'" });
      }
      
      // Check if user owns this band
      const artistCard = await storage.getArtistCard(cardId);
      if (!artistCard || artistCard.userId !== userId) {
        return res.status(403).json({ error: "You can only upload media for your own bands" });
      }
      
      // Get user subscription tier
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check tier limits
      const tier = user.subscriptionTier || 'Free';
      const limits = getMediaLimits(tier);
      const currentCount = await storage.getBandMediaCount(cardId, mediaType);
      
      const maxAllowed = mediaType === 'photo' ? limits.photos : limits.videos;
      if (currentCount >= maxAllowed) {
        return res.status(403).json({ 
          error: `Upload limit reached. ${tier} tier allows ${maxAllowed} ${mediaType}(s) per band.`,
          currentCount,
          maxAllowed,
          tier
        });
      }
      
      // Generate upload URL using object storage
      const ObjectStorageService = require('./objectStorage').ObjectStorageService;
      const objectStorage = new ObjectStorageService();
      const uploadURL = await objectStorage.getMediaUploadURL();
      
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });
  
  // Save media metadata after upload
  app.post('/api/bands/:cardId/media', isAuthenticated, async (req, res) => {
    try {
      const { cardId } = req.params;
      const { mediaType, fileName, fileSize, mediaUrl, duration, isProfileImage } = req.body;
      const userId = (req as any).user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Validate required fields
      if (!mediaType || !fileName || !fileSize || !mediaUrl) {
        return res.status(400).json({ error: "Missing required fields: mediaType, fileName, fileSize, mediaUrl" });
      }
      
      // Check if user owns this band
      const artistCard = await storage.getArtistCard(cardId);
      if (!artistCard || artistCard.userId !== userId) {
        return res.status(403).json({ error: "You can only add media for your own bands" });
      }
      
      // Validate video duration (must be 5 seconds or less)
      if (mediaType === 'video' && (!duration || duration > 5)) {
        return res.status(400).json({ error: "Videos must be 5 seconds or less" });
      }
      
      // Create media record
      const media = await storage.createBandMedia({
        artistCardId: cardId,
        userId,
        mediaType,
        fileName,
        fileSize,
        mediaUrl,
        duration: mediaType === 'video' ? duration : null,
        isProfileImage: isProfileImage || false
      });
      
      res.json(media);
    } catch (error) {
      console.error("Error saving media:", error);
      res.status(500).json({ error: "Failed to save media" });
    }
  });
  
  // Get band media
  app.get('/api/bands/:cardId/media', async (req, res) => {
    try {
      const { cardId } = req.params;
      const media = await storage.getBandMedia(cardId);
      res.json(media);
    } catch (error) {
      console.error("Error fetching band media:", error);
      res.status(500).json({ error: "Failed to fetch band media" });
    }
  });
  
  // Delete band media
  app.delete('/api/bands/:cardId/media/:mediaId', isAuthenticated, async (req, res) => {
    try {
      const { mediaId } = req.params;
      const userId = (req as any).user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const deleted = await storage.deleteBandMedia(mediaId, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Media not found or access denied" });
      }
      
      res.json({ message: "Media deleted successfully" });
    } catch (error) {
      console.error("Error deleting media:", error);
      res.status(500).json({ error: "Failed to delete media" });
    }
  });
  
  // Serve media files
  app.get('/api/media/*', async (req, res) => {
    try {
      const objectPath = req.path.replace('/api/media', '');
      const ObjectStorageService = require('./objectStorage').ObjectStorageService;
      const objectStorage = new ObjectStorageService();
      
      const objectFile = await objectStorage.getObjectFile(objectPath);
      await objectStorage.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving media:", error);
      res.status(404).json({ error: "Media not found" });
    }
  });

  // Update artist card (Record Executive only)
  app.put('/api/artist-cards/:cardId', isAuthenticated, async (req, res) => {
    try {
      const { cardId } = req.params;
      const userId = (req as any).user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Check if user is Record Executive (Pro tier)
      const user = await storage.getUser(userId);
      if (!user || user.subscriptionTier !== "Pro") {
        return res.status(403).json({ 
          error: "INSUFFICIENT_PRIVILEGES",
          message: "Band editing is only available to Record Executive level members. Upgrade to Pro to unlock full editing capabilities."
        });
      }
      
      // Get the existing artist card
      const cards = await storage.getAllArtistCards();
      const existingCard = cards.find(c => c.id === cardId);
      if (!existingCard) {
        return res.status(404).json({ error: "Artist card not found" });
      }
      
      // Check if user owns this card
      if (existingCard.userId !== userId) {
        return res.status(403).json({ error: "You can only edit your own artist cards" });
      }
      
      // Reconstruct the artistData object
      const updatedArtistData = {
        bandName: req.body.bandName,
        genre: req.body.genre,
        artistType: req.body.artistType,
        members: req.body.members,
        philosophy: req.body.philosophy,
        bandConcept: req.body.bandConcept,
        signatureSound: req.body.signatureSound,
        lyricalThemes: req.body.lyricalThemes,
        liveVisuals: req.body.liveVisuals,
        influences: req.body.influences,
        sunoPrompt: req.body.sunoPrompt,
        // Preserve existing fields
        colorPalette: (existingCard.artistData as any).colorPalette
      };
      
      // Update the artist card data while preserving metadata
      const updateData = {
        artistData: updatedArtistData,
        updatedAt: new Date()
      };
      
      const updatedCard = await storage.updateArtistCard(cardId, updateData);
      
      console.log(`🎭 Artist card ${cardId} updated by Record Executive ${userId}`);
      res.json(updatedCard);
    } catch (error) {
      console.error("Error updating artist card:", error);
      res.status(500).json({ error: "Failed to update artist card" });
    }
  });

  // Band Career Progression Routes

  // Release new music under an existing artist
  app.post('/api/artists/:artistId/release', isAuthenticated, upload.single('audio'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No audio file provided' });
      }

      const userId = (req.user as any).claims.sub;
      const artistCardId = req.params.artistId;
      const { releaseTitle, releaseType = 'single' } = req.body;

      // Analyze the uploaded audio
      const audioMetrics = ServerAudioAnalyzer.analyzeBuffer(
        req.file.buffer.buffer as ArrayBuffer, 
        req.file.originalname
      );

      // Determine music quality based on audio analysis (convert to numeric 0-1 scale)
      const qualityRating = ServerAudioAnalyzer.getQualityRating(req.file.size, audioMetrics.duration);
      const musicQuality = qualityRating === 'High' ? 0.8 : qualityRating === 'Medium' ? 0.5 : 0.3;

      // Analyze genre with Gemini AI for consistency checking
      let detectedGenre = "Unknown";
      try {
        detectedGenre = await analyzeGenreWithGemini({
          fileName: req.file.originalname,
          duration: audioMetrics.duration || 0,
          tempo: audioMetrics.tempo || 120,
          key: audioMetrics.key || 'Unknown',
          energy: audioMetrics.energy || 'Medium',
          loudness: audioMetrics.loudness || 0.5,
        });
      } catch (error) {
        console.log('Genre analysis failed, using fallback detection');
        const tempo = audioMetrics.tempo || 120;
        detectedGenre = tempo > 140 ? "High Energy" : 
                      tempo > 120 ? "Alternative" : 
                      tempo > 80 ? "Indie" : "Ambient";
      }

      // Release the music through career progression service
      const result = await CareerProgressionService.releaseNewMusic({
        artistCardId,
        userId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        duration: audioMetrics.duration,
        tempo: audioMetrics.tempo,
        key: audioMetrics.key,
        energy: audioMetrics.energy,
        genre: detectedGenre,
        confidence: 0.85, // Default confidence value
        releaseTitle: releaseTitle || `New Release ${Date.now()}`,
        releaseType: releaseType as "single" | "ep" | "album",
        musicQuality,
      });

      res.json({
        success: true,
        release: result.release,
        rankingUpdate: result.rankingUpdate,
        artistEvolution: result.artistEvolution,
        careerSummary: result.careerSummary,
        message: `Successfully released "${result.release.releaseTitle}" under your artist!`
      });

    } catch (error) {
      console.error('Error releasing new music:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Failed to release music',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get artist career overview including all releases and evolution
  app.get('/api/artists/:artistId/career', async (req, res) => {
    try {
      const artistCardId = req.params.artistId;
      const careerOverview = await CareerProgressionService.getArtistCareerOverview(artistCardId);
      
      res.json(careerOverview);
    } catch (error) {
      console.error('Error fetching artist career:', error);
      res.status(500).json({ message: 'Failed to fetch artist career' });
    }
  });

  // Get artist releases
  app.get('/api/artists/:artistId/releases', async (req, res) => {
    try {
      const artistCardId = req.params.artistId;
      const releases = await storage.getArtistReleases(artistCardId);
      res.json(releases);
    } catch (error) {
      console.error('Error fetching artist releases:', error);
      res.status(500).json({ message: 'Failed to fetch releases' });
    }
  });

  // Search for artists
  app.get('/api/search/artists', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }
      
      const results = await storage.searchArtists(query);
      res.json(results);
    } catch (error) {
      console.error('Error searching artists:', error);
      res.status(500).json({ message: 'Failed to search artists' });
    }
  });

  // User Profile Routes

  // Get user profile by ID (public)
  app.get('/api/users/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return public user information
      const publicUser = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        level: user.level,
        experience: user.experience,
        influence: user.influence,
        totalCards: user.totalCards,
        fame: user.fame,
        totalStreams: user.totalStreams,
        subscriptionTier: user.subscriptionTier,
        canCustomizeArtistStyle: user.canCustomizeArtistStyle,
        canSetArtistPhilosophy: user.canSetArtistPhilosophy,
        canUploadProfileImages: user.canUploadProfileImages,
        canHardcodeParameters: user.canHardcodeParameters,
      };
      
      res.json(publicUser);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // Get user's artist cards (public)
  app.get('/api/users/:userId/cards', async (req, res) => {
    try {
      const { userId } = req.params;
      const cards = await storage.getUserArtistCards(userId);
      res.json(cards);
    } catch (error) {
      console.error("Error fetching user cards:", error);
      res.status(500).json({ message: "Failed to fetch user cards" });
    }
  });

  // Get user's releases (public)
  app.get('/api/users/:userId/releases', async (req, res) => {
    try {
      const { userId } = req.params;
      const releases = await storage.getUserReleases(userId);
      res.json(releases);
    } catch (error) {
      console.error("Error fetching user releases:", error);
      res.status(500).json({ message: "Failed to fetch user releases" });
    }
  });

  // Profile Image Upload Routes
  
  // Get profile image upload URL
  app.post('/api/profile-image/upload-url', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user has permission to upload profile images
      if (!user.canUploadProfileImages) {
        return res.status(403).json({ 
          message: "Profile image upload requires Tier 2 subscription ($4.96/month)", 
          currentTier: user.subscriptionTier,
          requiredTier: "Tier2",
          upgradeUrl: "/subscription"
        });
      }
      
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getPublicUploadURL();
      
      res.json({ uploadURL });
    } catch (error) {
      console.error('Error getting profile image upload URL:', error);
      res.status(500).json({ message: 'Failed to get upload URL' });
    }
  });

  // Proxy route to serve profile images (handles auth with object storage)
  app.get('/api/profile-image/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user || !user.profileImageUrl) {
        return res.status(404).json({ message: "Profile image not found" });
      }

      // Get the image from object storage and stream it
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectPath(user.profileImageUrl);
      const objectFile = await objectStorageService.getObjectFile(objectPath);
      
      // Set appropriate headers with no caching for profile images
      res.setHeader('Content-Type', 'image/jpeg'); // Default to JPEG, could be more dynamic
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Stream the file
      const stream = objectFile.createReadStream();
      stream.pipe(res);
      
    } catch (error) {
      console.error('Error serving profile image:', error);
      res.status(500).json({ message: 'Failed to load profile image' });
    }
  });

  // Update user profile image after upload
  app.put('/api/profile-image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: "Image URL is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.canUploadProfileImages) {
        return res.status(403).json({ message: "Profile image upload requires Tier 2 subscription or higher" });
      }
      
      // Store the direct image URL
      
      // Update user's profile image URL  
      const updatedUser = {
        ...user,
        profileImageUrl: imageUrl,
        updatedAt: new Date(),
      };
      
      await storage.updateUser(userId, updatedUser);
      
      res.json({ 
        message: "Profile image updated successfully",
        profileImageUrl: imageUrl
      });
    } catch (error) {
      console.error('Error updating profile image:', error);
      res.status(500).json({ message: 'Failed to update profile image' });
    }
  });

  // Get user's all releases across all artists
  app.get('/api/my-releases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const releases = await storage.getUserReleases(userId);
      res.json(releases);
    } catch (error) {
      console.error('Error fetching user releases:', error);
      res.status(500).json({ message: 'Failed to fetch user releases' });
    }
  });

  // Get artist evolution history
  app.get('/api/artists/:artistId/evolution', async (req, res) => {
    try {
      const artistCardId = req.params.artistId;
      const evolutions = await storage.getArtistEvolution(artistCardId);
      res.json(evolutions);
    } catch (error) {
      console.error('Error fetching artist evolution:', error);
      res.status(500).json({ message: 'Failed to fetch artist evolution' });
    }
  });

  // Generate detailed profile PDF for artist cards
  app.post('/api/generate-profile-pdf', async (req, res) => {
    try {
      const { artistData } = req.body;
      
      if (!artistData) {
        return res.status(400).json({ message: 'Artist data is required' });
      }

      // For now, return a simple HTML response that can be printed to PDF
      // In a full implementation, you could use libraries like puppeteer or jsPDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${artistData.bandName} - Full Profile</title>
          <style>
            body { 
              font-family: 'Arial', sans-serif; 
              padding: 40px; 
              line-height: 1.6; 
              color: #333;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 { 
              color: #2563eb; 
              border-bottom: 3px solid #2563eb; 
              padding-bottom: 10px;
              font-size: 2.5em;
            }
            h2 { 
              color: #1e40af; 
              margin-top: 40px; 
              font-size: 1.5em;
              border-left: 4px solid #2563eb;
              padding-left: 15px;
            }
            .member { 
              background: #f8fafc; 
              padding: 20px; 
              margin: 15px 0; 
              border-radius: 8px; 
              border-left: 4px solid #60a5fa;
            }
            .stats { 
              display: grid; 
              grid-template-columns: repeat(2, 1fr); 
              gap: 20px; 
              background: #f1f5f9;
              padding: 20px;
              border-radius: 8px;
            }
            .stat-item {
              padding: 10px;
              background: white;
              border-radius: 4px;
              border: 1px solid #e2e8f0;
            }
            .philosophy {
              background: #fef7cd;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #f59e0b;
              font-style: italic;
            }
            @media print {
              body { padding: 20px; }
              h1 { font-size: 2em; }
            }
          </style>
        </head>
        <body>
          <h1>${artistData.bandName || "Unknown Artist"}</h1>
          
          <div class="stats">
            <div class="stat-item"><strong>Genre:</strong> ${artistData.genre || "Unknown"}</div>
            <div class="stat-item"><strong>Formation Year:</strong> 2024</div>
            <div class="stat-item"><strong>Card Rarity:</strong> Rare</div>
            <div class="stat-item"><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
          </div>
          
          ${artistData.philosophy ? `
            <h2>Philosophy</h2>
            <div class="philosophy">"${artistData.philosophy}"</div>
          ` : ""}
          
          <h2>Background Story</h2>
          <p>${artistData.bandConcept || "No background information available"}</p>
          
          ${artistData.members && artistData.members.length > 0 ? `
            <h2>Band Members (${artistData.members.length})</h2>
            ${artistData.members.map((member: any) => `
              <div class="member">
                <h3 style="margin-top: 0; color: #1e40af;">${member.name || "Unknown Member"}</h3>
                ${member.role ? `<p><strong>Role:</strong> ${member.role}</p>` : ""}
                ${member.archetype ? `<p><strong>Archetype:</strong> ${member.archetype}</p>` : ""}
              </div>
            `).join("")}
          ` : ""}
          
          <h2>Technical Details</h2>
          <div class="stats">
            <div class="stat-item"><strong>Source:</strong> AetherWave Studio</div>
            <div class="stat-item"><strong>AI Generated:</strong> Yes</div>
            <div class="stat-item"><strong>Card Series:</strong> 2024 Collection</div>
            <div class="stat-item"><strong>Unique ID:</strong> AW-${Date.now().toString().slice(-6)}</div>
          </div>
          
          ${artistData.sunoPrompt ? `
            <h2>🎵 Proposed Next Release - AI Music Prompt</h2>
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0ea5e9; font-family: monospace; line-height: 1.6; font-size: 0.95em; border: 2px dashed #0ea5e9;">
              <p style="margin: 0; white-space: pre-wrap; color: #0c4a6e; font-weight: 500;">${artistData.sunoPrompt}</p>
            </div>
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-top: 15px;">
              <p style="margin: 0; font-size: 0.9em; color: #92400e;">
                <strong>Instructions:</strong>
                <br>1. Go to <strong>Suno.ai</strong> or your preferred AI music generator
                <br>2. <strong>Copy the entire prompt above</strong> (click and drag to select all text)
                <br>3. <strong>Paste it into the prompt field</strong>
                <br>4. Generate your track and enjoy ${artistData.bandName}'s sound!
              </p>
            </div>
          ` : ""}
          
          <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b;">
            <p>Generated by AetherWave Studio © 2024</p>
            <p style="font-size: 0.9em;">This profile contains AI-generated content based on musical analysis</p>
          </footer>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${artistData.bandName || 'artist'}-profile.html"`);
      res.send(htmlContent);

    } catch (error) {
      console.error('Error generating profile PDF:', error);
      res.status(500).json({ message: 'Failed to generate profile PDF' });
    }
  });

  // === MARKETPLACE ROUTES ===

  // Get store products
  app.get("/api/store/products", isAuthenticated, async (req, res) => {
    try {
      const products = await storage.getStoreProducts();
      res.json(products);
    } catch (error) {
      console.error("Error getting store products:", error);
      res.status(500).json({ message: "Failed to get store products" });
    }
  });

  // Purchase a product
  app.post("/api/store/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { productId, quantity = 1 } = req.body;

      if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
      }

      const result = await storage.purchaseProduct(userId, productId, quantity);

      if (result.success) {
        // Get updated product and transaction details
        const products = await storage.getStoreProducts();
        const product = products.find(p => p.id === productId);
        
        res.json({
          success: true,
          message: "Purchase successful",
          transaction: result.transaction,
          product,
          totalCost: (product?.price || 0) * quantity
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error || "Purchase failed"
        });
      }
    } catch (error) {
      console.error("Error purchasing product:", error);
      res.status(500).json({ message: "Failed to purchase product" });
    }
  });

  // Get user inventory
  app.get("/api/inventory", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const inventory = await storage.getUserInventory(userId);
      res.json(inventory);
    } catch (error) {
      console.error("Error getting user inventory:", error);
      res.status(500).json({ message: "Failed to get inventory" });
    }
  });

  // Get user transactions
  app.get("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const transactions = await storage.getUserTransactions(userId);
      res.json(transactions);
    } catch (error) {
      console.error("Error getting user transactions:", error);
      res.status(500).json({ message: "Failed to get transactions" });
    }
  });

  // === ACHIEVEMENT ROUTES ===

  // === SUBSCRIPTION TIER MANAGEMENT ===

  // POST /api/user/upgrade-subscription - Upgrade user subscription tier
  app.post("/api/user/upgrade-subscription", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      const { newTier } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Validate tier
      const validTiers = ['Fan', 'Artist', 'Record Label', 'Mogul'];
      if (!validTiers.includes(newTier)) {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }

      // Apply tier benefits
      await storage.applySubscriptionTierBenefits(userId, newTier);

      // Get updated user
      const updatedUser = await storage.getUser(userId);

      res.json({
        success: true,
        message: `Subscription upgraded to ${newTier}`,
        user: updatedUser
      });
    } catch (error) {
      console.error("Error upgrading subscription:", error);
      res.status(500).json({ message: "Failed to upgrade subscription" });
    }
  });

  // GET /api/subscription-tiers - Get all available subscription tiers
  app.get("/api/subscription-tiers", async (req, res) => {
    try {
      const tiers = [
        {
          name: 'Fan',
          price: 0.00,
          initialCredits: 500,
          monthlyCredits: 0,
          initialFame: 1,
          initialExperience: 0,
          features: ['Basic card generation', '500 starting credits', 'Community access']
        },
        {
          name: 'Artist',
          price: 5.95,
          initialCredits: 1500,
          monthlyCredits: 1500,
          initialFame: 5,
          initialExperience: 100,
          features: ['1500 monthly credits', 'Enhanced FAME starting level', 'Priority support']
        },
        {
          name: 'Record Label',
          price: 19.95,
          initialCredits: 5000,
          monthlyCredits: 5000,
          initialFame: 15,
          initialExperience: 3500,
          features: ['5000 monthly credits', 'Professional FAME level', 'Advanced customization']
        },
        {
          name: 'Mogul',
          price: 49.50,
          initialCredits: 15000,
          monthlyCredits: 15000,
          initialFame: 30,
          initialExperience: 10000,
          features: ['15000 monthly credits', 'Elite FAME status', 'All premium features']
        }
      ];

      res.json({ tiers });
    } catch (error) {
      console.error("Error getting subscription tiers:", error);
      res.status(500).json({ message: "Failed to get subscription tiers" });
    }
  });

  // POST /api/admin/process-monthly-credits - Process monthly credit renewals
  app.post("/api/admin/process-monthly-credits", isAuthenticated, async (req, res) => {
    try {
      await storage.processMonthlyCredits();

      res.json({
        success: true,
        message: "Monthly credits processed successfully"
      });
    } catch (error) {
      console.error("Error processing monthly credits:", error);
      res.status(500).json({ message: "Failed to process monthly credits" });
    }
  });

  // Daily growth system - Apply FAME-driven growth to artist cards (Grok's system)
  app.post("/api/daily-growth/:cardId", isAuthenticated, async (req, res) => {
    try {
      const { cardId } = req.params;
      const userId = (req as any).user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the artist card and user info
      const card = await storage.getArtistCard(cardId);
      const user = await storage.getUser(userId);
      
      if (!card || card.userId !== userId) {
        return res.status(404).json({ message: "Artist card not found" });
      }
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if daily growth has already been applied today
      const now = new Date();
      const lastUpdateValue = card.lastDailyUpdate || card.createdAt;
      if (!lastUpdateValue) {
        throw new Error('No valid date found for daily update tracking');
      }
      const lastUpdate = new Date(lastUpdateValue);
      const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate < 24) {
        return res.json({ 
          message: "Daily growth already applied today",
          hoursUntilNext: Math.ceil(24 - hoursSinceUpdate),
          card
        });
      }

      // Calculate daily growth using Grok's algorithm
      const currentSales = {
        physical: card.physicalCopies || 0,
        digital: card.digitalDownloads || 0,
        streams: card.totalStreams || 0
      };

      const growth = calculateDailyGrowth(
        card.currentFame || 5,
        currentSales,
        user.subscriptionTier || 'Fan'
      );

      // Apply growth to the band's metrics
      const updatedCard = await storage.updateArtistCard(cardId, {
        physicalCopies: (card.physicalCopies || 0) + growth.physicalGrowth,
        digitalDownloads: (card.digitalDownloads || 0) + growth.digitalGrowth,
        totalStreams: (card.totalStreams || 0) + growth.streamGrowth,
        currentFame: Math.floor((card.currentFame || 5) + growth.fameGrowth),
        lastDailyUpdate: now,
        dailyGrowthStreak: (card.dailyGrowthStreak || 0) + 1
      });

      console.log(`✅ Applied daily growth to ${(card.artistData as any)?.bandName || 'band'}: +${growth.streamGrowth} streams, +${growth.digitalGrowth} digital, +${growth.physicalGrowth} physical`);

      res.json({ 
        message: "Daily growth applied successfully",
        growth,
        updatedCard
      });

    } catch (error) {
      console.error("Error applying daily growth:", error);
      res.status(500).json({ message: "Failed to apply daily growth" });
    }
  });

  // Get band achievements
  app.get("/api/artist/:cardId/achievements", async (req, res) => {
    try {
      const { cardId } = req.params;
      const achievements = await storage.getBandAchievements(cardId);
      res.json(achievements);
    } catch (error) {
      console.error("Error getting band achievements:", error);
      res.status(500).json({ message: "Failed to get achievements" });
    }
  });

  // Get user achievements
  app.get("/api/achievements", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const achievements = await storage.getUserAchievements(userId);
      res.json(achievements);
    } catch (error) {
      console.error("Error getting user achievements:", error);
      res.status(500).json({ message: "Failed to get achievements" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
