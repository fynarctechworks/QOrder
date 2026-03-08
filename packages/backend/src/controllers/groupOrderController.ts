import type { Request, Response, NextFunction } from 'express';
import { groupOrderService } from '../services/groupOrderService.js';

export const groupOrderController = {
  // ─── Create group order ──────────────────────────────────
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { restaurantId, tableId, sessionToken, hostName, hostPhone } = req.body;
      const group = await groupOrderService.create({
        restaurantId,
        tableId,
        sessionToken,
        hostName,
        hostPhone,
      });
      res.status(201).json({ success: true, data: group });
    } catch (err) { next(err); }
  },

  // ─── Get group by code ───────────────────────────────────
  async getByCode(req: Request, res: Response, next: NextFunction) {
    try {
      const group = await groupOrderService.getByCode(req.params.code!);
      res.json({ success: true, data: group });
    } catch (err) { next(err); }
  },

  // ─── Join group ──────────────────────────────────────────
  async join(req: Request, res: Response, next: NextFunction) {
    try {
      const participant = await groupOrderService.join(req.params.code!, {
        name: req.body.name,
        phone: req.body.phone,
      });
      res.status(201).json({ success: true, data: participant });
    } catch (err) { next(err); }
  },

  // ─── Add cart item ───────────────────────────────────────
  async addCartItem(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await groupOrderService.addCartItem(
        req.params.code!,
        req.params.participantId!,
        {
          menuItemId: req.body.menuItemId,
          quantity: req.body.quantity,
          notes: req.body.notes,
          modifiers: req.body.modifiers,
        },
      );
      res.status(201).json({ success: true, data: item });
    } catch (err) { next(err); }
  },

  // ─── Update cart item ────────────────────────────────────
  async updateCartItem(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await groupOrderService.updateCartItem(
        req.params.code!,
        req.params.participantId!,
        req.params.itemId!,
        { quantity: req.body.quantity },
      );
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  },

  // ─── Remove cart item ────────────────────────────────────
  async removeCartItem(req: Request, res: Response, next: NextFunction) {
    try {
      await groupOrderService.removeCartItem(
        req.params.code!,
        req.params.participantId!,
        req.params.itemId!,
      );
      res.json({ success: true, message: 'Item removed' });
    } catch (err) { next(err); }
  },

  // ─── Mark ready ──────────────────────────────────────────
  async markReady(req: Request, res: Response, next: NextFunction) {
    try {
      const participant = await groupOrderService.markReady(
        req.params.code!,
        req.params.participantId!,
      );
      res.json({ success: true, data: participant });
    } catch (err) { next(err); }
  },

  // ─── Submit group order ──────────────────────────────────
  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await groupOrderService.submit(
        req.params.code!,
        req.body.participantId,
      );
      res.json({ success: true, data: { ...result, newSessionToken: result.newSessionToken } });
    } catch (err) { next(err); }
  },

  // ─── Cancel group order ──────────────────────────────────
  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      await groupOrderService.cancel(
        req.params.code!,
        req.body.participantId,
      );
      res.json({ success: true, message: 'Group order cancelled' });
    } catch (err) { next(err); }
  },
};
