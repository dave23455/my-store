import autoBind from "auto-bind";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import {
  RegisterDTO,
  LoginDTO,
  UpdateProfileDTO,
  ForgotPasswordDTO,
  ResetPasswordDTO,
} from "./dto/auth.dto.js";

export class AuthController {
  private authService = new AuthService();

  constructor() {
    autoBind(this);
  }

  public register = async (req: Request, res: Response) => {
    const dto = req.body as RegisterDTO;
    const response = await this.authService.register(dto);
    res.status(response.status_code).json(response.data);
  };

  public login = async (req: Request, res: Response) => {
    const dto = req.body as LoginDTO;
    const response = await this.authService.login(dto);
    res.status(response.status_code).json(response.data);
  };

  public getMe = async (req: Request, res: Response) => {
    const response = await this.authService.getProfile(req.user!.id);
    res.status(response.status_code).json(response.data);
  };

  public updateMe = async (req: Request, res: Response) => {
    const dto = req.body as UpdateProfileDTO;
    const response = await this.authService.updateProfile(req.user!.id, dto);
    res.status(response.status_code).json(response.data);
  };

  public forgotPassword = async (req: Request, res: Response) => {
    const dto = req.body as ForgotPasswordDTO;
    const response = await this.authService.forgotPassword(dto);
    res.status(response.status_code).json({ message: response.message });
  };

  public resetPassword = async (req: Request, res: Response) => {
    const dto = req.body as ResetPasswordDTO;
    const response = await this.authService.resetPassword(dto);
    res.status(response.status_code).json({ message: response.message });
  };

  public logout = async (_req: Request, res: Response) => {
    res.status(204).end();
  };
}
