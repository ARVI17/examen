import { NextFunction, Request, Response } from "express";
import { ZodTypeAny, z } from "zod";
import { AppError } from "../common/errors/AppError";

type ValidationSchemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

const toValidationError = (error: z.ZodError) => {
  return new AppError("Error de validacion", 400, "VALIDATION_ERROR", error.flatten());
};

export const validateRequest = (schemas: ValidationSchemas) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw toValidationError(error);
      }
      throw error;
    }
  };
};
