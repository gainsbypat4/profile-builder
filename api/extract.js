export default async function handler(req, res) {
  // CORS headers
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
          content: `You are an expert healthcare staffing recruiter. Extract ALL structured data from this nurse resume. Be THOROUGH — do not miss any certifications, licenses, or work history entries.

CRITICAL RULES:
- Extract EVERY certification mentioned anywhere in the resume (BLS, ACLS, PALS, TNCC, CCRN, CNOR, CEN, NRP, ENPC, NIH Stroke Scale, AWHONN, RNC-OB, PCCN, OCN, MEDSURG-BC, etc.)
- Certifications can appear in headers, bullet points, after names, in skills sections, or anywhere else
- Extract EVERY license with state, type, compact status, and any license numbers/expiration dates
- Extract ALL work history entries with full details
- Look for charge nurse experience, preceptor experience, committee participation
- Identify the primary specialty from the most recent/prominent experience

Return ONLY valid JSON with this exact structure (no markdown, no backticks, no explanation):

{
  "personalInfo": {
    "fullName": "First Middle Last, Credentials",
    "phone": "(xxx) xxx-xxxx",
    "email": "email@example.com",
    "location": "City, State ZIP"
  },
  "licenses": [
    {
      "state": "XX",
      "type": "RN",
      "compact": true,
      "licenseNumber": "if found",
      "issueDate": "if found",
      "expirationDate": "if found"
    }
  ],
  "certifications": [
    {
      "name": "BLS",
      "issuingBody": "AHA",
      "certNumber": "if found",
      "issueDate": "if found",
      "expirationDate": "if found"
    }
  ],
  "education": {
    "degree": "BSN/MSN/ADN",
    "school": "University Name",
    "graduationDate": "Month Year"
  },
  "workHistory": [
    {
      "title": "Job Title — Unit Type",
      "facility": "Hospital/Facility Name",
      "city": "City",
      "state": "ST",
      "unit": "ICU/ER/Med-Surg/etc",
      "startDate": "Month Year",
      "endDate": "Month Year or Present",
      "responsibilities": ["responsibility 1", "responsibility 2"],
      "chargeExperience": true,
      "preceptorExperience": false
    }
  ],
  "yearsExperience": 6,
  "primarySpecialty": "ICU"
}

RESUME TEXT:
${resumeText}`
        }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("Claude API error:", data.error);
      return res.status(500).json({ error: data.error.message || "API error" });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.error("Unexpected API response:", JSON.stringify(data));
      return res.status(500).json({ error: "Empty response from AI" });
    }

    const responseText = data.content[0].text;
    
    // Clean JSON - remove any markdown backticks or extra text
    let cleanJson = responseText;
    
    // Remove ```json ... ``` wrapper if present
    const jsonMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      cleanJson = jsonMatch[1];
    }
    
    cleanJson = cleanJson.trim();
    
    // Try to find JSON object if there's extra text
    if (!cleanJson.startsWith('{')) {
      const firstBrace = cleanJson.indexOf('{');
      if (firstBrace !== -1) {
        cleanJson = cleanJson.substring(firstBrace);
      }
    }
    
    const parsed = JSON.parse(cleanJson);
    return res.status(200).json(parsed);
    
  } catch (error) {
    console.error("Extract function error:", error);
    return res.status(500).json({ 
      error: error.message || "Failed to extract data",
      details: error.toString()
    });
  }
}
