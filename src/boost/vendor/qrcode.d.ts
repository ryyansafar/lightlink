export interface QR {
  addData(data: string, mode?: 'Byte' | 'Numeric' | 'Alphanumeric'): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
  setMask(mask: number): void;
}
export function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QR;
export default qrcode;
