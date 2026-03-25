"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const STEPS = [
  {
    number: "01",
    title: "Print & Place",
    description:
      "Generate unique QR codes for every table. Print them. Place them. That's it.",
    icon: "🖨️",
  },
  {
    number: "02",
    title: "Customers Scan & Order",
    description:
      "No app download needed. Customers scan the QR, browse your menu with photos, customise their order, and place it — all from their phone.",
    icon: "📱",
  },
  {
    number: "03",
    title: "You Manage Everything",
    description:
      "Orders appear instantly on your dashboard and kitchen display. Manage statuses, settle bills, track analytics — all in real-time.",
    icon: "⚡",
  },
];

export default function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="section-padding bg-background-secondary" ref={ref}>
      <div className="content-width">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">How It Works</span>
          <h2 className="text-4xl font-bold text-text-primary mt-3">
            Up and running in 3 steps
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-0.5 bg-gradient-to-r from-primary-muted via-primary to-primary-muted" />

          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-8 shadow-card border border-border flex flex-col gap-4 relative"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shadow-glow">
                  {step.number}
                </div>
                <span className="text-2xl">{step.icon}</span>
              </div>
              <h3 className="text-xl font-bold text-text-primary">{step.title}</h3>
              <p className="text-text-secondary leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
