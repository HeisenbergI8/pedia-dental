import { HttpException } from "@nestjs/common";

/** A refusal: the status and the mock's plain-text words. Rules modules return one; services throw it. */
export type Refusal = { status: 400 | 404 | 409; message: string };

/** Throws a refusal as the mock's plain-text answer (HttpErrorFilter sends an HttpException's message as text). */
export function refuse(refusal: Refusal | undefined): void {
  if (refusal) throw new HttpException(refusal.message, refusal.status);
}
