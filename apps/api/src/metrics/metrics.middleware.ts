import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { MetricsService } from "./metrics.service";

/** Times every request; keys by the matched route's template (`/api/patients/:id`), so no id or query is ever a label. */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}
  use(req: Request, res: Response, next: NextFunction) {
    const started = performance.now();
    res.on("finish", () => {
      const template = req.route?.path as string | undefined;
      this.metrics.observe(template ? `${req.method} ${template}` : undefined, res.statusCode, performance.now() - started);
    });
    next();
  }
}
