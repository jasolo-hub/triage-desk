/*
  Warnings:

  - You are about to alter the column `attachmentName` on the `Comment` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `attachmentContentType` on the `Comment` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `name` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - You are about to alter the column `email` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(320)`.
  - You are about to alter the column `company` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - You are about to alter the column `name` on the `Tag` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `color` on the `Tag` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(7)`.
  - You are about to alter the column `title` on the `Ticket` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.
  - You are about to alter the column `email` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(320)`.
  - You are about to alter the column `name` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(200)`.

*/
-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "attachmentName" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "attachmentContentType" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "name" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(320),
ALTER COLUMN "company" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "Tag" ALTER COLUMN "name" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "color" SET DATA TYPE VARCHAR(7);

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "title" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "previousRefreshTokenHash" TEXT,
ALTER COLUMN "email" SET DATA TYPE VARCHAR(320),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(200);
