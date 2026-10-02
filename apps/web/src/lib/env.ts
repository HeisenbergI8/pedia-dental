export const env = {
  apiMocking: process.env.NEXT_PUBLIC_API_MOCKING === "enabled",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "/api",
};
