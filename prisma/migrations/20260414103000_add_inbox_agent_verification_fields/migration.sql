ALTER TABLE "InboxAgentRegistration"
ADD COLUMN "linkedEmail" TEXT,
ADD COLUMN "encryptionPublicKey" TEXT,
ADD COLUMN "encryptionKeyVersion" TEXT,
ADD COLUMN "signingPublicKey" TEXT,
ADD COLUMN "signingKeyVersion" TEXT;
