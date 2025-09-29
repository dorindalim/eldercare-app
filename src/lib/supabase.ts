// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ilwcrkwdmzfwoyjknrkl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsd2Nya3dkbXpmd295amtucmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwNjQ3MTcsImV4cCI6MjA3MjY0MDcxN30.SMXOZoShZ7pNd4fNF8PwyevLj0SjLXALaoF8H8ZwOi4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Tables: elderly_profiles / elderly_conditions / elderly_medications ──
export interface ElderlyProfile {
  id: string;                 // if you have a PK id
  user_id: string;
  user_code?: string | null;
  name: string | null;
  year_of_birth: number | null;
  gender: 'male' | 'female' | 'na' | null;
  phone: string | null;

  // Emergency (present in your table)
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_phone: string | null;
  emergency_email: string | null;

  // Extras
  assistive_needs: string[] | null;
  drug_allergies: string | null;
  public_note: string | null;

  created_at: string;
  updated_at: string;
}

export interface ElderlyCondition {
  id: string;
  user_id: string;
  condition: string | null;
  doctor: string | null;
  clinic: string | null;
  appointments: string | null;
  created_at: string;
}

export interface ElderlyMedication {
  id: string;
  condition_id: string;
  name: string;
  frequency: string | null;
  created_at: string;
}


