import type {
  BusinessProfileSettings,
  DefaultsSettings,
  DocumentNumberingSettings,
  DocumentPaymentSettings,
  DocumentTemplateSettings,
  NotificationRoute,
  PlatformSettings,
  PrivacyNoticeSettings,
} from "./types";
import { DEFAULT_DOCUMENT_HEADER, DEFAULT_DOCUMENT_TEMPLATES } from "./document-templates";
import { notificationEvents } from "./types";
import {
  DEFAULT_CONTACT_DETAILS_EMAIL,
  DEFAULT_CONTACT_DETAILS_PHONE,
} from "./contact-sync";

export const DEFAULT_BRAND_LINES = [
  "JEHMARP",
  "Brgy. Tolo-Tolo Consolacion, Cebu",
  "Cell #: 0917 777 0118 | 0932 215 9289",
] as const;

export const DEFAULT_CUSTOMER_CREDIT_LIMIT = 1000;

export const DEFAULT_BUSINESS_PROFILE: BusinessProfileSettings = {
  tradeName: DEFAULT_BRAND_LINES[0],
  legalName: "",
  address: DEFAULT_BRAND_LINES[1],
  phone: DEFAULT_CONTACT_DETAILS_PHONE,
  tin: "",
  logoPath: null,
  primaryEmail: DEFAULT_CONTACT_DETAILS_EMAIL,
  secondaryEmail: "",
};

export const DEFAULT_DOCUMENT_PAYMENT: DocumentPaymentSettings = {
  instructions: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  gcashNumber: "",
  mayaNumber: "",
};

export const DEFAULT_DEFAULTS: DefaultsSettings = {
  customerCreditLimit: DEFAULT_CUSTOMER_CREDIT_LIMIT,
};

export const DEFAULT_NOTIFICATION_ROUTES: NotificationRoute[] = notificationEvents.map((event) => ({
  event,
  primaryEmail: "",
  secondaryEmail: "",
}));

export const DEFAULT_DOCUMENT_NUMBERING: DocumentNumberingSettings = {
  invoicePrefix: "INV-",
  invoiceNext: 1,
  orderSlipPrefix: "OS-",
  orderSlipNext: 1,
};

export const DEFAULT_PRIVACY_NOTICE: PrivacyNoticeSettings = {
  controllerLegalName: "JEHMARP Meat and Poultry Products",
  philippineBusinessAddress: `${DEFAULT_BRAND_LINES[1]}, Philippines`,
  privacyContactEmail: DEFAULT_CONTACT_DETAILS_EMAIL,
  noticeVersion: "1.0",
  effectiveDate: "2026-09-06",
  retentionInquiries: "24 months after the inquiry is closed or resolved.",
  retentionResellerApplications: "36 months after the application decision, unless a longer period is required by law.",
  retentionOrders: "7 years from order completion for accounting, tax, and dispute records.",
  retentionAccounts: "While the account is active and for 24 months after closure, unless law requires longer retention.",
  retentionSecurityLogs: "12 months for operational monitoring and incident investigation.",
  retentionBackups: "30 days in rolling backup systems, subject to earlier overwrite.",
};

export const DEFAULT_DOCUMENT_TEMPLATES_SETTINGS: DocumentTemplateSettings = {
  header: { ...DEFAULT_DOCUMENT_HEADER },
  orderSlip: {
    ...DEFAULT_DOCUMENT_TEMPLATES.orderSlip,
    deliveryPreferences: [...DEFAULT_DOCUMENT_TEMPLATES.orderSlip.deliveryPreferences],
    paymentTerms: [...DEFAULT_DOCUMENT_TEMPLATES.orderSlip.paymentTerms],
  },
  salesInvoice: {
    ...DEFAULT_DOCUMENT_TEMPLATES.salesInvoice,
    modeOfPayment: [...DEFAULT_DOCUMENT_TEMPLATES.salesInvoice.modeOfPayment],
  },
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  businessProfile: { ...DEFAULT_BUSINESS_PROFILE },
  documentPayment: { ...DEFAULT_DOCUMENT_PAYMENT },
  defaults: { ...DEFAULT_DEFAULTS },
  notifications: {
    routes: DEFAULT_NOTIFICATION_ROUTES.map((route) => ({ ...route })),
  },
  documentNumbering: { ...DEFAULT_DOCUMENT_NUMBERING },
  privacyNotice: { ...DEFAULT_PRIVACY_NOTICE },
  documentTemplates: { ...DEFAULT_DOCUMENT_TEMPLATES_SETTINGS },
};
