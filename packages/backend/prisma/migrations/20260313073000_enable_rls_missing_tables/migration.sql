-- Enable RLS on tables that were missed in the initial RLS migration.
-- These contain sensitive biometric and financial data.

-- 1. Enable RLS
ALTER TABLE "BiometricDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiometricLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiometricTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BiometricUserMap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditTransaction" ENABLE ROW LEVEL SECURITY;

-- 2. Allow full access for service_role (same pattern as existing tables)
CREATE POLICY "service_role_full_access" ON "BiometricDevice" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "BiometricLog" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "BiometricTemplate" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "BiometricUserMap" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "CreditAccount" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "CreditTransaction" FOR ALL TO service_role USING (true) WITH CHECK (true);
