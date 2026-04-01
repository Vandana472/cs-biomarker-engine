import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Patients
export const patients = sqliteTable("patients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  full_name: text("full_name").notNull(),
  date_of_birth: text("date_of_birth"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  created_at: text("created_at"),
});

export const insertPatientSchema = createInsertSchema(patients).omit({ id: true, created_at: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

// Lab Reports
export const lab_reports = sqliteTable("lab_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patient_id: integer("patient_id"),
  file_path: text("file_path"),
  file_name: text("file_name"),
  lab_name: text("lab_name"),
  report_date: text("report_date"),
  extraction_status: text("extraction_status").default("pending"),
  raw_extraction: text("raw_extraction"),
  created_at: text("created_at"),
});

export const insertLabReportSchema = createInsertSchema(lab_reports).omit({ id: true, created_at: true });
export type InsertLabReport = z.infer<typeof insertLabReportSchema>;
export type LabReport = typeof lab_reports.$inferSelect;

// Biomarker Results
export const biomarker_results = sqliteTable("biomarker_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  report_id: integer("report_id"),
  biomarker_name: text("biomarker_name").notNull(),
  abbreviation: text("abbreviation"),
  value: real("value"),
  text_value: text("text_value"),
  unit: text("unit"),
  reference_range_low: real("reference_range_low"),
  reference_range_high: real("reference_range_high"),
  flag: text("flag"),
  category: text("category"),
  status: text("status"),
  confidence: real("confidence"),
  created_at: text("created_at"),
});

export const insertBiomarkerResultSchema = createInsertSchema(biomarker_results).omit({ id: true, created_at: true });
export type InsertBiomarkerResult = z.infer<typeof insertBiomarkerResultSchema>;
export type BiomarkerResult = typeof biomarker_results.$inferSelect;

// Biomarker Config (reference ranges for RAG classification)
export const biomarker_config = sqliteTable("biomarker_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  biomarker_name: text("biomarker_name").notNull(),
  abbreviation: text("abbreviation"),
  unit: text("unit"),
  optimal_low: real("optimal_low"),
  optimal_high: real("optimal_high"),
  borderline_low: real("borderline_low"),
  borderline_high: real("borderline_high"),
  critical_low: real("critical_low"),
  critical_high: real("critical_high"),
  category: text("category"),
});

export type BiomarkerConfig = typeof biomarker_config.$inferSelect;

// Frontend Display
export const frontend_display = sqliteTable("frontend_display", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  biomarker_name: text("biomarker_name").notNull(),
  display_name: text("display_name"),
  description: text("description"),
  monitoring_note: text("monitoring_note"),
  compliant_tooltip: text("compliant_tooltip"),
  icon: text("icon"),
  sort_order: integer("sort_order"),
});

export type FrontendDisplay = typeof frontend_display.$inferSelect;

// Biomarker to Nutrient mapping
export const biomarker_to_nutrient = sqliteTable("biomarker_to_nutrient", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  biomarker_name: text("biomarker_name").notNull(),
  nutrient_name: text("nutrient_name").notNull(),
  relevance: text("relevance"),
  direction: text("direction"),
});

export type BiomarkerToNutrient = typeof biomarker_to_nutrient.$inferSelect;

// Biomarker to Food mapping
export const biomarker_to_food = sqliteTable("biomarker_to_food", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  biomarker_name: text("biomarker_name").notNull(),
  food_name: text("food_name").notNull(),
  rationale: text("rationale"),
});

export type BiomarkerToFood = typeof biomarker_to_food.$inferSelect;

// Biomarker Patterns
export const biomarker_patterns = sqliteTable("biomarker_patterns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern_name: text("pattern_name").notNull(),
  description: text("description"),
  biomarkers_involved: text("biomarkers_involved"), // JSON text
  condition: text("condition"),
  recommendation: text("recommendation"),
  severity: text("severity"),
});

export type BiomarkerPattern = typeof biomarker_patterns.$inferSelect;

// Nutrient Interactions
export const nutrient_interactions = sqliteTable("nutrient_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nutrient_a: text("nutrient_a").notNull(),
  nutrient_b: text("nutrient_b").notNull(),
  interaction_type: text("interaction_type"),
  description: text("description"),
  clinical_note: text("clinical_note"),
});

export type NutrientInteraction = typeof nutrient_interactions.$inferSelect;
