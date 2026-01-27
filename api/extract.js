export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { resumeText } = req.body;
  if (!resumeText) return res.status(400).json({ error: "Resume text is required" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: `Parse this nurse resume and extract ALL data. Return ONLY valid JSON with no markdown.

RESUME:
${resumeText}

INSTRUCTIONS:
1. Extract the person's FULL NAME (look at top of resume)
2. Extract ALL nursing licenses with STATE ABBREVIATIONS (FL, OH, TX, etc)
3. If license says "Compact" or "Multistate", mark compact as true
4. Extract ALL certifications (BLS, ACLS, PALS, CCRN, TNCC, etc)
5. Extract education with degree type, school name, graduation date
6. For each job: get title, hospital, city, state, unit type, dates, and ALL responsibilities/bullets
7. Note if they have charge nurse experience

Return this JSON structure:
{
  "personalInfo": {
    "fullName": "The actual name from resume",
    "phone": "phone number",
    "email": "email address",
    "location": "City, State"
  },
  "licenses": [
    {"state": "FL", "type": "RN", "compact": true},
    {"state": "OH", "type": "RN", "compact": false}
  ],
  "certifications": ["BLS", "ACLS", "PALS", "CCRN", "TNCC"],
  "education": {
    "degree": "BSN",
    "school": "University Name",
    "graduationDate": "May 2016"
  },
  "workHistory": [
    {
      "title": "ICU Staff RN",
      "facility": "Tampa General Hospital",
      "city": "Tampa",
      "state": "FL",
      "unit": "ICU",
      "startDate": "March 2021",
      "endDate": "Present",
      "chargeExperience": true,
      "responsibilities": [
        "First bullet point from resume",
        "Second bullet point",
        "Third bullet point"
      ]
    }
  ],
  "yearsExperience": 7,
  "primarySpecialty": "ICU"
}

CRITICAL: fullName must be the REAL name from the resume. licenses must have state abbreviations.`
        }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const responseText = data.content?.[0]?.text || "";
    
    let cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanJson = jsonMatch[0];
    
    const parsed = JSON.parse(cleanJson);
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to extract data" });
  }
}
