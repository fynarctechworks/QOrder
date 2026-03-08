import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { prisma } from '../lib/index.js';
import { logger } from '../lib/logger.js';

/* ═══════════════════════════ Types ════════════════════════════ */

export interface PrinterConfig {
  printerEnabled: boolean;
  printerConnectionType: 'network' | 'bluetooth' | 'browser';
  printerIp: string;
  printerPort: number;
  printerType: 'epson' | 'star';
  printerWidth: number; // chars per line (48 for 80mm, 32 for 58mm)
  autoPrintOnComplete: boolean;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  printerEnabled: false,
  printerConnectionType: 'network',
  printerIp: '',
  printerPort: 9100,
  printerType: 'epson',
  printerWidth: 48,
  autoPrintOnComplete: true,
};

interface PrintInvoiceData {
  invoiceNumber: string;
  restaurant: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    currency: string;
  };
  table: { number: string; name?: string | null } | null;
  date: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    modifiers?: { name: string; price: number }[];
    notes?: string | null;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  orderNumber?: string;
}

/* ═══════════════════════════ Helpers ═════════════════════════ */

function getPrinterType(type: string): string {
  switch (type) {
    case 'star':
      return PrinterTypes.STAR;
    default:
      return PrinterTypes.EPSON;
  }
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/* ═══════════════════════════ Service ═════════════════════════ */

export const printService = {
  /**
   * Get printer config from restaurant settings JSON
   */
  getPrinterConfig(settings: Record<string, unknown>): PrinterConfig {
    return {
      printerEnabled: (settings.printerEnabled as boolean) ?? DEFAULT_PRINTER_CONFIG.printerEnabled,
      printerConnectionType: (settings.printerConnectionType as 'network' | 'bluetooth' | 'browser') ?? DEFAULT_PRINTER_CONFIG.printerConnectionType,
      printerIp: (settings.printerIp as string) ?? DEFAULT_PRINTER_CONFIG.printerIp,
      printerPort: (settings.printerPort as number) ?? DEFAULT_PRINTER_CONFIG.printerPort,
      printerType: (settings.printerType as 'epson' | 'star') ?? DEFAULT_PRINTER_CONFIG.printerType,
      printerWidth: (settings.printerWidth as number) ?? DEFAULT_PRINTER_CONFIG.printerWidth,
      autoPrintOnComplete: (settings.autoPrintOnComplete as boolean) ?? DEFAULT_PRINTER_CONFIG.autoPrintOnComplete,
    };
  },

  /**
   * Create a thermal printer instance
   */
  createPrinter(config: PrinterConfig): ThermalPrinter {
    return new ThermalPrinter({
      type: getPrinterType(config.printerType) as any,
      interface: `tcp://${config.printerIp}:${config.printerPort}`,
      width: config.printerWidth,
      characterSet: CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
      options: {
        timeout: 5000,
      },
    });
  },

  /**
   * Test printer connection — returns true if printer is reachable
   */
  async testConnection(config: PrinterConfig): Promise<{ success: boolean; message: string }> {
    if (!config.printerIp) {
      return { success: false, message: 'Printer IP address is not configured' };
    }

    try {
      const printer = this.createPrinter(config);
      const isConnected = await printer.isPrinterConnected();
      
      if (isConnected) {
        // Print a small test receipt
        printer.alignCenter();
        printer.setTextDoubleHeight();
        printer.println('TEST PRINT');
        printer.setTextNormal();
        printer.drawLine();
        printer.println('Printer is connected and working!');
        printer.println(new Date().toLocaleString());
        printer.drawLine();
        printer.cut();
        await printer.execute();
        
        return { success: true, message: 'Printer is connected. Test receipt printed.' };
      } else {
        return { success: false, message: 'Printer is not reachable. Check IP address and ensure printer is powered on.' };
      }
    } catch (err: any) {
      logger.error({ err }, 'Printer connection test failed');
      return { 
        success: false, 
        message: `Connection failed: ${err.message || 'Unable to reach printer. Verify IP, port, and network.'}` 
      };
    }
  },

  /**
   * Print an invoice/receipt for a completed order
   */
  async printOrderReceipt(data: PrintInvoiceData, config: PrinterConfig): Promise<void> {
    const printer = this.createPrinter(config);
    const fmt = (amount: number) => formatCurrency(amount, data.restaurant.currency);
    const w = config.printerWidth;

    try {
      // ── Header ──
      printer.alignCenter();
      printer.setTextDoubleHeight();
      printer.bold(true);
      printer.println(data.restaurant.name);
      printer.bold(false);
      printer.setTextNormal();

      if (data.restaurant.address) {
        printer.println(data.restaurant.address);
      }
      if (data.restaurant.phone) {
        printer.println(`Tel: ${data.restaurant.phone}`);
      }

      printer.drawLine();

      // ── Invoice info ──
      printer.alignLeft();
      if (data.invoiceNumber) {
        printer.println(`Invoice: #${data.invoiceNumber}`);
      }
      if (data.orderNumber) {
        printer.println(`Order:   #${data.orderNumber}`);
      }
      if (data.table) {
        const tableLine = data.table.name 
          ? `Table:   ${data.table.number} (${data.table.name})`
          : `Table:   ${data.table.number}`;
        printer.println(tableLine);
      } else {
        printer.println('Type:    Takeaway');
      }
      printer.println(`Date:    ${new Date(data.date).toLocaleString()}`);

      printer.drawLine();

      // ── Items ──
      printer.bold(true);
      printer.tableCustom([
        { text: 'Item', align: 'LEFT', width: 0.5 },
        { text: 'Qty', align: 'CENTER', width: 0.15 },
        { text: 'Price', align: 'RIGHT', width: 0.35 },
      ]);
      printer.bold(false);
      printer.drawLine();

      for (const item of data.items) {
        printer.tableCustom([
          { text: item.name.substring(0, Math.floor(w * 0.5)), align: 'LEFT', width: 0.5 },
          { text: String(item.quantity), align: 'CENTER', width: 0.15 },
          { text: fmt(item.totalPrice), align: 'RIGHT', width: 0.35 },
        ]);

        // Modifiers
        if (item.modifiers && item.modifiers.length > 0) {
          for (const mod of item.modifiers) {
            const modText = mod.price > 0
              ? `  + ${mod.name} (${fmt(mod.price)})`
              : `  + ${mod.name}`;
            printer.println(modText);
          }
        }

        // Special instructions
        if (item.notes) {
          printer.println(`  * ${item.notes}`);
        }
      }

      printer.drawLine();

      // ── Totals ──
      printer.alignRight();
      // Right-align label + amount pairs
      const pad = (label: string, amount: string) => {
        const space = w - label.length - amount.length;
        return label + ' '.repeat(Math.max(1, space)) + amount;
      };

      printer.alignLeft();
      printer.println(pad('Subtotal:', fmt(data.subtotal)));
      if (data.tax > 0) {
        printer.println(pad('Tax:', fmt(data.tax)));
      }
      printer.drawLine();
      printer.bold(true);
      printer.setTextDoubleHeight();
      printer.println(pad('TOTAL:', fmt(data.total)));
      printer.setTextNormal();
      printer.bold(false);

      printer.drawLine();

      // ── Footer ──
      printer.alignCenter();
      printer.println('Thank you for dining with us!');
      printer.println('');

      // Feed and cut
      printer.cut();

      await printer.execute();
      logger.info({ invoiceNumber: data.invoiceNumber }, 'Receipt printed successfully');
    } catch (err) {
      logger.error({ err, invoiceNumber: data.invoiceNumber }, 'Failed to print receipt');
      throw err;
    }
  },

  /**
   * Auto-print when order completes — called from orderService
   * Fetches the full order data and prints it
   */
  async autoPrintOrder(orderId: string, restaurantId: string): Promise<void> {
    try {
      // Get restaurant settings
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          address: true,
          phone: true,
          email: true,
          currency: true,
          settings: true,
        },
      });

      if (!restaurant) return;

      const settings = (restaurant.settings as Record<string, unknown>) || {};
      const config = this.getPrinterConfig(settings);

      // Skip if printer is not enabled or auto-print is off
      if (!config.printerEnabled || !config.autoPrintOnComplete) {
        return;
      }

      // Skip server-side printing for bluetooth/browser (those are handled client-side)
      if (config.printerConnectionType !== 'network' || !config.printerIp) {
        return;
      }

      // Get order with all items
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          table: { select: { number: true, name: true } },
          items: {
            include: {
              menuItem: { select: { name: true } },
              modifiers: {
                include: {
                  modifier: {
                    include: {
                      modifierGroup: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!order) return;

      const invoiceData: PrintInvoiceData = {
        invoiceNumber: order.orderNumber || order.id.slice(0, 8).toUpperCase(),
        orderNumber: order.orderNumber || undefined,
        restaurant: {
          name: restaurant.name,
          address: restaurant.address,
          phone: restaurant.phone,
          email: restaurant.email,
          currency: restaurant.currency,
        },
        table: order.table
          ? { number: order.table.number, name: order.table.name }
          : null,
        date: order.createdAt.toISOString(),
        items: order.items.map(item => ({
          name: item.menuItem?.name ?? 'Deleted Item',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          modifiers: item.modifiers.map(mod => ({
            name: mod.modifier?.modifierGroup
              ? `${mod.modifier.modifierGroup.name}: ${mod.name}`
              : mod.name,
            price: Number(mod.price),
          })),
          notes: item.notes,
        })),
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        total: Number(order.total),
      };

      await this.printOrderReceipt(invoiceData, config);
    } catch (err) {
      // Never let print failures break the order flow
      logger.error({ err, orderId }, 'Auto-print failed for order — skipping silently');
    }
  },
};
