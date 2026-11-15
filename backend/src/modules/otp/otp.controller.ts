import type { Request, Response } from "express";
import { otpService } from "./otp.service.js";

export class OtpController {
  async forgotPassword(req: Request, res: Response) {
    const result = await otpService.requestPasswordReset(req.body);
    res.status(result.status_code).json({ message: result.message });
  }

  async resetPassword(req: Request, res: Response) {
    const result = await otpService.resetPassword(req.body);
    res.status(result.status_code).json({ message: result.message });
  }

  async verifyEmail(req: Request, res: Response) {
    const result = await otpService.verifyEmail(req.body);
    res.status(result.status_code).json({ message: result.message });
  }

  async resendVerification(req: Request, res: Response) {
    const result = await otpService.resendEmailVerification(req.body);
    res.status(result.status_code).json({ message: result.message });
  }
}
