import type { Request, Response } from "express";
import { ApiError } from "../../utils/api.response.utils.js";
import type {
  InitializePaymentDTO,
  ManualPaymentConfirmationDTO,
} from "./dto/payment.dto.js";
import { PaymentService } from "./payment.service.js";

const service = new PaymentService();

function currentUserId(req: Request): number {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export class PaymentController {
  async initialize(req: Request, res: Response) {
    const userId = currentUserId(req);
    const dto = req.body as InitializePaymentDTO;
    res.json(await service.initializePayment(dto.orderId, userId));
  }

  async confirm(req: Request, res: Response) {
    const dto = req.body as ManualPaymentConfirmationDTO;
    const confirmation = await service.confirmManualPayment({
      ...dto,
      userId: currentUserId(req),
    });
    res.status(201).json({
      message: "Payment confirmation sent for review.",
      confirmation,
    });
  }

  async verify(req: Request, res: Response) {
    const userId = currentUserId(req);
    const rawReference = req.params.reference;
    const reference = typeof rawReference === "string" ? rawReference.trim() : "";
    if (!reference || reference.length > 255) {
      throw ApiError.badRequest("Invalid payment reference.");
    }

    res.json(await service.verifyPayment(reference, userId));
  }

  async cancel(req: Request, res: Response) {
    const rawReference = req.params.reference;
    const reference = typeof rawReference === "string" ? rawReference.trim() : "";
    if (!reference || reference.length > 255) {
      throw ApiError.badRequest("Invalid payment reference.");
    }
    res.json(await service.cancelPaymentAttempt(reference, currentUserId(req)));
  }
}
