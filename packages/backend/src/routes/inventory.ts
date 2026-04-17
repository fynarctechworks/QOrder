import { Router } from 'express';
import { inventoryController } from '../controllers/inventoryController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';

const router = Router();

// All inventory routes require authentication
router.use(authenticate);
router.use(resolveBranch);

// ─── OVERVIEW ───────────────────────────────────────────────
router.get('/overview', inventoryController.getOverview);
router.get('/alerts', inventoryController.getLowStockAlerts);

// ─── INGREDIENTS ────────────────────────────────────────────
router.get('/ingredients', inventoryController.getIngredients);
router.get('/ingredients/:id', inventoryController.getIngredientById);
router.post('/ingredients', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.createIngredient);
router.patch('/ingredients/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.updateIngredient);
router.delete('/ingredients/:id', authorize('OWNER', 'ADMIN'), inventoryController.deleteIngredient);

// ─── STOCK ADJUSTMENTS ──────────────────────────────────────
router.post('/ingredients/:id/adjust', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.adjustStock);
router.get('/stock-history', inventoryController.getStockHistory);

// ─── EXPORTS ────────────────────────────────────────────────
router.get('/export/products', inventoryController.exportProducts);
router.get('/export/stock-movements', inventoryController.exportStockMovements);

// ─── USAGE / STOCK OUT ─────────────────────────────────────
router.post('/usage', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.recordUsage);
router.post('/auto-deduct/run', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.runAutoDeduct);
router.get('/daily-summary', inventoryController.getDailySummary);
router.get('/usage-trend', inventoryController.getUsageTrend);
router.get('/forecast', inventoryController.getForecast);

// ─── SUPPLIERS ──────────────────────────────────────────────
router.get('/suppliers', inventoryController.getSuppliers);
router.post('/suppliers', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.createSupplier);
router.patch('/suppliers/:id', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.updateSupplier);
router.delete('/suppliers/:id', authorize('OWNER', 'ADMIN'), inventoryController.deleteSupplier);

// ─── SUPPLIER LINKS ─────────────────────────────────────────
router.post('/ingredients/:ingredientId/suppliers', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.linkSupplier);
router.delete('/ingredients/:ingredientId/suppliers/:supplierId', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.unlinkSupplier);

// ─── PURCHASE ORDERS ────────────────────────────────────────
router.get('/purchase-orders', inventoryController.getPurchaseOrders);
router.post('/purchase-orders', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.createPurchaseOrder);
router.post('/purchase-orders/:id/receive', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.receivePurchaseOrder);
router.patch('/purchase-orders/:id/status', authorize('OWNER', 'ADMIN', 'MANAGER'), inventoryController.updatePurchaseOrderStatus);

export default router;
