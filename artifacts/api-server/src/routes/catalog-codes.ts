/**
 * Catalog code generation — доступно ВСЕМ аутентифицированным пользователям.
 *
 * Артист/лейбл создают релизы и должны получать настоящий, sequential ISRC
 * с сервера (реестр + атомарный счётчик в platform_settings), а не клиентский
 * Math.random. Поэтому этот роутер монтируется в routes/index.ts ДО admin-гарда
 * `router.use("/catalog", adminOnly, …)` — иначе не-админ получит 403.
 *
 * Конфиг кодов (GET/PUT /catalog/codes/config) и генерация UPC остаются под
 * admin-гардом внутри catalogRouter — их вызывает только админ-страница «Каталог».
 */
import { Router } from "express";
import { generateIsrc } from "./catalog";

const router = Router();

router.post("/catalog/codes/isrc", async (_req, res) => {
  try {
    const { code, warning } = await generateIsrc();
    res.json({ code, warning });
  } catch (e) {
    res.status(409).json({ error: "isrc_generation_failed", message: (e as Error).message });
  }
});

export default router;
