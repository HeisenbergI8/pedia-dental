-- Runs once, when the volume is first created. Prisma's `migrate dev` replays migrations in this shadow database.
CREATE DATABASE IF NOT EXISTS pedia_dental_shadow;
GRANT ALL PRIVILEGES ON pedia_dental_shadow.* TO 'pedia'@'%';
