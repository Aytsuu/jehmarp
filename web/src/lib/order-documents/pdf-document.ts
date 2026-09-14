import type { DocumentLogoImage } from "@/lib/platform-settings/types";

export const pdfPageWidth = 595;
export const pdfPageHeight = 842;
export const documentTableTopY = 680;

export type BuildPdfDocumentOptions = {
  logoImage?: DocumentLogoImage | null;
};

type PdfObjectBody =
  | string
  | {
      header: string;
      bytes: Uint8Array;
      footer: string;
    };

export function buildPdfDocument(
  contentStreams: string[],
  options: BuildPdfDocumentOptions = {},
): Uint8Array {
  const logoImage = options.logoImage ?? null;
  const fontRegularObjectId = 3;
  const fontObliqueObjectId = 4;
  const fontBoldObjectId = 5;
  const logoObjectId = logoImage ? 6 : null;
  const firstPageObjectId = logoImage ? 7 : 6;
  const pageObjectIds = contentStreams.map((_, index) => firstPageObjectId + index * 2);
  const pageResources = logoImage
    ? `<< /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontObliqueObjectId} 0 R /F3 ${fontBoldObjectId} 0 R >> /XObject << /${logoImage.name} ${logoObjectId} 0 R >> >>`
    : `<< /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontObliqueObjectId} 0 R /F3 ${fontBoldObjectId} 0 R >> >>`;
  const objects: PdfObjectBody[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${contentStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  if (logoImage) {
    objects.push({
      header: `<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.jpegBytes.byteLength} >>\nstream\n`,
      bytes: logoImage.jpegBytes,
      footer: "\nendstream",
    });
  }

  contentStreams.forEach((content, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    const contentLength = new TextEncoder().encode(content).length;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfPageWidth} ${pdfPageHeight}] /Resources ${pageResources} /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`,
    );
  });

  return encodePdfObjects(objects);
}

function encodePdfObjects(objects: PdfObjectBody[]) {
  const parts: Uint8Array[] = [new TextEncoder().encode("%PDF-1.4\n")];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(getTotalByteLength(parts));
    parts.push(new TextEncoder().encode(`${index + 1} 0 obj\n`));
    appendObjectBody(parts, object);
    parts.push(new TextEncoder().encode("\nendobj\n"));
  });

  const xrefOffset = getTotalByteLength(parts);
  parts.push(new TextEncoder().encode(`xref\n0 ${objects.length + 1}\n`));
  parts.push(new TextEncoder().encode("0000000000 65535 f \n"));
  offsets.slice(1).forEach((offset) => {
    parts.push(new TextEncoder().encode(`${String(offset).padStart(10, "0")} 00000 n \n`));
  });
  parts.push(
    new TextEncoder().encode(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
    ),
  );

  return concatUint8Arrays(parts);
}

function appendObjectBody(parts: Uint8Array[], object: PdfObjectBody) {
  if (typeof object === "string") {
    parts.push(new TextEncoder().encode(object));
    return;
  }

  parts.push(new TextEncoder().encode(object.header));
  parts.push(object.bytes);
  parts.push(new TextEncoder().encode(object.footer));
}

function getTotalByteLength(parts: Uint8Array[]) {
  return parts.reduce((total, part) => total + part.byteLength, 0);
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = getTotalByteLength(parts);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.byteLength;
  });

  return output;
}
