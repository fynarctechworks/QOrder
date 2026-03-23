"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";

export default function CTABanner() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <section ref={ref} className="relative section-padding overflow-hidden">
      <div className="absolute inset-0 bg-primary" />
      {/* Decorative circles */}
      <motion.div
        className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10 bg-white"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div
        className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full opacity-10 bg-white"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      <div className="content-width relative text-center flex flex-col items-center gap-8">
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-white max-w-3xl leading-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          Ready to modernise your restaurant?
        </motion.h2>
        <motion.p
          className="text-lg text-white/80 max-w-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          Join hundreds of restaurants using Q Order to serve faster, waste less, and grow smarter.
        </motion.p>
        <motion.div
          className="flex flex-wrap gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <Link
            href="/demo"
            className="px-8 py-4 bg-white text-primary font-bold rounded-xl hover:bg-primary-light transition-all duration-200 shadow-elevated hover:-translate-y-0.5"
          >
            Book a Free Demo
          </Link>
          <Link
            href="/pricing"
            className="px-8 py-4 border-2 border-white/50 text-white font-semibold rounded-xl hover:bg-white/10 transition-all duration-200"
          >
            View Pricing
          </Link>
        </motion.div>
        <motion.p
          className="text-sm text-white/60"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.4 }}
        >
          No credit card required · Zero commission · Cancel anytime
        </motion.p>
      </div>
    </section>
  );
}
