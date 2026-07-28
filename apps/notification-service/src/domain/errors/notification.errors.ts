export class PushTokenLifecycleConflictError extends Error {
  constructor() {
    super('Push token lifecycle has advanced');
    this.name = PushTokenLifecycleConflictError.name;
  }
}

export class ActiveFcmPushTokenNotFoundError extends Error {
  constructor() {
    super('No active FCM token found');
    this.name = ActiveFcmPushTokenNotFoundError.name;
  }
}
