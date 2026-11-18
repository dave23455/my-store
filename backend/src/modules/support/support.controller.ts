import autoBind from "auto-bind";
import type { Request, Response } from "express";
import { ApiError } from "../../utils/api.response.utils.js";
import { SupportService } from "./support.service.js";
import {
  CreateCommentSchema,
  CreateMessageSchema,
  CreateReviewSchema,
} from "./dto/support.dto.js";

function currentUserId(req: Request): number {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function productParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string") throw ApiError.badRequest("Invalid product id.");
  return id;
}

export class SupportController {
  private service = new SupportService();

  constructor() {
    autoBind(this);
  }

  async getSettings(_req: Request, res: Response) {
    res.json(await this.service.getSettings());
  }

  async listReviews(req: Request, res: Response) {
    res.json(await this.service.listReviews(productParam(req)));
  }

  async createReview(req: Request, res: Response) {
    const input = CreateReviewSchema.parse(req.body);
    res.status(201).json(await this.service.createReview(
      productParam(req),
      currentUserId(req),
      input
    ));
  }

  async listComments(req: Request, res: Response) {
    res.json(await this.service.listComments(productParam(req)));
  }

  async createComment(req: Request, res: Response) {
    const input = CreateCommentSchema.parse(req.body);
    res.status(201).json(await this.service.createComment(
      productParam(req),
      currentUserId(req),
      input
    ));
  }

  async createMessage(req: Request, res: Response) {
    const input = CreateMessageSchema.parse(req.body);
    res.status(201).json(await this.service.createMessage(input));
  }

  async listMessages(_req: Request, res: Response) {
    res.json(await this.service.listMessages());
  }
}
