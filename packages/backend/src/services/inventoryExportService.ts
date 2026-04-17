import ExcelJS from 'exceljs';
import { prisma } from '../lib/index.js';

const CURRENCY_FMT = '"₹"#,##0.00';
const DATE_FMT = 'dd-mmm-yyyy hh:mm AM/PM';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ExcelJS writes Date cells as UTC; shifting by +5:30 makes the displayed value IST.
function toIST(d: Date | null | undefined): Date | null {
  if (!d) return null;
  return new Date(d.getTime() + IST_OFFSET_MS);
}

function statusForStock(current: number, min: number): 'OUT' | 'LOW' | 'OK' {
  if (current <= 0) return 'OUT';
  if (min > 0 && current <= min) return 'LOW';
  return 'OK';
}

export const inventoryExportService = {
  async buildProductsWorkbook(restaurantId: string, branchId?: string | null) {
    const ingredients = await prisma.ingredient.findMany({
      where: {
        restaurantId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      include: {
        suppliers: {
          include: { supplier: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'QR Order Web';
    wb.created = new Date();

    const ws = wb.addWorksheet('Products');
    ws.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Category', key: 'category', width: 14 },
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Current Stock', key: 'currentStock', width: 14 },
      { header: 'Min Stock', key: 'minStock', width: 12 },
      { header: 'Cost / Unit', key: 'costPerUnit', width: 14, style: { numFmt: CURRENCY_FMT } },
      { header: 'Stock Value', key: 'stockValue', width: 14, style: { numFmt: CURRENCY_FMT } },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Preferred Supplier', key: 'supplier', width: 24 },
      { header: 'Active', key: 'isActive', width: 8 },
      { header: 'Last Updated', key: 'updatedAt', width: 20, style: { numFmt: DATE_FMT } },
    ];

    ingredients.forEach((i) => {
      const current = Number(i.currentStock);
      const min = Number(i.minStock);
      const cost = Number(i.costPerUnit);
      const preferred = i.suppliers.find((s) => s.isPreferred) ?? i.suppliers[0];
      ws.addRow({
        name: i.name,
        category: i.category,
        unit: i.unit,
        currentStock: current,
        minStock: min,
        costPerUnit: cost,
        stockValue: Number((current * cost).toFixed(2)),
        status: statusForStock(current, min),
        supplier: preferred?.supplier.name ?? '',
        isActive: i.isActive ? 'Yes' : 'No',
        updatedAt: toIST(i.updatedAt),
      });
    });

    // Header styling + row coloring
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const status = row.getCell('status').value;
      if (status === 'OUT') {
        row.getCell('status').fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' },
        };
      } else if (status === 'LOW') {
        row.getCell('status').fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' },
        };
      }
    });

    // Totals row
    const totalValue = ingredients.reduce(
      (sum, i) => sum + Number(i.currentStock) * Number(i.costPerUnit),
      0,
    );
    const totalRow = ws.addRow({
      name: `TOTAL (${ingredients.length} products)`,
      stockValue: Number(totalValue.toFixed(2)),
    });
    totalRow.font = { bold: true };
    totalRow.getCell('stockValue').numFmt = CURRENCY_FMT;

    return wb;
  },

  async buildStockMovementsWorkbook(
    restaurantId: string,
    filters?: { startDate?: string; endDate?: string; type?: string; ingredientId?: string },
  ) {
    const where: Record<string, unknown> = { restaurantId };
    if (filters?.type) where.type = filters.type;
    if (filters?.ingredientId) where.ingredientId = filters.ingredientId;
    if (filters?.startDate || filters?.endDate) {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters?.startDate) range.gte = new Date(filters.startDate);
      if (filters?.endDate) range.lte = new Date(new Date(filters.endDate).getTime() + 86400000);
      where.createdAt = range;
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        ingredient: { select: { name: true, unit: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const userIds = Array.from(
      new Set(movements.map((m) => m.performedBy).filter((v): v is string => !!v)),
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userNameById = new Map(
      users.map((u) => [u.id, u.name || u.email || u.id] as const),
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'QR Order Web';
    wb.created = new Date();

    const ws = wb.addWorksheet('Stock Movements');
    ws.columns = [
      { header: 'Date', key: 'date', width: 22, style: { numFmt: DATE_FMT } },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Product', key: 'product', width: 26 },
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'Price / Unit', key: 'price', width: 14, style: { numFmt: CURRENCY_FMT } },
      { header: 'Total Cost', key: 'total', width: 14, style: { numFmt: CURRENCY_FMT } },
      { header: 'Vendor', key: 'vendor', width: 22 },
      { header: 'Before', key: 'before', width: 10 },
      { header: 'After', key: 'after', width: 10 },
      { header: 'Notes', key: 'notes', width: 28 },
      { header: 'Performed By', key: 'performedBy', width: 20 },
    ];

    const ADDITIVE_TYPES = new Set(['PURCHASE', 'MANUAL_ADD', 'RETURN']);
    let sumIn = 0;
    let sumOut = 0;

    movements.forEach((m) => {
      const qty = Number(m.quantity);
      const price = m.costPerUnit != null ? Number(m.costPerUnit) : null;
      const total = m.totalCost != null
        ? Number(m.totalCost)
        : (price != null ? price * qty : null);
      const isAdd = ADDITIVE_TYPES.has(m.type);
      if (isAdd && total != null) sumIn += total;
      if (!isAdd && total != null) sumOut += total;

      ws.addRow({
        date: toIST(m.createdAt),
        type: m.type,
        product: m.ingredient?.name ?? '',
        unit: m.ingredient?.unit ?? '',
        qty: isAdd ? qty : -qty,
        price: price,
        total: total,
        vendor: m.supplier?.name ?? '',
        before: Number(m.previousQty),
        after: Number(m.newQty),
        notes: m.notes ?? '',
        performedBy: m.performedBy ? (userNameById.get(m.performedBy) ?? m.performedBy) : '',
      });
    });

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const qtyCell = row.getCell('qty');
      qtyCell.font = { color: { argb: Number(qtyCell.value) >= 0 ? 'FF2E7D32' : 'FFC62828' } };
    });

    const totalRow = ws.addRow({
      date: null,
      product: `TOTAL (${movements.length} movements)`,
      price: null,
      total: null,
    });
    totalRow.font = { bold: true };

    const summaryRow1 = ws.addRow({ product: 'Stock In value', total: Number(sumIn.toFixed(2)) });
    summaryRow1.font = { bold: true };
    summaryRow1.getCell('total').numFmt = CURRENCY_FMT;

    const summaryRow2 = ws.addRow({ product: 'Stock Out value', total: Number(sumOut.toFixed(2)) });
    summaryRow2.font = { bold: true };
    summaryRow2.getCell('total').numFmt = CURRENCY_FMT;

    return wb;
  },
};
