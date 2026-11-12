import { deliverFile } from "../../../platform/native";

// Kept out of geometry.ts, which Node tests import without the browser bundle.
export const downloadDxf = (name: string, text: string) =>
  deliverFile(new Blob([text], { type: "application/dxf" }), name);
