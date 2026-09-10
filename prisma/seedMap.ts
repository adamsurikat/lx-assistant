// One-off script to seed the MapPort/MapDepot/MapRoute tables with the data
// that used to live in src/lib/mapData.ts, now that the Map page reads
// (and writes) these annotations from the database instead. Safe to re-run:
// skips seeding anything that already has rows.
//
// Run with: npx tsx prisma/seedMap.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [portCount, depotCount, routeCount] = await Promise.all([
    prisma.mapPort.count(),
    prisma.mapDepot.count(),
    prisma.mapRoute.count(),
  ]);

  if (portCount === 0) {
    await prisma.mapPort.createMany({
      data: [
        {
          name: "Rotterdam",
          code: "RTM",
          country: "Netherlands",
          lat: 51.9496,
          lng: 4.1453,
          description: "Largest seaport in Europe, key gateway for imports into the EU.",
        },
        {
          name: "Singapore",
          code: "SIN",
          country: "Singapore",
          lat: 1.2644,
          lng: 103.84,
          description: "One of the busiest transshipment hubs in the world.",
        },
        {
          name: "Shanghai",
          code: "SHA",
          country: "China",
          lat: 31.2304,
          lng: 121.4737,
          description: "World's busiest container port by volume.",
        },
        {
          name: "Los Angeles",
          code: "LAX",
          country: "United States",
          lat: 33.7288,
          lng: -118.262,
          description: "Busiest container port in the Americas.",
        },
        {
          name: "Belfast",
          code: "BELF",
          tenant: "stenaline",
          country: "United Kingdom",
          lat: 54.6058,
          lng: -5.8977,
          description: "Northern Ireland's main port, key link on Irish Sea ferry routes.",
        },
        {
          name: "Heysham",
          code: "HEYS",
          tenant: "stenaline",
          country: "United Kingdom",
          lat: 54.0333,
          lng: -2.9,
          description: "North-west England port serving Irish Sea ferry routes to Belfast and Douglas.",
        },
      ],
    });
    console.log("Seeded MapPort");
  }

  if (depotCount === 0) {
    await prisma.mapDepot.createMany({
      data: [
        {
          name: "Amsterdam Truck Depot",
          country: "Netherlands",
          tenant: "kn",
          lat: 52.3676,
          lng: 4.9041,
          description: "Regional distribution depot serving the Benelux area.",
        },
        {
          name: "Chicago Truck Depot",
          country: "United States",
          lat: 41.8781,
          lng: -87.6298,
          description: "Major inland hub connecting rail and road freight in the US.",
        },
        {
          name: "Guangzhou Truck Depot",
          country: "China",
          lat: 23.1291,
          lng: 113.2644,
          description: "Depot supporting last-mile distribution in the Pearl River Delta.",
        },
      ],
    });
    console.log("Seeded MapDepot");
  }

  if (routeCount === 0) {
    const findPort = (name: string) => prisma.mapPort.findFirstOrThrow({ where: { name } });
    const [singapore, rotterdam, shanghai, losAngeles, belfast, heysham] = await Promise.all([
      findPort("Singapore"),
      findPort("Rotterdam"),
      findPort("Shanghai"),
      findPort("Los Angeles"),
      findPort("Belfast"),
      findPort("Heysham"),
    ]);

    await prisma.mapRoute.createMany({
      data: [
        {
          name: "Asia \u2192 Europe",
          description: "Main east-west trade lane via the Suez Canal.",
          startPortId: singapore.id,
          endPortId: rotterdam.id,
          control1Lat: 12.5654,
          control1Lng: 43.1483,
          control2Lat: 36.1408,
          control2Lng: -5.3536,
        },
        {
          name: "Asia \u2192 US West Coast",
          description: "Trans-Pacific route linking Shanghai to Los Angeles.",
          startPortId: shanghai.id,
          endPortId: losAngeles.id,
          control1Lat: 26.2041,
          control1Lng: 127.6791,
          control2Lat: 26.2041,
          control2Lng: 127.6791,
        },
        {
          name: "Belfast \u2194 Heysham",
          description:
            "Irish Sea ferry lane linking Belfast and Heysham, drawn as a cubic bezier curve that bows north through the North Channel past Girvan before curving south to Heysham.",
          startPortId: belfast.id,
          endPortId: heysham.id,
          control1Lat: 55.2456,
          control1Lng: -4.8517,
          control2Lat: 53.7,
          control2Lng: -4.3,
        },
      ],
    });
    console.log("Seeded MapRoute");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
