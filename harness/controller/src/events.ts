import { appendFile } from "node:fs/promises";
import {
  responseEventSchema,
  type ResponseEvent,
  type ResponseEventInput
} from "@chaos/runner/response-tracker";

export interface ControllerEventSink {
  record(input: ResponseEventInput): Promise<ResponseEvent | null>;
}

export class JsonlControllerEventSink implements ControllerEventSink {
  constructor(
    private readonly runId: string | undefined,
    private readonly path: string | undefined
  ) {}

  async record(input: ResponseEventInput): Promise<ResponseEvent | null> {
    if (!this.runId || !this.path) return null;
    const event = responseEventSchema.parse({ run_id: this.runId, ...input });
    await appendFile(this.path, `${JSON.stringify(event)}\n`);
    return event;
  }
}
