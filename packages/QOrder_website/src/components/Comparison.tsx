"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ROWS: { feature: string; qorder: boolean | "partial"; paper: boolean | "partial"; others: boolean | "partial" }[] = [
  { feature: "Zero commission per order", qorder: true, paper: true, others: false },
  { feature: "No customer app download", qorder: true, paper: false, others: true },
  { feature: "Real-time kitchen display (KDS)", qorder: true, paper: false, others: "partial" },
  { feature: "Smart inventory auto-deduction", qorder: true, paper: false, others: false },
  { feature: "Staff roles & attendance", qorder: true, paper: false, others: false },
  { feature: "Discounts & coupon codes", qorder: true, paper: false, others: "partial" },
  { feature: "Group ordering (multi-person)", qorder: true, paper: false, others: false },
  { feature: "Thermal printer support", qorder: true, paper: false, others: false },
  { feature: "Works on any device", qorder: true, paper: false, others: true },
  { feature: "Swiggy / Zomato integration", qorder: true, paper: false, others: false },
];

function Cell({ value }: { value: boolean | "partial" }) {
  if (value === true)
    return (
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        className="text-green-500 font-bold text-lg"
      >
        ✓
      </motion.span>
    );
  if (value === "partial")
    return <span className="text-yellow-500 text-sm font-medium">Limited</span>;
  return <span className="text-red-400 font-bold text-lg">✕</span>;
}

export default function Comparison() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="section-padding bg-background-secondary" ref={ref}>
      <div className="content-width">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">Why Q Order</span>
          <h2 className="text-4xl font-bold text-text-primary mt-3">
            See how we compare
          </h2>
        </motion.div>

        <div className="overflow-x-auto rounded-2xl border border-border shadow-card">
          <table className="w-full bg-white text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-5 font-semibold text-text-muted">Feature</th>
                <th className="text-center p-5">
                  <span className="inline-block bg-primary text-white font-bold text-xs px-3 py-1 rounded-full">Q Order</span>
                </th>
                <th className="text-center p-5 font-semibold text-text-muted">Pen & Paper</th>
                <th className="text-center p-5 font-semibold text-text-muted">Other QR Apps</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0, x: -20 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-background-secondary/40"}`}
                >
                  <td className="p-5 font-medium text-text-primary">{row.feature}</td>
                  <td className="p-5 text-center"><Cell value={row.qorder} /></td>
                  <td className="p-5 text-center"><Cell value={row.paper} /></td>
                  <td className="p-5 text-center"><Cell value={row.others} /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
