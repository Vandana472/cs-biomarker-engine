import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ecspoxppctlmtbchxipi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjc3BveHBwY3RsbXRiY2h4aXBpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk4OTExNiwiZXhwIjoyMDkwNTY1MTE2fQ.0ImC_6uKzKwuHYZQxHtKJfANjqCF5QhTGNA4BNdskHA'
);

const sql = `
CREATE TABLE IF NOT EXISTS patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('M', 'F')),
  conditions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  upload_date TIMESTAMPTZ DEFAULT now(),
  extraction_status TEXT DEFAULT 'pending',
  extraction_confidence REAL,
  lab_provider TEXT,
  report_date DATE,
  raw_extraction JSONB
);

CREATE TABLE IF NOT EXISTS biomarker_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES lab_reports(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  biomarker_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  lab_ref_low REAL,
  lab_ref_high REAL,
  lab_flag TEXT,
  status TEXT CHECK (status IN ('green', 'amber', 'red')),
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS biomarker_config (
  biomarker_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  category TEXT NOT NULL,
  si_unit TEXT NOT NULL,
  conventional_unit TEXT,
  conversion_formula TEXT,
  is_derived BOOLEAN DEFAULT false,
  derivation_formula TEXT,
  input_biomarkers TEXT,
  direction TEXT,
  rag_classification_logic TEXT,
  fallback_threshold_rules TEXT,
  functional_optimal_low REAL,
  functional_optimal_high REAL,
  loinc_code TEXT,
  snomed_ct_code TEXT,
  nice_guideline TEXT,
  version TEXT DEFAULT '3.2'
);

CREATE TABLE IF NOT EXISTS frontend_display (
  tooltip_id TEXT PRIMARY KEY,
  biomarker_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  display_text TEXT NOT NULL,
  reference_url TEXT,
  reference_label TEXT,
  max_chars INTEGER,
  prohibited_claims TEXT,
  compliance_note TEXT
);

CREATE TABLE IF NOT EXISTS biomarker_to_nutrient (
  rule_id TEXT PRIMARY KEY,
  biomarker_name TEXT NOT NULL,
  biomarker_status TEXT,
  context TEXT,
  life_stage TEXT,
  sex TEXT,
  nutrient_name TEXT NOT NULL,
  relationship_type TEXT,
  nutrition_focus_note TEXT,
  evidence_source_id TEXT,
  evidence_strength TEXT,
  confidence_note TEXT
);

CREATE TABLE IF NOT EXISTS biomarker_to_food (
  rule_id TEXT PRIMARY KEY,
  biomarker_name TEXT NOT NULL,
  biomarker_status TEXT,
  context TEXT,
  food_name TEXT NOT NULL,
  food_group TEXT,
  nutrition_rationale TEXT,
  evidence_source_id TEXT,
  evidence_strength TEXT
);

CREATE TABLE IF NOT EXISTS biomarker_patterns (
  rule_id TEXT PRIMARY KEY,
  biomarker_pattern TEXT NOT NULL,
  nutrition_focus TEXT NOT NULL,
  nutrient_focus TEXT,
  diet_pattern TEXT,
  practical_note TEXT,
  evidence_source_id TEXT,
  evidence_strength TEXT
);

CREATE TABLE IF NOT EXISTS nutrient_interactions (
  rule_id TEXT PRIMARY KEY,
  nutrient_1 TEXT NOT NULL,
  nutrient_2 TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  practical_nutrition_note TEXT,
  food_pairing_or_timing_note TEXT,
  evidence_source_id TEXT,
  evidence_strength TEXT
);
`;

// Execute SQL statements one by one
const statements = sql.split(';').filter(s => s.trim().length > 0);

for (const stmt of statements) {
  const { error } = await supabase.rpc('exec_sql', { sql_text: stmt + ';' });
  if (error) {
    // rpc might not exist, try alternative
    console.log('RPC not available, trying direct...');
    break;
  }
}

// Test connection by trying to read from a table
const { data, error } = await supabase.from('patients').select('*').limit(1);
if (error && error.code === '42P01') {
  console.log('Tables not created yet — need SQL Editor approach');
  console.log('Generating SQL file for manual paste...');
} else if (error) {
  console.log('Connection works but:', error.message);
} else {
  console.log('Tables exist! Patients:', data);
}
