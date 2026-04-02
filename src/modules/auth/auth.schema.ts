import { z } from "zod";
import { RoleCode } from "@prisma/client";

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  password: z.string().min(8).max(120),
  role: z.nativeEnum(RoleCode).optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
