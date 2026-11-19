"use client";

import { useState } from "react";

import { ConfirmWrite } from "@/components/chat/confirm-write";
import {
  declineAllChoices,
  decisionsForSubmit,
  type BatchChoice,
  type PendingWriteItem,
} from "@/components/chat/pending-writes";
import { Button } from "@/components/ui/button";

/**
 * Several pending proposals, each with its own decision. Submit sends only
 * the proposals the reviewer set. The rest stay pending. There is no
 * approve-all control.
 */
export function BatchReview({
  items,
  onSubmit,
}: {
  items: PendingWriteItem[];
  onSubmit: (chosen: ReturnType<typeof decisionsForSubmit>) => void;
}) {
  const [choices, setChoices] = useState<Record<string, BatchChoice>>({});
  const groups = new Map<string, PendingWriteItem[]>();
  for (const item of items) {
    const list = groups.get(item.patientId) ?? [];
    list.push(item);
    groups.set(item.patientId, list);
  }
  const chosen = decisionsForSubmit(items, choices);
  return (
    <section aria-label="Batch review" className="space-y-3 pb-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Review each proposal</h3>
        <p className="text-xs text-muted-foreground">
          Decide each one. Anything you leave unset stays pending. Submitting
          saves only the proposals you approved.
        </p>
      </div>
      {[...groups.entries()].map(([patientId, group]) => (
        <div key={patientId} className="space-y-3">
          <p className="font-mono text-xs text-muted-foreground">Patient/{patientId}</p>
          {group.map((item) => {
            const choice = choices[item.approvalId];
            return (
              <ConfirmWrite
                key={item.approvalId}
                title={item.title}
                resourceType={item.resourceType}
                fields={item.fields}
                preview={item.preview}
                evidence={item.evidence}
                blocked={item.blocked}
                onApprove={() => {}}
                onCancel={() => {}}
                actions={
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant={choice === "decline" ? "default" : "outline"}
                      size="sm"
                      aria-pressed={choice === "decline"}
                      onClick={() =>
                        setChoices((current) => ({ ...current, [item.approvalId]: "decline" }))
                      }
                    >
                      Decline
                    </Button>
                    {item.blocked ? null : (
                      <Button
                        type="button"
                        variant={choice === "approve" ? "default" : "outline"}
                        size="sm"
                        aria-pressed={choice === "approve"}
                        onClick={() =>
                          setChoices((current) => ({ ...current, [item.approvalId]: "approve" }))
                        }
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                }
              />
            );
          })}
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setChoices(declineAllChoices(items.map((item) => item.approvalId)))}
        >
          Decline all
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={chosen.length === 0}
          onClick={() => onSubmit(chosen)}
        >
          Submit decisions
        </Button>
      </div>
    </section>
  );
}
