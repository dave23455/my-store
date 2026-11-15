import type { Request, Response } from "express";
import { ApiError } from "../../utils/api.response.utils.js";
import { parsePublicId } from "../../utils/public-id.utils.js";
import { CartService } from "./cart.service.js";

const service = new CartService();

function currentUserId(req: Request): number {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function itemId(value: string | string[] | undefined): string {
  return parsePublicId(value, "cart item id");
}

export class CartController {
  async getCart(req: Request, res: Response) {
    res.json(await service.getCart(currentUserId(req)));
  }

  async clearCart(req: Request, res: Response) {
    await service.clearCart(currentUserId(req));
    res.status(204).end();
  }

  async addItem(req: Request, res: Response) {
    res.status(201).json(await service.addItem(currentUserId(req), req.body));
  }

  async updateItem(req: Request, res: Response) {
    res.json(await service.updateItem(
      currentUserId(req),
      itemId(req.params.id),
      req.body.quantity
    ));
  }

  async removeItem(req: Request, res: Response) {
    await service.removeItem(currentUserId(req), itemId(req.params.id));
    res.status(204).end();
  }

  async mergeItems(req: Request, res: Response) {
    res.json(await service.mergeItems(currentUserId(req), req.body.items));
  }
}
