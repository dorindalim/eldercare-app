import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ilwcrkwdmzfwoyjknrkl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsd2Nya3dkbXpmd295amtucmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwNjQ3MTcsImV4cCI6MjA3MjY0MDcxN30.SMXOZoShZ7pNd4fNF8PwyevLj0SjLXALaoF8H8ZwOi4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export interface ElderlyProfile {
  id: string;
  user_id: string;
  user_code: string;
  name: string;
  year_of_birth: string;
  gender: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

export interface CaregiverProfile {
  id: string;
  user_id: string;
  user_code: string;
  name: string;
  type: 'family' | 'nurse' | 'other';
  relation: string;
  phone: string;
  email?: string;
  elderly_code: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaregiverPreferences {
  id: string;
  caregiver_id: string;
  notify_inactivity: boolean;
  inactivity_hours: number;
  notify_sos: boolean;
  track_location: boolean;
  manage_reminders: boolean;
  tips_opt_in: boolean;
  preferred_lang: string;
  elderly_needs?: string;
  created_at: string;
}

export interface ElderlyCondition {
  id: string;
  caregiver_id: string;
  condition?: string;
  medications: string[];
  doctor?: string;
  clinic?: string;
  appointments?: string;
  created_at: string;
}

