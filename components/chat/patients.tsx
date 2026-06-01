"use client";

import Image from "next/image";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

export function Patients({
  patients,
  onSelect,
}: {
  patients: any[];
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
        const resource = patient.resource ?? patient ?? {};
        const name = resource.name?.[0];
        const family = name?.family ?? "";
        const given = name?.given?.join(" ") ?? "";
        const photo = resource.photo?.[0]?.url as string | undefined;
        const initials = (given[0] ?? family[0] ?? "?").toUpperCase();

        return (
          <Card key={resource.id}>
            <CardContent className="flex items-center gap-4 pt-4">
              {photo ? (
                <Image
                  alt={`${given} ${family}`.trim() || "Patient avatar"}
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
                <div className="font-semibold">
                  {family ? `${family}, ${given}` : given || "Unknown patient"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {resource.birthDate}
                </div>
              </div>
              <Button size="sm" onClick={() => onSelect(resource.id)}>
                View record
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
