-- A patient's details are fixed once saved: name, age, gender and contact
-- details can't be changed afterwards, so a registered patient (and every
-- report printed for them) can never be quietly rewritten. Only
-- patient_code stays writable — the insert trigger in 001_init/007 sets it
-- right after each new patient row is created.

CREATE TRIGGER IF NOT EXISTS prevent_patient_details_update
BEFORE UPDATE OF full_name, age, age_unit, gender, phone, address ON patients
FOR EACH ROW
WHEN OLD.full_name IS NOT NEW.full_name
  OR OLD.age IS NOT NEW.age
  OR OLD.age_unit IS NOT NEW.age_unit
  OR OLD.gender IS NOT NEW.gender
  OR OLD.phone IS NOT NEW.phone
  OR OLD.address IS NOT NEW.address
BEGIN
  SELECT RAISE(ABORT, 'Patient details are locked once saved and cannot be changed.');
END;
