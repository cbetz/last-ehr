"use client";

import { Patient } from "@medplum/fhirtypes";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import Image from "next/image";

type Labeled = { id: string; text: string };
type ObsRow = { id: string; label: string; value: string; date: string };
type Note = { id: string; text: string; date: string };
type Medication = { id: string; text: string; dosage: string; status: string };
type Immunization = { id: string; text: string; date: string };

export function PatientCard({
  patient,
  conditions = [],
  allergies = [],
  medications = [],
  observations = [],
  immunizations = [],
  notes = [],
}: {
  patient: Patient;
  conditions?: Labeled[];
  allergies?: Labeled[];
  medications?: Medication[];
  observations?: ObsRow[];
  immunizations?: Immunization[];
  notes?: Note[];
}) {
  const family = patient.name?.[0]?.family ?? "";
  const given = patient.name?.[0]?.given?.join(" ") ?? "";
  const fullName = `${given} ${family}`.trim() || "Unknown patient";
  const birthDate = patient.birthDate ?? "";
  const photo = patient.photo?.[0]?.url;
  const initials = (given[0] ?? family[0] ?? "?").toUpperCase();

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          {photo ? (
            <Image
              alt={fullName}
              className="rounded-lg object-cover"
              height={36}
              width={36}
              src={photo}
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground"
            >
              {initials}
            </div>
          )}
          <div className="space-y-1">
            <h3 className="text-lg font-bold tracking-tight">{fullName}</h3>
            <p className="text-sm leading-none tracking-wide text-muted-foreground">
              Patient ID: {patient.id}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Demographics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none text-muted-foreground">
                Date of Birth
              </p>
              <p className="text-lg font-semibold leading-none">
                {birthDate || "Unknown"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none text-muted-foreground">
                Gender
              </p>
              <p className="text-lg font-semibold leading-none">
                {patient.gender ?? "Unknown"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Medical History</CardTitle>
          </CardHeader>
          <CardContent>
            {conditions.length > 0 ? (
              <ul className="list-none space-y-2 p-2">
                {conditions.map((c) => (
                  <li key={c.id}>{c.text}</li>
                ))}
              </ul>
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No recorded conditions.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Allergies</CardTitle>
          </CardHeader>
          <CardContent>
            {allergies.length > 0 ? (
              <ul className="list-none space-y-2 p-2">
                {allergies.map((a) => (
                  <li key={a.id}>{a.text}</li>
                ))}
              </ul>
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No known allergies.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Medications</CardTitle>
          </CardHeader>
          <CardContent>
            {medications.length > 0 ? (
              <ul className="list-none space-y-3 p-2">
                {medications.map((m) => (
                  <li key={m.id} className="space-y-1">
                    <p className="font-medium">{m.text}</p>
                    {m.dosage && (
                      <p className="text-sm text-muted-foreground">
                        {m.dosage}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No active medications.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observations</CardTitle>
          </CardHeader>
          <CardContent>
            {observations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr>
                      <th className="pb-2 text-xs font-medium uppercase text-muted-foreground">
                        Date
                      </th>
                      <th className="pb-2 text-xs font-medium uppercase text-muted-foreground">
                        Type
                      </th>
                      <th className="pb-2 text-xs font-medium uppercase text-muted-foreground">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {observations.map((o) => (
                      <tr key={o.id}>
                        <td className="font-semibold">{o.date || ""}</td>
                        <td>{o.label}</td>
                        <td>{o.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No observations recorded yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Immunizations</CardTitle>
          </CardHeader>
          <CardContent>
            {immunizations.length > 0 ? (
              <ul className="list-none space-y-2 p-2">
                {immunizations.map((i) => (
                  <li key={i.id} className="flex justify-between gap-4">
                    <span>{i.text}</span>
                    {i.date && (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {i.date}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                No immunizations on record.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {notes.length > 0 ? (
              <div className="space-y-4">
                {notes.map((n) => (
                  <div key={n.id} className="space-y-1">
                    <p className="text-sm">{n.text}</p>
                    {n.date && (
                      <p className="text-xs text-muted-foreground">{n.date}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
