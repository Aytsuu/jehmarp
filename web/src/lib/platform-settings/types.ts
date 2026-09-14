export const PLATFORM_SETTINGS_SINGLETON_ID = "default";

export const notificationEvents = [
  "new_order",
  "reseller_application",
  "contact_inquiry",
  "credit_alert",
] as const;

export type NotificationEvent = (typeof notificationEvents)[number];

export type NotificationRoute = {
  event: NotificationEvent;
  primaryEmail: string;
  secondaryEmail: string;
};

export type BusinessProfileSettings = {
  tradeName: string;
  legalName: string;
  address: string;
  phone: string;
  tin: string;
  logoPath: string | null;
  primaryEmail: string;
  secondaryEmail: string;
};

export type DocumentPaymentSettings = {
  instructions: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  gcashNumber: string;
  mayaNumber: string;
};

export type DefaultsSettings = {
  customerCreditLimit: number;
};

export type DocumentNumberingSettings = {
  invoicePrefix: string;
  invoiceNext: number;
  orderSlipPrefix: string;
  orderSlipNext: number;
};

export type NotificationsSettings = {
  routes: NotificationRoute[];
};

export type PrivacyNoticeSettings = {
  controllerLegalName: string;
  philippineBusinessAddress: string;
  privacyContactEmail: string;
  noticeVersion: string;
  effectiveDate: string;
  retentionInquiries: string;
  retentionResellerApplications: string;
  retentionOrders: string;
  retentionAccounts: string;
  retentionSecurityLogs: string;
  retentionBackups: string;
};

export type OrderSlipTemplateSettings = {
  sellerName: string;
  acceptedByName: string;
  deliveryPreferences: string[];
  paymentTerms: string[];
};

export type SalesInvoiceTemplateSettings = {
  issuedByName: string;
  issuedBySubline: string;
  modeOfPayment: string[];
};

export type DocumentHeaderSettings = {
  businessName: string;
  address: string;
  phoneLine: string;
};

export type DocumentTemplateSettings = {
  header: DocumentHeaderSettings;
  orderSlip: OrderSlipTemplateSettings;
  salesInvoice: SalesInvoiceTemplateSettings;
};

export type PlatformSettings = {
  businessProfile: BusinessProfileSettings;
  documentPayment: DocumentPaymentSettings;
  defaults: DefaultsSettings;
  notifications: NotificationsSettings;
  documentNumbering: DocumentNumberingSettings;
  privacyNotice: PrivacyNoticeSettings;
  documentTemplates: DocumentTemplateSettings;
};

export type DocumentTemplateSettingsPatch = {
  header?: Partial<DocumentHeaderSettings>;
  orderSlip?: Partial<OrderSlipTemplateSettings>;
  salesInvoice?: Partial<SalesInvoiceTemplateSettings>;
};

export type PlatformSettingsPatch = {
  businessProfile?: Partial<BusinessProfileSettings>;
  documentPayment?: Partial<DocumentPaymentSettings>;
  defaults?: Partial<DefaultsSettings>;
  notifications?: Partial<NotificationsSettings>;
  documentNumbering?: Partial<DocumentNumberingSettings>;
  privacyNotice?: Partial<PrivacyNoticeSettings>;
  documentTemplates?: DocumentTemplateSettingsPatch;
};

export type DocumentLogoImage = {
  name: string;
  width: number;
  height: number;
  jpegBytes: Uint8Array;
};

export type DocumentLayoutOptions = {
  businessProfile?: BusinessProfileSettings;
  documentPayment?: DocumentPaymentSettings;
  documentTemplates?: DocumentTemplateSettings;
  logoImage?: DocumentLogoImage | null;
};
