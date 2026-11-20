-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('ROOM', 'COMMERCIAL_SPACE');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('AVAILABLE', 'SOON_TO_BE_AVAILABLE', 'DEPOSITED', 'RENTED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONTACTED', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL DEFAULT 'ROOM',
    "address" TEXT NOT NULL,
    "area" DECIMAL(8,2) NOT NULL,
    "monthly_rent" DECIMAL(14,2) NOT NULL,
    "deposit" DECIMAL(14,2),
    "electricity_rate" DECIMAL(10,2) NOT NULL,
    "water_rate" DECIMAL(10,2) NOT NULL,
    "service_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PropertyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "available_from" DATE,
    "description" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billings" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "electricity_start" INTEGER NOT NULL,
    "electricity_end" INTEGER NOT NULL,
    "water_start" INTEGER NOT NULL,
    "water_end" INTEGER NOT NULL,
    "electricity_rate" DECIMAL(10,2) NOT NULL,
    "water_rate" DECIMAL(10,2) NOT NULL,
    "rent_amount" DECIMAL(14,2) NOT NULL,
    "electricity_amount" DECIMAL(14,2) NOT NULL,
    "water_amount" DECIMAL(14,2) NOT NULL,
    "service_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'UNPAID',
    "paid_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_email" TEXT,
    "desired_move_in" DATE,
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AI_AGENT',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "properties_code_key" ON "properties"("code");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE INDEX "properties_type_status_idx" ON "properties"("type", "status");

-- CreateIndex
CREATE INDEX "billings_status_idx" ON "billings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billings_property_id_period_year_period_month_key" ON "billings"("property_id", "period_year", "period_month");

-- CreateIndex
CREATE INDEX "booking_requests_property_id_idx" ON "booking_requests"("property_id");

-- CreateIndex
CREATE INDEX "booking_requests_status_created_at_idx" ON "booking_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "billings" ADD CONSTRAINT "billings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
