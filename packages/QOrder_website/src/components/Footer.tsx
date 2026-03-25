import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-text-primary text-white">
      <div className="content-width px-6 md:px-10 py-16 grid md:grid-cols-4 gap-10">
        {/* Brand */}
        <div className="flex flex-col gap-4">
          <Image
            src="/Q Order Logo Landscape.svg"
            alt="Q Order"
            width={110}
            height={32}
            className="brightness-0 invert"
          />
          <p className="text-sm text-white/60 leading-relaxed">
            The smartest way to run your restaurant floor.
          </p>
          <p className="text-xs text-white/40">Made with ❤️ by FYN ARC Techworks</p>
        </div>

        {/* Product */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold uppercase tracking-wider text-white/50">Product</p>
          <Link href="/features" className="text-sm text-white/70 hover:text-white transition-colors">Features</Link>
          <Link href="/pricing" className="text-sm text-white/70 hover:text-white transition-colors">Pricing</Link>
          <Link href="/demo" className="text-sm text-white/70 hover:text-white transition-colors">Book a Demo</Link>
        </div>

        {/* Company */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold uppercase tracking-wider text-white/50">Company</p>
          <Link href="/about" className="text-sm text-white/70 hover:text-white transition-colors">About</Link>
          <Link href="/contact" className="text-sm text-white/70 hover:text-white transition-colors">Contact</Link>
        </div>

        {/* Legal */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold uppercase tracking-wider text-white/50">Legal</p>
          <Link href="/privacy" className="text-sm text-white/70 hover:text-white transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="text-sm text-white/70 hover:text-white transition-colors">Terms of Service</Link>
        </div>
      </div>
      <div className="border-t border-white/10 px-6 md:px-10 py-6 content-width flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-white/40">© {new Date().getFullYear()} FYN ARC Techworks. All rights reserved.</p>
        <p className="text-xs text-white/40">Q Order · Scan. Order. Done.</p>
      </div>
    </footer>
  );
}
