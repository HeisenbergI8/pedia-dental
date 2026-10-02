import { faker } from "@faker-js/faker";
import type { Patient } from "@pedia/shared";
import type { Db } from "./db";

export const CLINIC_ID = "clinic_demo";

export function seed(): Db {
  faker.seed(42); // same fake data on every machine
  const patients: Patient[] = Array.from({ length: 24 }, () => {
    const lastName = faker.person.lastName();
    const sex = faker.helpers.arrayElement(["male", "female"] as const);
    return {
      id: faker.string.uuid(),
      clinicId: CLINIC_ID,
      firstName: faker.person.firstName(sex),
      lastName,
      birthDate: faker.date.birthdate({ mode: "age", min: 2, max: 14 }).toISOString().slice(0, 10),
      sex,
      address: `${faker.location.streetAddress()}, Cavite`,
      guardians: [
        {
          id: faker.string.uuid(),
          fullName: `${faker.person.firstName("female")} ${lastName}`,
          relationship: "Mother",
          phone: `09${faker.string.numeric(9)}`,
          isPrimary: true,
        },
      ],
      allergies: faker.helpers.maybe(() => ["Penicillin"], { probability: 0.15 }) ?? [],
      medicalConditions: faker.helpers.maybe(() => ["Asthma"], { probability: 0.1 }) ?? [],
      medications: [],
      alerts: [],
      createdAt: faker.date.past({ years: 2 }).toISOString(),
    };
  });
  return { patients };
}
