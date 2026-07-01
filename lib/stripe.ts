import "server-only";
import Stripe from "stripe";
import type { BillingInterval } from "@/lib/plans";

// Server-only Stripe client. Configure STRIPE_SECRET_KEY in .env.local.
const key = process.env.STRIPE_SECRET_KEY?.trim();

export const stripe = key ? new Stripe(key) : null;

export function stripeConfigured(): boolean {
  return !!stripe;
}

// Map a billing interval to its configured Stripe Price id.
export function proPriceId(interval: BillingInterval): string | undefined {
  return interval === "year"
    ? process.env.STRIPE_PRICE_PRO_YEARLY?.trim()
    : process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
}

// Absolute base URL for building Checkout success/cancel + portal return URLs.
export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}
