/*
  Warnings:

  - You are about to drop the column `content` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `vector` on the `Document` table. All the data in the column will be lost.
  - Added the required column `name` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" DROP COLUMN "content",
DROP COLUMN "vector",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryLog" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "embedding" vector NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueryLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
