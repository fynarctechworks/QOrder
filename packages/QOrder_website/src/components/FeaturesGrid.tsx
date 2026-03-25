"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const FEATURES = [
  {
    icon: "📷",
    title: "QR Table Ordering",
    description: "Contactless ordering from any smartphone. No app install required.",
  },
  {
    icon: "🎛️",
    title: "Live Order Dashboard",
    description: "See every order the second it's placed. Kanban board with drag-and-drop status updates.",
  },
  {
    icon: "🍳",
    title: "Kitchen Display System",
    description: "Dedicated KDS for your kitchen with colour-coded prep timers and audio alerts.",
  },
  {
    icon: "📦",
    title: "Smart Inventory",
    description: "Stock deducted automatically per order. Items auto-disable when an ingredient hits zero.",
  },
  {
    icon: "👥",
    title: "Staff & Attendance",
    description: "Manage roles, track daily attendance, and handle leave requests — all in one place.",
  },
  {
    icon: "🎟️",
    title: "Discounts & Coupons",
    description: "Auto-apply discounts or coupon codes with usage limits and day-of-week scheduling.",
  },
  {
    icon: "📈",
    title: "Analytics & Reports",
    description: "Revenue trends, popular items, peak hours, and 10+ report types — exportable to Excel.",
  },
  {
    icon: "🖨️",
    title: "Thermal Printing",
    description: "Auto-print KOT & bills on Bluetooth or network ESC/POS printers.",
  },
  {
    icon: "🛵",
    title: "Swiggy & Zomato Integration",
    description: "Sync your menu and receive Swiggy/Zomato orders directly into your Q Order dashboard.",
  },
];

export default function FeaturesGrid() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="section-padding bg-white" ref={ref}>
      <div className="content-width">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">Everything You Need</span>
          <h2 className="text-4xl font-bold text-text-primary mt-3">
            One platform. Every tool.
          </h2>
          <p className="text-lg text-text-secondary mt-4 max-w-2xl mx-auto">
            Q Order replaces your menu, order pad, KDS, inventory sheet, attendance register, and reports — all in one.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4, boxShadow: "0 12px 24px -4px rgba(0,0,0,0.12)" }}
              className="bg-white border border-border rounded-2xl p-6 shadow-card cursor-default group transition-all duration-200"
            >
              <motion.div
                className="text-3xl mb-4"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                {feature.icon}
              </motion.div>
              <h3 className="text-base font-bold text-text-primary mb-2 group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-sm text-text-muted leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
