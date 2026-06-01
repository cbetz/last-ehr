import {
  BaseLoginRequest,
  LoginAuthenticationResponse,
  normalizeErrorString,
} from "@medplum/core";
import { ProjectMembership } from "@medplum/fhirtypes";
import { useMedplum } from "@medplum/react-hooks";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { AuthenticationForm } from "./AuthenticationForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface SignInFormProps extends BaseLoginRequest {
  readonly login?: string;
  readonly chooseScopes?: boolean;
  readonly disableEmailAuth?: boolean;
  readonly disableGoogleAuth?: boolean;
  readonly onSuccess?: () => void;
  readonly onForgotPassword?: () => void;
  readonly onRegister?: () => void;
  readonly onCode?: (code: string) => void;
  readonly children?: ReactNode;
}

/**
 * The SignInForm component allows users to sign in to Medplum.
 *
 * "Signing in" is a multi-step process:
 * 1) Authentication - identify the user
 * 2) MFA - If MFA is enabled, prompt for MFA code
 * 3) Choose profile - If the user has multiple profiles, prompt to choose one
 * 4) Choose scope - If the user has multiple scopes, prompt to choose one
 * 5) Success - Return to the caller with either a code or a redirect
 * @param props - The SignInForm React props.
 * @returns The SignInForm React node.
 */
export function SignInForm(props: SignInFormProps) {
  const {
    login: loginCode,
    chooseScopes,
    onSuccess,
    onForgotPassword,
    onRegister,
    onCode,
    ...baseLoginRequest
  } = props;
  const medplum = useMedplum();
  const [login, setLogin] = useState<string>();
  const [mfaRequired, setAuthenticatorRequired] = useState(false);
  const [memberships, setMemberships] = useState<ProjectMembership[]>();
  const [error, setError] = useState<string>();

  const handleCode = useCallback(
    (code: string): void => {
      setError(undefined);
      if (onCode) {
        onCode(code);
      } else {
        medplum
          .processCode(code)
          .then(() => onSuccess?.())
          .catch((err) => {
            const message = normalizeErrorString(err);
            console.error("Error processing code", message);
            setError(message);
          });
      }
    },
    [medplum, onCode, onSuccess]
  );

  const handleAuthResponse = useCallback(
    (response: LoginAuthenticationResponse): void => {
      setAuthenticatorRequired(!!response.mfaRequired);

      if (response.login) {
        setLogin(response.login);
      }

      if (response.memberships) {
        setMemberships(response.memberships);
      }

      if (response.code) {
        if (chooseScopes) {
          setMemberships(undefined);
        } else {
          handleCode(response.code as string);
        }
      }
    },
    [chooseScopes, handleCode]
  );

  const handleScopeResponse = useCallback(
    (response: LoginAuthenticationResponse): void => {
      handleCode(response.code as string);
    },
    [handleCode]
  );

  useEffect(() => {
    // Only request login status once (useMedplum returns a new client on login).
    if (loginCode && !login) {
      medplum
        .get("auth/login/" + loginCode)
        .then(handleAuthResponse)
        .catch((err) => {
          const message = normalizeErrorString(err);
          console.error("Error getting login status", message);
          setError(message);
        });
    }
    const authToken = medplum.getAccessToken();
    if (authToken) {
      document.cookie = `medplum_access_token=${authToken}; path=/`;
    }
  }, [medplum, loginCode, login, handleAuthResponse]);

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {(() => {
        if (!login) {
          return (
            <AuthenticationForm
              onForgotPassword={onForgotPassword}
              onRegister={onRegister}
              handleAuthResponse={handleAuthResponse}
              disableGoogleAuth={props.disableGoogleAuth}
              disableEmailAuth={props.disableEmailAuth}
              {...baseLoginRequest}
            >
              {props.children}
            </AuthenticationForm>
          );
        } /*else if (mfaRequired) {
          return (
            <MfaForm login={login} handleAuthResponse={handleAuthResponse} />
          );
        } else if (memberships) {
          return (
            <ChooseProfileForm
              login={login}
              memberships={memberships}
              handleAuthResponse={handleAuthResponse}
            />
          );
        } else if (props.projectId === "new") {
          return (
            <NewProjectForm
              login={login}
              handleAuthResponse={handleAuthResponse}
            />
          );
        } else if (props.chooseScopes) {
          return (
            <ChooseScopeForm
              login={login}
              scope={props.scope}
              handleAuthResponse={handleScopeResponse}
            />
          );
        }*/ else {
          return <div></div>;
        }
      })()}
    </div>
  );
}
