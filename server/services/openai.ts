import OpenAI from "openai";
import { ArtistData, artistDataSchema } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || ""
});

export interface AudioAnalysisInput {
  fileName: string;
  duration: number;
  tempo?: number;
  key?: string;
  energy?: string;
  loudness?: number;
  genre?: string;
  fundamentalFreq?: number;
  spectralCentroid?: number;
  vocalRange?: 'low' | 'medium' | 'high';
  instrumentComplexity?: 'solo' | 'duo' | 'trio' | 'full_band';
  femaleIndicator?: number;
}

interface UserPreferences {
  userBandName?: string;
  songName?: string;
  userGenre?: string;
  artistType?: string;
}

export async function generateArtistIdentity(audioAnalysis: AudioAnalysisInput, artStyle: string = "realistic", cardTheme: string = "dark", userPreferences?: UserPreferences): Promise<ArtistData> {
  try {
    const prompt = `
You are a visionary music industry storyteller and cultural anthropologist. Create an EXTRAORDINARILY DETAILED and IMMERSIVE artist identity that matches the creative depth of legendary bands like Pink Floyd, Gorillaz, or the fictional "Neon Void Collective." This should be a band with rich lore, compelling characters, and authentic cultural impact.

CREATIVE BENCHMARK: Think documentary-worthy backstories, transmedia franchises, and bands that transcend music to become cultural movements.

USER CREATIVE DIRECTION:
${userPreferences?.userBandName ? `- REQUIRED BAND NAME: "${userPreferences.userBandName}" (This is the exact name the user wants - use it exactly)` : ''}
${userPreferences?.songName ? `- REQUIRED SONG NAME: "${userPreferences.songName}" (This is the exact song name the user wants - use it exactly)` : ''}
${userPreferences?.userGenre ? `- USER'S GENRE CHOICE: ${userPreferences.userGenre} (Respect this genre while building the identity)` : ''}
${userPreferences?.artistType ? `- ARTIST TYPE: ${userPreferences.artistType === 'solo' ? 'Solo Artist (single performer)' : 'Band/Group (multiple members)'}` : ''}

Audio Analysis to Interpret:
- File: ${audioAnalysis.fileName}
- Duration: ${audioAnalysis.duration} seconds
- Tempo: ${audioAnalysis.tempo || "Unknown"} BPM ${audioAnalysis.tempo ? (audioAnalysis.tempo < 100 ? '(Intimate/Ballad - deep emotional introspection)' : audioAnalysis.tempo < 130 ? '(Groove/Medium - hypnotic driving force)' : '(High Energy - rebellious intensity)') : ''}
- Key: ${audioAnalysis.key || "Unknown"}
- Energy Level: ${audioAnalysis.energy || "Unknown"}
- Loudness: ${audioAnalysis.loudness || "Unknown"}
- Detected Genre: ${audioAnalysis.genre || "Unknown"}

CRITICAL VOCAL ANALYSIS (Use this to determine lead singer gender and band composition):
- Vocal Range: ${audioAnalysis.vocalRange || 'unknown'} ${audioAnalysis.vocalRange === 'high' ? '(FEMALE VOCALS DETECTED - Create female-fronted artist)' : audioAnalysis.vocalRange === 'low' ? '(MALE VOCALS DETECTED - Create male-fronted artist)' : '(MIXED/UNKNOWN VOCALS)'}
- Fundamental Frequency: ${audioAnalysis.fundamentalFreq ? `${audioAnalysis.fundamentalFreq.toFixed(0)} Hz` : 'Unknown'} ${audioAnalysis.fundamentalFreq ? (audioAnalysis.fundamentalFreq > 200 ? '(Female voice range)' : audioAnalysis.fundamentalFreq < 150 ? '(Male voice range)' : '(Ambiguous range)') : ''}
- Gender Confidence: ${audioAnalysis.femaleIndicator ? `${(audioAnalysis.femaleIndicator * 100).toFixed(0)}% female likelihood` : 'Unknown'}
- Band Size Indicator: ${audioAnalysis.instrumentComplexity || 'unknown'} ${audioAnalysis.instrumentComplexity ? `(Create ${audioAnalysis.instrumentComplexity === 'solo' ? '1 member' : audioAnalysis.instrumentComplexity === 'duo' ? '2 members' : audioAnalysis.instrumentComplexity === 'trio' ? '3 members' : '4-5 members'})` : ''}

Visual Identity Framework:
- Card Theme: ${cardTheme} (create immersive visual worldbuilding)
- Art Style: ${artStyle} (influence stage presence and aesthetic philosophy)

STORYTELLING DEPTH REQUIREMENTS:
- ORIGIN MYTHOLOGY: Specific formation story with year, location, catalyst event
- MEMBER PSYCHOLOGY: Deep individual backstories, creative tensions, personal quirks
- CULTURAL IMPACT: How they influenced their scene, fanbase mythology, hidden meanings
- VISUAL UNIVERSE: Distinctive aesthetic that extends beyond just clothing to entire worldview
- PHILOSOPHICAL FRAMEWORK: Unique artistic manifesto that drives all creative decisions
- BREAKTHROUGH LEGEND: Their defining moment, "origin myth," or career catalyst
- HIDDEN LAYERS: Mysterious elements, secret influences, unexplored collaborations

Create a rich artist identity with this enhanced structure (respond in JSON format):
{
  "bandName": "string - Evocative, memorable name with cultural significance (never generic)",
  "songName": "${userPreferences?.songName || 'Generated song name'}",
  "genre": "string - Specific subgenre that matches audio analysis perfectly",
  "philosophy": "string - 3-5 word artistic manifesto that defines their worldview",
  "bandConcept": "string - Comprehensive backstory including formation legend, breakthrough moment, creative philosophy, cultural impact, and what makes them legendary. Minimum 150 words of rich narrative.",
  "members": [
    {
      "name": "string - Authentic full name or culturally significant stage name",
      "role": "string - Specific instrument/vocals/production specialty",
      "archetype": "string - Rich personality profile including background, creative role, personal quirks, and psychological dynamics within the group. Minimum 50 words per member."
    }
  ],
  "influences": ["string array - 5-7 specific real artists, movements, or cultural phenomena that shaped their sound"],
  "signatureSound": "string - Detailed description of what makes their music instantly recognizable, including specific instrumentation, production techniques, and sonic innovations",
  "lyricalThemes": "string - Specific topics, emotional landscapes, storytelling approaches, and philosophical concepts they explore. Include recurring motifs and hidden meanings.",
  "liveVisuals": "string - Comprehensive description of concert atmosphere, stage design, audience interaction, and visual storytelling that matches the ${artStyle} aesthetic",
  "colorPalette": {
    "background": "string - Dark hex color that supports ${cardTheme} theme",
    "textPrimary": "string - High contrast hex color for optimal readability",
    "highlight": "string - Vibrant accent hex color that captures the genre's energy"
  },
  "sunoPrompt": "string - Highly detailed Suno AI music generation prompt (minimum 100 words) including specific instrumentation (e.g., 'analog Moog synthesizers,' 'Gibson Les Paul through Marshall amplifiers'), vocal characteristics, production techniques, lyrical themes, tempo guidance, emotional arc, and any unique sonic signatures that would allow Suno to recreate their distinctive sound perfectly"
}

SUNO PROMPT EXCELLENCE STANDARDS:
- Ultra-specific instrumentation details (exact gear, effects, techniques)
- Comprehensive vocal direction (style, processing, emotional delivery)
- Production aesthetics (vintage/modern, spatial effects, mixing style)
- Lyrical guidance (themes, narrative style, emotional tone)
- Tempo and rhythmic patterns that match the ${audioAnalysis.tempo || 120} BPM analysis
- Unique sonic signatures that define the band's sound DNA

Make this band feel like they could have a Netflix documentary, graphic novel series, and devoted fanbase analyzing their hidden meanings for decades.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a music industry expert and creative director specializing in artist development and branding. Create authentic, compelling artist identities based on musical analysis."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Validate the response against our schema
    const artistData = artistDataSchema.parse(result);
    
    return artistData;
  } catch (error) {
    console.error("Error generating artist identity:", error);
    throw new Error(`Failed to generate artist identity: ${error}`);
  }
}

export async function generateArtistImage(artistData: ArtistData, artStyle: string = "realistic", cardTheme: string = "dark"): Promise<string> {
  try {
    const stylePrompts = {
      realistic: "photorealistic portrait",
      stylized: "stylized digital illustration",
      retro: "retro poster art style",
      abstract: "abstract geometric art"
    };

    const stylePrompt = stylePrompts[artStyle as keyof typeof stylePrompts] || stylePrompts.realistic;
    
    const themeDescriptor = cardTheme === "light" ? "bright, well-lit" : cardTheme === "vibrant" ? "colorful, energetic" : "moody, atmospheric";
    const prompt = `${stylePrompt} of ${artistData.bandName}, a ${artistData.genre} band. ${artistData.bandConcept}. The image should capture their ${artistData.philosophy} philosophy. Include ${artistData.members.length} band members with instruments. Style should reflect ${artistData.liveVisuals}. ${themeDescriptor} lighting and mood. High quality, professional band portrait.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    return response.data?.[0]?.url || "";
  } catch (error) {
    console.error("Error generating artist image:", error);
    throw new Error(`Failed to generate artist image: ${error}`);
  }
}

export async function analyzeGenreFromAudio(audioAnalysis: AudioAnalysisInput): Promise<string> {
  try {
    const prompt = `
Based on this audio analysis, predict the most likely musical genre:

- Tempo: ${audioAnalysis.tempo || "Unknown"} BPM
- Energy Level: ${audioAnalysis.energy || "Unknown"}
- Duration: ${audioAnalysis.duration} seconds
- Loudness: ${audioAnalysis.loudness || "Unknown"}

Respond with just the genre name (e.g., "Rock", "Pop", "Electronic", "Hip-Hop", "Jazz", etc.).
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a music classification expert. Analyze audio characteristics to predict musical genres accurately."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 50,
      temperature: 0.3,
    });

    return response.choices[0].message.content?.trim() || "Unknown";
  } catch (error) {
    console.error("Error analyzing genre:", error);
    return "Unknown";
  }
}
