-- Configure revenue factory mapping for yarn source processes.
-- Existing seed data uses generic process names instead of G33/TQ for two sources:
--   Soi con NM1 => G33  => NM1 revenue
--   Soi con NM2 => TQ   => NM1 revenue
--   Soi con G37 => G37  => NM2 revenue

UPDATE "processes"
SET "revenueFactoryId" = (
  SELECT "id" FROM "factories" WHERE "name" ILIKE '%Sợi 1%' LIMIT 1
)
WHERE "name" ILIKE '%Sợi con NM1%'
   OR "name" ILIKE '%Soi con NM1%'
   OR "name" ILIKE '%G33%'
   OR "name" ILIKE '%Trung Quốc%'
   OR "name" ILIKE '%Trung Quoc%'
   OR "name" ILIKE '%TQ%';

UPDATE "processes"
SET "revenueFactoryId" = (
  SELECT "id" FROM "factories" WHERE "name" ILIKE '%Sợi 1%' LIMIT 1
)
WHERE "name" ILIKE '%Sợi con NM2%'
   OR "name" ILIKE '%Soi con NM2%';

UPDATE "processes"
SET "revenueFactoryId" = (
  SELECT "id" FROM "factories" WHERE "name" ILIKE '%Sợi 2%' LIMIT 1
)
WHERE "name" ILIKE '%G37%';
