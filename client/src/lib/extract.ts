// Client-side biomarker extraction using Gemini API directly
// For prototype only — in production, move to a Supabase Edge Function

const GEMINI_API_KEY = 'AIzaSyCnhR1v45eL6K1zIZRofuPVzT_ko3_LyZE';

const EXTRACTION_PROMPT = `You are a medical data extraction system. Extract ALL blood test results from this UK lab report.
Return JSON only:
{
  "lab_name": "string or null",
  "report_date": "YYYY-MM-DD or null",
  "biomarkers": [
    {
      "name": "Full biomarker name as printed",
      "abbreviation": "e.g. TSH, HbA1c",
      "value": number,
      "unit": "unit as printed",
      "reference_range_low": number or null,
      "reference_range_high": number or null,
      "flag": "H or L or null",
      "category": "Diabetes or Thyroid or Lipids or Vitamins or Iron or Inflammation or Liver",
      "confidence": 0.0-1.0
    }
  ]
}
Rules: Extract ALL results. If non-numeric value, set value null and add text_value. Never guess.`;

export async function extractBiomarkersFromFile(file: File): Promise<{
  lab_name: string | null;
  report_date: string | null;
  biomarkers: any[];
}> {
  // Convert file to base64
  const arrayBuffer = await file.arrayBuffer();
  const base64Data = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  // Determine mime type
  let mimeType = 'application/pdf';
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') mimeType = 'image/jpeg';
  else if (file.type === 'image/png') mimeType = 'image/png';
  else if (file.type === 'application/pdf') mimeType = 'application/pdf';

  // Call Gemini API
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini extraction failed: ${errorText}`);
  }

  const result = await response.json();
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonStr = textContent
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(jsonStr);
}
