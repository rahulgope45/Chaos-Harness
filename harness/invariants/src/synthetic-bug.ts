interface WebhookEvent {
  eventId: string;
  paymentId: string;
}

interface SideEffect {
  sequence: number;
  eventId: string;
  paymentId: string;
  kind: "receipt_email_sent";
}

class DeliberatelyNonIdempotentConsumer {
  readonly sideEffects: SideEffect[] = [];

  handle(event: WebhookEvent): void {
    this.sideEffects.push({
      sequence: this.sideEffects.length + 1,
      eventId: event.eventId,
      paymentId: event.paymentId,
      kind: "receipt_email_sent"
    });
  }
}

export function runSyntheticScenarioS001() {
  const event: WebhookEvent = {
    eventId: "synthetic-event-001",
    paymentId: "00000000-0000-4000-8000-000000000001"
  };
  const consumer = new DeliberatelyNonIdempotentConsumer();

  consumer.handle(event);
  consumer.handle(event);

  const effectsForEvent = consumer.sideEffects.filter(({ eventId }) => eventId === event.eventId);
  return {
    scenario_id: "S-001",
    classification: "synthetic",
    genuine_finding: false,
    planted_design: "consumer performs a side effect without deduplicating event_id",
    expected_contract: "at most one receipt email side effect per event_id",
    stimulus: {
      event,
      delivery_count: 2
    },
    observed: {
      side_effect_count: effectsForEvent.length,
      side_effects: effectsForEvent
    },
    status: effectsForEvent.length > 1 ? "detected" : "not_detected",
    violations:
      effectsForEvent.length > 1
        ? [
            {
              event_id: event.eventId,
              side_effect_count: effectsForEvent.length
            }
          ]
        : []
  } as const;
}
