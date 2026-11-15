import type { Request, Response } from "express";
import { ApiError } from "../../utils/api.response.utils.js";
import { parsePublicId } from "../../utils/public-id.utils.js";
import { OrdersService } from "./orders.service.js";

const service = new OrdersService();

function currentUserId(req: Request): number {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export class OrdersController {
  async create(req: Request, res: Response) {
    res.status(201).json(await service.createOrder(currentUserId(req), req.body));
  }

  async list(req: Request, res: Response) {
    res.json(await service.listOrders(currentUserId(req)));
  }

  async cancel(req: Request, res: Response) {
    res.json(await service.cancelOrder(
      currentUserId(req),
      parsePublicId(req.params.id, "order id")
    ));
  }
}
