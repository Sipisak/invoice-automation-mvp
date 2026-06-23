-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ico" TEXT NOT NULL,
    "dic" TEXT,
    "isVatPayer" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ico" TEXT,
    "dic" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'FAKTURA',
    "technicalStatus" TEXT NOT NULL DEFAULT 'PROCESSING',
    "businessStatus" TEXT NOT NULL DEFAULT 'NEPRECTENO_NEUPLNE',
    "extractedData" TEXT,
    "ourCompanyId" TEXT,
    "supplierId" TEXT,
    "dedupKey" TEXT,
    "ruleMatched" BOOLEAN NOT NULL DEFAULT false,
    "ruleId" TEXT,
    "routingToPohoda" BOOLEAN NOT NULL DEFAULT false,
    "routingToIntranet" BOOLEAN NOT NULL DEFAULT false,
    "missingFields" TEXT,
    "warnings" TEXT,
    "isHardDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "isSoftDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_ourCompanyId_fkey" FOREIGN KEY ("ourCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "before" TEXT,
    "after" TEXT,
    "reason" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_ico_key" ON "Company"("ico");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_ico_key" ON "Supplier"("ico");

-- CreateIndex
CREATE INDEX "Invoice_fileHash_idx" ON "Invoice"("fileHash");

-- CreateIndex
CREATE INDEX "Invoice_dedupKey_idx" ON "Invoice"("dedupKey");

-- CreateIndex
CREATE INDEX "Invoice_businessStatus_idx" ON "Invoice"("businessStatus");

-- CreateIndex
CREATE INDEX "AuditLog_invoiceId_idx" ON "AuditLog"("invoiceId");
