-- Contact gender (optional) and the Sentroweb check's per-run fuzzy option and requested gender.
-- Additive only: a new enum, nullable columns and one boolean with a default. Existing rows keep
-- NULL gender and fuzzy = false, which is what every earlier run was.
-- Rollback: ALTER TABLE "sentroweb_check_results" DROP COLUMN "requestedGender";
--   ALTER TABLE "sentroweb_check_runs" DROP COLUMN "fuzzy";
--   ALTER TABLE "contacts" DROP COLUMN "gender"; DROP TYPE "ContactGender";

-- CreateEnum
CREATE TYPE "ContactGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "gender" "ContactGender";

-- AlterTable
ALTER TABLE "sentroweb_check_runs" ADD COLUMN     "fuzzy" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sentroweb_check_results" ADD COLUMN     "requestedGender" "ContactGender";
