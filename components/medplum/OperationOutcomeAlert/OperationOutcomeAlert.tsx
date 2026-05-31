import { Alert } from "@/components/ui/alert";
import { operationOutcomeIssueToString } from "@medplum/core";
import { OperationOutcome, OperationOutcomeIssue } from "@medplum/fhirtypes";

export interface OperationOutcomeAlertProps {
  readonly outcome?: OperationOutcome;
  readonly issues?: OperationOutcomeIssue[];
}

export function OperationOutcomeAlert(
  props: OperationOutcomeAlertProps
) {
  const issues = props.outcome?.issue || props.issues;
  if (!issues || issues.length === 0) {
    return null;
  }
  return (
    <Alert color="red">
      {issues.map((issue) => (
        <div data-testid="text-field-error" key={issue.details?.text}>
          {operationOutcomeIssueToString(issue)}
        </div>
      ))}
    </Alert>
  );
}
