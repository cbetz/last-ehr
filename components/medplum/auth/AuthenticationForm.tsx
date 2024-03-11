import {
  BaseLoginRequest,
  GoogleCredentialResponse,
  GoogleLoginRequest,
  LoginAuthenticationResponse,
  normalizeOperationOutcome,
} from "@medplum/core";
import { OperationOutcome } from "@medplum/fhirtypes";
import { useMedplum } from "@medplum/react-hooks";
import { ReactNode, useCallback, useState } from "react";
import { Form } from "../Form/Form";
import { GoogleButton } from "../GoogleButton/GoogleButton";
import { getGoogleClientId } from "../GoogleButton/GoogleButton.utils";
import { OperationOutcomeAlert } from "../OperationOutcomeAlert/OperationOutcomeAlert";
import { getErrorsForInput, getIssuesForExpression } from "../utils/outcomes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface AuthenticationFormProps extends BaseLoginRequest {
  readonly disableEmailAuth?: boolean;
  readonly disableGoogleAuth?: boolean;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: ReactNode;
}

export function AuthenticationForm(
  props: AuthenticationFormProps
): JSX.Element {
  const [email, setEmail] = useState<string>();

  if (!email) {
    return <EmailForm setEmail={setEmail} {...props} />;
  } else {
    return <PasswordForm email={email} {...props} />;
  }
}

export interface EmailFormProps extends BaseLoginRequest {
  readonly disableEmailAuth?: boolean;
  readonly disableGoogleAuth?: boolean;
  readonly onRegister?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly setEmail: (email: string) => void;
  readonly children?: ReactNode;
}

export function EmailForm(props: EmailFormProps): JSX.Element {
  const {
    setEmail,
    onRegister,
    handleAuthResponse,
    children,
    disableEmailAuth,
    ...baseLoginRequest
  } = props;
  const medplum = useMedplum();
  const googleClientId =
    !props.disableGoogleAuth && getGoogleClientId(props.googleClientId);
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  const isExternalAuth = useCallback(
    async (authMethod: any): Promise<boolean> => {
      if (!authMethod.authorizeUrl) {
        return false;
      }

      const state = JSON.stringify({
        ...(await medplum.ensureCodeChallenge(baseLoginRequest)),
        domain: authMethod.domain,
      });
      const url = new URL(authMethod.authorizeUrl);
      url.searchParams.set("state", state);
      window.location.assign(url.toString());
      return true;
    },
    [medplum, baseLoginRequest]
  );

  const handleSubmit = useCallback(
    async (formData: Record<string, string>) => {
      const authMethod = await medplum.post("auth/method", {
        email: formData.email,
      });
      if (!(await isExternalAuth(authMethod))) {
        setEmail(formData.email);
      }
    },
    [medplum, isExternalAuth, setEmail]
  );

  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      try {
        const authResponse = await medplum.startGoogleLogin({
          ...baseLoginRequest,
          googleCredential: response.credential,
        } as GoogleLoginRequest);
        if (!(await isExternalAuth(authResponse))) {
          handleAuthResponse(authResponse);
        }
      } catch (err) {
        setOutcome(normalizeOperationOutcome(err));
      }
    },
    [medplum, baseLoginRequest, isExternalAuth, handleAuthResponse]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <div className="flex flex-col items-center justify-center">
        {children}
      </div>
      <OperationOutcomeAlert issues={issues} />
      {googleClientId && (
        <>
          <div className="flex justify-center items-center py-8 h-18">
            <GoogleButton
              googleClientId={googleClientId}
              handleGoogleCredential={handleGoogleCredential}
            />
          </div>
          {!disableEmailAuth && (
            <div className="border-t border-gray-200 my-4"></div>
          )}
        </>
      )}
      {!disableEmailAuth && (
        <Input
          name="email"
          type="email"
          placeholder="name@domain.com"
          required={true}
          autoFocus={true}
        />
      )}
      <div className="flex justify-between mt-8 space-x-0 flex-nowrap">
        <div>
          {onRegister && (
            <Button type="button" color="dimmed" onClick={onRegister}>
              Register
            </Button>
          )}
        </div>
        {!disableEmailAuth && <Button type="submit">Next</Button>}
      </div>
    </Form>
  );
}

export interface PasswordFormProps extends BaseLoginRequest {
  readonly email: string;
  readonly onForgotPassword?: () => void;
  readonly handleAuthResponse: (response: LoginAuthenticationResponse) => void;
  readonly children?: ReactNode;
}

export function PasswordForm(props: PasswordFormProps): JSX.Element {
  const {
    onForgotPassword,
    handleAuthResponse,
    children,
    ...baseLoginRequest
  } = props;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const issues = getIssuesForExpression(outcome, undefined);

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      medplum
        .startLogin({
          ...baseLoginRequest,
          password: formData.password,
          remember: formData.remember === "on",
        })
        .then(handleAuthResponse)
        .catch((err) => setOutcome(normalizeOperationOutcome(err)));
    },
    [medplum, baseLoginRequest, handleAuthResponse]
  );

  return (
    <Form style={{ maxWidth: 400 }} onSubmit={handleSubmit}>
      <div className="flex flex-col items-center justify-center">
        {children}
      </div>
      <OperationOutcomeAlert issues={issues} />
      <div className="flex flex-col space-y-8">
        <Input
          name="password"
          placeholder="Password"
          autoComplete="off"
          required={true}
          autoFocus={true}
        />
      </div>
      <div className="flex justify-between mt-8 space-x-0 flex-nowrap">
        {onForgotPassword && (
          <Button type="button" onClick={onForgotPassword}>
            Forgot password
          </Button>
        )}
        <Checkbox id="remember" name="remember" style={{ lineHeight: 1 }} />
        <label htmlFor="remember">Remember Me</label>
        <Button type="submit">Sign in</Button>
      </div>
    </Form>
  );
}
