import { ArtistData } from "@shared/schema";

export interface AudioMetrics {
  fileName: string;
  duration: number;
  tempo: number;
  key: string;
  energy: string;
  loudness: number;
  fundamentalFreq?: number;
  spectralCentroid?: number;
  vocalRange?: 'low' | 'medium' | 'high';
  instrumentComplexity?: 'solo' | 'duo' | 'trio' | 'full_band';
  femaleIndicator?: number;
}

export async function analyzeGenreWithGemini(audioMetrics: AudioMetrics): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  try {
    const prompt = `Analyze audio characteristics to determine genre. Prioritize TEMPO and KEY over filename.

    PRIMARY ANALYSIS (Audio Characteristics):
    - Tempo: ${audioMetrics.tempo.toFixed(0)} BPM
    - Key: ${audioMetrics.key}
    - Energy: ${audioMetrics.energy}
    - Loudness: ${audioMetrics.loudness.toFixed(2)}
    - Duration: ${audioMetrics.duration.toFixed(1)}s

    SECONDARY CONTEXT (Filename): ${audioMetrics.fileName}

    TEMPO-BASED CLASSIFICATION:
    - 60-90 BPM: Ballad, R&B, Ambient
    - 90-110 BPM: Hip-Hop, Alternative Rock, Indie  
    - 110-130 BPM: Pop, Indie Pop, Alternative Pop
    - 130-145 BPM: Pop Rock, Dance Pop, Alternative Rock
    - 145-160 BPM: Rock, Electronic, Dance
    - 160+ BPM: Punk, Metal, Hardcore

    KEY INFLUENCE:
    - Major keys lean toward Pop, Dance, Commercial
    - Minor keys lean toward Rock, Alternative, Electronic

    Respond with one specific genre only:`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const genre = result.candidates[0].content.parts[0].text.trim();
      console.log('Gemini genre analysis:', genre);
      return genre;
    }

    throw new Error('No genre analysis received from Gemini');

  } catch (error) {
    console.error('Gemini genre analysis failed:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Gemini genre analysis error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

interface UserPreferences {
  userBandName?: string;
  songName?: string;
  userGenre?: string;
  artistType?: string;
}

export async function generateArtistWithGemini(
  audioMetrics: AudioMetrics & { genre: string },
  artStyle: string,
  cardTheme: string = "dark",
  userPreferences?: UserPreferences
): Promise<ArtistData> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  try {
    // Create diversity seeds to ensure unique generations
    const diversitySeed = Math.floor(Math.random() * 1000);
    // Override band size based on user preference
    const bandSizeOverride = userPreferences?.artistType === 'solo' 
      ? 1 
      : Math.floor(Math.random() * 4) + 1; // 1-4 members
    
    // Create genre-specific templates for more variety
    const genreTemplates = {
      'Electronic': ['EDM Producer', 'Synthwave Duo', 'Industrial Collective', 'Ambient Artist', 'Techno Pioneer'],
      'Rock': ['Indie Rock Band', 'Alternative Trio', 'Garage Rock Duo', 'Post-Rock Ensemble', 'Punk Revival'],
      'Pop': ['Solo Pop Star', 'Pop Rock Band', 'Dream Pop Duo', 'Indie Pop Collective', 'Synthpop Artist'],
      'Hip-Hop': ['Rap Artist', 'Producer-Rapper Duo', 'Hip-Hop Collective', 'Underground MC', 'Trap Artist'],
      'Folk': ['Singer-Songwriter', 'Folk Duo', 'Acoustic Ensemble', 'Country Folk Band', 'Indie Folk Artist'],
      'Jazz': ['Jazz Trio', 'Fusion Quartet', 'Solo Jazz Artist', 'Big Band Leader', 'Experimental Jazz Group'],
      'Alternative': ['Alt-Rock Band', 'Experimental Artist', 'Shoegaze Duo', 'Grunge Revival', 'Alternative Pop']
    };
    
    const currentGenre = audioMetrics.genre || 'Alternative';
    const templates = genreTemplates[currentGenre as keyof typeof genreTemplates] || genreTemplates['Alternative'];
    const selectedTemplate = templates[Math.floor(Math.random() * templates.length)];
    
    const prompt = `You are an expert music industry analyst and creative storyteller. Create an EXTRAORDINARILY DETAILED and IMAGINATIVE artist identity that rivals the depth of fictional bands like Gorillaz or real music mythologies. Think of this as creating a virtual band with the creative depth of the "Neon Void Collective" - rich backstory, compelling characters, and authentic cultural context.

    CREATIVE BENCHMARK: Match the storytelling depth of cyberpunk bands, concept albums, and music industry legends. Create a band that feels like they could have a documentary, graphic novel, or transmedia franchise.

    USER CREATIVE DIRECTION:
    ${userPreferences?.userBandName ? `- REQUIRED BAND NAME: "${userPreferences.userBandName}" (This is the exact name the user wants - use it exactly)` : ''}
    ${userPreferences?.songName ? `- REQUIRED SONG NAME: "${userPreferences.songName}" (This is the exact song name the user wants - use it exactly)` : ''}
    ${userPreferences?.userGenre ? `- USER'S GENRE CHOICE: ${userPreferences.userGenre} (Respect this genre while building the identity)` : ''}
    ${userPreferences?.artistType ? `- ARTIST TYPE: ${userPreferences.artistType === 'solo' ? 'Solo Artist (single performer)' : 'Band/Group (multiple members)'}` : ''}
    
    🎯 CREATIVITY CONSTRAINTS:
    DIVERSITY SEED: ${diversitySeed} - Use this EXACT number to drive completely different creative choices
    UNIQUENESS MULTIPLIER: ${diversitySeed * 13 + Date.now() % 1000} - Use this to avoid ALL repetition
    TIMESTAMP VARIANCE: ${Date.now() % 10000} - Add this entropy to ensure zero duplication
    TEMPLATE: Create a ${selectedTemplate} with extraordinary depth
    THEME: ${cardTheme} theme with matching colors and immersive aesthetic
    
    🎯 CREATIVE ORIGINALITY: 
    - Generate band names that feel authentic to this specific audio and genre
    - Draw inspiration from the actual tempo, key, energy, and musical characteristics
    - Create names that reflect the emotional tone and style of this particular track
    - Make each generation completely unique based on the audio's "fingerprint"

    🎵 AUDIO ANALYSIS - BASE YOUR GENERATION ON THESE CHARACTERISTICS:
    - Genre: ${audioMetrics.genre} (Generate a band that authentically represents this genre)
    - Tempo: ${audioMetrics.tempo.toFixed(0)} BPM (${audioMetrics.tempo < 100 ? 'Slow/Ballad - Create introspective, intimate artists with emotional depth' : audioMetrics.tempo < 130 ? 'Medium/Groove - Build steady, hypnotic artists with driving rhythms' : 'Fast/Energetic - Design high-energy artists with adrenaline and intensity'})
    - Key: ${audioMetrics.key} (Let this influence the band's emotional tone)
    - Energy Level: ${audioMetrics.energy}
    - Vocal Characteristics: ${audioMetrics.vocalRange || 'medium'} range (Use this to determine lead singer gender and vocal style)
    - Instrument Complexity: ${audioMetrics.instrumentComplexity || 'solo'} (CRITICAL: Use this to determine exact band member count:
      * solo = 1 member (singer-songwriter or electronic artist)
      * duo = 2 members (vocal + instrumental partner)  
      * trio = 3 members (vocals, guitar, bass/drums)
      * full_band = 4-5 members (full rock/pop band setup))
    - Spectral Analysis: High frequency content suggests ${audioMetrics.fundamentalFreq ? (audioMetrics.fundamentalFreq > 200 ? 'female lead vocals' : 'male lead vocals') : 'mixed vocals'}

    🎭 AUDIO-DRIVEN CHARACTER DEVELOPMENT:
    - Band Size: Base member count on instrument complexity analysis above - DO NOT use ${bandSizeOverride}, use the audio analysis instead
    - Lead Singer Gender: Determine from vocal frequency analysis - higher frequencies suggest female, lower suggest male
    - Member Personalities: Create characters that match the energy and genre of this specific audio
    - Origin Story: Develop formation backstory that explains how this exact musical style evolved
    - Musical Evolution: Show how their sound would naturally create the audio characteristics you're analyzing
    - Genre Authenticity: Every member should feel like they belong in this specific genre and tempo range

    STORYTELLING ELEMENTS TO INCLUDE:
    - FORMATION LEGEND: How did they meet? What catalyst brought them together? (specific event, location, year)
    - BREAKTHROUGH MOMENT: What was their defining moment or "origin myth"?
    - CREATIVE TENSIONS: What internal dynamics drive their creativity?
    - CULTURAL IMPACT: How do they influence their fictional fanbase and music scene?
    - VISUAL IDENTITY: Distinctive aesthetic choices, fashion, stage presence
    - HIDDEN DEPTHS: Secret influences, unexpected collaborations, mysterious elements

    GENRE-SPECIFIC CREATIVITY:
    - Electronic: Think Daft Punk, Deadmau5, Skrillex, Porter Robinson, ODESZA
    - Rock: Think Arctic Monkeys, Queens of the Stone Age, The White Stripes, Foo Fighters
    - Pop: Think Taylor Swift, Billie Eilish, The 1975, Lorde, Harry Styles  
    - Hip-Hop: Think Kendrick Lamar, Tyler the Creator, J. Cole, Travis Scott
    - Folk: Think Bon Iver, Fleet Foxes, The Lumineers, Phoebe Bridgers
    - Jazz: Think Robert Glasper, Kamasi Washington, Esperanza Spalding

    BAND NAME INSPIRATION (AVOID "CHROMATIC" PATTERNS):
    - Use evocative imagery, emotions, or concepts (e.g., "Midnight Oil", "Stone Temple Pilots")
    - Combine unexpected words (like "Arctic Monkeys" or "Vampire Weekend")
    - Reference mythology, literature, or science (like "Radiohead" or "Pink Floyd") 
    - Use nature/location combinations ("Fleet Foxes", "Phoenix", "Beirut")
    - Create memorable, Google-able names that sound professional
    - SEED MULTIPLIER: ${diversitySeed * 7} - Use this to drive name creativity away from patterns

    MEMBER PERSONALITY VARIETY:
    - The Visionary: Creative mastermind with big ideas
    - The Technician: Perfectionist focused on craft and sound quality  
    - The Rebel: Challenges conventions, brings edge and attitude
    - The Heart: Emotional center, connects with audiences
    - The Scholar: Music theory expert, brings complexity and depth

    Generate a compelling artist identity in JSON:
    {
      "bandName": "Creative name inspired by the audio's tempo (${audioMetrics.tempo.toFixed(0)} BPM), key (${audioMetrics.key}), and ${audioMetrics.genre} genre characteristics",
      "songName": "${userPreferences?.songName || 'Generated song name'}",
      "genre": "${audioMetrics.genre}",
      "philosophy": "Unique 3-5 word artistic mission",
      "bandConcept": "Detailed backstory with personality, origin story, and what makes them special",
      "members": [
        {
          "name": "Realistic full name or stage name",
          "role": "Specific instrument/vocals/production role",
          "archetype": "Detailed personality, background, and what they bring to the group"
        }
      ],
      "influences": ["5 specific real artists/bands that inspired their sound"],
      "signatureSound": "What makes their music instantly recognizable",
      "lyricalThemes": "Specific topics, emotions, or stories they explore",
      "liveVisuals": "Concert atmosphere and stage presence for ${cardTheme} aesthetic",
      "colorPalette": {
        "background": "Dark hex color for ${cardTheme} cards",
        "textPrimary": "Light hex color for readability",
        "highlight": "Vibrant hex color matching genre energy"
      },
      "sunoPrompt": "Detailed Suno AI music generation prompt that captures the band's complete aesthetic - include specific lyrical themes, instrumentation details, vocal style, mood, tempo references, and production techniques that would recreate their signature sound"
    }

    SUNO PROMPT REQUIREMENTS:
    - Be highly specific about instrumentation (e.g., "analog synthesizers", "distorted electric guitars", "ethereal reverb-drenched vocals")
    - Include lyrical direction (themes, emotional tone, storytelling approach)
    - Specify production style (raw/polished, vintage/modern, spacious/intimate)
    - Reference tempo and energy level to match the ${audioMetrics.tempo.toFixed(0)} BPM analysis
    - Make it comprehensive enough that Suno could recreate their signature sound

    Make them feel like a real band with authentic personalities and compelling stories.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const jsonText = result.candidates[0].content.parts[0].text.trim();
      
      // Extract JSON from the response (handle markdown code blocks)  
      let jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonToParseText;
      
      if (jsonMatch) {
        // Found JSON in code block - use the inner content
        jsonToParseText = jsonMatch[1].trim();
        console.log('Found JSON in code block, extracting...');
      } else {
        // Try to find raw JSON object
        jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonToParseText = jsonMatch[0].trim();
          console.log('Found raw JSON object...');
        } else {
          throw new Error('No JSON found in Gemini response');
        }
      }

      const artistData = JSON.parse(jsonToParseText);
      console.log('Generated artist with Gemini:', artistData.bandName);
      return artistData;
    }

    throw new Error('No artist data received from Gemini');

  } catch (error) {
    console.error('Gemini artist generation failed:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Gemini artist generation error: ${error instanceof Error ? error.message : String(error)}`);
  }
}