-- Snapshots each report_tests row's short code at the time the test was
-- added to the report, same reasoning as test_name_snapshot/price_snapshot:
-- a later rename of the test's short code in the catalog must never change
-- what an already-created report shows. Backfilled from the current
-- catalog for rows that already exist, since that's the best information
-- available for tests added before this column existed.
ALTER TABLE report_tests ADD COLUMN short_code_snapshot TEXT NOT NULL DEFAULT '';

UPDATE report_tests
SET short_code_snapshot = (SELECT short_code FROM tests WHERE tests.id = report_tests.test_id)
WHERE short_code_snapshot = '';
