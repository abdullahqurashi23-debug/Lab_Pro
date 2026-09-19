// Seed data for a general diagnostic laboratory: 10 categories and 50
// common tests with realistic parameters, units, and adult reference
// ranges. Prices are left at 0 — fill them in from Settings, or bulk
// import real prices via Settings > Test Catalog > Import from Excel.
//
// Ranges are the commonly-cited adult reference intervals used for
// teaching/reference purposes; a real lab should confirm ranges against
// its own analyzer/reagent documentation before relying on them clinically.

import type { InputType } from './repositories/types';

export interface SeedParam {
  name: string;
  // Formula-friendly short identifier (e.g. "TC"). Auto-derived from `name`
  // in seed.ts when omitted — only set explicitly where a formula elsewhere
  // needs to reference this exact parameter (see Lipid Profile below).
  code?: string;
  unit?: string;
  input_type?: InputType;
  decimals?: number;
  maleLow?: number;
  maleHigh?: number;
  femaleLow?: number;
  femaleHigh?: number;
  childLow?: number;
  childHigh?: number;
  refText?: string;
  criticalLow?: number;
  criticalHigh?: number;
  dropdownOptions?: string[];
  formula?: string;
}

export interface SeedTest {
  category: string;
  name: string;
  short_code: string;
  sample_type: string;
  parameters: SeedParam[];
}

export const CATEGORIES = [
  'Hematology',
  'Biochemistry',
  'Liver Function',
  'Renal Function',
  'Lipid Profile',
  'Diabetes',
  'Thyroid & Hormones',
  'Cardiac Markers',
  'Serology & Immunology',
  'Clinical Pathology',
  'Microbiology',
  'Histopathology & Cytology',
  'Electrolytes & Minerals',
];

const num = (name: string, unit: string, r: Partial<SeedParam> = {}): SeedParam => ({
  name,
  unit,
  input_type: 'NUMBER',
  ...r,
});
const text = (name: string, refText: string): SeedParam => ({ name, input_type: 'TEXT', refText });
const dropdown = (name: string, options: string[], refText = ''): SeedParam => ({
  name,
  input_type: 'DROPDOWN',
  dropdownOptions: options,
  refText,
});
const formula = (name: string, unit: string, expr: string, r: Partial<SeedParam> = {}): SeedParam => ({
  name,
  unit,
  input_type: 'FORMULA',
  formula: expr,
  ...r,
});

export const TESTS: SeedTest[] = [
  // ---------- Hematology ----------
  {
    category: 'Hematology',
    name: 'Complete Blood Count',
    short_code: 'CBC',
    sample_type: 'EDTA Blood',
    parameters: [
      num('Hemoglobin', 'g/dL', { maleLow: 13.5, maleHigh: 17.5, femaleLow: 12.0, femaleHigh: 15.5, childLow: 11.0, childHigh: 14.0 }),
      num('WBC Count', 'x10^3/uL', { maleLow: 4.0, maleHigh: 11.0, femaleLow: 4.0, femaleHigh: 11.0 }),
      num('RBC Count', 'x10^6/uL', { maleLow: 4.5, maleHigh: 5.9, femaleLow: 4.0, femaleHigh: 5.2 }),
      num('Platelet Count', 'x10^3/uL', { maleLow: 150, maleHigh: 450, femaleLow: 150, femaleHigh: 450 }),
      num('Hematocrit', '%', { maleLow: 40, maleHigh: 52, femaleLow: 36, femaleHigh: 48 }),
      num('MCV', 'fL', { maleLow: 80, maleHigh: 100, femaleLow: 80, femaleHigh: 100 }),
      num('MCH', 'pg', { maleLow: 27, maleHigh: 33, femaleLow: 27, femaleHigh: 33 }),
      num('MCHC', 'g/dL', { maleLow: 32, maleHigh: 36, femaleLow: 32, femaleHigh: 36 }),
      num('Red Cell Distribution Width', '%', { code: 'RDW', maleLow: 11.5, maleHigh: 14.5, femaleLow: 11.5, femaleHigh: 14.5, decimals: 1 }),
      num('Mean Platelet Volume', 'fL', { code: 'MPV', maleLow: 7.5, maleHigh: 11.5, femaleLow: 7.5, femaleHigh: 11.5 }),
    ],
  },
  {
    category: 'Hematology',
    name: 'Hemoglobin',
    short_code: 'Hb',
    sample_type: 'EDTA Blood',
    parameters: [num('Hemoglobin', 'g/dL', { code: 'HGB', maleLow: 13.5, maleHigh: 17.5, femaleLow: 12.0, femaleHigh: 15.5, childLow: 11.0, childHigh: 14.0 })],
  },
  {
    category: 'Hematology',
    name: 'Hematocrit / Packed Cell Volume',
    short_code: 'HCT',
    sample_type: 'EDTA Blood',
    parameters: [num('Hematocrit', '%', { code: 'PCV', maleLow: 40, maleHigh: 52, femaleLow: 36, femaleHigh: 48 })],
  },
  {
    category: 'Hematology',
    name: 'Red Blood Cell Count',
    short_code: 'RBC',
    sample_type: 'EDTA Blood',
    parameters: [num('RBC Count', 'x10^6/uL', { maleLow: 4.5, maleHigh: 5.9, femaleLow: 4.0, femaleHigh: 5.2 })],
  },
  {
    category: 'Hematology',
    name: 'White Blood Cell Count',
    short_code: 'WBC',
    sample_type: 'EDTA Blood',
    parameters: [num('WBC Count', 'x10^3/uL', { code: 'TLC', maleLow: 4.0, maleHigh: 11.0, femaleLow: 4.0, femaleHigh: 11.0 })],
  },
  {
    category: 'Hematology',
    name: 'Differential Leukocyte Count',
    short_code: 'DLC',
    sample_type: 'EDTA Blood',
    parameters: [
      num('Neutrophils', '%', { code: 'NEU', maleLow: 40, maleHigh: 75, femaleLow: 40, femaleHigh: 75 }),
      num('Lymphocytes', '%', { code: 'LYM', maleLow: 20, maleHigh: 45, femaleLow: 20, femaleHigh: 45 }),
      num('Monocytes', '%', { code: 'MONO', maleLow: 2, maleHigh: 10, femaleLow: 2, femaleHigh: 10 }),
      num('Eosinophils', '%', { code: 'EOS', maleLow: 1, maleHigh: 6, femaleLow: 1, femaleHigh: 6 }),
      num('Basophils', '%', { code: 'BASO', maleLow: 0, maleHigh: 2, femaleLow: 0, femaleHigh: 2 }),
      num('Absolute Eosinophil Count', '/uL', { code: 'AEC', maleLow: 40, maleHigh: 500, femaleLow: 40, femaleHigh: 500 }),
    ],
  },
  {
    category: 'Hematology',
    name: 'Erythrocyte Sedimentation Rate',
    short_code: 'ESR',
    sample_type: 'EDTA Blood',
    parameters: [num('ESR', 'mm/hr', { maleLow: 0, maleHigh: 15, femaleLow: 0, femaleHigh: 20 })],
  },
  {
    category: 'Hematology',
    name: 'Prothrombin Time',
    short_code: 'PT',
    sample_type: 'Citrated Plasma',
    parameters: [
      num('Prothrombin Time', 'sec', { maleLow: 11, maleHigh: 13.5, femaleLow: 11, femaleHigh: 13.5 }),
      num('INR', '', { maleLow: 0.8, maleHigh: 1.1, femaleLow: 0.8, femaleHigh: 1.1, decimals: 1 }),
    ],
  },
  {
    category: 'Hematology',
    name: 'Activated Partial Thromboplastin Time',
    short_code: 'APTT',
    sample_type: 'Citrated Plasma',
    parameters: [num('APTT', 'sec', { maleLow: 25, maleHigh: 35, femaleLow: 25, femaleHigh: 35 })],
  },
  {
    category: 'Hematology',
    name: 'Bleeding Time',
    short_code: 'BT',
    sample_type: 'Whole Blood',
    parameters: [num('Bleeding Time', 'min', { maleLow: 2, maleHigh: 7, femaleLow: 2, femaleHigh: 7 })],
  },
  {
    category: 'Hematology',
    name: 'Clotting Time',
    short_code: 'CT',
    sample_type: 'Whole Blood',
    parameters: [num('Clotting Time', 'min', { maleLow: 5, maleHigh: 15, femaleLow: 5, femaleHigh: 15 })],
  },
  {
    category: 'Hematology',
    name: 'Reticulocyte Count',
    short_code: 'RETIC',
    sample_type: 'EDTA Blood',
    parameters: [num('Reticulocyte Count', '%', { maleLow: 0.5, maleHigh: 2.5, femaleLow: 0.5, femaleHigh: 2.5, decimals: 1 })],
  },
  {
    category: 'Hematology',
    name: 'Blood Group & Rh Type',
    short_code: 'BG',
    sample_type: 'EDTA Blood',
    parameters: [dropdown('Blood Group', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])],
  },
  {
    category: 'Hematology',
    name: 'Fibrinogen',
    short_code: 'FIB',
    sample_type: 'Citrated Plasma',
    parameters: [num('Fibrinogen', 'mg/dL', { maleLow: 200, maleHigh: 400, femaleLow: 200, femaleHigh: 400 })],
  },

  // ---------- Biochemistry ----------
  { category: 'Biochemistry', name: 'Blood Urea', short_code: 'UREA', sample_type: 'Serum', parameters: [num('Blood Urea', 'mg/dL', { maleLow: 15, maleHigh: 40, femaleLow: 15, femaleHigh: 40 })] },
  { category: 'Biochemistry', name: 'Blood Urea Nitrogen', short_code: 'BUN', sample_type: 'Serum', parameters: [num('BUN', 'mg/dL', { maleLow: 7, maleHigh: 20, femaleLow: 7, femaleHigh: 20 })] },
  {
    category: 'Biochemistry',
    name: 'Serum Creatinine',
    short_code: 'S.CREAT',
    sample_type: 'Serum',
    parameters: [num('Creatinine', 'mg/dL', { code: 'CRE', maleLow: 0.7, maleHigh: 1.3, femaleLow: 0.6, femaleHigh: 1.1, decimals: 2 })],
  },
  {
    category: 'Biochemistry',
    name: 'Serum Uric Acid',
    short_code: 'UA',
    sample_type: 'Serum',
    parameters: [num('Uric Acid', 'mg/dL', { maleLow: 3.5, maleHigh: 7.2, femaleLow: 2.6, femaleHigh: 6.0 })],
  },
  { category: 'Biochemistry', name: 'Total Protein', short_code: 'TP', sample_type: 'Serum', parameters: [num('Total Protein', 'g/dL', { code: 'TP', maleLow: 6.0, maleHigh: 8.3, femaleLow: 6.0, femaleHigh: 8.3 })] },
  { category: 'Biochemistry', name: 'Albumin', short_code: 'ALB', sample_type: 'Serum', parameters: [num('Albumin', 'g/dL', { code: 'ALB', maleLow: 3.5, maleHigh: 5.0, femaleLow: 3.5, femaleHigh: 5.0 })] },
  { category: 'Biochemistry', name: 'Globulin', short_code: 'GLOB', sample_type: 'Serum', parameters: [num('Globulin', 'g/dL', { code: 'GLOB', maleLow: 2.0, maleHigh: 3.5, femaleLow: 2.0, femaleHigh: 3.5 })] },
  { category: 'Biochemistry', name: 'Amylase', short_code: 'AMY', sample_type: 'Serum', parameters: [num('Amylase', 'U/L', { maleLow: 28, maleHigh: 100, femaleLow: 28, femaleHigh: 100 })] },
  { category: 'Biochemistry', name: 'Lipase', short_code: 'LIP', sample_type: 'Serum', parameters: [num('Lipase', 'U/L', { maleLow: 13, maleHigh: 60, femaleLow: 13, femaleHigh: 60 })] },
  { category: 'Biochemistry', name: 'Total Iron Binding Capacity', short_code: 'TIBC', sample_type: 'Serum', parameters: [num('TIBC', 'ug/dL', { maleLow: 250, maleHigh: 450, femaleLow: 250, femaleHigh: 450 })] },
  { category: 'Biochemistry', name: 'Folic Acid', short_code: 'FOLATE', sample_type: 'Serum', parameters: [num('Folic Acid', 'ng/mL', { maleLow: 2.7, maleHigh: 17.0, femaleLow: 2.7, femaleHigh: 17.0 })] },
  { category: 'Biochemistry', name: 'High Sensitivity CRP', short_code: 'hs-CRP', sample_type: 'Serum', parameters: [num('hs-CRP', 'mg/L', { maleHigh: 3.0, femaleHigh: 3.0, decimals: 2, refText: '<1.0 Low risk, 1-3 Average, >3 High risk' })] },
  {
    category: 'Biochemistry',
    name: 'Arterial Blood Gas',
    short_code: 'ABG',
    sample_type: 'Arterial Blood',
    parameters: [
      num('pH', '', { code: 'PH', maleLow: 7.35, maleHigh: 7.45, femaleLow: 7.35, femaleHigh: 7.45, decimals: 2 }),
      num('pCO2', 'mmHg', { code: 'PCO2', maleLow: 35, maleHigh: 45, femaleLow: 35, femaleHigh: 45 }),
      num('pO2', 'mmHg', { code: 'PO2', maleLow: 80, maleHigh: 100, femaleLow: 80, femaleHigh: 100 }),
      num('Bicarbonate', 'mmol/L', { code: 'HCO3', maleLow: 22, maleHigh: 26, femaleLow: 22, femaleHigh: 26 }),
      num('Oxygen Saturation', '%', { code: 'SO2', maleLow: 95, maleHigh: 100, femaleLow: 95, femaleHigh: 100 }),
    ],
  },

  // ---------- Liver Function ----------
  {
    category: 'Liver Function',
    name: 'Liver Function Test',
    short_code: 'LFT',
    sample_type: 'Serum',
    parameters: [
      num('Total Bilirubin', 'mg/dL', { code: 'TBIL', maleLow: 0.2, maleHigh: 1.2, femaleLow: 0.2, femaleHigh: 1.2 }),
      num('Direct Bilirubin', 'mg/dL', { code: 'DBIL', maleLow: 0.0, maleHigh: 0.3, femaleLow: 0.0, femaleHigh: 0.3 }),
      formula('Indirect Bilirubin', 'mg/dL', 'TBIL - DBIL', { code: 'IBIL', maleLow: 0.2, maleHigh: 0.9, femaleLow: 0.2, femaleHigh: 0.9 }),
      num('SGOT (AST)', 'U/L', { code: 'AST', maleLow: 5, maleHigh: 40, femaleLow: 5, femaleHigh: 40 }),
      num('SGPT (ALT)', 'U/L', { code: 'ALT', maleLow: 7, maleHigh: 56, femaleLow: 7, femaleHigh: 56 }),
      num('Alkaline Phosphatase', 'U/L', { code: 'ALP', maleLow: 44, maleHigh: 147, femaleLow: 44, femaleHigh: 147 }),
      num('Gamma Glutamyl Transferase', 'U/L', { code: 'GGT', maleLow: 8, maleHigh: 61, femaleLow: 5, femaleHigh: 36 }),
      num('Total Protein', 'g/dL', { code: 'TP', maleLow: 6.0, maleHigh: 8.3, femaleLow: 6.0, femaleHigh: 8.3 }),
      num('Albumin', 'g/dL', { code: 'ALB', maleLow: 3.5, maleHigh: 5.0, femaleLow: 3.5, femaleHigh: 5.0 }),
      num('Globulin', 'g/dL', { code: 'GLOB', maleLow: 2.0, maleHigh: 3.5, femaleLow: 2.0, femaleHigh: 3.5 }),
      formula('Albumin/Globulin Ratio', '', 'ALB / GLOB', { code: 'AG', maleLow: 1.1, maleHigh: 2.5, femaleLow: 1.1, femaleHigh: 2.5, decimals: 2 }),
    ],
  },
  { category: 'Liver Function', name: 'Hepatitis B Surface Antigen', short_code: 'HBsAg', sample_type: 'Serum', parameters: [dropdown('HBsAg', ['Negative', 'Positive'])] },
  { category: 'Liver Function', name: 'Hepatitis C Antibody', short_code: 'Anti-HCV', sample_type: 'Serum', parameters: [dropdown('Anti-HCV', ['Negative', 'Positive'])] },

  // ---------- Renal Function ----------
  {
    category: 'Renal Function',
    name: 'Renal Function Test',
    short_code: 'RFT',
    sample_type: 'Serum',
    parameters: [
      num('Blood Urea', 'mg/dL', { maleLow: 15, maleHigh: 40, femaleLow: 15, femaleHigh: 40 }),
      num('Creatinine', 'mg/dL', { maleLow: 0.7, maleHigh: 1.3, femaleLow: 0.6, femaleHigh: 1.1, decimals: 2 }),
      num('Uric Acid', 'mg/dL', { maleLow: 3.5, maleHigh: 7.2, femaleLow: 2.6, femaleHigh: 6.0 }),
      num('Sodium', 'mmol/L', { maleLow: 135, maleHigh: 145, femaleLow: 135, femaleHigh: 145 }),
      num('Potassium', 'mmol/L', { maleLow: 3.5, maleHigh: 5.1, femaleLow: 3.5, femaleHigh: 5.1, decimals: 1, criticalLow: 2.5, criticalHigh: 6.5 }),
    ],
  },
  { category: 'Renal Function', name: 'Estimated GFR', short_code: 'eGFR', sample_type: 'Serum', parameters: [num('eGFR', 'mL/min/1.73m2', { maleLow: 90, femaleLow: 90 })] },

  // ---------- Lipid Profile ----------
  {
    category: 'Lipid Profile',
    name: 'Lipid Profile',
    short_code: 'LIPID',
    sample_type: 'Serum (Fasting)',
    parameters: [
      num('Total Cholesterol', 'mg/dL', { code: 'TC', maleHigh: 200, femaleHigh: 200 }),
      num('Triglycerides', 'mg/dL', { code: 'TG', maleHigh: 150, femaleHigh: 150 }),
      num('HDL Cholesterol', 'mg/dL', { code: 'HDL', maleLow: 40, femaleLow: 50 }),
      formula('LDL Cholesterol', 'mg/dL', 'TC - HDL - (TG / 5)', { code: 'LDL', maleHigh: 100, femaleHigh: 100 }),
      formula('VLDL Cholesterol', 'mg/dL', 'TG / 5', { code: 'VLDL', maleLow: 5, maleHigh: 40, femaleLow: 5, femaleHigh: 40 }),
    ],
  },

  // ---------- Diabetes ----------
  { category: 'Diabetes', name: 'Fasting Blood Sugar', short_code: 'FBS', sample_type: 'Fluoride Plasma', parameters: [num('FBS', 'mg/dL', { maleLow: 70, maleHigh: 100, femaleLow: 70, femaleHigh: 100 })] },
  { category: 'Diabetes', name: 'Random Blood Sugar', short_code: 'RBS', sample_type: 'Fluoride Plasma', parameters: [num('RBS', 'mg/dL', { maleLow: 70, maleHigh: 140, femaleLow: 70, femaleHigh: 140 })] },
  { category: 'Diabetes', name: 'Post Prandial Blood Sugar', short_code: 'PPBS', sample_type: 'Fluoride Plasma', parameters: [num('PPBS', 'mg/dL', { maleLow: 70, maleHigh: 140, femaleLow: 70, femaleHigh: 140 })] },
  { category: 'Diabetes', name: 'Glycated Hemoglobin', short_code: 'HbA1c', sample_type: 'EDTA Blood', parameters: [num('HbA1c', '%', { maleHigh: 5.7, femaleHigh: 5.7, decimals: 1 })] },

  // ---------- Thyroid & Hormones ----------
  {
    category: 'Thyroid & Hormones',
    name: 'Thyroid Profile',
    short_code: 'TFT',
    sample_type: 'Serum',
    parameters: [
      num('TSH', 'uIU/mL', { code: 'TSH', maleLow: 0.4, maleHigh: 4.0, femaleLow: 0.4, femaleHigh: 4.0, decimals: 2 }),
      num('T3', 'ng/dL', { code: 'T3', maleLow: 80, maleHigh: 200, femaleLow: 80, femaleHigh: 200 }),
      num('T4', 'ug/dL', { code: 'T4', maleLow: 5.0, maleHigh: 12.0, femaleLow: 5.0, femaleHigh: 12.0 }),
    ],
  },
  { category: 'Thyroid & Hormones', name: 'Free T3', short_code: 'FT3', sample_type: 'Serum', parameters: [num('Free T3', 'pg/mL', { maleLow: 2.3, maleHigh: 4.2, femaleLow: 2.3, femaleHigh: 4.2 })] },
  { category: 'Thyroid & Hormones', name: 'Free T4', short_code: 'FT4', sample_type: 'Serum', parameters: [num('Free T4', 'ng/dL', { maleLow: 0.8, maleHigh: 1.8, femaleLow: 0.8, femaleHigh: 1.8 })] },
  { category: 'Thyroid & Hormones', name: 'Beta Human Chorionic Gonadotropin', short_code: 'β-hCG', sample_type: 'Serum', parameters: [num('Beta-hCG', 'mIU/mL', { femaleHigh: 5, refText: '<5 Negative' })] },
  { category: 'Thyroid & Hormones', name: 'Prolactin', short_code: 'PRL', sample_type: 'Serum', parameters: [num('Prolactin', 'ng/mL', { maleLow: 2, maleHigh: 18, femaleLow: 2, femaleHigh: 29 })] },
  { category: 'Thyroid & Hormones', name: 'Follicle Stimulating Hormone', short_code: 'FSH', sample_type: 'Serum', parameters: [num('FSH', 'mIU/mL', { maleLow: 1.5, maleHigh: 12.4, femaleLow: 1.4, femaleHigh: 18.1 })] },
  { category: 'Thyroid & Hormones', name: 'Luteinizing Hormone', short_code: 'LH', sample_type: 'Serum', parameters: [num('LH', 'mIU/mL', { maleLow: 1.7, maleHigh: 8.6, femaleLow: 1.9, femaleHigh: 12.5 })] },
  { category: 'Thyroid & Hormones', name: 'Estradiol', short_code: 'E2', sample_type: 'Serum', parameters: [num('Estradiol', 'pg/mL', { femaleLow: 15, femaleHigh: 350, refText: 'Varies with cycle phase' })] },
  { category: 'Thyroid & Hormones', name: 'Progesterone', short_code: 'PROG', sample_type: 'Serum', parameters: [num('Progesterone', 'ng/mL', { femaleLow: 0.1, femaleHigh: 25, refText: 'Varies with cycle phase' })] },
  { category: 'Thyroid & Hormones', name: 'Testosterone', short_code: 'TESTO', sample_type: 'Serum', parameters: [num('Testosterone', 'ng/dL', { maleLow: 280, maleHigh: 1100, femaleLow: 15, femaleHigh: 70 })] },
  { category: 'Thyroid & Hormones', name: 'Cortisol', short_code: 'CORT', sample_type: 'Serum', parameters: [num('Cortisol', 'ug/dL', { maleLow: 6.2, maleHigh: 19.4, femaleLow: 6.2, femaleHigh: 19.4, refText: 'Morning sample' })] },
  { category: 'Thyroid & Hormones', name: 'Insulin', short_code: 'INS', sample_type: 'Serum', parameters: [num('Insulin', 'uIU/mL', { maleLow: 2.6, maleHigh: 24.9, femaleLow: 2.6, femaleHigh: 24.9 })] },

  // ---------- Serology & Immunology ----------
  {
    category: 'Serology & Immunology',
    name: 'Widal Test',
    short_code: 'Widal',
    sample_type: 'Serum',
    parameters: [
      dropdown('S. Typhi O', ['1:20', '1:40', '1:80', '1:160', '1:320', '>1:320']),
      dropdown('S. Typhi H', ['1:20', '1:40', '1:80', '1:160', '1:320', '>1:320']),
    ],
  },
  { category: 'Serology & Immunology', name: 'C-Reactive Protein', short_code: 'CRP', sample_type: 'Serum', parameters: [num('CRP', 'mg/L', { maleHigh: 6, femaleHigh: 6 })] },
  { category: 'Serology & Immunology', name: 'Rheumatoid Factor', short_code: 'RA', sample_type: 'Serum', parameters: [num('RA Factor', 'IU/mL', { maleHigh: 14, femaleHigh: 14 })] },
  { category: 'Serology & Immunology', name: 'Anti-Streptolysin O', short_code: 'ASO', sample_type: 'Serum', parameters: [num('ASO Titer', 'IU/mL', { maleHigh: 200, femaleHigh: 200 })] },
  { category: 'Serology & Immunology', name: 'Venereal Disease Research Laboratory', short_code: 'VDRL', sample_type: 'Serum', parameters: [dropdown('VDRL', ['Non-Reactive', 'Reactive'])] },
  { category: 'Serology & Immunology', name: 'Rapid Plasma Reagin', short_code: 'RPR', sample_type: 'Serum', parameters: [dropdown('RPR', ['Non-Reactive', 'Reactive'])] },
  { category: 'Serology & Immunology', name: 'Human Immunodeficiency Virus', short_code: 'HIV', sample_type: 'Serum', parameters: [dropdown('HIV', ['Negative', 'Positive'])] },
  { category: 'Serology & Immunology', name: 'Dengue NS1 Antigen', short_code: 'NS1', sample_type: 'Serum', parameters: [dropdown('Dengue NS1 Antigen', ['Negative', 'Positive'])] },
  {
    category: 'Serology & Immunology',
    name: 'Dengue IgG / IgM',
    short_code: 'DEN-Ab',
    sample_type: 'Serum',
    parameters: [dropdown('Dengue IgG', ['Negative', 'Positive']), dropdown('Dengue IgM', ['Negative', 'Positive'])],
  },
  { category: 'Serology & Immunology', name: 'Antinuclear Antibody', short_code: 'ANA', sample_type: 'Serum', parameters: [dropdown('ANA', ['Negative', 'Positive'])] },
  { category: 'Serology & Immunology', name: 'Helicobacter pylori', short_code: 'H.PYLORI', sample_type: 'Serum/Stool', parameters: [dropdown('H. pylori', ['Negative', 'Positive'])] },
  { category: 'Serology & Immunology', name: 'COVID-19 Test', short_code: 'COVID-19', sample_type: 'Nasopharyngeal Swab', parameters: [dropdown('COVID-19', ['Not Detected', 'Detected'])] },

  // ---------- Clinical Pathology ----------
  {
    category: 'Clinical Pathology',
    name: 'Urine Routine Examination',
    short_code: 'URE',
    sample_type: 'Urine',
    parameters: [
      text('Colour', 'Pale Yellow'),
      text('Appearance', 'Clear'),
      num('pH', '', { maleLow: 4.5, maleHigh: 8.0, femaleLow: 4.5, femaleHigh: 8.0, decimals: 1 }),
      num('Specific Gravity', '', { maleLow: 1.005, maleHigh: 1.03, femaleLow: 1.005, femaleHigh: 1.03, decimals: 3 }),
      dropdown('Protein', ['Nil', 'Trace', '+', '++', '+++']),
      dropdown('Sugar', ['Nil', 'Trace', '+', '++', '+++']),
      num('Pus Cells', '/hpf', { maleLow: 0, maleHigh: 5, femaleLow: 0, femaleHigh: 5 }),
      num('RBC', '/hpf', { maleLow: 0, maleHigh: 2, femaleLow: 0, femaleHigh: 2 }),
    ],
  },
  { category: 'Clinical Pathology', name: 'Urine Pregnancy Test', short_code: 'UPT', sample_type: 'Urine', parameters: [dropdown('UPT', ['Negative', 'Positive'])] },
  {
    category: 'Clinical Pathology',
    name: 'Stool Routine Examination',
    short_code: 'SRE',
    sample_type: 'Stool',
    parameters: [
      text('Colour', 'Brown'),
      text('Consistency', 'Formed'),
      dropdown('Ova/Cyst', ['Not Seen', 'Seen']),
      dropdown('Occult Blood', ['Negative', 'Positive']),
    ],
  },
  { category: 'Clinical Pathology', name: 'Stool Occult Blood', short_code: 'FOBT', sample_type: 'Stool', parameters: [dropdown('Occult Blood', ['Negative', 'Positive'])] },
  {
    category: 'Clinical Pathology',
    name: 'Semen Analysis',
    short_code: 'SA',
    sample_type: 'Semen',
    parameters: [
      num('Volume', 'mL', { maleLow: 1.5, maleHigh: 6.0 }),
      num('Sperm Count', 'million/mL', { maleLow: 15 }),
      num('Motility', '%', { maleLow: 40 }),
      num('Normal Morphology', '%', { maleLow: 4 }),
    ],
  },
  {
    category: 'Clinical Pathology',
    name: 'Cerebrospinal Fluid Analysis',
    short_code: 'CSF',
    sample_type: 'CSF',
    parameters: [
      text('Appearance', 'Clear, Colourless'),
      num('Cell Count', '/uL', { maleHigh: 5, femaleHigh: 5 }),
      num('Protein', 'mg/dL', { maleLow: 15, maleHigh: 45, femaleLow: 15, femaleHigh: 45 }),
      num('Glucose', 'mg/dL', { maleLow: 40, maleHigh: 70, femaleLow: 40, femaleHigh: 70 }),
    ],
  },
  {
    category: 'Clinical Pathology',
    name: 'Body Fluid Analysis',
    short_code: 'BFA',
    sample_type: 'Body Fluid',
    parameters: [
      text('Appearance', 'Clear'),
      num('Cell Count', '/uL', { maleHigh: 0, femaleHigh: 0, refText: 'Varies by fluid type' }),
      num('Protein', 'g/dL', { maleLow: 0, maleHigh: 0, refText: 'Varies by fluid type' }),
      num('Glucose', 'mg/dL', { maleLow: 0, maleHigh: 0, refText: 'Varies by fluid type' }),
    ],
  },

  // ---------- Microbiology ----------
  { category: 'Microbiology', name: 'Culture & Sensitivity', short_code: 'C/S', sample_type: 'Varies', parameters: [text('Organism & Sensitivity', 'No Growth')] },
  { category: 'Microbiology', name: 'Urine Culture', short_code: 'U-C/S', sample_type: 'Urine', parameters: [text('Organism', 'No Growth')] },
  { category: 'Microbiology', name: 'Blood Culture', short_code: 'B-C/S', sample_type: 'Blood', parameters: [text('Organism', 'No Growth')] },
  { category: 'Microbiology', name: 'Sputum Culture', short_code: 'SP-C/S', sample_type: 'Sputum', parameters: [text('Organism', 'No Growth')] },
  { category: 'Microbiology', name: 'Gram Stain', short_code: 'GS', sample_type: 'Varies', parameters: [text('Gram Stain', 'No organisms seen')] },
  { category: 'Microbiology', name: 'Sputum AFB (TB Test)', short_code: 'AFB', sample_type: 'Sputum', parameters: [dropdown('AFB', ['Negative', '1+', '2+', '3+'])] },
  { category: 'Microbiology', name: 'Ziehl-Neelsen Stain', short_code: 'ZN', sample_type: 'Varies', parameters: [dropdown('ZN Stain', ['Negative', '1+', '2+', '3+'])] },
  { category: 'Microbiology', name: 'Potassium Hydroxide Mount', short_code: 'KOH', sample_type: 'Skin/Nail/Hair', parameters: [dropdown('KOH Mount', ['Fungal Elements Not Seen', 'Fungal Elements Seen'])] },
  { category: 'Microbiology', name: 'Malaria Parasite Test', short_code: 'MP', sample_type: 'EDTA Blood', parameters: [dropdown('Malaria Parasite', ['Not Detected', 'P. vivax', 'P. falciparum'])] },

  // ---------- Histopathology & Cytology ----------
  { category: 'Histopathology & Cytology', name: 'Histopathology / Biopsy', short_code: 'HPE', sample_type: 'Tissue', parameters: [text('Findings', '')] },
  { category: 'Histopathology & Cytology', name: 'Papanicolaou Smear', short_code: 'PAP', sample_type: 'Cervical Smear', parameters: [text('Findings', 'Negative for Intraepithelial Lesion')] },
  { category: 'Histopathology & Cytology', name: 'Fine Needle Aspiration Cytology', short_code: 'FNAC', sample_type: 'Aspirate', parameters: [text('Findings', '')] },

  // ---------- Electrolytes & Minerals ----------
  {
    category: 'Electrolytes & Minerals',
    name: 'Serum Electrolytes',
    short_code: 'Electrolytes',
    sample_type: 'Serum',
    parameters: [
      num('Sodium', 'mmol/L', { code: 'NA', maleLow: 135, maleHigh: 145, femaleLow: 135, femaleHigh: 145, criticalLow: 120, criticalHigh: 160 }),
      num('Potassium', 'mmol/L', { code: 'K', maleLow: 3.5, maleHigh: 5.1, femaleLow: 3.5, femaleHigh: 5.1, decimals: 1, criticalLow: 2.5, criticalHigh: 6.5 }),
      num('Chloride', 'mmol/L', { code: 'CL', maleLow: 98, maleHigh: 107, femaleLow: 98, femaleHigh: 107 }),
      num('Bicarbonate', 'mmol/L', { code: 'HCO3', maleLow: 22, maleHigh: 29, femaleLow: 22, femaleHigh: 29 }),
    ],
  },
  { category: 'Electrolytes & Minerals', name: 'Serum Calcium', short_code: 'Ca', sample_type: 'Serum', parameters: [num('Calcium', 'mg/dL', { maleLow: 8.5, maleHigh: 10.5, femaleLow: 8.5, femaleHigh: 10.5 })] },
  { category: 'Electrolytes & Minerals', name: 'Serum Phosphorus', short_code: 'PHOS', sample_type: 'Serum', parameters: [num('Phosphorus', 'mg/dL', { maleLow: 2.5, maleHigh: 4.5, femaleLow: 2.5, femaleHigh: 4.5 })] },
  { category: 'Electrolytes & Minerals', name: 'Serum Magnesium', short_code: 'Mg', sample_type: 'Serum', parameters: [num('Magnesium', 'mg/dL', { maleLow: 1.7, maleHigh: 2.2, femaleLow: 1.7, femaleHigh: 2.2 })] },

  // ---------- A few more common individual tests ----------
  { category: 'Biochemistry', name: 'Serum Iron', short_code: 'FE', sample_type: 'Serum', parameters: [num('Iron', 'ug/dL', { maleLow: 65, maleHigh: 175, femaleLow: 50, femaleHigh: 170 })] },
  { category: 'Biochemistry', name: 'Vitamin D (25-OH)', short_code: 'VIT-D', sample_type: 'Serum', parameters: [num('Vitamin D', 'ng/mL', { maleLow: 30, maleHigh: 100, femaleLow: 30, femaleHigh: 100, refText: '30-100 Sufficient' })] },
  { category: 'Biochemistry', name: 'Vitamin B12', short_code: 'VIT-B12', sample_type: 'Serum', parameters: [num('Vitamin B12', 'pg/mL', { maleLow: 200, maleHigh: 900, femaleLow: 200, femaleHigh: 900 })] },
  { category: 'Thyroid & Hormones', name: 'Prostate Specific Antigen', short_code: 'PSA', sample_type: 'Serum', parameters: [num('PSA', 'ng/mL', { maleHigh: 4.0 })] },
  { category: 'Hematology', name: 'D-Dimer', short_code: 'D-DIMER', sample_type: 'Citrated Plasma', parameters: [num('D-Dimer', 'ng/mL', { maleHigh: 500, femaleHigh: 500 })] },
  { category: 'Biochemistry', name: 'Ferritin', short_code: 'FERR', sample_type: 'Serum', parameters: [num('Ferritin', 'ng/mL', { maleLow: 20, maleHigh: 250, femaleLow: 10, femaleHigh: 120 })] },

  // ---------- Cardiac Markers ----------
  { category: 'Cardiac Markers', name: 'Troponin I', short_code: 'TnI', sample_type: 'Serum', parameters: [num('Troponin I', 'ng/mL', { maleHigh: 0.04, femaleHigh: 0.04, decimals: 3, criticalHigh: 0.4 })] },
  { category: 'Cardiac Markers', name: 'Troponin T', short_code: 'TnT', sample_type: 'Serum', parameters: [num('Troponin T', 'ng/mL', { maleHigh: 0.01, femaleHigh: 0.01, decimals: 3, criticalHigh: 0.1 })] },
  { category: 'Cardiac Markers', name: 'Creatine Kinase-MB', short_code: 'CK-MB', sample_type: 'Serum', parameters: [num('CK-MB', 'ng/mL', { maleHigh: 5.0, femaleHigh: 5.0 })] },
  { category: 'Cardiac Markers', name: 'Lactate Dehydrogenase', short_code: 'LDH', sample_type: 'Serum', parameters: [num('LDH', 'U/L', { maleLow: 140, maleHigh: 280, femaleLow: 140, femaleHigh: 280 })] },
  { category: 'Cardiac Markers', name: 'B-type Natriuretic Peptide', short_code: 'BNP', sample_type: 'Serum', parameters: [num('BNP', 'pg/mL', { maleHigh: 100, femaleHigh: 100 })] },

  // ---------- OGTT ----------
  {
    category: 'Diabetes',
    name: 'Oral Glucose Tolerance Test',
    short_code: 'OGTT',
    sample_type: 'Fluoride Plasma',
    parameters: [
      num('Fasting', 'mg/dL', { maleHigh: 92, femaleHigh: 92 }),
      num('1 Hour', 'mg/dL', { maleHigh: 180, femaleHigh: 180 }),
      num('2 Hour', 'mg/dL', { maleHigh: 153, femaleHigh: 153 }),
    ],
  },
];
