import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleCode } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

const fail = (message: string): never => {
  throw new Error(message);
};

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`Variable requerida no configurada: ${name}`);
  }
  return value as string;
};

const main = async () => {
  const email = requiredEnv("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("BOOTSTRAP_ADMIN_PASSWORD");
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrador";

  if (password.length < 12) {
    fail("BOOTSTRAP_ADMIN_PASSWORD debe tener minimo 12 caracteres.");
  }

  const adminRole = await prisma.role.upsert({
    where: { code: RoleCode.ADMIN },
    update: {
      name: "admin",
      description: "Administrador de la plataforma"
    },
    create: {
      code: RoleCode.ADMIN,
      name: "admin",
      description: "Administrador de la plataforma"
    }
  });

  const passwordHash = bcrypt.hashSync(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      roleId: adminRole.id,
      passwordHash,
      isActive: true
    },
    create: {
      name,
      email,
      roleId: adminRole.id,
      passwordHash,
      isActive: true
    }
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        message: "Admin bootstrap completado",
        data: {
          id: user.id,
          email: user.email,
          role: RoleCode.ADMIN
        }
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          message: error instanceof Error ? error.message : "No se pudo bootstrapear admin"
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
