import { useEffect, useRef } from 'react';

const UPLOAD_BASE = (import.meta.env.VITE_API_URL as string || 'http://localhost:3000/api').replace('/api', '');
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';
import { settingsService } from '../services/settingsService';

interface PrintInvoiceProps {
  sessionId: string;
  formatCurrency: (amount: number) => string;
  onClose: () => void;
}

interface InvoiceData {
  invoiceNumber: string;
  restaurant: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  table: {
    number: string;
    name?: string;
  };
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers: Array<{ name: string; price: number }>;
    notes?: string;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  payments: Array<{
    method: string;
    amount: number;
    createdAt: string;
  }>;
  totalPaid: number;
  remaining: number;
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function PrintInvoice({
  sessionId,
  formatCurrency,
  onClose,
}: PrintInvoiceProps) {
  const printedRef = useRef(false);

  const { data: invoice } = useQuery<InvoiceData>({
    queryKey: ['invoice', sessionId],
    queryFn: () => apiClient.get<InvoiceData>(`/sessions/${sessionId}/print`),
  });

  const { data: restaurantData } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!invoice || !restaurantData || printedRef.current) return;
    printedRef.current = true;

    const pls = (restaurantData.settings ?? {}) as Record<string, unknown>;
    const rawLogoUrl = (pls.qrLogoUrl || pls.printLogoUrl) as string | undefined;
    const logoUrl = (pls.printShowLogo !== false && rawLogoUrl)
      ? (rawLogoUrl.startsWith('/uploads')
        ? `${UPLOAD_BASE}${rawLogoUrl}`
        : rawLogoUrl)
      : '';
    const headerText = (pls.printShowAddress !== false && pls.printHeaderText) ? pls.printHeaderText as string : '';
    const footerText = (pls.printFooterText as string) || 'Thank you for dining with us!';
    const showAddress = (pls.printShowAddress as boolean) ?? true;
    const showModifiers = (pls.printShowItemModifiers as boolean) ?? true;
    const showInstructions = (pls.printShowSpecialInstructions as boolean) ?? true;
    const showSubtotal = (pls.printShowSubtotal as boolean) ?? true;
    const showTax = (pls.printShowTax as boolean) ?? true;

    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) { onClose(); return; }

    let html = `<!DOCTYPE html><html><head><title>Invoice ${escHtml(invoice.invoiceNumber)}</title><style>
      body{font-family:'Courier New',monospace;max-width:350px;margin:0 auto;padding:20px;color:#111;font-size:13px}
      h2{text-align:center;margin:0 0 4px;font-size:16px}
      .sub{text-align:center;color:#666;font-size:12px;margin:2px 0}
      .logo{text-align:center;margin-bottom:8px}
      .logo img{max-width:120px;max-height:60px}
      .header-text{text-align:center;color:#666;font-size:11px;white-space:pre-line;margin-bottom:8px}
      hr{border:none;border-top:1px dashed #999;margin:8px 0}
      .meta{font-size:12px;margin:4px 0}
      .meta .row{display:flex;justify-content:space-between}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{text-align:left;border-bottom:1px solid #333;padding:4px 2px;font-size:11px;text-transform:uppercase}
      th.r,td.r{text-align:right}
      th.c,td.c{text-align:center}
      td{padding:4px 2px;vertical-align:top}
      td.c{font-size:20px;font-weight:700}
      .mod{color:#888;font-size:10px;margin-top:1px}
      .note{color:#d97706;font-size:10px;margin-top:1px}
      .totals .row{display:flex;justify-content:space-between;padding:2px 0;font-size:13px}
      .totals .row.bold{font-weight:700;font-size:14px;border-top:2px solid #333;margin-top:4px;padding-top:6px}
      .payments .title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:4px}
      .payments .row{display:flex;justify-content:space-between;padding:2px 0;font-size:12px}
      .payments .row.paid{color:#059669;font-weight:700}
      .payments .row.remaining{color:#dc2626;font-weight:700}
      .footer{text-align:center;margin-top:12px;font-weight:700;font-size:13px}
      @page{size:80mm auto;margin:0}
      @media print{html,body{width:80mm;margin:0;padding:0;overflow:hidden}}
    </style></head><body>`;

    // Logo
    if (logoUrl) html += `<div class="logo"><img src="${escHtml(logoUrl)}" alt="logo"></div>`;

    // Restaurant name
    html += `<h2>${escHtml(invoice.restaurant.name)}</h2>`;

    // Header text or address
    if (headerText) {
      html += `<div class="header-text">${escHtml(headerText)}</div>`;
    } else if (showAddress) {
      if (invoice.restaurant.address) html += `<p class="sub">${escHtml(invoice.restaurant.address)}</p>`;
      if (invoice.restaurant.phone) html += `<p class="sub">Tel: ${escHtml(invoice.restaurant.phone)}</p>`;
      if (invoice.restaurant.email) html += `<p class="sub">${escHtml(invoice.restaurant.email)}</p>`;
    }

    html += `<hr>`;

    // Meta
    const tableName = invoice.table.number + (invoice.table.name ? ` (${invoice.table.name})` : '');
    const dateStr = new Date(invoice.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    html += `<div class="meta">
      <div class="row"><span>Invoice No:</span><span>${escHtml(invoice.invoiceNumber)}</span></div>
      <div class="row"><span>Table:</span><span>${escHtml(tableName)}</span></div>
      <div class="row"><span>Date:</span><span>${escHtml(dateStr)}</span></div>
    </div>`;

    html += `<hr>`;

    // Items table
    html += `<table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>`;
    invoice.items.forEach(item => {
      html += `<tr><td>${escHtml(item.name)}`;
      if (showModifiers && item.modifiers.length > 0) {
        item.modifiers.forEach(mod => {
          html += `<div class="mod">+ ${escHtml(mod.name)} (${formatCurrency(mod.price)})</div>`;
        });
      }
      if (showInstructions && item.notes) {
        html += `<div class="note">Note: ${escHtml(item.notes)}</div>`;
      }
      html += `</td><td class="c">${item.quantity}</td><td class="r">${formatCurrency(item.unitPrice)}</td><td class="r"><b>${formatCurrency(item.totalPrice)}</b></td></tr>`;
    });
    html += `</tbody></table>`;

    html += `<hr>`;

    // Totals
    html += `<div class="totals">`;
    if (showSubtotal) html += `<div class="row"><span>Subtotal:</span><span>${formatCurrency(invoice.subtotal)}</span></div>`;
    if (showTax) html += `<div class="row"><span>Tax:</span><span>${formatCurrency(invoice.tax)}</span></div>`;
    html += `<div class="row bold"><span>Total:</span><span>${formatCurrency(invoice.total)}</span></div>`;
    html += `</div>`;

    // Payments
    if (invoice.payments.length > 0) {
      html += `<hr><div class="payments"><div class="title">Payments</div>`;
      invoice.payments.forEach(p => {
        const time = new Date(p.createdAt).toLocaleString('en-IN', { timeStyle: 'short' });
        html += `<div class="row"><span>${escHtml(p.method)} - ${escHtml(time)}</span><span>${formatCurrency(p.amount)}</span></div>`;
      });
      html += `<div class="row paid"><span>Paid:</span><span>${formatCurrency(invoice.totalPaid)}</span></div>`;
      if (invoice.remaining > 0) {
        html += `<div class="row remaining"><span>Remaining:</span><span>${formatCurrency(invoice.remaining)}</span></div>`;
      }
      html += `</div>`;
    }

    // Footer
    html += `<hr><div class="footer">${escHtml(footerText)}</div>`;

    html += `</body></html>`;

    w.document.write(html);
    w.document.close();

    setTimeout(() => {
      w.print();
      w.onafterprint = () => { w.close(); onClose(); };
    }, 300);
  }, [invoice, restaurantData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render nothing on the main page
  return null;
}
