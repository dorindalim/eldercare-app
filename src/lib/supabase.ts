import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

const extra = (Constants.expoConfig ?? Constants.manifest)?.extra ?? {};
const supabaseUrl = extra.SUPABASE_URL as string;
const supabaseAnonKey = extra.SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env not set. Check app.config.ts and your .env/EAS secrets.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: AsyncStorage,    
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
export interface ElderlyProfile {
  id: string;                 
  user_id: string;
  user_code?: string | null;
  name: string | null;
  year_of_birth: number | null;
  gender: 'male' | 'female' | 'na' | null;
  phone: string | null;

  // Emergency
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


