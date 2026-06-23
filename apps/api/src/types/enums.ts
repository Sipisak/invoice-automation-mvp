// SQLite has no enums; these are the allowed String values. Enforce in app layer.

export const BUSINESS_STATUS = [
  'K_ODSOUHLASENI',
  'DOPLNIT_PRAVIDLO',
  'NEPRECTENO_NEUPLNE',
  'DUPLICITA',
  'SCHVALENO',
  'EXPORTOVANO',
] as const;
export type BusinessStatus = (typeof BUSINESS_STATUS)[number];

export const TECHNICAL_STATUS = [
  'PROCESSING',
  'EXTRACTED',
  'CLASSIFIED',
  'APPROVED',
  'REJECTED',
  'READY_FOR_EXPORT',
  'EXPORTED',
  'ARCHIVED',
  'FAILED',
] as const;
export type TechnicalStatus = (typeof TECHNICAL_STATUS)[number];

export const DOCUMENT_TYPE = [
  'FAKTURA',
  'ZALOHOVA_FAKTURA',
  'DOBROPIS',
  'OBJEDNAVKA',
  'NEDANOVY_DOKLAD',
  'NEZNAMY',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPE)[number];
