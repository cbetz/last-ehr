'use client';

import { useActions, useUIState } from 'ai/rsc';

import type { AI } from '../../app/action';

export function Patients({ patients }: { patients: any[] }) {
  const [, setMessages] = useUIState<typeof AI>();
  const { submitUserMessage } = useActions<typeof AI>();

  return (
    <div className="flex flex-col gap-2 pb-4 mb-4 overflow-y-scroll text-sm sm:flex-row">
      {patients.map(patient => (
        <button
          key={patient.symbol}
          className="flex flex-row gap-2 p-2 text-left rounded-lg cursor-pointer bg-zinc-900 hover:bg-zinc-800 sm:w-52"
          onClick={async () => {
            const response = await submitUserMessage(`View patient with id = ${patient.id}`);
            setMessages(currentMessages => [...currentMessages, response]);
          }}
        >
          <div className="flex flex-col">
            <div className="uppercase text-zinc-300 bold">{`${patient.resource.name[0].family}, ${patient.resource.name[0].given}`}</div>
            <div className="text-base text-zinc-500">{patient.resource.birthDate}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
