"use client";

import { useActions, useUIState } from "ai/rsc";

import type { AI } from "../../app/action";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import Image from "next/image";

export function Patients({ patients }: { patients: any[] }) {
  const [, setMessages] = useUIState<typeof AI>();
  const { submitUserMessage } = useActions<typeof AI>();

  return (
    <>
      <div className="grid gap-4">
        {patients.map((patient) => (
          <Card key={patient.resource.id}>
            <CardContent className="flex items-center gap-4 pt-4">
              <Image
                alt="Patient avatar"
                className="rounded-full"
                height="64"
                src={patient.resource.photo[0].url}
                style={{
                  aspectRatio: "64/64",
                  objectFit: "cover",
                }}
                width="64"
              />
              <div className="flex-1">
                <div className="font-semibold">{`${patient.resource.name[0].family}, ${patient.resource.name[0].given}`}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {patient.resource.birthDate}
                </div>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  const response = await submitUserMessage(
                    `View patient with id = ${patient.resource.id}`
                  );
                  setMessages((currentMessages) => [
                    ...currentMessages,
                    response,
                  ]);
                }}
              >
                View record
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
