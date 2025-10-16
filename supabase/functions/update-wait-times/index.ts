import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Helper to generate a random integer
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

serve(async (req) => {
  try {
    // Create a Supabase client with the service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all clinic names from the table
    const { data: clinics, error: selectError } = await supabase
      .from('clinic_wait_times')
      .select('clinic_name');

    if (selectError) {
      throw selectError;
    }

    // Prepare the updates
    const updates = clinics.map(clinic => ({
      clinic_name: clinic.clinic_name,
      wait_time_minutes: randomInt(5, 75), // Random time between 5 and 75 mins
      updated_at: new Date().toISOString(),
    }));

    // Bulk update the records
    const { error: updateError } = await supabase
      .from('clinic_wait_times')
      .upsert(updates, { onConflict: 'clinic_name' });

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ message: `Updated ${updates.length} clinic wait times.` }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
