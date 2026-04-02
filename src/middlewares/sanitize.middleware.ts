import { NextFunction, Request, Response } from "express";
import { sanitizeObject } from "../common/utils/sanitize";

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeObject(req.body) as Request["body"];
  }

  if (req.query) {
    req.query = sanitizeObject(req.query) as Request["query"];
  }

  next();
};
