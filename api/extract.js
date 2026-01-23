import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { resumeText } = req.body;

  if (!resumeText) {
    return res.status(400).json({ error: "Resume text is required" });
  }

  try {
    const client = new Anthropic();

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Extract structured data from this nurse resume. Return ONLY valid JSON, no other text, no markdown code blocks.

Resume:
${resumeText}

Return this exact JSON structure (fill in what you find, use null for missing fields):
{
  "personalInfo": {
    "fullName": "",
    "phone": "",
    "email": "",
    "location": ""
  },
  "licenses": [
    {"state": "", "compact": true, "type": "RN"}
  ],
  "certifications": ["BLS", "ACLS"],
  "education": {
    "degree": "BSN",
    "school": "",
    "graduationDate": ""
  },
  "workHistory": [
    {
      "title": "",
      "facility": "",
      "city": "",
      "state": "",
      "unit": "",
      "startDate": "",
      "endDate": "",
      "responsibilities": [""],
      "chargeExperience": false
    }
  ],
  "yearsExperience": 0,
  "primarySpecialty": ""
}

Important:
- Extract ALL work history entries you can find
- For each job, identify the unit type (ICU, Med-Surg, ER, L&D, OR, Telemetry, etc.)
- Look for charge nurse experience
- Extract all certifications mentioned (BLS, ACLS, PALS, CCRN, TNCC, etc.)
- Identify if they have a compact license
- Return ONLY the JSON object, nothing else`
        }
      ]
    });

    const responseText = message.content[0].text;
    
    // Try to parse the JSON
    let parsed;
    try {
      // Remove any potential markdown code blocks
      const cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      return res.status(500).json({ error: "Failed to parse AI response", raw: responseText });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to extract data" });
  }
}
