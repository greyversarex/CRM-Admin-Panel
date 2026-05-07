-- Бэкфилл assets.storage_key: добавляем недостающий префикс "private/"
-- к строкам, созданным до фикса в routes/assets.ts confirm.
--
-- Контекст: ObjectStorageService.createUpload() возвращает
-- storageKey="private/uploads/<uuid>", файл реально лежит на диске под
-- <LOCAL_STORAGE_ROOT>/private/uploads/<uuid>. Ранее confirm-роут отрезал
-- от objectPath только "/objects/" → storage_key='uploads/<uuid>' без
-- "private/", из-за чего DDEX-доставка не находила файл (ENOENT).
--
-- Идемпотентно: затрагивает только строки, которые НЕ начинаются с
-- "private/" или "public/".

UPDATE assets
SET storage_key = 'private/' || storage_key,
    updated_at  = now()
WHERE storage_key IS NOT NULL
  AND storage_key <> ''
  AND storage_key NOT LIKE 'private/%'
  AND storage_key NOT LIKE 'public/%';
