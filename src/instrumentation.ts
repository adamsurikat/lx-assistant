export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAdminAccount } = await import("./lib/localAuth");
    await ensureAdminAccount();
    const { prisma } = await import("./lib/prisma");
    const { seedMapDataIfEmpty } = await import("./lib/seedMapData");
    const result = await seedMapDataIfEmpty(prisma);

    if (result) {
      console.info(
        `Seeded map from mapData.geojson: ${result.portsCreated} ports, ` +
          `${result.depotsCreated} depots, ${result.routesCreated} routes.`,
      );
    }
  }
}
