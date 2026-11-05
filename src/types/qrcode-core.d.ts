declare module 'qrcode/lib/core/qrcode' {
  export interface QrModules {
    size: number;
    data: Uint8Array;
    get(row: number, col: number): number;
  }
  export interface QrSymbol {
    modules: QrModules;
    version: number;
  }
  export function create(
    data: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; version?: number },
  ): QrSymbol;
}
