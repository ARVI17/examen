import { RoleCode } from "@prisma/client";

export type UserCreateInput = {
  name: string;
  email: string;
  password: string;
  role?: RoleCode;
  isActive?: boolean;
};

export type UserUpdateInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: RoleCode;
  isActive?: boolean;
};
