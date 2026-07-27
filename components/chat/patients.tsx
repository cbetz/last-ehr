"use client";

import Image from "next/image";

import type { PatientSummary } from "@/packages/mcp/src/chart-read";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

/** Chart free text arrives wrapped for the model; the reader gets the text. */
const chartText = (value: string | undefined): string =>
  (value ?? "").replace(/<\/?chart_text>/g, "");

/**
 * The search tool projects each match rather than returning raw
 * `Bundle.entry`, which used to carry `fullUrl` (the backend host), `meta`,
 * `identifier`, `address` and `telecom` into both the browser and the model.
 * Typed here so the projection cannot quietly revert to a resource.
 */
export function Patients({
  patients,
  onSelect,
}: {
  patients: PatientSummary[];
  onSelect: (id: string) => void;
}) {
  if (!patients.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No patients found. Try a different name.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {patients.map((patient) => {
        // The name arrives inside the untrusted-content boundary; the reader
        // gets the text.
        const name = chartText(patient.name) || "Unknown patient";
        const photo = patient.photoUrl;
        const initials = (name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();

        return (
          <Card key={patient.id}>
            <CardContent className="flex items-center gap-4 pt-4">
              {photo ? (
                <Image
                  alt={name}
                  className="rounded-full object-cover"
                  height={64}
                  width={64}
                  src={photo}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground"
                >
                  {initials}
                </div>
              )}
              <div className="flex-1">
                <div className="font-semibold">{name}</div>
                <div className="text-sm text-muted-foreground">
                  {patient.birthDate}
                </div>
              </div>
              <Button size="sm" onClick={() => onSelect(patient.id)}>
                View record
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
