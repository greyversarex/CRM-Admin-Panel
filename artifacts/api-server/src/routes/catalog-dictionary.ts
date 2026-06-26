/**
 * Справочники Broma16 для форм мастера релиза — read-only, доступны ВСЕМ
 * авторизованным ролям (admin/manager/label/artist), т.к. релизы создают и
 * лейблы, и артисты. Данные не секретны (жанры/языки/страны/типы релизов).
 *
 * ВАЖНО: монтируется в index.ts ДО гарда `router.use("/catalog", adminOnly, …)`,
 * иначе label/artist получат 403. Остальные /catalog/* остаются под admin-гардом.
 *
 * Сами словари подтягиваются интеграцией Broma16 автоматически
 * (см. broma16 onConnected + планировщик), здесь только чтение кэша.
 */
import { Router } from "express";
import { z } from "zod";
import { getDictionary, type DictionaryType } from "../services/broma16/dictionaries";

const router = Router();

const DICT_TYPES = ["genre", "language", "country", "release_type", "outlet"] as const;
const DictTypeParam = z.object({ type: z.enum(DICT_TYPES) });

router.get("/catalog/dictionary/:type", async (req, res) => {
  const parsed = DictTypeParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "validation", message: "Неизвестный тип справочника" });
    return;
  }
  const type = parsed.data.type as DictionaryType;
  const items = await getDictionary(type);
  res.json({ type, items });
});

export default router;
