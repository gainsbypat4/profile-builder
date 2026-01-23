import Anthropic from "@anthropic-ai/sdk";

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
      "facility": "Hospital/facility name",
      "dates": "Employment dates",
      "unit": "Unit type if mentioned (ICU, ER, etc)"
    }
  ],
  "education": "Degree and school",
  "chargeExperience": true or false,
  "yearsExperience": number
}

Important:
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
