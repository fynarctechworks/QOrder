"use client";

import { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const TABLES_OPTIONS = ["1–10 tables", "11–25 tables", "26–50 tables", "50+ tables"];
const SYSTEM_OPTIONS = ["Pen & Paper", "POS Machine", "Other QR App", "Nothing currently"];

export default function DemoPage() {
  const formRef = useRef(null);
  const formInView = useInView(formRef, { once: true });
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    restaurantName: "",
    name: "",
    phone: "",
    email: "",
    city: "",
    tables: "",
    currentSystem: "",
    message: "",
  });

  const update = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const inputClass =
    "w-full px-4 py-3.5 bg-white border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

  return (
    <main className="min-h-screen bg-white font-sans">
      <Nav />

      <section className="pt-32 pb-20 px-6">
        <div className="content-width grid lg:grid-cols-2 gap-16 items-start max-w-5xl mx-auto">
          {/* Left — info */}
          <motion.div
            className="flex flex-col gap-8"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              <span className="text-sm font-bold uppercase tracking-widest text-primary">Book a Demo</span>
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mt-4 leading-tight">
                See Q Order in action
              </h1>
              <p className="text-lg text-text-secondary mt-4 leading-relaxed">
                15 minutes. No pressure. We'll show you exactly how Q Order fits your restaurant — live, with your own menu if you'd like.
              </p>
            </div>

            {/* Trust points */}
            <div className="flex flex-col gap-4">
              {[
                { icon: "⚡", title: "Response within 2 hours", desc: "We'll confirm your slot fast — no back-and-forth." },
                { icon: "🎯", title: "Tailored to your restaurant", desc: "We demo with your menu type and flow in mind." },
                { icon: "🔒", title: "No commitment", desc: "No credit card. No lock-in. Just a conversation." },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 items-start p-4 bg-background-secondary rounded-xl border border-border">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-text-primary">{item.title}</p>
                    <p className="text-sm text-text-secondary mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="bg-primary-muted border border-primary/20 rounded-xl p-5">
              <p className="text-text-secondary italic leading-relaxed">
                "The demo sold us in 5 minutes. We went live the same day and haven't looked back."
              </p>
              <p className="text-sm font-semibold text-primary mt-3">— Restaurant Owner, Chennai</p>
            </div>
          </motion.div>

          {/* Right — form */}
          <motion.div
            ref={formRef}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-background-secondary border border-border rounded-2xl p-10 text-center shadow-card"
              >
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-text-primary mb-3">You're booked!</h2>
                <p className="text-text-secondary leading-relaxed">
                  We've received your request and will reach out within 2 hours to confirm your demo slot.
                </p>
                <p className="text-sm text-text-muted mt-4">Check your WhatsApp and email for confirmation.</p>
              </motion.div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-white border border-border rounded-2xl p-8 shadow-card flex flex-col gap-5"
              >
                <h2 className="text-xl font-bold text-text-primary">Book your free demo</h2>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Restaurant Name *</label>
                    <input
                      required
                      type="text"
                      className={inputClass}
                      placeholder="e.g. Spice Garden"
                      value={form.restaurantName}
                      onChange={(e) => update("restaurantName", e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Your Name *</label>
                    <input
                      required
                      type="text"
                      className={inputClass}
                      placeholder="Full name"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">WhatsApp Number *</label>
                    <input
                      required
                      type="tel"
                      className={inputClass}
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Email *</label>
                    <input
                      required
                      type="email"
                      className={inputClass}
                      placeholder="you@restaurant.com"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">City *</label>
                    <input
                      required
                      type="text"
                      className={inputClass}
                      placeholder="e.g. Chennai"
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Number of Tables</label>
                    <select
                      className={inputClass}
                      value={form.tables}
                      onChange={(e) => update("tables", e.target.value)}
                    >
                      <option value="">Select range</option>
                      {TABLES_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Current System</label>
                  <select
                    className={inputClass}
                    value={form.currentSystem}
                    onChange={(e) => update("currentSystem", e.target.value)}
                  >
                    <option value="">How do you take orders now?</option>
                    {SYSTEM_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Message (optional)</label>
                  <textarea
                    rows={3}
                    className={inputClass + " resize-none"}
                    placeholder="Anything specific you'd like us to cover in the demo?"
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-all duration-200 shadow-glow hover:shadow-none hover:-translate-y-0.5 active:translate-y-0 mt-1"
                >
                  Book My Free Demo →
                </button>

                <p className="text-xs text-text-muted text-center">
                  No credit card required · Response within 2 hours
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
