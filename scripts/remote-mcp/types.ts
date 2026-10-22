/** Credentials below belong only to this run's disposable synthetic stack. */
export type SyntheticIdentity = {
  subject: string;
  username: string;
  password: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type FixturePrincipal = {
  subject: string;
  profileReference: string;
  membershipId: string;
};

export type MedplumFixture = {
  baseUrl: string;
  projectId: string;
  patientId: string;
  observationId: string;
  exchangeClientId: string;
  adminAccessToken: string;
  writer: FixturePrincipal;
  reader: FixturePrincipal;
};

export type UserTokens = {
  accessToken: string;
  idToken: string;
};

export type VerificationCheck = {
  name: string;
  status: "pass";
};
