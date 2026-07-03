"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The approval card is the write gate: it must show the user exactly what
// will be saved, field by field, not a prose summary of it. `fields` is the
// payload the tool will write, one row per field; `resourceType` names the
// FHIR resource being created.
export function ConfirmWrite({
  title,
  resourceType,
  fields,
  onApprove,
  onCancel,
}: {
  title: string;
  resourceType: string;
  fields: { label: string; value: string }[];
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <span className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
            {resourceType}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="divide-y divide-border/60 rounded-md bg-muted/60 px-3 text-sm">
          {fields.map((field) => (
            <div key={field.label} className="flex gap-3 py-2">
              <dt className="w-16 shrink-0 pt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                {field.label}
              </dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Nothing is saved to the chart until you approve.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onApprove}>
            Approve &amp; save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
