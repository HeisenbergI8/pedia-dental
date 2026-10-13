/**
 * A sign-up's multipart body (billing #6, #9): `data` is the JSON the schema parses; the logo and up to three reference
 * images go beside it as files, the way PUT /clinic/logo sends one. Used by the public form, the console and the tests.
 */
export function signupFormData(data: unknown, files: { logo?: Blob; references?: Blob[] } = {}): FormData {
  const body = new FormData();
  body.set("data", JSON.stringify(data));
  if (files.logo) body.set("logo", files.logo);
  for (const f of files.references ?? []) body.append("reference", f);
  return body;
}
