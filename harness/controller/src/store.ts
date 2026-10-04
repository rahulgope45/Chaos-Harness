import { createPrismaClient, type DatabaseClient } from "@chaos/database";
import { controllerPolicySchema, type ControllerPolicy } from "./policy.js";

export interface PolicyStore {
  loadEnabled(): Promise<ControllerPolicy[]>;
  close(): Promise<void>;
}

export class PostgresPolicyStore implements PolicyStore {
  private readonly database: DatabaseClient;

  constructor(databaseUrl: string) {
    this.database = createPrismaClient(databaseUrl);
  }

  async loadEnabled(): Promise<ControllerPolicy[]> {
    const rows = await this.database.controllerPolicy.findMany({
      where: { enabled: true },
      orderBy: { id: "asc" }
    });
    return rows.map((row) => controllerPolicySchema.parse(row));
  }

  async close(): Promise<void> {
    await this.database.$disconnect();
  }
}
