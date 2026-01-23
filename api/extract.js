import Anthropic from "@anthropic-ai/sdk";
import hospitalData from "../data/hospitals.json";

// Build hospital lookup index (runs once when server starts)
let hospitalIndex = null;

function getHospitalIndex() {
  if (!hospitalIndex) {
    hospitalIndex = {};
    for (const hospital of hospitalData.hospitals) {
      // Index by all lookup keys
      const keys = hospital.lookup_keys || [];
      for (const key of keys) {
        if (key && key.length > 2) {
          hospitalIndex[key] = hospital;
        }
      }
      // Also index by lowercase name
      hospitalIndex[hospital.name.toLowerCase()] = hospital;
    }
    console.log(`Hospital index built: ${Object.keys(hospitalIndex).length} keys for ${hospitalData.hospitals.length} hospitals`);
  }
  return hospitalIndex;
}

function findHospital(facilityName, state = null) {
  if (!facilityName) return null;
  
  const index = getHospitalIndex();
  const searchName = facilityName.toLowerCase().trim();
  
  // Try exact match
  if (index[searchName]) {
    const match = index[searchName];
    if (!state || match.state === state.toUpperCase()) {
      return formatHospitalData(match);
    }
  }
  
  // Try removing common suffixes for matching
  const simplified = searchName
    .replace(/medical center/gi, '')
    .replace(/hospital/gi, '')
    .replace(/regional/gi, '')
    .replace(/health system/gi, '')
    .replace(/healthcare/gi, '')
    .trim();
  
  if (simplified && index[simplified]) {
    const match = index[simplified];
    if (!state || match.state === state.toUpperCase()) {
      return formatHospitalData(match);
    }
  }
  
  // Try partial matching - look for hospital names contained in the search
  for (const [key, hospital] of Object.entries(index)) {
    if (key.length > 4) { // Only match on meaningful keys
      if (searchName.includes(key) || key.includes(simplified)) {
        if (!state || hospital.state === state.toUpperCase()) {
          return formatHospitalData(hospital);
        }
      }
    }
  }
  
  return null;
}

function formatHospitalData(h) {
  return {
    verified: true,
    officialName: h.name,
    city: h.city,
    state: h.state,
    beds: h.beds || null,
    traumaLevel: h.trauma_level || null,
    teachingHospital: h.teaching_hospital || false,
    magnetStatus: h.magnet_status || false,
    emrSystem: h.emr_system || null,
    hospitalType: h.hospital_type || null
  };
}

function enrichWorkHistory(workHistory) {
  if (!workHistory || !Array.isArray(workHistory)) {
    return workHistory;
  }
  
  return workHistory.map(job => {
    const hospitalInfo = findHospital(job.facility);
    
    if (hospitalInfo) {
      return {
        ...job,
        hospitalData: hospitalInfo
      };
    }
    
    // No match found
    return {
      ...job,
      hospitalData: {
        verified: false,
        message: "Hospital not found in database"
      }
    };
  });
}

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { resumeText } = req.body;

  if (!resumeText || resumeText.trim().length < 50) {
    return res.status(400).json({ error: "Resume text is required (minimum 50 characters)" });
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    return res.status(500).json({ error: "API key not configured. Please add ANTHROPIC_API_KEY to environment variables." });
  }

  try {
    const client = new Anthropic();

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Extract structured data from this nurse resume. Return ONLY valid JSON, no other text.

Resume:
${resumeText}

Return this exact JSON structure:
{
  "name": "Full name with credentials",
  "phone": "Phone number",
  "email": "Email address", 
  "location": "City, State ZIP",
  "licenses": ["Array of licenses"],
  "compactLicense": true or false,
  "certifications": ["Array of certifications like BLS, ACLS, CCRN"],
  "workHistory": [
    {
      "title": "Job title",
      "facility": "Hospital/facility name exactly as written",
      "city": "City if mentioned",
      "state": "State abbreviation if mentioned",
      "dates": "Employment dates",
      "unit": "Unit type if mentioned (ICU, ER, Med-Surg, etc)"
    }
  ],
  "education": "Degree and school",
  "chargeExperience": true or false,
  "yearsExperience": number
}

Important:
- Extract the facility name exactly as it appears on the resume
- Look for charge nurse experience
- Extract all certifications mentioned (BLS, ACLS, PALS, CCRN, TNCC, etc.)
- Identify if they have a compact license
- Return ONLY the JSON object, no markdown, no code blocks, no explanation`
        }
      ]
    });

    const responseText = message.content[0]?.text || "";
    
    // Try to parse the JSON
    let parsed;
    try {
      // Remove any potential markdown code blocks or extra whitespace
      let cleanJson = responseText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .trim();
      
      // Find the JSON object in the response
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }
      
      parsed = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      return res.status(500).json({ 
        error: "Failed to parse AI response. The AI may have returned invalid JSON.",
        details: responseText.substring(0, 500)
      });
    }

    // Enrich work history with hospital data
    if (parsed.workHistory) {
      parsed.workHistory = enrichWorkHistory(parsed.workHistory);
    }

    // Add metadata
    parsed._meta = {
      enrichedAt: new Date().toISOString(),
      hospitalDatabaseVersion: hospitalData.version,
      hospitalsInDatabase: hospitalData.hospital_count
    };

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("API Error:", error);
    
    // Handle specific Anthropic errors
    if (error.status === 401) {
      return res.status(401).json({ error: "Invalid API key. Please check your ANTHROPIC_API_KEY." });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded. Please try again in a moment." });
    }
    if (error.status === 500) {
      return res.status(500).json({ error: "Anthropic API error. Please try again." });
    }
    
    return res.status(500).json({ 
      error: error.message || "Failed to extract data",
      type: error.constructor.name
    });
  }
}
