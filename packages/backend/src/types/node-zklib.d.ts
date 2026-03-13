declare module 'node-zklib' {
  class ZKLib {
    constructor(ip: string, port: number, timeout: number, inactivityTimeout: number);
    createSocket(): Promise<boolean>;
    getUsers(): Promise<{ data: Array<{ uid: number; name: string; role: number; userId: string; cardno: string }> }>;
    getAttendances(): Promise<{ data: Array<{ id: number; date: Date; userId: string; state: number }> }>;
    getSerialNumber(): Promise<string>;
    disconnect(): Promise<void>;
  }
  export default ZKLib;
}
