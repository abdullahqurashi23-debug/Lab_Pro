-- A saved, reusable list of technician names for the "Performed By" field
-- on New Report, the same idea as the doctors table for "Referring
-- Doctor" — pick from a saved list instead of retyping a name every time.
-- reports.performed_by itself stays a plain TEXT column (added in
-- migration 008, already protected by the finalize-lock trigger) rather
-- than a foreign key: a report keeps its own copy of the name at the time
-- it was chosen, so renaming or removing a technician later never changes
-- what an already-created report shows — the same snapshot principle
-- already used for test names/prices/short codes.
CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
