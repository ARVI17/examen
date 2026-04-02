import { RoleCode } from "@prisma/client";

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role?: RoleCode;
};

export type LoginInput = {
  email: string;
  password: string;
};
