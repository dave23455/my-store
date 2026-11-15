import type { Request, Response } from "express";
import { parsePublicId } from "../../utils/public-id.utils.js";
import { CatalogService } from "./catalog.service.js";

const service = new CatalogService();

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export class CatalogController {
  async listCategories(_req: Request, res: Response) {
    res.json(await service.listCategories());
  }

  async listProducts(req: Request, res: Response) {
    res.json(await service.listProducts({
      search: queryString(req.query.search),
      category: queryString(req.query.category),
      sort: queryString(req.query.sort),
    }));
  }

  async getProduct(req: Request, res: Response) {
    res.json(await service.getProduct(parsePublicId(req.params.id, "product id")));
  }

  async listAdminProducts(_req: Request, res: Response) {
    res.json(await service.listAdminProducts());
  }

  async createProduct(req: Request, res: Response) {
    const product = await service.createProduct(req.body);
    res.status(201).json(product);
  }

  async updateProduct(req: Request, res: Response) {
    res.json(await service.updateProduct(
      parsePublicId(req.params.id, "product id"),
      req.body
    ));
  }

  async removeProduct(req: Request, res: Response) {
    await service.removeProduct(parsePublicId(req.params.id, "product id"));
    res.status(204).end();
  }

  async createVariant(req: Request, res: Response) {
    const variant = await service.createVariant(
      parsePublicId(req.params.id, "product id"),
      req.body
    );
    res.status(201).json(variant);
  }

  async createCategory(req: Request, res: Response) {
    res.status(201).json(await service.createCategory(req.body));
  }

  async updateCategory(req: Request, res: Response) {
    res.json(await service.updateCategory(
      parsePublicId(req.params.id, "category id"),
      req.body
    ));
  }

  async removeCategory(req: Request, res: Response) {
    await service.removeCategory(parsePublicId(req.params.id, "category id"));
    res.status(204).end();
  }

  async updateVariant(req: Request, res: Response) {
    res.json(await service.updateVariant(
      parsePublicId(req.params.id, "product id"),
      parsePublicId(req.params.variantId, "variant id"),
      req.body
    ));
  }

  async removeVariant(req: Request, res: Response) {
    await service.removeVariant(
      parsePublicId(req.params.id, "product id"),
      parsePublicId(req.params.variantId, "variant id")
    );
    res.status(204).end();
  }
}
