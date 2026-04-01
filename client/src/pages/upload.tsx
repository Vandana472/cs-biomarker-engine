import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Loader2,
  User,
  Calendar,
  Mail,
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

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsProcessing(true);

      // Step 1: Upload to Supabase Storage
      setProcessingStep("Uploading file...");
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("lab-reports")
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Step 2: Create lab_reports row
      setProcessingStep("Creating report record...");
      const { data: report, error: insertError } = await supabase
        .from("lab_reports")
        .insert({
          patient_id: patient?.id || 1,
          file_path: filePath,
          file_name: file.name,
          extraction_status: "processing",
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Insert failed: ${insertError.message}`);
      }

      // Step 3: Call server to extract biomarkers
      setProcessingStep("Extracting biomarkers...");
      const response = await apiRequest("POST", "/api/extract-biomarkers", {
        reportId: report.id,
        filePath: filePath,
      });

      const result = await response.json();
      return { reportId: report.id, ...result };
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
                      {patient.full_name}
                    </p>
                    <div className="flex items-center gap-4 mt-1.5">
                      {patient.date_of_birth && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {patient.date_of_birth}
                        </span>
                      )}
                      {patient.email && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="w-3.5 h-3.5" />
                          {patient.email}
                        </span>
                      )}
                    </div>
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
