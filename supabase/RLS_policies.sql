-- ============== ELDERLY PROFILE POLICIES ==============
-- Ensures users can only see and manage their own profile.

-- 1. Enable RLS on the ElderlyProfile table
ALTER TABLE "elderly_profiles" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for SELECT: Allows users to read their own profile.
CREATE POLICY "Allow users to select their own profile"
ON "elderly_profiles"
FOR SELECT
USING (auth.uid() = user_id);

-- 3. Policy for UPDATE: Allows users to update their own profile.
CREATE POLICY "Allow users to update their own profile"
ON "elderly_profiles"
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Policy for INSERT: Allows users to create their own profile.
CREATE POLICY "Allow users to insert their own profile"
ON "elderly_profiles"
FOR INSERT
WITH CHECK (auth.uid() = user_id);


-- ============== ELDERLY CONDITION POLICIES ==============
-- Ensures users can only manage their own health conditions.

-- 1. Enable RLS on the ElderlyCondition table
ALTER TABLE "elderly_conditions" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for ALL: Allows users to perform all actions on their own conditions.
CREATE POLICY "Allow users to manage their own conditions"
ON "elderly_conditions"
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ============== ELDERLY MEDICATION POLICIES ==============
-- Ensures users can only manage medications linked to their own health conditions.

-- 1. Enable RLS on the ElderlyMedication table
ALTER TABLE "elderly_medications" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for ALL: Allows users to manage medications for their conditions.
CREATE POLICY "Allow users to manage medications for their conditions"
ON "elderly_medications"
FOR ALL
USING (
  (
    SELECT user_id
    FROM "elderly_conditions"
    WHERE id = condition_id
  ) = auth.uid()
)
WITH CHECK (
  (
    SELECT user_id
    FROM "elderly_conditions"
    WHERE id = condition_id
  ) = auth.uid()
);


-- ============== CLINIC WAIT TIMES POLICIES ==============
-- Ensures authenticated users can read wait times, but not modify them.

-- 1. Enable RLS on the clinic_wait_times table
ALTER TABLE "clinic_wait_times" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for SELECT: Allows any authenticated user to read the wait times.
CREATE POLICY "Allow authenticated users to select clinic wait times"
ON "clinic_wait_times"
FOR SELECT
USING (auth.role() = 'authenticated');


-- ============== PUSH TOKEN POLICIES ==============
-- Secures push notification tokens.

-- 1. Enable RLS on the push_tokens table
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for INSERT: Allows anyone to register a token.
CREATE POLICY "Allow insert for anyone" ON "push_tokens" FOR INSERT WITH CHECK (true);

-- 3. Policy for UPDATE: Allows users to update their own token.
CREATE POLICY "Allow update for own token" ON "push_tokens" FOR UPDATE USING (auth.uid() = user_id);

-- 4. Policy for SELECT: Denies read access to everyone.
CREATE POLICY "Deny reading all tokens" ON "push_tokens" FOR SELECT USING (false);


-- ============== COMMUNITY ACTIVITY POLICIES ==============
-- Public read, but only owners can modify.

-- 1. Enable RLS on the community_activities table
ALTER TABLE "community_activities" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for SELECT: Public read access.
CREATE POLICY "Allow public read access" ON "community_activities" FOR SELECT USING (true);

-- 3. Policy for INSERT: Authenticated users can create activities.
CREATE POLICY "Allow users to insert their own activities" ON "community_activities" FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Policy for UPDATE: Only owners can update.
CREATE POLICY "Allow users to update their own activities" ON "community_activities" FOR UPDATE USING (auth.uid() = user_id);

-- 5. Policy for DELETE: Only owners can delete.
CREATE POLICY "Allow users to delete their own activities" ON "community_activities" FOR DELETE USING (auth.uid() = user_id);


-- ============== ACTIVITY INTEREST POLICIES ==============
-- Users can manage their own interest status.

-- 1. Enable RLS on the activity_interests table
ALTER TABLE "activity_interests" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for SELECT: Users can see their own interest, and hosts can see all interests for their activity.
CREATE POLICY "Allow owner and self to read interest" ON "activity_interests" FOR SELECT USING (auth.uid() = interested_user_id OR (SELECT user_id FROM community_activities WHERE id = activity_id) = auth.uid());

-- 3. Policy for INSERT: Users can declare their own interest.
CREATE POLICY "Allow users to insert their own interest" ON "activity_interests" FOR INSERT WITH CHECK (auth.uid() = interested_user_id);

-- 4. Policy for DELETE: Users can remove their own interest.
CREATE POLICY "Allow users to delete their own interest" ON "activity_interests" FOR DELETE USING (auth.uid() = interested_user_id);


-- ============== ACTIVITY MESSAGE POLICIES ==============
-- Authenticated users can read, but only send messages as themselves.

-- 1. Enable RLS on the activity_messages table
ALTER TABLE "activity_messages" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for SELECT: Authenticated users can read messages.
CREATE POLICY "Allow authenticated users to read messages" ON "activity_messages" FOR SELECT USING (auth.role() = 'authenticated');

-- 3. Policy for INSERT: Users can only send messages as themselves.
CREATE POLICY "Allow users to insert their own messages" ON "activity_messages" FOR INSERT WITH CHECK (auth.uid() = sender_user_id);


-- ============== EVENTS TABLE POLICIES ==============
-- Publicly readable data.

-- 1. Enable RLS on the events table
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for SELECT: Allow public read access.
CREATE POLICY "Allow public read on events" ON "events" FOR SELECT USING (true);


-- ============== EMERGENCY CONTACT LINK POLICIES ==============
-- Highly sensitive data, client access should be denied.

-- 1. Enable RLS on the ec_links table
ALTER TABLE "ec_links" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for ALL: Deny all client-side access.
CREATE POLICY "Deny all access to ec_links" ON "ec_links" FOR ALL USING (false);


-- ============== ALL PARKS TABLE POLICIES ==============
-- Publicly readable data.

-- 1. Enable RLS on the all_parks table
ALTER TABLE "all_parks" ENABLE ROW LEVEL SECURITY;

-- 2. Policy for SELECT: Allow public read access.
CREATE POLICY "Allow public read on parks" ON "all_parks" FOR SELECT USING (true);


-- ============== SCRIPT TO DROP ALL RLS POLICIES (FOR REFERENCE) ==============
--
-- To run this, select the text below and execute it in your database client.
--
-- -- ============== DROP ELDERLY PROFILE POLICIES ==============
-- DROP POLICY IF EXISTS "Allow users to select their own profile" ON "elderly_profiles";
-- DROP POLICY IF EXISTS "Allow users to update their own profile" ON "elderly_profiles";
-- DROP POLICY IF EXISTS "Allow users to insert their own profile" ON "elderly_profiles";
-- ALTER TABLE "elderly_profiles" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP ELDERLY CONDITION POLICIES ==============
-- DROP POLICY IF EXISTS "Allow users to manage their own conditions" ON "elderly_conditions";
-- ALTER TABLE "elderly_conditions" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP ELDERLY MEDICATION POLICIES ==============
-- DROP POLICY IF EXISTS "Allow users to manage medications for their conditions" ON "elderly_medications";
-- ALTER TABLE "elderly_medications" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP CLINIC WAIT TIMES POLICIES ==============
-- DROP POLICY IF EXISTS "Allow authenticated users to select clinic wait times" ON "clinic_wait_times";
-- ALTER TABLE "clinic_wait_times" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP PUSH TOKEN POLICIES ==============
-- DROP POLICY IF EXISTS "Allow insert for anyone" ON "push_tokens";
-- DROP POLICY IF EXISTS "Allow update for own token" ON "push_tokens";
-- DROP POLICY IF EXISTS "Deny reading all tokens" ON "push_tokens";
-- ALTER TABLE "push_tokens" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP COMMUNITY ACTIVITY POLICIES ==============
-- DROP POLICY IF EXISTS "Allow public read access" ON "community_activities";
-- DROP POLICY IF EXISTS "Allow users to insert their own activities" ON "community_activities";
-- DROP POLICY IF EXISTS "Allow users to update their own activities" ON "community_activities";
-- DROP POLICY IF EXISTS "Allow users to delete their own activities" ON "community_activities";
-- ALTER TABLE "community_activities" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP ACTIVITY INTEREST POLICIES ==============
-- DROP POLICY IF EXISTS "Allow owner and self to read interest" ON "activity_interests";
-- DROP POLICY IF EXISTS "Allow users to insert their own interest" ON "activity_interests";
-- DROP POLICY IF EXISTS "Allow users to delete their own interest" ON "activity_interests";
-- ALTER TABLE "activity_interests" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP ACTIVITY MESSAGE POLICIES ==============
-- DROP POLICY IF EXISTS "Allow authenticated users to read messages" ON "activity_messages";
-- DROP POLICY IF EXISTS "Allow users to insert their own messages" ON "activity_messages";
-- ALTER TABLE "activity_messages" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP EVENTS TABLE POLICIES ==============
-- DROP POLICY IF EXISTS "Allow public read on events" ON "events";
-- ALTER TABLE "events" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP EMERGENCY CONTACT LINK POLICIES ==============
-- DROP POLICY IF EXISTS "Deny all access to ec_links" ON "ec_links";
-- ALTER TABLE "ec_links" DISABLE ROW LEVEL SECURITY;
-- 
-- -- ============== DROP ALL PARKS TABLE POLICIES ==============
-- DROP POLICY IF EXISTS "Allow public read on parks" ON "all_parks";
-- ALTER TABLE "all_parks" DISABLE ROW LEVEL SECURITY;

