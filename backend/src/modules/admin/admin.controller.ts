import autoBind from "auto-bind";
import type { Request, Response } from "express";
import { ApiError } from "../../utils/api.response.utils.js";
import { AdminService } from "./admin.service.js";
import {
  CreateStaffSchema,
  ReviewPaymentConfirmationSchema,
  StoreSettingsSchema,
  UpdateAdminOrderSchema,
} from "./dto/admin.dto.js";

const requiredParam = (value: string | string[], label: string): string => {
  if (typeof value !== "string") {
    throw ApiError.badRequest(`Invalid ${label}.`);
  }
  return value;
};

const positiveId = (value: string | string[], label: string): number => {
  value = requiredParam(value, label);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw ApiError.badRequest(`Invalid ${label}.`);
  }
  return id;
};

export class AdminController {
  private service = new AdminService();

  constructor() {
    autoBind(this);
  }

  async getDashboard(_req: Request, res: Response) {
    res.json(await this.service.getDashboard());
  }

  async listOrders(_req: Request, res: Response) {
    res.json(await this.service.listOrders());
  }

  async updateOrder(req: Request, res: Response) {
    const input = UpdateAdminOrderSchema.parse(req.body);
    res.json(await this.service.updateOrder(
      positiveId(req.params.id, "order id"),
      input
    ));
  }

  async listCustomers(_req: Request, res: Response) {
    res.json(await this.service.listCustomers());
  }

  async listCustomerOrders(req: Request, res: Response) {
    res.json(await this.service.listCustomerOrders(
      requiredParam(req.params.id, "customer id")
    ));
  }

  async listPaymentConfirmations(_req: Request, res: Response) {
    res.json(await this.service.listPaymentConfirmations());
  }

  async reviewPaymentConfirmation(req: Request, res: Response) {
    const input = ReviewPaymentConfirmationSchema.parse(req.body);
    res.json(await this.service.reviewPaymentConfirmation(
      positiveId(req.params.id, "payment confirmation id"),
      input.status
    ));
  }

  async listStaff(_req: Request, res: Response) {
    res.json(await this.service.listStaff());
  }

  async createStaff(req: Request, res: Response) {
    const input = CreateStaffSchema.parse(req.body);
    res.status(201).json(await this.service.createStaff(input));
  }

  async removeStaff(req: Request, res: Response) {
    await this.service.removeStaff(requiredParam(req.params.id, "staff id"));
    res.status(204).end();
  }

  async getSettings(_req: Request, res: Response) {
    res.json(await this.service.getSettings());
  }

  async updateSettings(req: Request, res: Response) {
    const settings = StoreSettingsSchema.parse(req.body);
    res.json(await this.service.updateSettings(settings));
  }
}
