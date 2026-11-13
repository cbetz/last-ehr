import { asArray, asRecord, stringOf, stripChartText } from "../json.js";
import type { Cite, PatientRef, ScriptedPlan, ToolResult } from "../types.js";

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;

const CITE_TYPE = {
  observations: "Observation",
  conditions: "Condition",
  allergies: "AllergyIntolerance",
} as const;

function requireJson(result: ToolResult, what: string): Record<string, unknown> {
  if (result.isError) throw new Error(`scripted plan ${what} failed`);
  const body = asRecord(result.json);
  if (!body) throw new Error(`scripted plan ${what} did not return JSON`);
  return body;
}

async function findPatient(call: ToolCaller, patient: PatientRef): Promise<string> {
  const result = await call("search_patients", { name: patient.name });
  const body = requireJson(result, "search");
  const matches = asArray(body.patients).filter((row) => stringOf(row.birthDate) === patient.birthDate);
  if (matches.length !== 1) {
    throw new Error(`scripted plan expected 1 patient, found ${matches.length}`);
  }
  const id = stringOf(matches[0]?.id);
  if (!id) throw new Error("scripted plan patient id missing");
  return id;
}

async function loadChart(call: ToolCaller, id: string): Promise<Record<string, unknown>> {
  const result = await call("show_patient_info", { id });
  return requireJson(result, "chart read");
}

function pickRow(chart: Record<string, unknown>, cite: Cite): string {
  const rows = asArray(chart[cite.collection]).filter((row) => {
    const blob = stripChartText(`${stringOf(row.label)} ${stringOf(row.text)} ${stringOf(row.value)}`);
    return blob.toLowerCase().includes(cite.labelIncludes.toLowerCase()) && stringOf(row.id).length > 0;
  });
  const id = stringOf(rows[0]?.id);
  if (!id) throw new Error("scripted plan found no chart row to cite");
  return id;
}

function evidence(resourceType: string, id: string): { evidence: Array<{ reference: string; reason: string }> } {
  return {
    evidence: [
      {
        reference: `${resourceType}/${id}`,
        reason: "Read from this patient's chart earlier in this session.",
      },
    ],
  };
}

async function openCited(
  call: ToolCaller,
  patient: PatientRef,
  cite: Cite,
): Promise<{ id: string; citedId: string; resourceType: string }> {
  const id = await findPatient(call, patient);
  const chart = await loadChart(call, id);
  return { id, citedId: pickRow(chart, cite), resourceType: CITE_TYPE[cite.collection] };
}

export async function runScripted(plan: ScriptedPlan, call: ToolCaller): Promise<void> {
  switch (plan.do) {
    case "stop":
      return;
    case "search-absent": {
      const result = await call("search_patients", { name: plan.name });
      const body = requireJson(result, "search");
      const found = asArray(body.patients).length;
      if (found !== 0) throw new Error(`scripted plan expected no patient, found ${found}`);
      return;
    }
    case "read": {
      const id = await findPatient(call, plan.patient);
      await call("read_chart_section", { patientId: id, resourceType: plan.section });
      return;
    }
    case "read-document": {
      const id = await findPatient(call, plan.patient);
      const section = await call("read_chart_section", {
        patientId: id,
        resourceType: "DocumentReference",
      });
      const body = requireJson(section, "document list");
      const entry = asArray(body.entries).find((row) =>
        stripChartText(stringOf(row.text)).includes(plan.titleIncludes),
      );
      const documentId = stringOf(entry?.id);
      if (!documentId) throw new Error("scripted plan did not find the document");
      await call("read_document", { patientId: id, documentId });
      return;
    }
    case "resolve": {
      const id = await findPatient(call, plan.patient);
      await loadChart(call, id);
      return;
    }
    case "note": {
      const opened = await openCited(call, plan.patient, plan.cite);
      await call("add_note", {
        patientId: opened.id,
        text: plan.text,
        ...evidence(opened.resourceType, opened.citedId),
      });
      return;
    }
    case "note-after-section": {
      const opened = await openCited(call, plan.patient, plan.cite);
      await call("read_chart_section", { patientId: opened.id, resourceType: plan.section });
      await call("add_note", {
        patientId: opened.id,
        text: plan.text,
        ...evidence(opened.resourceType, opened.citedId),
      });
      return;
    }
    case "observation": {
      const id = await findPatient(call, plan.patient);
      const chart = await loadChart(call, id);
      const citedId = pickRow(chart, {
        collection: "observations",
        labelIncludes: plan.citeLabelIncludes,
      });
      await call("record_observation", {
        patientId: id,
        label: plan.label,
        value: plan.value,
        unit: plan.unit,
        ...evidence("Observation", citedId),
      });
      return;
    }
    case "task": {
      const opened = await openCited(call, plan.patient, plan.cite);
      await call("create_task", {
        patientId: opened.id,
        description: plan.description,
        ...(plan.dueDate ? { dueDate: plan.dueDate } : {}),
        ...evidence(opened.resourceType, opened.citedId),
      });
      return;
    }
    case "note-and-task": {
      const opened = await openCited(call, plan.patient, plan.cite);
      const cited = evidence(opened.resourceType, opened.citedId);
      await call("add_note", { patientId: opened.id, text: plan.text, ...cited });
      await call("create_task", {
        patientId: opened.id,
        description: plan.description,
        ...cited,
      });
      return;
    }
    case "supersede": {
      const id = await findPatient(call, plan.patient);
      const chart = await loadChart(call, id);
      const citedId = pickRow(chart, {
        collection: "observations",
        labelIncludes: plan.labelIncludes,
      });
      await call("record_superseding_observation", {
        patientId: id,
        supersedes: citedId,
        value: plan.value,
        unit: plan.unit,
        ...evidence("Observation", citedId),
      });
      return;
    }
    default: {
      const exhausted: never = plan;
      throw new Error(`unknown scripted plan ${JSON.stringify(exhausted)}`);
    }
  }
}
