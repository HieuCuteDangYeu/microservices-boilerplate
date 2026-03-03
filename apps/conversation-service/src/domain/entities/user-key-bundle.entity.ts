export class SignedPreKey {
  keyId: number;
  publicKey: string;
  signature: string;
}

export class OneTimePreKey {
  keyId: number;
  publicKey: string;
}

export class UserKeyBundle {
  id?: string;
  userId: string;
  deviceId: number;
  registrationId: number;
  identityKey: string;

  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];

  constructor(props?: Partial<UserKeyBundle>) {
    if (props) {
      Object.assign(this, props);
    }
  }
}
