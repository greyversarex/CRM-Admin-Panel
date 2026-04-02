import { Router } from "express";

const router = Router();

const platforms = ["Spotify", "Apple Music", "YouTube Music", "Yandex Music", "VK Music", "Tidal", "Amazon Music", "Deezer"];

router.get("/analytics/streams", async (req, res): Promise<void> => {
  const period = (req.query.period as string) ?? "30d";
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;

  const byDay = [];
  const now = new Date();
  let totalStreams = 0;
  let totalRevenue = 0;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const streams = Math.floor(Math.random() * 50000) + 5000;
    const revenue = parseFloat((streams * 0.004).toFixed(2));
    totalStreams += streams;
    totalRevenue += revenue;
    byDay.push({
      date: date.toISOString().split("T")[0],
      streams,
      revenue,
    });
  }

  res.json({
    totalStreams,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    byDay,
  });
});

router.get("/analytics/platforms", async (req, res): Promise<void> => {
  const total = 5000000;
  const result = platforms.map((p, i) => {
    const streams = Math.floor(Math.random() * (total / 2)) + 100000;
    return {
      platform: p,
      streams,
      revenue: parseFloat((streams * 0.004).toFixed(2)),
      percentage: parseFloat(((streams / total) * 100).toFixed(1)),
    };
  });

  res.json(result);
});

router.get("/analytics/geography", async (req, res): Promise<void> => {
  const countries = [
    { country: "Tajikistan", countryCode: "TJ" },
    { country: "Russia", countryCode: "RU" },
    { country: "Uzbekistan", countryCode: "UZ" },
    { country: "Kazakhstan", countryCode: "KZ" },
    { country: "Germany", countryCode: "DE" },
    { country: "United States", countryCode: "US" },
    { country: "Turkey", countryCode: "TR" },
    { country: "Afghanistan", countryCode: "AF" },
    { country: "United Kingdom", countryCode: "GB" },
    { country: "UAE", countryCode: "AE" },
  ];

  const total = 10000000;
  const result = countries.map(c => {
    const streams = Math.floor(Math.random() * 2000000) + 50000;
    return {
      ...c,
      streams,
      revenue: parseFloat((streams * 0.003).toFixed(2)),
      percentage: parseFloat(((streams / total) * 100).toFixed(1)),
    };
  });

  res.json(result);
});

export default router;
