"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CTABanner from "@/components/CTABanner";

const FEATURES = [
  {
    badge: "Customer App",
    title: "Your menu, on every phone — no download required",
    description:
      "Customers scan a table QR code and instantly land on your menu. Browse categories, see item photos, read Veg/Non-Veg info, customise with modifiers — spice level, add-ons, special instructions — then place their order directly from their phone. No app store. No signup. No friction.",
    callouts: ["PWA — no install needed", "Veg / Non-Veg filter", "Real-time menu sync"],
    icon: "📷",
    bg: "bg-white",
    flip: false,
  },
  {
    badge: "Admin Dashboard",
    title: "Every order, the moment it's placed",
    description:
      "Orders flow in real-time onto your Kanban board — New → Confirmed → Preparing → Ready → Served. Drag and drop to update status. Click any order to see items, customisations, special instructions, and the full bill breakdown. Filter by status, search by table or order number, export to CSV or PDF.",
    callouts: ["Live updates — no refresh", "CSV & PDF export", "Print bill"],
    icon: "🎛️",
    bg: "bg-background-secondary",
    flip: true,
  },
  {
    badge: "Kitchen Display",
    title: "Your kitchen, always in sync",
    description:
      "A dedicated full-screen Kitchen Display System built for your kitchen staff. Two columns — Preparing and Ready to Serve. Each ticket shows the order number, table name, item names, quantities, customisations, and special instructions. A live prep timer changes colour — green under 10 minutes, amber at 10–15, red beyond 15. Audio alert on every new order. Mark items ready with one tap.",
    callouts: ["Colour-coded timers", "Audio alerts", "Full-screen mode"],
    icon: "🍳",
    bg: "bg-white",
    flip: false,
  },
  {
    badge: "Menu Management",
    title: "Your menu, your way — with full modifier support",
    description:
      "Create unlimited categories and menu items. Add photos, prices, and dietary tags (Veg / Non-Veg). Build modifier groups — size, add-ons, extras — with individual price adjustments. Toggle item availability instantly; the change reflects on every customer's phone in seconds. Bulk import and export your entire menu.",
    callouts: ["Instant sync to customer app", "Bulk import/export", "Modifier groups"],
    icon: "🍽️",
    bg: "bg-background-secondary",
    flip: true,
  },
  {
    badge: "Smart Inventory",
    title: "Never run out of an ingredient mid-service",
    description:
      "Link ingredients to menu items with recipe quantities in kg, g, L, ml, or pieces. When an order is placed, stock is deducted automatically. Set minimum stock thresholds — Q Order alerts you when stock falls below the limit. If an ingredient hits zero, the menu item is automatically marked unavailable so customers can't order it.",
    callouts: ["Auto-deduction per order", "Zero-stock auto-disables item", "Hourly low-stock alerts"],
    icon: "📦",
    bg: "bg-white",
    flip: false,
  },
  {
    badge: "Staff & Attendance",
    title: "Your team, fully managed",
    description:
      "Add staff with role-based access — Owner, Admin, Manager, Staff. Each role sees only what they need. Track daily attendance — present, late, absent, on leave. Staff request leave; managers approve or deny from the panel. Payroll run tracking built in. Auto-lock the screen after idle time with a 6-digit PIN so your dashboard stays secure on shared devices.",
    callouts: ["4 access roles", "Daily attendance", "Leave management", "Auto-lock PIN"],
    icon: "👥",
    bg: "bg-background-secondary",
    flip: true,
  },
  {
    badge: "Discounts & Coupons",
    title: "Run offers that actually fill tables",
    description:
      "Create percentage or flat-amount discounts. Set minimum order value, maximum discount cap, and schedule by date range or day of the week. Attach coupon codes with per-customer and total usage limits. Discounts can auto-apply at checkout or require a code. Track usage in real-time.",
    callouts: ["Auto-apply or coupon code", "Usage limit controls", "Day-of-week scheduling"],
    icon: "🎟️",
    bg: "bg-white",
    flip: false,
  },
  {
    badge: "Analytics & Reports",
    title: "Know your numbers — grow your business",
    description:
      "Revenue trends by day, week, month, or custom date range. Top-selling items and categories. Peak hours analysis. Payment method breakdown (cash, card, UPI). Table performance and turnover. Item-level sales and inventory consumption reports. Staff attendance reports. Export any report to Excel.",
    callouts: ["Excel export", "Custom date ranges", "10+ report types"],
    icon: "📈",
    bg: "bg-background-secondary",
    flip: true,
  },
  {
    badge: "Thermal Printing",
    title: "KOT and bills — printed automatically",
    description:
      "Connect any ESC/POS compatible thermal printer over Bluetooth or your local network via TCP/IP. Auto-print Kitchen Order Tickets the moment an order is placed. Print detailed bills with your restaurant name, item breakdown, modifiers, GST, and payment summary. Configure printer connection and paper width from settings.",
    callouts: ["Bluetooth & network printers", "ESC/POS compatible", "Auto-print on order"],
    icon: "🖨️",
    bg: "bg-white",
    flip: false,
  },
  {
    badge: "Group Ordering",
    title: "One table, many phones — one order",
    description:
      "Create a group session with a shareable code. Friends at the same table join from their own phones and build their own cart individually. Everyone marks themselves ready. The host reviews the combined order and submits in one tap. All carts sync in real-time across every phone at the table.",
    callouts: ["Real-time sync", "Per-person cart", "Host submits all at once"],
    icon: "🤝",
    bg: "bg-background-secondary",
    flip: true,
  },
  {
    badge: "CRM",
    title: "Know your regulars. Reward your VIPs.",
    description:
      "Every customer who orders builds a profile automatically. View total visits, total spend, and average order value. Tag customers — VIP, Regular, New, Corporate, Inactive. Add private notes. Filter and search your full customer database. See full interaction history: every order, every feedback, every payment.",
    callouts: ["Auto-built profiles", "VIP tagging", "Full order history"],
    icon: "💬",
    bg: "bg-white",
    flip: false,
  },
  {
    badge: "Customer Feedback",
    title: "Turn every meal into a review",
    description:
      "Customers rate their experience across Food, Service, and Ambience. View aggregate scores, star distribution (1–5 breakdown), and individual written feedback — all linked to the order and the customer. Understand what's working and what needs attention, without leaving your dashboard.",
    callouts: ["Food · Service · Ambience", "Star distribution chart", "Linked to orders"],
    icon: "⭐",
    bg: "bg-background-secondary",
    flip: true,
  },
  {
    badge: "QSR Counter",
    title: "For the counter — quick service, zero friction",
    description:
      "A dedicated counter-side interface for takeaway and walk-in orders. Browse your full menu, add items, apply discounts, and place orders without a table. Hold tickets and recall them later for multi-queue counters. Print the KOT per kitchen station and the final bill at checkout.",
    callouts: ["Hold & recall tickets", "Takeaway orders", "Per-station KOT"],
    icon: "⚡",
    bg: "bg-white",
    flip: false,
  },
  {
    badge: "Swiggy & Zomato",
    title: "Aggregator orders — right inside your dashboard",
    description:
      "Connect your Swiggy and Zomato storefronts to Q Order. Incoming delivery orders appear on the same Kanban board as your dine-in orders. Your menu stays in sync across all channels — update a price or toggle an item in Q Order and it reflects on Swiggy and Zomato automatically. No more juggling multiple tablets.",
    callouts: ["Unified order board", "Menu sync across channels", "Single dashboard for all orders"],
    icon: "🛵",
    bg: "bg-background-secondary",
    flip: true,
  },
];

function FeatureSection({ feature, index }: { feature: typeof FEATURES[0]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className={`py-20 px-6 md:px-10 ${feature.bg}`}>
      <div className={`content-width flex flex-col ${feature.flip ? "lg:flex-row-reverse" : "lg:flex-row"} gap-16 items-center`}>
        {/* Text */}
        <motion.div
          className="flex-1 flex flex-col gap-6"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary bg-primary-muted px-3 py-1.5 rounded-full w-fit">
            {feature.badge}
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary leading-tight">
            {feature.title}
          </h2>
          <p className="text-lg text-text-secondary leading-relaxed">
            {feature.description}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {feature.callouts.map((c) => (
              <motion.span
                key={c}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary bg-primary-muted px-3 py-1.5 rounded-full"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {c}
              </motion.span>
            ))}
          </div>
        </motion.div>

        {/* Mockup placeholder */}
        <motion.div
          className="flex-1 flex justify-center"
          initial={{ opacity: 0, x: feature.flip ? -40 : 40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          <div className="w-full max-w-md h-72 bg-gradient-to-br from-primary-muted to-background-secondary rounded-2xl border border-border shadow-elevated flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-3">{feature.icon}</div>
              <p className="text-sm font-medium text-text-muted">Screenshot — {feature.badge}</p>
              <p className="text-xs text-text-muted/60 mt-1">Place device mockup here</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-white font-sans">
      <Nav />

      {/* Hero */}
      <section className="pt-32 pb-20 text-center px-6 bg-background-secondary">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="text-sm font-bold uppercase tracking-widest text-primary">All Features</span>
          <h1 className="text-5xl md:text-6xl font-bold text-text-primary mt-4 mb-6 leading-tight">
            Everything your restaurant needs
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
            Q Order replaces your menu, order pad, KDS, inventory sheet, attendance register, and reports —
            all in one platform. Zero commission. No app download.
          </p>
        </motion.div>
      </section>

      {/* Feature sections */}
      {FEATURES.map((feature, i) => (
        <FeatureSection key={feature.badge} feature={feature} index={i} />
      ))}

      <CTABanner />
      <Footer />
    </main>
  );
}
