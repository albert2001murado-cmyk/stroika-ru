import qrcode from "qrcode-generator";
/** Numeric SVG path only; the secret never enters an external QR-generation service. */
export function totpQr(uri: string) {
  const qr = qrcode(0, "M"); qr.addData(uri); qr.make();
  const count = qr.getModuleCount(), size = count + 8, paths: string[] = [];
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (qr.isDark(y, x)) paths.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  return { size, path: paths.join("") };
}
