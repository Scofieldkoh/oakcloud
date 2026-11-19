-- Sentroweb check: country and date of birth sent with an individual's search.
-- Additive, nullable columns only; existing rows keep NULL ("name only").
-- Rollback: ALTER TABLE "sentroweb_check_results" DROP COLUMN "requestedDateOfBirth",
--   DROP COLUMN "requestedCountry";

-- AlterTable
ALTER TABLE "sentroweb_check_results" ADD COLUMN     "requestedCountry" TEXT,
ADD COLUMN     "requestedDateOfBirth" TEXT;
