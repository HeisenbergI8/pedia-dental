/**
 * B12: the QR's and a receipt's multipart body. `data` is the JSON the schema parses; the image is the `file` part,
 * the way signupFormData sends a sign-up's files. The only builder for both.
 */
export function imageFormData(data: object, file?: Blob): FormData {
  const body = new FormData();
  body.set("data", JSON.stringify(data));
  if (file) body.set("file", file);
  return body;
}
