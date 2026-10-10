import type { APIRoute } from "astro";

import { loadAdminOrder } from "@/lib/admin-dashboard/data";
import { buildOrderSlipPdf } from "@/lib/admin-dashboard/order-slip-pdf";
import { requireAdminRoute } from "@/lib/admin-dashboard/page";
import { fullName } from "@/lib/admin-dashboard/view";
import { loadDocumentPdfLayoutOptions } from "@/lib/platform-settings/document-layout";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const adminRoute = await requireAdminRoute(context);

  if (!adminRoute.ready) {
    return adminRoute.response;
  }

  const orderId = context.params.orderId;

  if (!orderId) {
    return new Response("Order not found.", { status: 404 });
  }

  const [order, documentLayout] = await Promise.all([
    loadAdminOrder(orderId),
    loadDocumentPdfLayoutOptions(),
  ]);
  if (!order) return new Response("Order not found.", { status: 404 });
  const pdf = buildOrderSlipPdf(order, documentLayout);
  const body = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(body).set(pdf);
  const fileName = `order-slip-${sanitizeFileName(fullName(order.customer))}-${order.id.slice(0, 8)}.pdf`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
};

function sanitizeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "order";
}
