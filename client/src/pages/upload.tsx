import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { extractBiomarkersFromFile } from "@/lib/extract";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Loader2,
  User,
  CheckCircle2,
} from "lucide-react";

export default function UploadPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");

  // Fetch demo patient
  const { data: patient } = useQuery({
    queryKey: ["patient"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
  });

  // Fetch biomarker config for RAG classification
  const { data: biomarkerConfig } = useQuery({
    queryKey: ["biomarker-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biomarker_config")
        .select("*");
      if (error) return [];
      return data || [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsProcessing(true);

      // Step 1: Create lab_reports row first
      setProcessingStep("Creating report record...");
      const { data: report, error: insertError } = await supabase
        .from("lab_reports")
        .insert({
          patient_id: patient?.id || "00000000-0000-0000-0000-000000000001",
          file_name: file.name,
          extraction_status: "processing",
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Upload failed: ${insertError.message}`);
      }

      // Step 2: Extract biomarkers using Gemini (client-side)
      setProcessingStep("Extracting biomarkers with AI...");
      let extractedData;
      try {
        extractedData = await extractBiomarkersFromFile(file);
      } catch (err: any) {
        // Update status to failed
        await supabase
          .from("lab_reports")
          .update({ extraction_status: "failed" })
          .eq("id", report.id);
        throw new Error(`Extraction failed: ${err.message}`);
      }

      // Step 3: Classify biomarkers against config
      setProcessingStep("Classifying results...");
      const configMap = new Map<string, any>();
      if (biomarkerConfig) {
        for (const c of biomarkerConfig) {
          if (c.abbreviation) configMap.set(c.abbreviation.toLowerCase(), c);
          if (c.biomarker_name) configMap.set(c.biomarker_name.toLowerCase(), c);
        }
      }

      const biomarkers = extractedData.biomarkers || [];
      const results = [];

      for (const bm of biomarkers) {
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
            (bm.value < config.borderline_low || bm.value > config.borderline_high)
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

        results.push({
          report_id: report.id,
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
        });
      }

      // Step 4: Batch insert biomarker results
      setProcessingStep("Saving results...");
      if (results.length > 0) {
        const { error: bmInsertError } = await supabase
          .from("biomarker_results")
          .insert(results);

        if (bmInsertError) {
          console.error("Biomarker insert error:", bmInsertError);
        }
      }

      // Step 5: Update lab_reports with extraction data
      await supabase
        .from("lab_reports")
        .update({
          extraction_status: "completed",
          lab_name: extractedData.lab_name || null,
          report_date: extractedData.report_date || null,
          raw_extraction: JSON.stringify(extractedData),
        })
        .eq("id", report.id);

      return { reportId: report.id, biomarkerCount: results.length };
    },
    onSuccess: (data) => {
      setIsProcessing(false);
      toast({
        title: "Extraction complete",
        description: `Found ${data.biomarkerCount || 0} biomarkers`,
      });
      navigate(`/report/${data.reportId}`);
    },
    onError: (error: Error) => {
      setIsProcessing(false);
      setProcessingStep("");
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      const validTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
      ];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, JPG, or PNG file",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB",
          variant: "destructive",
        });
        return;
      }
      uploadMutation.mutate(file);
    },
    [uploadMutation, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#01696F' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: '#01696F' }} data-testid="text-brand">
              CalorieScience
            </h1>
            <p className="text-xs text-muted-foreground -mt-0.5">
              Biomarker Engine
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Upload Zone */}
        {!isProcessing ? (
          <div
            data-testid="dropzone-upload"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all
              ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              data-testid="input-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-base font-medium text-foreground">
                  Drop PDF or image here
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  or{" "}
                  <span className="text-primary font-medium underline underline-offset-2">
                    browse files
                  </span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                PDF, JPG, PNG · MAX 10MB
              </p>
            </div>
          </div>
        ) : (
          /* Processing Animation */
          <Card className="border-border" data-testid="card-processing">
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-base font-medium text-foreground">
                  {processingStep || "Processing..."}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  This may take a moment
                </p>
              </div>
              {/* Progress dots */}
              <div className="flex gap-1.5 mt-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary/40 animate-pulse"
                    style={{ animationDelay: `${i * 0.3}s` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Patient Card */}
        {patient && (
          <Card className="mt-8 border-border" data-testid="card-patient">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground" data-testid="text-patient-name">
                      {patient.full_name || patient.name}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Active
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Reports */}
        <RecentReports navigate={navigate} />
      </main>
    </div>
  );
}

function RecentReports({ navigate }: { navigate: (path: string) => void }) {
  const { data: reports } = useQuery({
    queryKey: ["recent-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return [];
      return data || [];
    },
  });

  if (!reports || reports.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Recent Reports
      </h2>
      <div className="space-y-2">
        {reports.map((report: any) => (
          <Card
            key={report.id}
            className="border-border hover:bg-muted/30 transition-colors cursor-pointer"
            data-testid={`card-report-${report.id}`}
            onClick={() => navigate(`/report/${report.id}`)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {report.file_name || "Lab Report"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {report.lab_name || "Unknown lab"} ·{" "}
                    {report.report_date || report.created_at?.slice(0, 10) || ""}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`text-xs ${
                  report.extraction_status === "completed"
                    ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                    : report.extraction_status === "processing"
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {report.extraction_status === "completed" && (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                )}
                {report.extraction_status || "pending"}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
