-- =============================================================================
-- Supabase Setup Script
-- Run this in the Supabase SQL Editor after running `pnpm db:migrate`
-- Project > SQL Editor > New Query
-- =============================================================================

-- Enable UUID generation (already enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TRIGGER: Auto-create profile when new auth user signs up
-- =============================================================================
-- This trigger links Supabase's auth.users table to our profiles table.
-- When a user signs in for the first time (OAuth or email), a profile row
-- is automatically created with their ID and email.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'VIEWER',  -- Default role; Admin promotes manually
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY: profiles table
-- =============================================================================
-- Note: RLS is a defense-in-depth layer. Application-level auth checks
-- in Server Actions and API routes are the primary guard.
-- Prisma bypasses RLS when using the service role key.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (email field only; role managed by admin)
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can read all profiles (for user management pages)
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- =============================================================================
-- ROW LEVEL SECURITY: api_keys table
-- =============================================================================

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read their own API keys
CREATE POLICY "api_keys_select_own"
  ON public.api_keys
  FOR SELECT
  USING (profile_id = auth.uid());

-- Users can create their own API keys
CREATE POLICY "api_keys_insert_own"
  ON public.api_keys
  FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- Users can update (revoke) their own API keys
CREATE POLICY "api_keys_update_own"
  ON public.api_keys
  FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- Admins can manage all API keys
CREATE POLICY "api_keys_admin_all"
  ON public.api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- =============================================================================
-- VERIFICATION QUERIES
-- Run these after setup to confirm everything is configured correctly:
-- =============================================================================
-- SELECT * FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'on_auth_user_created';
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
