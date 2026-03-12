/**
 * Express routes for data analysis: file upload and chart preparation.
 */

import express from "express";
import multer from "multer";
import { eventBus } from "./event-bus.js";
import {
  parseUploadedFile,
  getAnalysis,
  prepareChartData,
} from "./data-analysis-manager.js";
import { analyzeDataset } from "./data-analysis-ai.js";
import type { ChartConfig, CodingProvider } from "@my-ai-console/shared";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["csv", "xlsx", "xls", "txt", "tsv"];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식: .${ext}`));
    }
  },
});

export function createAnalysisRouter(): express.Router {
  const router = express.Router();

  // POST /api/data/upload
  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "파일이 없습니다." });
        return;
      }

      const analysis = parseUploadedFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      const preview = analysis.rows.slice(0, 100);

      // Emit upload complete event
      eventBus.emit({
        type: "analysis:upload:complete",
        analysisId: analysis.id,
        timestamp: Date.now(),
        schema: analysis.schema,
        preview,
      });

      // Start AI analysis in background
      const provider = (req.body?.provider as CodingProvider) || "claude";
      const model = (req.body?.model as string) || "claude-sonnet-4-5-20250929";

      eventBus.emit({
        type: "analysis:ai:thinking",
        analysisId: analysis.id,
        timestamp: Date.now(),
      });

      analyzeDataset(analysis.schema, preview.slice(0, 10), provider, model)
        .then((result) => {
          eventBus.emit({
            type: "analysis:ai:result",
            analysisId: analysis.id,
            timestamp: Date.now(),
            result,
          });
        })
        .catch((err) => {
          console.error("[DataAnalysis] AI analysis error:", err);
          eventBus.emit({
            type: "analysis:error",
            analysisId: analysis.id,
            timestamp: Date.now(),
            error: `AI 분석 실패: ${err.message}`,
            phase: "ai",
          });
        });

      res.json({
        analysisId: analysis.id,
        schema: analysis.schema,
        preview,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "파일 파싱 실패";
      console.error("[DataAnalysis] Upload error:", message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/data/prepare-chart
  router.post("/prepare-chart", (req, res) => {
    try {
      const {
        analysisId, chartType, xAxis, yAxis, colorBy, sizeBy, aggregation,
        aiColumnDescriptions, aiStatistics,
      } = req.body;

      if (!analysisId) {
        res.status(400).json({ error: "analysisId가 필요합니다." });
        return;
      }

      const config: ChartConfig = {
        chartType: chartType ?? "scatter",
        xAxis: xAxis ?? null,
        yAxis: yAxis ?? null,
        colorBy: colorBy ?? null,
        sizeBy: sizeBy ?? null,
        aggregation: aggregation ?? "none",
      };

      const axisInfo = {
        columnDescriptions: aiColumnDescriptions ?? {},
        statistics: aiStatistics ?? {},
      };

      const { data, layout } = prepareChartData(analysisId, config, axisInfo);

      res.json({ chartData: data, chartLayout: layout });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "차트 데이터 준비 실패";
      console.error("[DataAnalysis] Chart preparation error:", message);
      res.status(500).json({ error: message });
    }
  });

  // GET /api/data/:analysisId
  router.get("/:analysisId", (req, res) => {
    const analysis = getAnalysis(req.params.analysisId);
    if (!analysis) {
      res.status(404).json({ error: "분석 데이터를 찾을 수 없습니다." });
      return;
    }
    res.json({
      schema: analysis.schema,
      preview: analysis.rows.slice(0, 100),
    });
  });

  return router;
}
