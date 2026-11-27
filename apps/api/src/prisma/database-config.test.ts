import { describe, expect, it } from "vitest";
import { databaseConfig } from "./prisma.service";

const CA = "-----BEGIN CERTIFICATE-----\nrds\n-----END CERTIFICATE-----\n";
const BUNDLE = "/app/rds-global-bundle.pem";
const readCa = (path: string) => {
  if (path !== BUNDLE) throw new Error(`no file ${path}`);
  return CA;
};
const FAKE = "EXAMPLE-not-a-password";

describe("databaseConfig (#15: TLS to RDS)", () => {
  it("passes a URL without sslcert through untouched: local, docker-compose and tests stay without TLS", () => {
    const url = "mysql://pedia:pedia@localhost:3307/pedia_dental";
    expect(databaseConfig(url, readCa)).toBe(url);
  });

  it("turns the deployment's URL into the driver's settings, checking the server against the RDS CA bundle", () => {
    const url = `mysql://primolar_app:${FAKE}@db.abc.ap-southeast-1.rds.amazonaws.com:3306/primolar?sslcert=${BUNDLE}&sslaccept=strict`;
    expect(databaseConfig(url, readCa)).toEqual({
      host: "db.abc.ap-southeast-1.rds.amazonaws.com",
      port: 3306,
      user: "primolar_app",
      password: FAKE,
      database: "primolar",
      ssl: { ca: CA, rejectUnauthorized: true },
    });
  });

  it("skips the certificate check only when told to (the release task's setting)", () => {
    const config = databaseConfig(`mysql://u:${FAKE}@h/db?sslcert=${BUNDLE}&sslaccept=accept_invalid_certs`, readCa);
    expect(config).toMatchObject({ port: 3306, ssl: { rejectUnauthorized: false } });
  });

  it("stops start-up on a missing bundle or a parameter it would drop", () => {
    expect(() => databaseConfig(`mysql://u:${FAKE}@h/db?sslcert=/nowhere.pem`, readCa)).toThrow(/nowhere/);
    expect(() => databaseConfig(`mysql://u:${FAKE}@h/db?sslcert=${BUNDLE}&connectionLimit=5`, readCa)).toThrow(/connectionLimit/);
  });

  it("connects through the Cloud SQL socket when the URL names one (Cloud Run), with no TLS settings", () => {
    const socket = "/cloudsql/primolar-test:asia-southeast1:primolar-db";
    const url = `mysql://primolar_app:${FAKE}@localhost/primolar?socket=${socket}`;
    expect(databaseConfig(url, readCa)).toEqual({ socketPath: socket, user: "primolar_app", password: FAKE, database: "primolar" });
  });

  it("refuses a socket URL that also carries another parameter: the driver settings would drop it", () => {
    const url = `mysql://primolar_app:${FAKE}@localhost/primolar?socket=/cloudsql/x:y:z&sslcert=${BUNDLE}`;
    expect(() => databaseConfig(url, readCa)).toThrow(/with socket, no other parameter is supported \(found sslcert\)/);
  });
});
