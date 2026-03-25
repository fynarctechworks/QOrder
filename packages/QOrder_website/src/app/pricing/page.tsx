"use client";

import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Link from "next/link";

type PlanFeature = { label: string; value?: string; included?: boolean; tooltip?: string };

const T: Record<string, string> = {
  Branches: "The number of restaurant outlets you can manage under a single Q Order account.",
  Tables: "Each table gets a unique QR code. Customers scan to view the menu and place orders from their phone — no app needed.",
  "Menu Items": "The total number of dishes you can add across all categories. Unlimited means no cap.",
  "Staff Accounts": "Individual login accounts for your team with role-based access — Owner, Admin, Manager, or Staff.",
  "QR Code Ordering": "Generate printable QR codes for each table. Customers scan and order instantly from their browser — no download required.",
  "Customer App (PWA)": "A Progressive Web App that works like a native app on any smartphone, straight from the browser — no App Store needed.",
  "Live Order Dashboard": "Every order appears in real-time on a Kanban board. Update status with one tap — New → Confirmed → Preparing → Ready → Served.",
  "Menu Management": "Add, edit, disable, or reorder items instantly. Changes reflect on every customer's phone within seconds.",
  "Group Ordering": "Multiple people at the same table order from their own phones. All carts merge into one combined order.",
  "Kitchen Display (KDS)": "A dedicated full-screen display for your kitchen with live prep timers, colour-coded urgency, and audio alerts on every new order.",
  "Smart Inventory": "Stock deducts automatically with each order. Items are auto-disabled when an ingredient hits zero — no manual intervention.",
  "Staff & Attendance": "Track daily attendance, approve leave requests, and set role-based permissions for every team member.",
  "Discounts & Coupons": "Create percentage or flat discounts with coupon codes, usage limits, minimum order values, and day-of-week scheduling.",
  CRM: "Every customer builds a profile automatically — total visits, spend, order history, and custom tags like VIP or Regular.",
  "Customer Feedback": "Customers rate Food, Service, and Ambience after their meal. View star distributions and written reviews in your dashboard.",
  "QSR Counter Mode": "A dedicated counter interface for takeaway and walk-in orders. No table needed — hold tickets and recall them anytime.",
  "Thermal Printing": "Auto-print Kitchen Order Tickets and bills on any ESC/POS Bluetooth or network thermal printer — Epson, Star, and most generics.",
  "Excel Reports Export": "Download revenue, item sales, inventory, staff, and more as Excel files for offline analysis or accounting.",
  "Swiggy / Zomato Integration": "Receive Swiggy and Zomato orders directly in your Q Order dashboard. Menu syncs across all platforms automatically.",
  "Support (Professional)": "Reach us via email or live chat. Typical response within a few hours on business days.",
  "Support (Scale)": "A dedicated account manager who knows your setup — onboarding, training, and ongoing support included.",
};

const PLANS: {
  name: string;
  price: string;
  period: string;
  description: string;
  cta: string;
  ctaHref: string;
  popular: boolean;
  features: PlanFeature[];
}[] = [
  {
    name: "Professional",
    price: "₹3,000",
    period: "/month",
    description: "Everything your restaurant needs, nothing it doesn't. Flat fee. Zero commission. Full control.",
    cta: "Book a Free Demo",
    ctaHref: "/demo",
    popular: true,
    features: [
      { label: "Branches", value: "3", tooltip: T["Branches"] },
      { label: "Tables", value: "Up to 15", tooltip: T["Tables"] },
      { label: "Menu Items", value: "Up to 200", tooltip: T["Menu Items"] },
      { label: "Staff Accounts", value: "10", tooltip: T["Staff Accounts"] },
      { label: "QR Code Ordering", included: true, tooltip: T["QR Code Ordering"] },
      { label: "Customer App (PWA)", included: true, tooltip: T["Customer App (PWA)"] },
      { label: "Live Order Dashboard", included: true, tooltip: T["Live Order Dashboard"] },
      { label: "Menu Management", included: true, tooltip: T["Menu Management"] },
      { label: "Group Ordering", included: true, tooltip: T["Group Ordering"] },
      { label: "Kitchen Display (KDS)", included: true, tooltip: T["Kitchen Display (KDS)"] },
      { label: "Smart Inventory", included: true, tooltip: T["Smart Inventory"] },
      { label: "Staff & Attendance", included: true, tooltip: T["Staff & Attendance"] },
      { label: "Discounts & Coupons", included: true, tooltip: T["Discounts & Coupons"] },
      { label: "CRM", included: true, tooltip: T["CRM"] },
      { label: "Customer Feedback", included: true, tooltip: T["Customer Feedback"] },
      { label: "QSR Counter Mode", included: true, tooltip: T["QSR Counter Mode"] },
      { label: "Thermal Printing", included: true, tooltip: T["Thermal Printing"] },
      { label: "Excel Reports Export", included: true, tooltip: T["Excel Reports Export"] },
      { label: "Swiggy / Zomato Integration", included: false, tooltip: T["Swiggy / Zomato Integration"] },
      { label: "Support", value: "Priority Email + Chat", tooltip: T["Support (Professional)"] },
    ],
  },
  {
    name: "Scale",
    price: "₹5,000",
    period: "/month",
    description: "Built for chains, food courts, and multi-outlet operations that need everything — including Swiggy & Zomato.",
    cta: "Talk to Sales",
    ctaHref: "/demo",
    popular: false,
    features: [
      { label: "Branches", value: "Unlimited", tooltip: T["Branches"] },
      { label: "Tables", value: "Unlimited", tooltip: T["Tables"] },
      { label: "Menu Items", value: "Unlimited", tooltip: T["Menu Items"] },
      { label: "Staff Accounts", value: "Unlimited", tooltip: T["Staff Accounts"] },
      { label: "QR Code Ordering", included: true, tooltip: T["QR Code Ordering"] },
      { label: "Customer App (PWA)", included: true, tooltip: T["Customer App (PWA)"] },
      { label: "Live Order Dashboard", included: true, tooltip: T["Live Order Dashboard"] },
      { label: "Menu Management", included: true, tooltip: T["Menu Management"] },
      { label: "Group Ordering", included: true, tooltip: T["Group Ordering"] },
      { label: "Kitchen Display (KDS)", included: true, tooltip: T["Kitchen Display (KDS)"] },
      { label: "Smart Inventory", included: true, tooltip: T["Smart Inventory"] },
      { label: "Staff & Attendance", included: true, tooltip: T["Staff & Attendance"] },
      { label: "Discounts & Coupons", included: true, tooltip: T["Discounts & Coupons"] },
      { label: "CRM", included: true, tooltip: T["CRM"] },
      { label: "Customer Feedback", included: true, tooltip: T["Customer Feedback"] },
      { label: "QSR Counter Mode", included: true, tooltip: T["QSR Counter Mode"] },
      { label: "Thermal Printing", included: true, tooltip: T["Thermal Printing"] },
      { label: "Excel Reports Export", included: true, tooltip: T["Excel Reports Export"] },
      { label: "Swiggy / Zomato Integration", included: true, tooltip: T["Swiggy / Zomato Integration"] },
      { label: "Support", value: "Dedicated Account Manager", tooltip: T["Support (Scale)"] },
    ],
  },
];

const FAQS = [
  {
    q: "Is there really no commission?",
    a: "Zero. You keep 100% of every order. We charge a flat monthly fee — that's it. No per-order cuts, ever.",
  },
  {
    q: "Do customers need to download an app?",
    a: "No. Q Order is a PWA — it works instantly in any mobile browser when they scan the QR code. Nothing to install.",
  },
  {
    q: "Can I use my existing thermal printer?",
    a: "Yes — any ESC/POS compatible Bluetooth or network printer works. Epson, Star, and most generic brands are supported.",
  },
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrade or downgrade anytime from your dashboard. Changes take effect on your next billing cycle.",
  },
  {
    q: "Is there a setup fee?",
    a: "No setup fee on any plan. All customers get free onboarding — we'll upload your menu and train your team.",
  },
  {
    q: "Is my data secure?",
    a: "Absolutely. JWT authentication, bcrypt-hashed credentials, rate limiting, and full tenant data isolation. Your data stays yours.",
  },
];

function FeatureRow({ label, value, included, tooltip }: PlanFeature) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-text-secondary flex-1">{label}</span>
      {value !== undefined ? (
        <span className="text-xs font-bold text-primary bg-primary-muted px-2 py-0.5 rounded-full whitespace-nowrap">{value}</span>
      ) : included ? (
        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {tooltip && (
        <div className="relative group flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-text-muted cursor-help" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 w-52 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-lg">
            {tooltip}
            <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left bg-white hover:bg-background-secondary transition-colors"
      >
        <span className="font-semibold text-text-primary pr-4">{q}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-primary text-2xl leading-none flex-shrink-0"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="p-5 pt-0 text-text-secondary leading-relaxed border-t border-border">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PricingPage() {
  const cardsRef = useRef(null);
  const faqRef = useRef(null);
  const cardsInView = useInView(cardsRef, { once: true, margin: "-60px" });
  const faqInView = useInView(faqRef, { once: true });

  return (
    <main className="min-h-screen bg-white font-sans">
      <Nav />

      {/* Hero */}
      <section className="pt-32 pb-16 text-center px-6 bg-background-secondary">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="text-sm font-bold uppercase tracking-widest text-primary">Pricing</span>
          <h1 className="text-5xl md:text-6xl font-bold text-text-primary mt-4 mb-4 leading-tight">
            Simple pricing.<br />No hidden fees. No commission.
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto">
            Pick the plan that fits your restaurant. Upgrade or cancel anytime.
          </p>
        </motion.div>
      </section>

      {/* Pricing cards */}
      <section className="section-padding bg-white" ref={cardsRef}>
        <div className="content-width grid md:grid-cols-2 gap-6 max-w-4xl mx-auto items-start">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 50 }}
              animate={cardsInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4 }}
              className={`rounded-2xl p-7 flex flex-col relative overflow-hidden transition-shadow duration-300 ${
                plan.popular
                  ? "bg-white border-2 border-primary shadow-elevated"
                  : "bg-white border-2 border-border shadow-card"
              }`}
            >
              {plan.popular && (
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute top-5 right-5 bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide"
                >
                  Most Popular
                </motion.div>
              )}

              {/* Plan header */}
              <div className="mb-6">
                <p className={`text-sm font-bold uppercase tracking-wider ${plan.popular ? "text-primary" : "text-text-muted"}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mt-3 mb-2">
                  <span className="text-4xl font-bold text-text-primary">{plan.price}</span>
                  <span className="text-text-muted mb-1 text-sm">{plan.period}</span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{plan.description}</p>
              </div>

              {/* CTA */}
              <Link
                href={plan.ctaHref}
                className={`block text-center py-3 font-bold rounded-xl transition-all duration-200 mb-6 text-sm ${
                  plan.popular
                    ? "bg-primary hover:bg-primary-hover text-white shadow-glow hover:shadow-none"
                    : "border-2 border-primary text-primary hover:bg-primary-muted"
                }`}
              >
                {plan.cta}
              </Link>

              {/* Features */}
              <div className="flex flex-col flex-1">
                {plan.features.map((f) => (
                  <FeatureRow key={f.label} {...f} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Zero commission callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={cardsInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-6xl mx-auto mt-6 flex flex-wrap justify-center gap-6 text-sm text-text-muted"
        >
          {["✓ Zero commission on every order", "✓ No setup fees", "✓ Cancel anytime", "✓ No credit card to start a demo"].map((t) => (
            <span key={t} className="font-medium text-text-secondary">{t}</span>
          ))}
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="section-padding bg-background-secondary" ref={faqRef}>
        <div className="content-width max-w-3xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={faqInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="text-sm font-bold uppercase tracking-widest text-primary">FAQ</span>
            <h2 className="text-4xl font-bold text-text-primary mt-3">Questions answered</h2>
          </motion.div>
          <div className="flex flex-col gap-3">
            {FAQS.map((faq, i) => (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 20 }}
                animate={faqInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.07 }}
              >
                <FAQItem {...faq} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
