-- Title printed before the patient's name (Mr., Mrs., Miss, Ms., Master,
-- Baby, Dr.), chosen when the patient is registered. Empty for patients
-- saved before this existed — the printed report then falls back to an
-- automatic Mr./Ms. for adults.
ALTER TABLE patients ADD COLUMN title TEXT NOT NULL DEFAULT '';

-- Recreated so the title is locked along with the other details (see 016).
DROP TRIGGER IF EXISTS prevent_patient_details_update;

CREATE TRIGGER IF NOT EXISTS prevent_patient_details_update
BEFORE UPDATE OF title, full_name, age, age_unit, gender, phone, address ON patients
FOR EACH ROW
WHEN OLD.title IS NOT NEW.title
  OR OLD.full_name IS NOT NEW.full_name
  OR OLD.age IS NOT NEW.age
  OR OLD.age_unit IS NOT NEW.age_unit
  OR OLD.gender IS NOT NEW.gender
  OR OLD.phone IS NOT NEW.phone
  OR OLD.address IS NOT NEW.address
BEGIN
  SELECT RAISE(ABORT, 'Patient details are locked once saved and cannot be changed.');
END;
