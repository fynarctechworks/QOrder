"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Scroll progress bar */}
      <motion.div
        className="fixed top-0 left-0 h-[3px] bg-primary z-[9999]"
        style={{ scaleX: 0, transformOrigin: "0%" }}
        animate={{ scaleX: scrolled ? 1 : 0 }}
      />

      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/90 backdrop-blur-md shadow-soft border-b border-border"
            : "bg-transparent"
        }`}
      >
        <div className="content-width flex items-center justify-between h-16 px-6 md:px-10">
          {/* Logo */}
          <Link href="/">
            <Image
              src="/Q Order Logo Landscape.svg"
              alt="Q Order"
              width={120}
              height={36}
              priority
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-sm font-medium text-text-secondary hover:text-primary transition-colors">Features</Link>
            <Link href="/pricing" className="text-sm font-medium text-text-secondary hover:text-primary transition-colors">Pricing</Link>
            <Link href="/demo" className="text-sm font-medium text-text-secondary hover:text-primary transition-colors">Book a Demo</Link>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/demo"
              className="text-sm font-semibold text-white bg-primary hover:bg-primary-hover px-5 py-2.5 rounded-xl transition-colors duration-200"
            >
              Book a Free Demo
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-text-primary"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 top-16 bg-white z-40 flex flex-col p-8 gap-6 md:hidden"
            >
              <Link href="/features" className="text-lg font-semibold text-text-primary" onClick={() => setMenuOpen(false)}>Features</Link>
              <Link href="/pricing" className="text-lg font-semibold text-text-primary" onClick={() => setMenuOpen(false)}>Pricing</Link>
              <Link href="/demo" className="text-lg font-semibold text-text-primary" onClick={() => setMenuOpen(false)}>Book a Demo</Link>
              <Link
                href="/demo"
                className="text-center font-bold text-white bg-primary py-4 rounded-xl mt-4"
                onClick={() => setMenuOpen(false)}
              >
                Book a Free Demo
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
