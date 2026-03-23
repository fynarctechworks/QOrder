"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import FeaturesGrid from "@/components/FeaturesGrid";
import Comparison from "@/components/Comparison";
import CTABanner from "@/components/CTABanner";
import Footer from "@/components/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white font-sans">
      <Nav />
      <Hero />
      <HowItWorks />
      <FeaturesGrid />
      <Comparison />
      <CTABanner />
      <Footer />
    </main>
  );
}
