import { Request, Response } from 'express';
import { enhancedBandGenerator, GenerationMode } from '../services/enhanced-band-generator';
import { ServerAudioAnalyzer } from '../services/audio-analyzer';
import { generateArtistImage } from '../services/openai';
import { generateArtistImageWithGoogle } from '../services/google-imagen';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

/**
 * Enhanced band generation endpoint
 * Supports both explore mode (4 candidates + auto-selection) and refine mode (single polished result)
 */
export function setupEnhancedBandRoutes(app: any) {
  
  app.post('/api/enhanced-band-generation', upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'customPhoto', maxCount: 1 }
  ]), async (req: any, res: Response) => {
    try {
      const audioFile = req.files?.['audio']?.[0];
      const customPhotoFile = req.files?.['customPhoto']?.[0];
      
      if (!audioFile) {
        return res.status(400).json({ message: 'No audio file provided' });
      }

      const startTime = Date.now();
      
      // Extract parameters
      const mode: GenerationMode = req.body.mode === 'refine' ? 'refine' : 'explore';
      const artStyle = req.body.artStyle || 'realistic';
      const cardTheme = req.body.cardTheme || 'dark';
      
      // User preferences
      const userPreferences = {
        userBandName: req.body.userBandName?.trim() || '',
        songName: req.body.songName?.trim() || '',
        userGenre: req.body.userGenre?.trim() || '',
        artistType: req.body.artistType || 'ensemble',
        hasCustomPhoto: !!customPhotoFile
      };

      console.log(`🎵 Enhanced band generation (${mode} mode) for:`, audioFile.originalname);
      console.log('User preferences:', userPreferences);

      // Analyze audio file
      const audioMetrics = ServerAudioAnalyzer.analyzeBuffer(
        audioFile.buffer.buffer as ArrayBuffer, 
        audioFile.originalname
      );

      console.log('Audio metrics:', { 
        duration: audioMetrics.duration, 
        tempo: audioMetrics.tempo, 
        key: audioMetrics.key,
        energy: audioMetrics.energy
      });

      // Generate enhanced band data
      const result = await enhancedBandGenerator.generateBand({
        audioMetrics,
        artStyle,
        cardTheme,
        userPreferences,
        mode
      });

      console.log(`✅ Generated band: ${result.winner.bandName} (${mode} mode)`);
      
      // Generate image for the winner
      let imageUrl = '';
      try {
        if (customPhotoFile) {
          // Use custom photo if provided
          imageUrl = `data:${customPhotoFile.mimetype};base64,${customPhotoFile.buffer.toString('base64')}`;
          console.log('✅ Using custom photo for band image');
        } else {
          // Generate image using the enhanced image prompt
          try {
            imageUrl = await generateArtistImage(result.winner, artStyle, cardTheme);
            console.log('✅ Generated band image with OpenAI DALL-E');
          } catch (imageError) {
            console.log('OpenAI image generation failed, trying Google Imagen...');
            imageUrl = await generateArtistImageWithGoogle(result.winner, artStyle);
            console.log('✅ Generated band image with Google Imagen');
          }
        }
      } catch (imageError) {
        console.error('Image generation failed:', imageError);
        imageUrl = ''; // Will use fallback in frontend
      }

      const processingTime = (Date.now() - startTime) / 1000;
      
      // Return enhanced response
      const response = {
        // Winner data
        winner: {
          ...result.winner,
          imageUrl,
          processingTime
        },
        // Generation metadata
        metadata: {
          mode,
          processingTime,
          audioAnalysis: {
            duration: audioMetrics.duration,
            tempo: audioMetrics.tempo,
            key: audioMetrics.key,
            energy: audioMetrics.energy
          },
          candidatesGenerated: mode === 'explore' ? 4 : 1
        },
        // Alternatives for explore mode
        ...(mode === 'explore' && result.alternatives && {
          alternatives: result.alternatives.map(alt => ({
            ...alt.data,
            score: alt.score,
            scoreBreakdown: alt.breakdown
          }))
        })
      };

      console.log(`🎯 Enhanced band generation completed in ${processingTime.toFixed(2)}s`);
      
      res.json(response);
      
    } catch (error) {
      console.error('Enhanced band generation error:', error);
      res.status(500).json({ 
        message: 'Failed to generate enhanced band data',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Quick mode selector endpoint - helps users choose between explore/refine
   */
  app.get('/api/enhanced-band-generation/modes', (req: Request, res: Response) => {
    res.json({
      modes: {
        explore: {
          name: 'Explore',
          description: 'Generate 4 creative options and auto-select the best',
          temperature: 0.9,
          candidates: 4,
          useCase: 'When you want maximum creativity and variety'
        },
        refine: {
          name: 'Refine', 
          description: 'Generate one polished, refined result',
          temperature: 0.4,
          candidates: 1,
          useCase: 'When you have specific preferences and want a focused result'
        }
      },
      default: 'explore'
    });
  });

  /**
   * Get scoring criteria explanation
   */
  app.get('/api/enhanced-band-generation/scoring', (req: Request, res: Response) => {
    res.json({
      criteria: {
        brandFit: {
          weight: 0.35,
          description: 'How well the band fits our creative vision and world-building standards'
        },
        constraintFit: {
          weight: 0.25,
          description: 'Technical validity - proper schema, field lengths, required data'
        },
        novelty: {
          weight: 0.25,
          description: 'Uniqueness compared to other candidates - avoids duplicates'
        },
        clarity: {
          weight: 0.15,
          description: 'Readability and conciseness of band identity and concepts'
        }
      },
      scoring: {
        range: '0.0 - 1.0',
        calculation: 'Weighted sum of all criteria',
        interpretation: {
          '0.8+': 'Exceptional - Premium quality band concept',
          '0.6-0.8': 'Strong - Solid creative concept with good depth',
          '0.4-0.6': 'Good - Meets basic standards with some creative elements',
          '0.0-0.4': 'Needs improvement - Missing key elements or lacks depth'
        }
      }
    });
  });
}