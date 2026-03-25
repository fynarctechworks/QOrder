"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] },
});

const TRUST_BADGES = [
  "Zero Commission",
  "No App Download",
  "Real-Time Ordering",
  "Setup in Minutes",
];

const ORDERS = [
  { table: "A-2", item: "Butter Chicken, Naan ×2", status: "Preparing", dot: "#F59E0B" },
  { table: "B-5", item: "Masala Dosa, Filter Coffee", status: "Ready", dot: "#22C55E" },
  { table: "C-1", item: "Paneer Tikka, Dal Makhani", status: "New", dot: "#F97316" },
  { table: "D-3", item: "Veg Biryani, Lassi", status: "Preparing", dot: "#F59E0B" },
];

const STATS = [
  { label: "Active Orders", value: "12" },
  { label: "Tables Busy", value: "8/15" },
  { label: "Today's Sales", value: "₹8,240" },
  { label: "Avg. Time", value: "14m" },
];

const DISHES = [
  { name: "Butter Chicken", price: "₹280", cal: "420 kcal" },
  { name: "Masala Dosa", price: "₹120", cal: "310 kcal" },
];

const CATS = ["All", "Starters", "Mains", "Drinks"];

function PhoneMockup() {
  return (
    <div className="flex items-end justify-center h-full">
      <div
        className="w-[200px] rounded-[44px] relative"
        style={{
          padding: "5px",
          background: "linear-gradient(160deg, #3a3a3c 0%, #1c1c1e 60%)",
          boxShadow:
            "0 0 0 1px #48484a, 0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="w-full rounded-[40px] overflow-hidden bg-white"
          style={{ aspectRatio: "9/19.5" }}
        >
          {/* Dynamic Island */}
          <div className="bg-white pt-3 pb-1 flex justify-center">
            <div
              className="w-[60px] h-[22px] rounded-full bg-black"
              style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}
            />
          </div>

          <div className="flex flex-col bg-white h-full pb-4">
            {/* Header */}
            <div
              className="px-4 py-3"
              style={{ background: "linear-gradient(135deg, #F97316 0%, #EA6C0A 100%)" }}
            >
              <p className="text-[9px] font-bold text-white leading-tight">Spice Garden</p>
              <p className="text-[7px] text-orange-100 mt-0.5">Table C-4 · Dine In</p>
            </div>

            {/* Search */}
            <div className="px-3 pt-2.5 pb-2">
              <div className="h-[20px] bg-gray-100 rounded-full flex items-center gap-2 px-2.5">
                <svg className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                </svg>
                <span className="text-[7px] text-gray-400">Search dishes...</span>
              </div>
            </div>

            {/* Category chips */}
            <div className="flex gap-1.5 px-3 pb-2.5">
              {CATS.map((c, i) => (
                <div
                  key={c}
                  className="flex-shrink-0 px-2.5 py-[3px] rounded-full text-[7px] font-semibold"
                  style={
                    i === 0
                      ? { background: "#F97316", color: "#fff" }
                      : { background: "#F3F4F6", color: "#6B7280" }
                  }
                >
                  {c}
                </div>
              ))}
            </div>

            <p className="text-[8px] font-bold text-gray-700 px-3 mb-2">Popular Dishes</p>

            <div className="flex flex-col gap-2 px-3">
              {DISHES.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center gap-2.5 bg-gray-50 rounded-2xl p-2"
                  style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
                >
                  <div className="w-11 h-11 rounded-xl bg-orange-100 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-semibold text-gray-800 truncate leading-tight">{d.name}</p>
                    <p className="text-[7px] text-gray-400 mt-0.5">{d.cal}</p>
                    <p className="text-[8.5px] font-bold text-primary mt-0.5">{d.price}</p>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[12px] font-bold leading-none">+</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div
          className="absolute right-[-2.5px] top-[100px] w-[3px] h-[46px] rounded-r-full"
          style={{ background: "linear-gradient(to right, #2a2a2c, #48484a)" }}
        />
        <div
          className="absolute left-[-2.5px] top-[88px] w-[3px] h-[32px] rounded-l-full"
          style={{ background: "linear-gradient(to left, #2a2a2c, #48484a)" }}
        />
        <div
          className="absolute left-[-2.5px] top-[128px] w-[3px] h-[32px] rounded-l-full"
          style={{ background: "linear-gradient(to left, #2a2a2c, #48484a)" }}
        />
      </div>
    </div>
  );
}

function LaptopMockup() {
  return (
    <div className="flex items-end justify-center h-full">
      <div className="w-[520px]">
        <div
          className="w-full rounded-t-[10px] overflow-hidden"
          style={{
            background: "#1c1c1e",
            boxShadow:
              "0 0 0 1.5px #3a3a3c, 0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Browser chrome */}
          <div className="flex items-center px-3 py-[7px] bg-[#232325]">
            <div className="flex items-center gap-1.5 mr-3">
              <span className="w-[11px] h-[11px] rounded-full bg-[#FF5F57] border border-[#E0443E]/40" />
              <span className="w-[11px] h-[11px] rounded-full bg-[#FEBC2E] border border-[#D4A017]/40" />
              <span className="w-[11px] h-[11px] rounded-full bg-[#28C840] border border-[#1DAD2B]/40" />
            </div>
            <div className="flex-1 h-[22px] bg-[#3a3a3c] rounded-md flex items-center justify-center gap-1.5 px-2">
              <svg className="w-2.5 h-2.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
              </svg>
              <span className="text-[9px] text-gray-400 tracking-wide">app.qorder.in/dashboard</span>
            </div>
          </div>

          {/* Dashboard */}
          <div className="w-full bg-[#f8f7f5]" style={{ aspectRatio: "16/10" }}>
            <div className="flex h-full">
              {/* Sidebar */}
              <div className="w-10 bg-white border-r border-gray-100 flex flex-col items-center pt-3 gap-3 flex-shrink-0">
                <div className="w-6 h-6 bg-primary/10 rounded-md flex items-center justify-center">
                  <div className="w-3 h-3 bg-primary rounded-sm" />
                </div>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-6 h-5 bg-gray-100 rounded-md" />
                ))}
              </div>

              {/* Main */}
              <div className="flex-1 p-4 flex flex-col gap-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <Image src="/Q Order Logo Landscape.svg" alt="Q Order" width={80} height={24} />
                  <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[8px] font-semibold text-green-700">Live</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {STATS.map((s, i) => (
                    <div
                      key={i}
                      className="bg-white rounded-xl p-3 border border-gray-100"
                      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                    >
                      <p className="text-[8px] text-gray-400">{s.label}</p>
                      <p className="text-[13px] font-bold text-gray-800 mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div
                  className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden"
                  style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                >
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-wide">Live Orders</span>
                    <span className="text-[8px] text-primary font-semibold">View all →</span>
                  </div>
                  <div className="px-3 py-1">
                    {ORDERS.map((o, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div className="w-[26px] h-[26px] bg-orange-50 border border-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-[8px] font-bold text-orange-600">{o.table}</span>
                        </div>
                        <p className="text-[9px] text-gray-600 flex-1 truncate">{o.item}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="w-2 h-2 rounded-full" style={{ background: o.dot }} />
                          <span className="text-[8px] font-medium text-gray-500">{o.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hinge + base */}
        <div className="w-full h-[4px]" style={{ background: "linear-gradient(to bottom, #48484a, #6e6e73)" }} />
        <div className="flex justify-center">
          <div className="w-[58%] h-[14px] rounded-b-[8px]" style={{ background: "linear-gradient(to bottom, #6e6e73, #aeaeb2)" }} />
        </div>
        <div className="flex justify-center mt-0.5">
          <div className="w-[62%] h-[6px] bg-black/10 blur-md rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const [active, setActive] = useState<"phone" | "laptop">("phone");
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const id = setInterval(() => {
      setDirection(1);
      setActive((prev) => (prev === "phone" ? "laptop" : "phone"));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const variants = {
    enter: (dir: number) => ({ x: dir * 80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir * -80, opacity: 0 }),
  };

  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-background-secondary to-white" />
      <motion.div
        className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #FDBA74, transparent)" }}
        animate={{ scale: [1, 1.1, 1], x: [0, 10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #F97316, transparent)" }}
        animate={{ scale: [1, 1.15, 1], x: [0, -10, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="content-width relative px-6 md:px-10 w-full grid lg:grid-cols-2 gap-16 items-center py-20">
        {/* Left — text */}
        <div className="flex flex-col gap-8">
          <motion.div {...fadeUp(0)}>
            <span className="inline-flex items-center gap-2 bg-primary-muted text-primary text-sm font-semibold px-4 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              QR Ordering for Restaurants
            </span>
          </motion.div>

          <motion.h1
            className="text-5xl lg:text-6xl font-bold text-text-primary leading-tight"
            {...fadeUp(0.1)}
          >
            Turn Every Table Into a{" "}
            <span className="text-primary">Revenue Machine</span>
          </motion.h1>

          <motion.p
            className="text-lg text-text-secondary leading-relaxed"
            {...fadeUp(0.2)}
          >
            Let customers scan, browse, and order from their phone — while your
            team focuses on what matters: the food.
          </motion.p>

          <motion.div className="flex flex-wrap gap-4" {...fadeUp(0.3)}>
            <Link
              href="/demo"
              className="px-8 py-4 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl transition-all duration-200 shadow-glow hover:shadow-none hover:-translate-y-0.5"
            >
              Book a Free Demo
            </Link>
            <Link
              href="/features"
              className="px-8 py-4 border-2 border-primary text-primary font-semibold rounded-xl hover:bg-primary-muted transition-all duration-200"
            >
              See All Features →
            </Link>
          </motion.div>

          <motion.div className="flex flex-wrap gap-3" {...fadeUp(0.4)}>
            {TRUST_BADGES.map((badge) => (
              <span
                key={badge}
                className="flex items-center gap-1.5 text-sm text-text-secondary bg-white border border-border px-3 py-1.5 rounded-full shadow-soft"
              >
                <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {badge}
              </span>
            ))}
          </motion.div>

          {/* Dots indicator */}
          <motion.div className="flex gap-2" {...fadeUp(0.5)}>
            {(["phone", "laptop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => { setDirection(d === "phone" ? -1 : 1); setActive(d); }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active === d ? "w-6 bg-primary" : "w-1.5 bg-gray-300"
                }`}
              />
            ))}
          </motion.div>
        </div>

        {/* Right — sliding device carousel */}
        <div className="hidden lg:block">
          {/* Clipping container — fixed height so layout never shifts */}
          <div className="relative h-[500px] overflow-hidden flex items-center justify-center">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={active}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                {active === "phone" ? <PhoneMockup /> : <LaptopMockup />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
