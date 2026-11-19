-- Bot test #8: the search reads a phone's leading 63 (+63) as 0 (patientSearchText's localDigits). The stored digits,
-- one phone per space-separated run, move to that form so "0917…" and "+63917…" find the same child. Data only.
UPDATE `Patient` SET `searchPhones` = REGEXP_REPLACE(`searchPhones`, '(^| )63', '$10') WHERE `searchPhones` REGEXP '(^| )63';
