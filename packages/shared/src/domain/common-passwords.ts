/**
 * Security review #7: passwords that appear at the top of every breached-password list, plus a few this product
 * invites (its name, the clinic words). Compared in lower case, so "Password1" is refused with "password1". Only the
 * ones a person could choose matter (NewPassword already wants 8 characters), but the short ones are kept so the list
 * reads as the published lists do. A short built-in list, not a breach database: it stops the obvious guesses.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "123456", "123456789", "12345678", "password", "qwerty123", "qwerty1", "111111", "12345", "1234567890", "1234567",
  "123123", "000000", "iloveyou", "1234", "1q2w3e4r5t", "qwertyuiop", "123", "monkey", "dragon", "123456a",
  "654321", "123321", "666666", "1qaz2wsx", "myspace1", "121212", "homelesspa", "123qwe", "a123456", "123abc",
  "1q2w3e4r", "qwe123", "7777777", "qwerty12", "123456789a", "abc123", "password1", "password12", "password123",
  "password1234", "passw0rd", "p@ssw0rd", "p@ssword", "pa$$word", "passpass", "pass1234", "pass12345", "letmein",
  "letmein1", "letmein123", "welcome", "welcome1", "welcome123", "welcome2024", "welcome2025", "welcome2026",
  "admin", "admin123", "admin1234", "administrator", "root1234", "qwerty", "qwertyui", "qwertyu", "asdfghjkl",
  "asdfghjk", "asdf1234", "zxcvbnm", "zxcvbnm1", "zxcvbn", "1qazxsw2", "qazwsx123", "qazwsxedc", "q1w2e3r4",
  "q1w2e3r4t5", "1a2b3c4d", "a1b2c3d4", "aa123456", "abcd1234", "abcdefgh", "abcdef", "abc12345", "abcd123",
  "11111111", "00000000", "22222222", "88888888", "99999999", "12341234", "11223344", "12121212", "12344321",
  "87654321", "98765432", "123456789", "0123456789", "147258369", "159753", "1234qwer", "123654789", "147852369",
  "987654321", "999999999", "112233", "555555", "696969", "7777777", "123123123", "1234554321", "11112222",
  "iloveyou1", "iloveyou2", "loveyou1", "lovely", "lovelove", "princess", "princess1", "sunshine", "sunshine1",
  "football", "football1", "baseball", "basketball", "soccer", "superman", "batman", "starwars", "pokemon",
  "computer", "internet", "trustno1", "whatever", "freedom", "shadow", "master", "master123", "michael", "jennifer",
  "jordan23", "charlie", "nicole", "daniel", "jessica", "ashley", "babygirl", "babygirl1", "angel1", "butterfly",
  "chocolate", "cookie", "flower", "hello123", "hellohello", "helloworld", "secret", "secret123", "changeme",
  "changeme1", "default", "test1234", "testing", "testtest", "guest123", "login123", "summer2024", "summer2025",
  "summer2026", "winter2025", "spring2025", "autumn2025", "january1", "monday123", "mustang", "harley", "ranger",
  "hunter", "hunter2", "killer", "access", "access14", "matrix", "merlin", "michelle", "jordan", "tigger", "maggie",
  "ginger", "pepper", "buster", "cheese", "summer", "thomas", "robert", "george", "andrew", "joshua", "qwerty1234",
  "zaq12wsx", "!qaz2wsx", "1qaz!qaz", "password!", "password01", "iloveu", "mahalkita", "mahalkoikaw", "iloveyou143",
  "pinoy123", "philippines", "manila123", "primolar", "primolar1", "primolar123", "dentist", "dentist1", "dental123",
  "clinic123", "smile123", "pediatric", "teeth123", "toothfairy", "doctor123", "nurse123", "pass123", "pass1234!",
]);

/** True for a password on COMMON_PASSWORDS, in any letter case. */
export const isCommonPassword = (password: string) => COMMON_PASSWORDS.has(password.toLowerCase());
