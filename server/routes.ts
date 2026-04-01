import type { Express } from "express";
import { createServer, type Server } from "http";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ecspoxppctlmtbchxipi.supabase.co";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjc3BveHBwY3RsbXRiY2h4aXBpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk4OTExNiwiZXhwIjoyMDkwNTY1MTE2fQ.0ImC_6uKzKwuHYZQxHtKJfANjqCF5QhTGNA4BNdskHA";
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "AIzaSyCnhR1v45eL6K1zIZRofuPVzT_ko3_LyZE";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // POST /api/extract-biomarkers
  app.post("/api/extract-biomarkers", async (req, res) => {
    try {
      const { reportId, filePath } = req.body;

      if (!reportId || !filePath) {
        return res.status(400).json({ error: "reportId and filePath required" });
      }

      // Step 1: Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from("lab-reports")
        .download(filePath);

      if (downloadError || !fileData) {
        console.error("Download error:", downloadError);
        await supabaseAdmin
          .from("lab_reports")
          .update({ extraction_status: "failed" })
          .eq("id", reportId);
        return res.status(500).json({ error: "Failed to download file" });
      }

      // Convert to base64
      const arrayBuffer = await fileData.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");

      // Determine mime type
      const ext = filePath.split(".").pop()?.toLowerCase();
      let mimeType = "application/pdf";
      if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
      else if (ext === "png") mimeType = "image/png";

      // Step 2: Call Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
                { text: EXTRACTION_PROMPT },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini error:", errorText);
        await supabaseAdmin
          .from("lab_reports")
          .update({ extraction_status: "failed" })
          .eq("id", reportId);
        return res.status(500).json({ error: "Gemini extraction failed" });
      }

      const geminiResult = await geminiResponse.json();

      // Parse Gemini response
      let extractedData;
      try {
        const textContent =
          geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
        // Try to parse directly, or extract JSON from markdown code blocks
        const jsonStr = textContent
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        extractedData = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error("Parse error:", parseErr);
        await supabaseAdmin
          .from("lab_reports")
          .update({
            extraction_status: "failed",
            raw_extraction: JSON.stringify(geminiResult),
          })
          .eq("id", reportId);
        return res.status(500).json({ error: "Failed to parse extraction" });
      }

      // Step 3: Fetch biomarker_config for RAG classification
      const { data: configData } = await supabaseAdmin
        .from("biomarker_config")
        .select("*");

      const configMap = new Map<string, any>();
      if (configData) {
        for (const c of configData) {
          configMap.set((c.abbreviation || "").toLowerCase(), c);
          configMap.set((c.biomarker_name || "").toLowerCase(), c);
        }
      }

      // Step 4: Classify and insert biomarker results
      const biomarkers = extractedData.biomarkers || [];
      const results = [];

      for (const bm of biomarkers) {
        // Try to match config
        const config =
          configMap.get((bm.abbreviation || "").toLowerCase()) ||
          configMap.get((bm.name || "").toLowerCase());

        let status = "normal";
        if (config && bm.value !== null && bm.value !== undefined) {
          if (
            config.critical_low !== null &&
            config.critical_high !== null &&
            (bm.value < config.critical_low || bm.value > config.critical_high)
          ) {
            status = "critical";
          } else if (
            config.borderline_low !== null &&
            config.borderline_high !== null &&
            (bm.value < config.borderline_low ||
              bm.value > config.borderline_high)
          ) {
            status = "borderline";
          } else if (
            config.optimal_low !== null &&
            config.optimal_high !== null &&
            bm.value >= config.optimal_low &&
            bm.value <= config.optimal_high
          ) {
            status = "normal";
          } else if (bm.flag === "H" || bm.flag === "L") {
            status = "borderline";
          }
        } else if (bm.flag === "H" || bm.flag === "L") {
          status = "borderline";
        }

        const row = {
          report_id: reportId,
          biomarker_name: bm.name,
          abbreviation: bm.abbreviation || null,
          value: bm.value ?? null,
          text_value: bm.text_value || null,
          unit: bm.unit || null,
          reference_range_low: bm.reference_range_low ?? null,
          reference_range_high: bm.reference_range_high ?? null,
          flag: bm.flag || null,
          category: bm.category || config?.category || null,
          status: status,
          confidence: bm.confidence ?? null,
        };

        results.push(row);
      }

      // Batch insert
      if (results.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("biomarker_results")
          .insert(results);

        if (insertError) {
          console.error("Insert error:", insertError);
        }
      }

      // Step 5: Update lab_reports
      await supabaseAdmin
        .from("lab_reports")
        .update({
          extraction_status: "completed",
          lab_name: extractedData.lab_name || null,
          report_date: extractedData.report_date || null,
          raw_extraction: JSON.stringify(extractedData),
        })
        .eq("id", reportId);

      return res.json({
        success: true,
        reportId: reportId,
        biomarkerCount: results.length,
        labName: extractedData.lab_name,
        reportDate: extractedData.report_date,
      });
    } catch (error: any) {
      console.error("Extraction error:", error);
      return res.status(500).json({ error: error.message || "Internal error" });
    }
  });

  return httpServer;
}
