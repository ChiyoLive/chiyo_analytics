class DinamicEnvPublic {
  private API_URL_CACHE: string | undefined;

  async API_URL(): Promise<string> {
    if (this.API_URL_CACHE) {
      return this.API_URL_CACHE;
    }

    try {
      const res = await fetch("/api/where-cyanly");
      const data = (await res.json()) as { base_url: string };
      if (!data.base_url) {
        throw new Error("fetch cyanly success but server return invalid data");
      }
      this.API_URL_CACHE = data.base_url;
      return this.API_URL_CACHE;
    } catch (e) {
      console.error("can not fetch cyanly api url", e);
    }

    return "";
  }
}

export const denvPublic = new DinamicEnvPublic();

export type TimeRange = {
  start: string;
  end: string;
};

export function calculateTimeRange(range: string): TimeRange {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case "7d":
      start.setDate(end.getDate() - 7);
      break;
    case "30d":
      start.setDate(end.getDate() - 30);
      break;
    case "24h":
    default:
      start.setHours(end.getHours() - 24);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
