import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Info,
  Beaker,
  Apple,
  Activity,
  Zap,
  Loader2,
} from "lucide-react";

const CATEGORIES = [
  "All",
  "Diabetes",
  "Thyroid",
  "Lipids",
  "Vitamins",
  "Iron",
  "Inflammation",
  "Liver",
];

function classifyStatus(
  value: number | null,
  refLow: number | null,
  refHigh: number | null,
  flag: string | null
): "normal" | "borderline" | "critical" {
  if (value === null) return "normal";
  if (flag === "H" || flag === "L") {
    if (refLow !== null && refHigh !== null) {
      const range = refHigh - refLow;
      if (value > refHigh + range * 0.5 || value < refLow - range * 0.5) {
        return "critical";
      }
    }
    return "borderline";
  }
  if (refLow !== null && refHigh !== null) {
    if (value >= refLow && value <= refHigh) return "normal";
    const range = refHigh - refLow;
    if (range > 0) {
      if (value > refHigh + range * 0.3 || value < refLow - range * 0.3) {
        return "critical";
      }
    }
    return "borderline";
  }
  return "normal";
}

const statusConfig = {
  normal: {
    label: "Normal",
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-200 dark:border-green-800",
    icon: CheckCircle2,
    barColor: "#22C55E",
  },
  borderline: {
    label: "Borderline",
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    icon: AlertTriangle,
    barColor: "#F59E0B",
  },
  critical: {
    label: "Critical",
    bg: "bg-red-50 dark:bg-red-950",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    icon: AlertOctagon,
    barColor: "#EF4444",
  },
};

export default function ReportDashboard() {
  const [, params] = useRoute("/report/:id");
  const [, navigate] = useLocation();
  const reportId = params?.id;
  const [activeCategory, setActiveCategory] = useState("All");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Fetch biomarker results
  const { data: biomarkers, isLoading: loadingBiomarkers } = useQuery({
    queryKey: ["biomarkers", reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biomarker_results")
        .select("*")
        .eq("report_id", Number(reportId))
        .order("category", { ascending: true });
      if (error) return [];
      return data || [];
    },
    enabled: !!reportId,
  });

  // Fetch report info
  const { data: report } = useQuery({
    queryKey: ["report", reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_reports")
        .select("*")
        .eq("id", Number(reportId))
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!reportId,
  });

  // Fetch frontend display config
  const { data: displayConfig } = useQuery({
    queryKey: ["frontend-display"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("frontend_display")
        .select("*");
      if (error) return [];
      return data || [];
    },
  });

  // Fetch nutrient mappings
  const { data: nutrients } = useQuery({
    queryKey: ["biomarker-nutrients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biomarker_to_nutrient")
        .select("*");
      if (error) return [];
      return data || [];
    },
  });

  // Fetch food mappings
  const { data: foods } = useQuery({
    queryKey: ["biomarker-foods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biomarker_to_food")
        .select("*");
      if (error) return [];
      return data || [];
    },
  });

  // Fetch patterns
  const { data: patterns } = useQuery({
    queryKey: ["biomarker-patterns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("biomarker_patterns")
        .select("*");
      if (error) return [];
      return data || [];
    },
  });

  // Fetch nutrient interactions
  const { data: interactions } = useQuery({
    queryKey: ["nutrient-interactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrient_interactions")
        .select("*");
      if (error) return [];
      return data || [];
    },
  });

  // Classify biomarkers with status
  const classifiedBiomarkers = useMemo(() => {
    if (!biomarkers) return [];
    return biomarkers.map((b: any) => ({
      ...b,
      computed_status: b.status || classifyStatus(b.value, b.reference_range_low, b.reference_range_high, b.flag),
    }));
  }, [biomarkers]);

  // Filter by category
  const filteredBiomarkers = useMemo(() => {
    if (activeCategory === "All") return classifiedBiomarkers;
    return classifiedBiomarkers.filter(
      (b: any) => b.category === activeCategory
    );
  }, [classifiedBiomarkers, activeCategory]);

  // Summary counts
  const summary = useMemo(() => {
    const counts = { normal: 0, borderline: 0, critical: 0 };
    classifiedBiomarkers.forEach((b: any) => {
      const s = b.computed_status as keyof typeof counts;
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }, [classifiedBiomarkers]);

  // Pattern matching
  const matchedPatterns = useMemo(() => {
    if (!patterns || !classifiedBiomarkers.length) return [];
    const biomarkerNames = new Set(
      classifiedBiomarkers.map((b: any) =>
        (b.abbreviation || b.biomarker_name || "").toLowerCase()
      )
    );
    return patterns.filter((p: any) => {
      try {
        const involved = JSON.parse(p.biomarkers_involved || "[]");
        return involved.some((name: string) =>
          biomarkerNames.has(name.toLowerCase())
        );
      } catch {
        return false;
      }
    });
  }, [patterns, classifiedBiomarkers]);

  // Relevant interactions
  const relevantInteractions = useMemo(() => {
    if (!interactions || !nutrients || !classifiedBiomarkers.length) return [];
    const relevantNutrients = new Set(
      (nutrients || [])
        .filter((n: any) =>
          classifiedBiomarkers.some(
            (b: any) =>
              (b.biomarker_name || "").toLowerCase() ===
              (n.biomarker_name || "").toLowerCase()
          )
        )
        .map((n: any) => (n.nutrient_name || "").toLowerCase())
    );
    return interactions.filter(
      (i: any) =>
        relevantNutrients.has((i.nutrient_a || "").toLowerCase()) ||
        relevantNutrients.has((i.nutrient_b || "").toLowerCase())
    );
  }, [interactions, nutrients, classifiedBiomarkers]);

  // Get display config for a biomarker
  const getDisplay = (biomarkerName: string) => {
    if (!displayConfig) return null;
    return displayConfig.find(
      (d: any) =>
        (d.biomarker_name || "").toLowerCase() ===
        (biomarkerName || "").toLowerCase()
    );
  };

  // Get nutrients for a biomarker
  const getNutrients = (biomarkerName: string) => {
    if (!nutrients) return [];
    return nutrients.filter(
      (n: any) =>
        (n.biomarker_name || "").toLowerCase() ===
        (biomarkerName || "").toLowerCase()
    );
  };

  // Get foods for a biomarker
  const getFoods = (biomarkerName: string) => {
    if (!foods) return [];
    return foods.filter(
      (f: any) =>
        (f.biomarker_name || "").toLowerCase() ===
        (biomarkerName || "").toLowerCase()
    );
  };

  if (loadingBiomarkers) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex-1">
            <h1
              className="text-lg font-semibold"
              style={{ color: "#01696F" }}
              data-testid="text-brand-header"
            >
              CalorieScience
            </h1>
          </div>
          {report && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {report.lab_name || "Lab Report"} · {report.report_date || ""}
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8" data-testid="summary-cards">
          {(["normal", "borderline", "critical"] as const).map((status) => {
            const config = statusConfig[status];
            const Icon = config.icon;
            return (
              <Card
                key={status}
                className={`${config.bg} ${config.border} border`}
                data-testid={`card-summary-${status}`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 ${config.text}`}
                    strokeWidth={2}
                  />
                  <div>
                    <p className={`text-2xl font-bold ${config.text}`}>
                      {summary[status]}
                    </p>
                    <p className={`text-xs font-medium ${config.text} opacity-80`}>
                      {config.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-6" data-testid="category-filters">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              className="text-xs h-8"
              onClick={() => setActiveCategory(cat)}
              data-testid={`button-filter-${cat.toLowerCase()}`}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Biomarker Table */}
        <Card className="border-border mb-8" data-testid="card-biomarker-table">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Biomarker
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Current
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Ref Range
                  </th>
                  <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                    Status
                  </th>
                  <th className="w-8 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBiomarkers.map((biomarker: any) => {
                  const status = biomarker.computed_status as keyof typeof statusConfig;
                  const config = statusConfig[status];
                  const isExpanded = expandedRow === biomarker.id;
                  const display = getDisplay(biomarker.biomarker_name);
                  const bioNutrients = getNutrients(biomarker.biomarker_name);
                  const bioFoods = getFoods(biomarker.biomarker_name);

                  return (
                    <BiomarkerRow
                      key={biomarker.id}
                      biomarker={biomarker}
                      status={status}
                      config={config}
                      isExpanded={isExpanded}
                      onToggle={() =>
                        setExpandedRow(isExpanded ? null : biomarker.id)
                      }
                      display={display}
                      nutrients={bioNutrients}
                      foods={bioFoods}
                    />
                  );
                })}
                {filteredBiomarkers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                      {biomarkers?.length === 0
                        ? "No biomarkers found for this report"
                        : "No biomarkers in this category"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Pattern Insights */}
        {matchedPatterns.length > 0 && (
          <Card className="border-border mb-8" data-testid="card-patterns">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Pattern Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {matchedPatterns.map((pattern: any) => (
                <div
                  key={pattern.id}
                  className="p-4 rounded-lg bg-muted/30 border border-border"
                  data-testid={`pattern-${pattern.id}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {pattern.pattern_name}
                    </h3>
                    {pattern.severity && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          pattern.severity === "high"
                            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                            : pattern.severity === "medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                            : "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                        }`}
                      >
                        {pattern.severity}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pattern.description}
                  </p>
                  {pattern.recommendation && (
                    <p className="text-sm text-foreground mt-2">
                      <span className="font-medium">Recommendation:</span>{" "}
                      {pattern.recommendation}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Nutrient Interactions */}
        {relevantInteractions.length > 0 && (
          <Card className="border-border mb-8" data-testid="card-interactions">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Nutrient Interactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {relevantInteractions.map((interaction: any) => (
                  <div
                    key={interaction.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border"
                    data-testid={`interaction-${interaction.id}`}
                  >
                    <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {interaction.nutrient_a} ↔ {interaction.nutrient_b}
                        {interaction.interaction_type && (
                          <span className="text-muted-foreground font-normal ml-2">
                            ({interaction.interaction_type})
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {interaction.description}
                      </p>
                      {interaction.clinical_note && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          {interaction.clinical_note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Disclaimer */}
        <div className="text-center py-8 border-t border-border mt-8">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-disclaimer">
            Results are provided for informational purposes only and should not
            be used as a substitute for professional medical advice, diagnosis,
            or treatment. Always seek the advice of your physician or other
            qualified health provider with any questions you may have regarding a
            medical condition.
          </p>
        </div>
      </main>
    </div>
  );
}

// Biomarker Row Component
function BiomarkerRow({
  biomarker,
  status,
  config,
  isExpanded,
  onToggle,
  display,
  nutrients,
  foods,
}: {
  biomarker: any;
  status: "normal" | "borderline" | "critical";
  config: typeof statusConfig.normal;
  isExpanded: boolean;
  onToggle: () => void;
  display: any;
  nutrients: any[];
  foods: any[];
}) {
  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={onToggle}
        data-testid={`row-biomarker-${biomarker.id}`}
      >
        <td className="px-5 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">
              {display?.display_name || biomarker.biomarker_name}
            </p>
            {biomarker.abbreviation && (
              <p className="text-xs text-muted-foreground">
                {biomarker.abbreviation}
              </p>
            )}
          </div>
        </td>
        <td className="px-5 py-3.5 text-right">
          <span className="text-sm font-semibold text-foreground">
            {biomarker.value !== null ? biomarker.value : biomarker.text_value || "—"}
          </span>
          {biomarker.unit && (
            <span className="text-xs text-muted-foreground ml-1">
              {biomarker.unit}
            </span>
          )}
        </td>
        <td className="px-5 py-3.5 text-right">
          <span className="text-xs text-muted-foreground">
            {biomarker.reference_range_low !== null &&
            biomarker.reference_range_high !== null
              ? `${biomarker.reference_range_low} – ${biomarker.reference_range_high}`
              : "—"}
          </span>
        </td>
        <td className="px-5 py-3.5 text-center">
          <Badge
            variant="outline"
            className={`text-xs ${config.bg} ${config.text} ${config.border}`}
          >
            {config.label}
          </Badge>
        </td>
        <td className="px-3 py-3.5">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr className="border-b border-border" data-testid={`detail-biomarker-${biomarker.id}`}>
          <td colSpan={5} className="px-5 py-5 bg-muted/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* LEFT: Reference range bar */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Reference Range
                </h4>
                <RangeBar
                  value={biomarker.value}
                  low={biomarker.reference_range_low}
                  high={biomarker.reference_range_high}
                  status={status}
                />
              </div>

              {/* MIDDLE: Nutrition focus */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Beaker className="w-3.5 h-3.5" />
                  Nutrition Focus
                </h4>
                {nutrients.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1.5">
                      Key nutrients
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {nutrients.map((n: any, i: number) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-xs"
                        >
                          {n.nutrient_name}
                          {n.direction && (
                            <span className="ml-1 opacity-60">
                              {n.direction === "increase" ? "↑" : "↓"}
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {foods.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Apple className="w-3 h-3" />
                      Recommended foods
                    </p>
                    <ul className="space-y-1">
                      {foods.map((f: any, i: number) => (
                        <li
                          key={i}
                          className="text-xs text-foreground flex items-start gap-1.5"
                        >
                          <span className="text-primary mt-0.5">•</span>
                          <span>
                            {f.food_name}
                            {f.rationale && (
                              <span className="text-muted-foreground ml-1">
                                — {f.rationale}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {nutrients.length === 0 && foods.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No nutrition data available
                  </p>
                )}
              </div>

              {/* RIGHT: Monitoring + tooltip */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Monitoring
                </h4>
                {display?.monitoring_note ? (
                  <p className="text-xs text-foreground leading-relaxed">
                    {display.monitoring_note}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No monitoring notes available
                  </p>
                )}
                {display?.compliant_tooltip && (
                  <div className="mt-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <Info className="w-3 h-3" />
                          Compliance info
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="max-w-[280px] text-xs"
                      >
                        {display.compliant_tooltip}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Range Bar visualization
function RangeBar({
  value,
  low,
  high,
  status,
}: {
  value: number | null;
  low: number | null;
  high: number | null;
  status: "normal" | "borderline" | "critical";
}) {
  if (value === null || low === null || high === null) {
    return (
      <p className="text-xs text-muted-foreground">No range data available</p>
    );
  }

  const range = high - low;
  const margin = range * 0.4;
  const barMin = low - margin;
  const barMax = high + margin;
  const barRange = barMax - barMin;

  // Calculate positions as percentages
  const greenStart = ((low - barMin) / barRange) * 100;
  const greenEnd = ((high - barMin) / barRange) * 100;
  const valuePos = Math.max(0, Math.min(100, ((value - barMin) / barRange) * 100));

  const markerColor =
    status === "normal"
      ? "#22C55E"
      : status === "borderline"
      ? "#F59E0B"
      : "#EF4444";

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="relative h-6 rounded-full overflow-hidden bg-muted/50">
        {/* Red zone left */}
        <div
          className="absolute top-0 bottom-0 bg-red-200 dark:bg-red-900/40"
          style={{ left: 0, width: `${greenStart * 0.5}%` }}
        />
        {/* Amber zone left */}
        <div
          className="absolute top-0 bottom-0 bg-amber-200 dark:bg-amber-900/40"
          style={{ left: `${greenStart * 0.5}%`, width: `${greenStart * 0.5}%` }}
        />
        {/* Green zone */}
        <div
          className="absolute top-0 bottom-0 bg-green-200 dark:bg-green-900/40"
          style={{ left: `${greenStart}%`, width: `${greenEnd - greenStart}%` }}
        />
        {/* Amber zone right */}
        <div
          className="absolute top-0 bottom-0 bg-amber-200 dark:bg-amber-900/40"
          style={{
            left: `${greenEnd}%`,
            width: `${(100 - greenEnd) * 0.5}%`,
          }}
        />
        {/* Red zone right */}
        <div
          className="absolute top-0 bottom-0 bg-red-200 dark:bg-red-900/40"
          style={{
            left: `${greenEnd + (100 - greenEnd) * 0.5}%`,
            width: `${(100 - greenEnd) * 0.5}%`,
          }}
        />
        {/* Value marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{
            left: `${valuePos}%`,
            backgroundColor: markerColor,
          }}
        >
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900"
            style={{ backgroundColor: markerColor }}
          />
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{low}</span>
        <span className="font-medium" style={{ color: markerColor }}>
          {value}
        </span>
        <span>{high}</span>
      </div>
    </div>
  );
}
