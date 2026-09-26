import axios from "axios";

const client = axios.create({
  baseURL: "/api/v1",
  timeout: 120000,
});

export const getExecutiveDashboard = () => client.get("/dashboard/executive").then((r) => r.data);

export const getMenuIntelligence = () => client.get("/menu/intelligence").then((r) => r.data);

export const getMarketBasket = () => client.get("/analytics/market-basket").then((r) => r.data);

export const getPromotionTraps = () => client.get("/analytics/promotion-traps").then((r) => r.data);

export const getDualPipelineCompare = (sampleSize = 100) =>
  client.get("/dual-pipeline/compare", { params: { sample_size: sampleSize } }).then((r) => r.data);

export const postWhatIfSimulation = (payload) =>
  client.post("/simulate/what-if", payload).then((r) => r.data);

export const getRecommendations = () => client.get("/recommendations").then((r) => r.data);

export const getModelMetrics = () => client.get("/models/metrics").then((r) => r.data);

export const postIngestSql = (payload) =>
  client.post("/ingest/sql", payload, { timeout: 900000 }).then((r) => r.data);

export default client;
