-- Runs once, when the volume is first created. Prisma's `migrate dev` replays migrations in this shadow database.
CREATE DATABASE IF NOT EXISTS pedia_dental_shadow;
GRANT ALL PRIVILEGES ON pedia_dental_shadow.* TO 'pedia'@'%';
-- The integration suite's database (test:int), emptied by every test.
CREATE DATABASE IF NOT EXISTS pedia_dental_test;
GRANT ALL PRIVILEGES ON pedia_dental_test.* TO 'pedia'@'%';
