"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ConfirmWrite({
  title,
  detail,
  onApprove,
  onCancel,
}: {
  title: string;
  detail: string;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-md bg-muted/60 p-3 text-sm text-foreground">
          {detail}
        </p>
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
