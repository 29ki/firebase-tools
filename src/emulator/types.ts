import { ChildProcess } from "child_process";

export const enum Emulators {
  FUNCTIONS = "functions",
  FIRESTORE = "firestore",
  DATABASE = "database",
  HOSTING = "hosting",
}

export interface EmulatorInstance {
  start(): Promise<void>; // Called to begin emulator process
  connect(): Promise<void>; // Called once all sibling emulators are start()'d
  stop(): Promise<void>; // Called to kill emulator process
}

export interface EmulatorInfo {
  instance: EmulatorInstance;
  host: string;
  port: number;
}

export interface JavaEmulatorCommand {
  binary: string;
  args: string[];
}

export interface JavaEmulatorDetails {
  name: string;
  instance: ChildProcess | null;
  stdout: any | null;
  cacheDir: string;
  remoteUrl: string;
  expectedSize: number;
  expectedChecksum: string;
  localPath: string;
}

export interface Address {
  host: string;
  port: number;
}
