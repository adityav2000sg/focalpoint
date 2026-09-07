import { Capacitor } from "@capacitor/core";
import { BiometricAuth, BiometryType } from "@aparajita/capacitor-biometric-auth";

export interface BiometryState {
  available: boolean;
  /** "Face ID", "Touch ID", or a generic label, so copy matches the device in hand. */
  label: string;
}

const labels: Partial<Record<BiometryType, string>> = {
  [BiometryType.faceId]: "Face ID",
  [BiometryType.touchId]: "Touch ID",
  [BiometryType.fingerprintAuthentication]: "fingerprint",
  [BiometryType.faceAuthentication]: "face unlock",
  [BiometryType.irisAuthentication]: "iris unlock",
};

export async function checkBiometry(): Promise<BiometryState> {
  if (!Capacitor.isNativePlatform()) return { available: false, label: "biometrics" };
  try {
    const info = await BiometricAuth.checkBiometry();
    return { available: info.isAvailable, label: labels[info.biometryType] || "biometrics" };
  } catch {
    return { available: false, label: "biometrics" };
  }
}

/** True only on a successful check; a cancel and a failure both leave the app locked. */
export async function authenticate(reason: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
      iosFallbackTitle: "Use passcode",
    });
    return true;
  } catch {
    return false;
  }
}
