-- Sentroweb check: whether the answer echoed exactly the search that was sent.
-- Additive: one boolean with a default. Rows from before this column read false ("not confirmed").
-- Rollback: ALTER TABLE "sentroweb_check_results" DROP COLUMN "searchEchoVerified";

-- AlterTable
ALTER TABLE "sentroweb_check_results" ADD COLUMN     "searchEchoVerified" BOOLEAN NOT NULL DEFAULT false;
