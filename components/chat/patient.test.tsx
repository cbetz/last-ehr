import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PatientCard } from "@/components/chat/patient";

// The `<chart_text>` boundary exists for the model. The reader must never see
// it. Every free-text field the chart tools return is wrapped now, not only
// notes, so a field rendered without the strip shows a clinician literal
// "<chart_text>" around their patient's medication name.
//
// Static markup rather than a DOM: the assertion is about what markup is
// produced, so this needs no jsdom.

const wrap = (value: string) => `<chart_text>${value}</chart_text>`;

const chart = {
  // The projection, not a raw resource: the tool no longer returns fullUrl,
  // meta, identifier, address or telecom to the browser or the model.
  patient: {
    id: "p1",
    name: wrap("Garcia, Maria"),
    birthDate: "2001-07-30",
  },
  conditions: [{ id: "c1", text: wrap("Asthma") }],
  allergies: [{ id: "a1", text: wrap("Penicillin") }],
  medications: [
    {
      id: "m1",
      text: wrap("Metformin 500 mg tablet"),
      dosage: wrap("1 tablet twice daily"),
      status: "active",
    },
  ],
  observations: [
    {
      id: "o1",
      label: wrap("Heart rate"),
      value: wrap("72 /min"),
      date: "2026-01-28",
    },
  ],
  immunizations: [
    { id: "i1", text: wrap("Influenza, seasonal"), date: "2025-10-15" },
  ],
  notes: [{ id: "n1", text: wrap("follow up in two weeks"), date: "2026-02-01" }],
};

describe("PatientCard", () => {
  const html = renderToStaticMarkup(<PatientCard {...chart} />);

  it("never shows the boundary marker to the reader", () => {
    // Escaped or not: neither form belongs on screen.
    expect(html).not.toContain("chart_text");
    expect(html).not.toContain("&lt;chart_text");
  });

  it("still shows the content of every wrapped field", () => {
    // The strip must remove the markers, not the text. Each of these is a
    // separate render site, and each was a separate place to forget.
    for (const value of [
      "Asthma",
      "Penicillin",
      "Metformin 500 mg tablet",
      "1 tablet twice daily",
      "Heart rate",
      "72 /min",
      "Influenza, seasonal",
      "follow up in two weeks",
    ]) {
      expect(html, `${value} did not render`).toContain(value);
    }
  });
});
